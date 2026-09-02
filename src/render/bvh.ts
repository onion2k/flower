/**
 * Acceleration structures for tracing reflected rays through the placed parts.
 *
 * Two levels, because the scene is a few meshes placed many times. Each mesh
 * gets its own bounding volume hierarchy over its triangles, in object space,
 * built once and cached however often the mesh is placed. The scene is then a
 * second hierarchy over the instances' world boxes, so a ray finds the few
 * placements it can touch in a handful of box tests, whatever the count, and
 * only walks those meshes' trees. Both levels use the same binned
 * surface-area-heuristic builder.
 *
 * Layout is what the shader reads: nodes as eight 32-bit words, triangles as
 * six vec4s of position and normal, vertex indices alongside so a hit can look
 * up its baked occlusion, instances as their transforms, box and offsets.
 */

import type { Mesh } from '../mesh/types';

export interface Blas {
  nodes: ArrayBuffer;
  nodeCount: number;
  /** Per triangle in hierarchy order: v0 v1 v2 n0 n1 n2 as vec4. */
  tris: Float32Array;
  /** Per triangle: the three vertex indices, padded to four. */
  triIdx: Uint32Array;
  triCount: number;
}

export interface SceneInstance {
  mesh: Mesh;
  matrix: Float32Array;
  /** Index of the group whose material this instance wears. */
  group: number;
  /** First occlusion entry for this placement: group base + iid * vertexCount. */
  occlusionBase: number;
}

export interface SceneBuffers {
  nodes: ArrayBuffer;
  tris: Float32Array;
  triIdx: Uint32Array;
  /** Instance records in hierarchy order, 176 bytes each. */
  instances: ArrayBuffer;
  instanceCount: number;
  /** The hierarchy over instances, same node layout. */
  tlas: ArrayBuffer;
}

export const INSTANCE_STRIDE = 176;
const NODE_WORDS = 8;

/**
 * Node words: 0-2 bmin, 4-6 bmax. A leaf keeps its first primitive in word 3
 * and its count in word 7. An interior node keeps its left child in word 3 and
 * its right child in word 7 with the high bit set, so the two kinds cannot be
 * confused however small a leaf is.
 */
interface Tree {
  nodes: ArrayBuffer;
  nodeCount: number;
  /** Primitive indices in hierarchy order. */
  order: Uint32Array;
}

/**
 * Binned surface-area heuristic over any set of boxed primitives: the split
 * whose children are cheapest to test, weighted by how many primitives each
 * holds. Median splits give balanced trees; these give tight ones, and a
 * reflected ray cares about tightness — it walks far fewer boxes.
 */
function buildTree(count: number, pmin: Float32Array, pmax: Float32Array, leafSize: number): Tree {
  const centroid = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) centroid[i] = (pmin[i] + pmax[i]) / 2;
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;

  const maxNodes = Math.max(1, 2 * count);
  const nodeBuf = new ArrayBuffer(maxNodes * NODE_WORDS * 4);
  const nf = new Float32Array(nodeBuf);
  const nu = new Uint32Array(nodeBuf);
  let nodeCount = 0;

  const BINS = 12;
  const binCount = new Int32Array(BINS);
  const binMin = new Float32Array(BINS * 3);
  const binMax = new Float32Array(BINS * 3);
  const rightArea = new Float32Array(BINS);
  const rightCount = new Int32Array(BINS);
  const area = (mn: number[], mx: number[]) => {
    const dx = Math.max(0, mx[0] - mn[0]), dy = Math.max(0, mx[1] - mn[1]), dz = Math.max(0, mx[2] - mn[2]);
    return 2 * (dx * dy + dy * dz + dz * dx);
  };

  const build = (start: number, end: number, depth: number): number => {
    const id = nodeCount++;
    const o = id * NODE_WORDS;
    const b0 = [Infinity, Infinity, Infinity], b1 = [-Infinity, -Infinity, -Infinity];
    const c0 = [Infinity, Infinity, Infinity], c1 = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const t = order[i] * 3;
      for (let k = 0; k < 3; k++) {
        b0[k] = Math.min(b0[k], pmin[t + k]); b1[k] = Math.max(b1[k], pmax[t + k]);
        c0[k] = Math.min(c0[k], centroid[t + k]); c1[k] = Math.max(c1[k], centroid[t + k]);
      }
    }
    nf[o] = b0[0]; nf[o + 1] = b0[1]; nf[o + 2] = b0[2];
    nf[o + 4] = b1[0]; nf[o + 5] = b1[1]; nf[o + 6] = b1[2];

    const n = end - start;
    const leaf = () => { nu[o + 3] = start; nu[o + 7] = n; return id; };
    const ex = c1[0] - c0[0], ey = c1[1] - c0[1], ez = c1[2] - c0[2];
    if (n <= leafSize || depth > 48 || (ex <= 0 && ey <= 0 && ez <= 0)) return leaf();

    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const lo = c0[axis], extent = c1[axis] - c0[axis];
    binCount.fill(0); binMin.fill(Infinity); binMax.fill(-Infinity);
    const binOf = (t: number) => Math.min(BINS - 1, Math.floor(((centroid[t * 3 + axis] - lo) / extent) * BINS));
    for (let i = start; i < end; i++) {
      const t = order[i];
      const b = binOf(t);
      binCount[b]++;
      for (let k = 0; k < 3; k++) {
        binMin[b * 3 + k] = Math.min(binMin[b * 3 + k], pmin[t * 3 + k]);
        binMax[b * 3 + k] = Math.max(binMax[b * 3 + k], pmax[t * 3 + k]);
      }
    }
    {
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      let acc = 0;
      for (let b = BINS - 1; b > 0; b--) {
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], binMin[b * 3 + k]); mx[k] = Math.max(mx[k], binMax[b * 3 + k]); }
        acc += binCount[b];
        rightArea[b] = acc ? area(mn, mx) : 0;
        rightCount[b] = acc;
      }
    }
    let bestCost = Infinity, bestBin = -1;
    {
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      let acc = 0;
      for (let b = 0; b < BINS - 1; b++) {
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], binMin[b * 3 + k]); mx[k] = Math.max(mx[k], binMax[b * 3 + k]); }
        acc += binCount[b];
        if (acc === 0 || rightCount[b + 1] === 0) continue;
        const cost = area(mn, mx) * acc + rightArea[b + 1] * rightCount[b + 1];
        if (cost < bestCost) { bestCost = cost; bestBin = b; }
      }
    }
    // not worth splitting when testing everything here is cheaper than the children
    const parentArea = area(b0, b1);
    if (bestBin < 0 || (n <= 2 * leafSize && bestCost / Math.max(parentArea, 1e-12) >= n)) return leaf();

    let i = start, j = end - 1;
    while (i <= j) {
      if (binOf(order[i]) <= bestBin) { i++; }
      else { const tmp = order[i]; order[i] = order[j]; order[j] = tmp; j--; }
    }
    const mid = i;
    if (mid === start || mid === end) return leaf();
    const left = build(start, mid, depth + 1);
    build(mid, end, depth + 1);
    nu[o + 3] = left;
    nu[o + 7] = 0;
    return id;
  };

  if (count > 0) build(0, count, 0);
  else { nodeCount = 1; nu[3] = 0; nu[7] = 0; }

  // children were built left first, so a right child is the node numbered
  // after everything under its sibling; link them now that the tree is complete
  const walk = (id: number): number => {
    const o = id * NODE_WORDS;
    // a leaf has a count, or is the empty root; an interior node's left child is never node 0
    if (nu[o + 7] !== 0 || nu[o + 3] === 0) return 1;
    const left = nu[o + 3];
    const ls = walk(left);
    const right = left + ls;
    const rs = walk(right);
    nu[o + 7] = (right | 0x80000000) >>> 0;
    return 1 + ls + rs;
  };
  walk(0);

  return { nodes: nodeBuf.slice(0, nodeCount * NODE_WORDS * 4), nodeCount, order };
}

const blasCache = new WeakMap<Mesh, Blas>();

export function blasOf(mesh: Mesh): Blas {
  let b = blasCache.get(mesh);
  if (!b) {
    b = buildBlas(mesh);
    blasCache.set(mesh, b);
  }
  return b;
}

function buildBlas(mesh: Mesh): Blas {
  const { positions: p, normals: nrm, indices } = mesh;
  const triCount = indices.length / 3;
  const tmin = new Float32Array(triCount * 3);
  const tmax = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const a = p[indices[t * 3] * 3 + k], b = p[indices[t * 3 + 1] * 3 + k], c = p[indices[t * 3 + 2] * 3 + k];
      tmin[t * 3 + k] = Math.min(a, b, c);
      tmax[t * 3 + k] = Math.max(a, b, c);
    }
  }
  const tree = buildTree(triCount, tmin, tmax, 4);

  const tris = new Float32Array(triCount * 24);
  const triIdx = new Uint32Array(triCount * 4);
  for (let i = 0; i < triCount; i++) {
    const t = tree.order[i];
    for (let v = 0; v < 3; v++) {
      const vi = indices[t * 3 + v];
      tris.set([p[vi * 3], p[vi * 3 + 1], p[vi * 3 + 2], 0], i * 24 + v * 4);
      tris.set([nrm[vi * 3], nrm[vi * 3 + 1], nrm[vi * 3 + 2], 0], i * 24 + 12 + v * 4);
      triIdx[i * 4 + v] = vi;
    }
  }
  return { nodes: tree.nodes, nodeCount: tree.nodeCount, tris, triIdx, triCount };
}

/** Concatenate the placed meshes' hierarchies, and build the one over the placements. */
export function buildScene(instances: SceneInstance[]): SceneBuffers {
  const blas = new Map<Mesh, Blas>();
  let nodeTotal = 0, triTotal = 0;
  const nodeOffset = new Map<Mesh, number>();
  const triOffset = new Map<Mesh, number>();
  for (const inst of instances) {
    if (blas.has(inst.mesh)) continue;
    const b = blasOf(inst.mesh);
    blas.set(inst.mesh, b);
    nodeOffset.set(inst.mesh, nodeTotal);
    triOffset.set(inst.mesh, triTotal);
    nodeTotal += b.nodeCount;
    triTotal += b.triCount;
  }

  const nodes = new ArrayBuffer(Math.max(1, nodeTotal) * NODE_WORDS * 4);
  const tris = new Float32Array(Math.max(1, triTotal) * 24);
  const triIdx = new Uint32Array(Math.max(1, triTotal) * 4);
  const nodeBytes = new Uint8Array(nodes);
  for (const [mesh, b] of blas) {
    nodeBytes.set(new Uint8Array(b.nodes), nodeOffset.get(mesh)! * NODE_WORDS * 4);
    tris.set(b.tris, triOffset.get(mesh)! * 24);
    triIdx.set(b.triIdx, triOffset.get(mesh)! * 4);
  }

  // world boxes, then the hierarchy over them
  const n = instances.length;
  const imin = new Float32Array(n * 3), imax = new Float32Array(n * 3);
  const boxes = instances.map((inst) => boundsOf(inst.mesh, inst.matrix));
  boxes.forEach((b, i) => { imin.set(b.min, i * 3); imax.set(b.max, i * 3); });
  const tlas = buildTree(n, imin, imax, 2);

  const instBuf = new ArrayBuffer(Math.max(1, n) * INSTANCE_STRIDE);
  const f = new Float32Array(instBuf);
  const u = new Uint32Array(instBuf);
  for (let slot = 0; slot < n; slot++) {
    const i = tlas.order[slot];
    const inst = instances[i];
    const o = (slot * INSTANCE_STRIDE) / 4;
    f.set(invert(inst.matrix), o);
    f.set(inst.matrix, o + 16);
    f.set(boxes[i].min, o + 32);
    u[o + 35] = nodeOffset.get(inst.mesh)!;
    f.set(boxes[i].max, o + 36);
    u[o + 39] = triOffset.get(inst.mesh)!;
    u[o + 40] = inst.group;
    u[o + 41] = inst.occlusionBase;
  }

  return { nodes, tris, triIdx, instances: instBuf, instanceCount: n, tlas: tlas.nodes };
}

function boundsOf(mesh: Mesh, m: Float32Array) {
  const p = mesh.positions;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < lo[k]) lo[k] = p[i + k];
      if (p[i + k] > hi[k]) hi[k] = p[i + k];
    }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner++) {
    const x = corner & 1 ? hi[0] : lo[0];
    const y = corner & 2 ? hi[1] : lo[1];
    const z = corner & 4 ? hi[2] : lo[2];
    const w = [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
    for (let k = 0; k < 3; k++) {
      if (w[k] < min[k]) min[k] = w[k];
      if (w[k] > max[k]) max[k] = w[k];
    }
  }
  return { min, max };
}

/** General 4x4 inverse, column-major. */
export function invert(m: Float32Array): Float32Array {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const out = new Float32Array(16);
  if (!det) return out;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}
