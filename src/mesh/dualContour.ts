import type { SDF, Box3 } from '../sdf/types';

export interface DCOptions {
  /** World-space region to mesh. Padded by one cell internally. */
  bounds: Box3;
  /** Cells along the longest axis. Other axes match the same cell size. */
  resolution: number;
  /** Bisection steps used to place each edge crossing. 0 = linear interpolation only. */
  refineSteps?: number;
  /** Angle (degrees) above which a shared vertex is split so the crease shades hard. */
  creaseAngle?: number;
  /** Bake per-vertex ambient occlusion by marching the field. */
  ao?: boolean;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  ao: Float32Array;
  indices: Uint32Array;
  stats: {
    dims: [number, number, number];
    cellSize: number;
    fieldEvals: number;
    gridMs: number;
    hermiteMs: number;
    qefMs: number;
    quadMs: number;
    normalMs: number;
    aoMs: number;
    totalMs: number;
    vertexCount: number;
    triangleCount: number;
  };
}

/** Growable Float32 buffer — avoids per-push array boxing in the hot loops. */
class F32 {
  data: Float32Array;
  len = 0;
  constructor(cap = 1024) { this.data = new Float32Array(cap); }
  push3(a: number, b: number, c: number) {
    if (this.len + 3 > this.data.length) this.grow(this.len + 3);
    this.data[this.len++] = a;
    this.data[this.len++] = b;
    this.data[this.len++] = c;
  }
  push1(a: number) {
    if (this.len + 1 > this.data.length) this.grow(this.len + 1);
    this.data[this.len++] = a;
  }
  private grow(min: number) {
    let cap = this.data.length * 2;
    while (cap < min) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.len));
    this.data = next;
  }
  view() { return this.data.subarray(0, this.len); }
}

class U32 {
  data: Uint32Array;
  len = 0;
  constructor(cap = 1024) { this.data = new Uint32Array(cap); }
  push3(a: number, b: number, c: number) {
    if (this.len + 3 > this.data.length) this.grow(this.len + 3);
    this.data[this.len++] = a;
    this.data[this.len++] = b;
    this.data[this.len++] = c;
  }
  private grow(min: number) {
    let cap = this.data.length * 2;
    while (cap < min) cap *= 2;
    const next = new Uint32Array(cap);
    next.set(this.data.subarray(0, this.len));
    this.data = next;
  }
  view() { return this.data.subarray(0, this.len); }
}

/** Offsets of the 12 cell edges as [dir, di, dj, dk] from the cell's origin corner. */
const CELL_EDGES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [0, 0, 1, 1],
  [1, 0, 0, 0], [1, 1, 0, 0], [1, 0, 0, 1], [1, 1, 0, 1],
  [2, 0, 0, 0], [2, 1, 0, 0], [2, 0, 1, 0], [2, 1, 1, 0],
];


/**
 * Cyclic Jacobi eigendecomposition of a symmetric 3x3 matrix.
 * `a` is [a00,a01,a02,a11,a12,a22]; eigenvalues land in `w`, eigenvectors in the
 * columns of `v`. Small and exact enough that a QEF never needs an external SVD.
 */
function jacobi3(a: Float64Array, w: Float64Array, v: Float64Array) {
  let m00 = a[0], m01 = a[1], m02 = a[2], m11 = a[3], m12 = a[4], m22 = a[5];
  v[0] = 1; v[1] = 0; v[2] = 0;
  v[3] = 0; v[4] = 1; v[5] = 0;
  v[6] = 0; v[7] = 0; v[8] = 1;

  for (let sweep = 0; sweep < 8; sweep++) {
    const off = Math.abs(m01) + Math.abs(m02) + Math.abs(m12);
    const diag = Math.abs(m00) + Math.abs(m11) + Math.abs(m22);
    // relative, not absolute: ATA entries scale with the number of edge planes,
    // so an absolute epsilon here never fires and every cell pays 8 full sweeps
    if (off <= diag * 1e-12) break;

    // (p,q) in (0,1), (0,2), (1,2)
    for (let pq = 0; pq < 3; pq++) {
      let apq: number, app: number, aqq: number;
      if (pq === 0) { apq = m01; app = m00; aqq = m11; }
      else if (pq === 1) { apq = m02; app = m00; aqq = m22; }
      else { apq = m12; app = m11; aqq = m22; }
      if (Math.abs(apq) < 1e-16) continue;

      const theta = (aqq - app) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;

      if (pq === 0) {
        const n00 = c * c * m00 - 2 * s * c * m01 + s * s * m11;
        const n11 = s * s * m00 + 2 * s * c * m01 + c * c * m11;
        const n02 = c * m02 - s * m12;
        const n12 = s * m02 + c * m12;
        m00 = n00; m11 = n11; m02 = n02; m12 = n12; m01 = 0;
      } else if (pq === 1) {
        const n00 = c * c * m00 - 2 * s * c * m02 + s * s * m22;
        const n22 = s * s * m00 + 2 * s * c * m02 + c * c * m22;
        const n01 = c * m01 - s * m12;
        const n12 = s * m01 + c * m12;
        m00 = n00; m22 = n22; m01 = n01; m12 = n12; m02 = 0;
      } else {
        const n11 = c * c * m11 - 2 * s * c * m12 + s * s * m22;
        const n22 = s * s * m11 + 2 * s * c * m12 + c * c * m22;
        const n01 = c * m01 - s * m02;
        const n02 = s * m01 + c * m02;
        m11 = n11; m22 = n22; m01 = n01; m02 = n02; m12 = 0;
      }

      const pi = pq === 2 ? 1 : 0;
      const qi = pq === 0 ? 1 : 2;
      for (let r = 0; r < 3; r++) {
        const vp = v[r * 3 + pi];
        const vq = v[r * 3 + qi];
        v[r * 3 + pi] = c * vp - s * vq;
        v[r * 3 + qi] = s * vp + c * vq;
      }
    }
  }
  w[0] = m00; w[1] = m11; w[2] = m22;
}

const qefA = new Float64Array(6);
const qefW = new Float64Array(3);
const qefV = new Float64Array(9);
const qefOut = new Float64Array(3);

/**
 * Minimise sum |n_i . (x - p_i)|^2, biased to the mass point.
 *
 * The bias must come from a *truncated* pseudo-inverse, not from adding lambda*I:
 * on a smooth patch every plane normal is near-parallel, ATA is effectively rank 1,
 * and lambda*I divides the null-space noise by lambda instead of discarding it.
 * That injects tangential jitter which folds the dual quads.
 */
function solveQEF(
  a00: number, a01: number, a02: number, a11: number, a12: number, a22: number,
  b0: number, b1: number, b2: number,
  mx: number, my: number, mz: number,
) {
  const rb0 = b0 - (a00 * mx + a01 * my + a02 * mz);
  const rb1 = b1 - (a01 * mx + a11 * my + a12 * mz);
  const rb2 = b2 - (a02 * mx + a12 * my + a22 * mz);

  qefA[0] = a00; qefA[1] = a01; qefA[2] = a02;
  qefA[3] = a11; qefA[4] = a12; qefA[5] = a22;
  jacobi3(qefA, qefW, qefV);

  let maxW = 0;
  for (let i = 0; i < 3; i++) maxW = Math.max(maxW, Math.abs(qefW[i]));
  const cutoff = maxW * QEF_SINGULAR_CUTOFF;

  let x = mx, y = my, z = mz;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(qefW[i]) <= cutoff) continue;
    const e0 = qefV[i], e1 = qefV[3 + i], e2 = qefV[6 + i];
    const proj = (e0 * rb0 + e1 * rb1 + e2 * rb2) / qefW[i];
    x += e0 * proj; y += e1 * proj; z += e2 * proj;
  }
  qefOut[0] = x; qefOut[1] = y; qefOut[2] = z;
}

/** Singular values below this fraction of the largest are treated as null. */
const QEF_SINGULAR_CUTOFF = 0.1;

export function dualContour(f: SDF, opts: DCOptions): MeshData {
  const t0 = performance.now();
  const refineSteps = opts.refineSteps ?? 3;
  const creaseAngle = opts.creaseAngle ?? 40;
  const wantAO = opts.ao ?? true;

  let evals = 0;
  const field = (x: number, y: number, z: number) => { evals++; return f(x, y, z); };

  // --- grid setup, padded so the surface never touches the boundary ---
  const { min, max } = opts.bounds;
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const longest = Math.max(ext[0], ext[1], ext[2]);
  const cell = longest / opts.resolution;
  const ox = min[0] - cell, oy = min[1] - cell, oz = min[2] - cell;
  const nx = Math.ceil(ext[0] / cell) + 2;
  const ny = Math.ceil(ext[1] / cell) + 2;
  const nz = Math.ceil(ext[2] / cell) + 2;

  const cx = nx + 1, cy = ny + 1, cz = nz + 1;
  const cornerIdx = (i: number, j: number, k: number) => i + j * cx + k * cx * cy;

  // --- 1. sample the field at every grid corner ---
  const g0 = performance.now();
  const grid = new Float32Array(cx * cy * cz);
  let gi = 0;
  for (let k = 0; k < cz; k++) {
    const z = oz + k * cell;
    for (let j = 0; j < cy; j++) {
      const y = oy + j * cell;
      for (let i = 0; i < cx; i++) {
        grid[gi++] = f(ox + i * cell, y, z);
      }
    }
  }
  evals += cx * cy * cz;
  const g1 = performance.now();

  // --- 2. hermite data on every sign-changing edge ---
  const crossOf = new Int32Array(cx * cy * cz * 3).fill(-1);
  const crossP = new F32(4096);
  const crossN = new F32(4096);
  let crossCount = 0;

  const h = cell * 0.02; // gradient step, small relative to a cell
  const gradInto = (x: number, y: number, z: number, out: Float32Array) => {
    const dx = field(x + h, y, z) - field(x - h, y, z);
    const dy = field(x, y + h, z) - field(x, y - h, z);
    const dz = field(x, y, z + h) - field(x, y, z - h);
    const len = Math.hypot(dx, dy, dz) || 1;
    out[0] = dx / len; out[1] = dy / len; out[2] = dz / len;
  };
  const nrm = new Float32Array(3);

  const dirStep = [1, cx, cx * cy];
  for (let dir = 0; dir < 3; dir++) {
    const limX = dir === 0 ? cx - 1 : cx;
    const limY = dir === 1 ? cy - 1 : cy;
    const limZ = dir === 2 ? cz - 1 : cz;
    const step = dirStep[dir];
    for (let k = 0; k < limZ; k++) {
      for (let j = 0; j < limY; j++) {
        for (let i = 0; i < limX; i++) {
          const ci = cornerIdx(i, j, k);
          const fa = grid[ci];
          const fb = grid[ci + step];
          if ((fa < 0) === (fb < 0)) continue;

          const ax = ox + i * cell, ay = oy + j * cell, az = oz + k * cell;
          const bx = dir === 0 ? ax + cell : ax;
          const by = dir === 1 ? ay + cell : ay;
          const bz = dir === 2 ? az + cell : az;

          // linear guess, then bisection against the real field
          let t = fa / (fa - fb);
          if (refineSteps > 0) {
            let lo = 0, hi = 1, flo = fa;
            for (let s = 0; s < refineSteps; s++) {
              const px = ax + (bx - ax) * t;
              const py = ay + (by - ay) * t;
              const pz = az + (bz - az) * t;
              const fm = field(px, py, pz);
              if ((fm < 0) === (flo < 0)) { lo = t; flo = fm; } else { hi = t; }
              t = (lo + hi) * 0.5;
            }
          }
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          const pz = az + (bz - az) * t;
          gradInto(px, py, pz, nrm);

          crossOf[ci * 3 + dir] = crossCount++;
          crossP.push3(px, py, pz);
          crossN.push3(nrm[0], nrm[1], nrm[2]);
        }
      }
    }
  }
  const cp = crossP.data, cn = crossN.data;
  const g2 = performance.now();

  // --- 3. one vertex per cell, placed by solving the QEF of its edge planes ---
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const verts = new F32(4096);
  let vertCount = 0;

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // symmetric ATA (6) + ATb (3) + mass point
        let a00 = 0, a01 = 0, a02 = 0, a11 = 0, a12 = 0, a22 = 0;
        let b0 = 0, b1 = 0, b2 = 0;
        let mx = 0, my = 0, mz = 0, count = 0;

        for (let e = 0; e < 12; e++) {
          const [dir, di, dj, dk] = CELL_EDGES[e];
          const idx = crossOf[cornerIdx(i + di, j + dj, k + dk) * 3 + dir];
          if (idx < 0) continue;
          const p = idx * 3;
          const px = cp[p], py = cp[p + 1], pz = cp[p + 2];
          const nxv = cn[p], nyv = cn[p + 1], nzv = cn[p + 2];
          a00 += nxv * nxv; a01 += nxv * nyv; a02 += nxv * nzv;
          a11 += nyv * nyv; a12 += nyv * nzv; a22 += nzv * nzv;
          const d = nxv * px + nyv * py + nzv * pz;
          b0 += nxv * d; b1 += nyv * d; b2 += nzv * d;
          mx += px; my += py; mz += pz; count++;
        }
        if (count === 0) continue;

        mx /= count; my /= count; mz /= count;

        solveQEF(a00, a01, a02, a11, a12, a22, b0, b1, b2, mx, my, mz);
        let vx = qefOut[0], vy = qefOut[1], vz = qefOut[2];

        // keep the vertex inside its own cell or the mesh self-intersects
        const lo0 = ox + i * cell, lo1 = oy + j * cell, lo2 = oz + k * cell;
        vx = Math.min(Math.max(vx, lo0), lo0 + cell);
        vy = Math.min(Math.max(vy, lo1), lo1 + cell);
        vz = Math.min(Math.max(vz, lo2), lo2 + cell);

        cellVert[i + j * nx + k * nx * ny] = vertCount++;
        verts.push3(vx, vy, vz);
      }
    }
  }
  const g3 = performance.now();

  // --- 4. one quad per sign-changing edge, joining the 4 cells around it ---
  const tris = new U32(4096);
  const quad = new Int32Array(4);
  const vpos = verts.data;

  for (let dir = 0; dir < 3; dir++) {
    const limX = dir === 0 ? cx - 1 : cx;
    const limY = dir === 1 ? cy - 1 : cy;
    const limZ = dir === 2 ? cz - 1 : cz;
    for (let k = 0; k < limZ; k++) {
      for (let j = 0; j < limY; j++) {
        for (let i = 0; i < limX; i++) {
          const ci = cornerIdx(i, j, k);
          const idx = crossOf[ci * 3 + dir];
          if (idx < 0) continue;

          // The four cells sharing this edge, ordered counter-clockwise about the
          // edge axis (x: y->z, y: z->x, z: x->y). Getting the y case wrong is the
          // classic dual-contouring bug: half the quads wind backwards and the
          // crease-split normals then cancel into slivers.
          let ok = true;
          for (let q = 0; q < 4; q++) {
            let a: number, b: number, c: number;
            if (dir === 0) {
              const u = q === 1 || q === 2 ? 0 : -1;
              const v = q >= 2 ? 0 : -1;
              a = i; b = j + u; c = k + v;
            } else if (dir === 1) {
              const u = q >= 2 ? 0 : -1;
              const v = q === 1 || q === 2 ? 0 : -1;
              a = i + u; b = j; c = k + v;
            } else {
              const u = q === 1 || q === 2 ? 0 : -1;
              const v = q >= 2 ? 0 : -1;
              a = i + u; b = j + v; c = k;
            }
            if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) { ok = false; break; }
            const vi = cellVert[a + b * nx + c * nx * ny];
            if (vi < 0) { ok = false; break; }
            quad[q] = vi;
          }
          if (!ok) continue;

          // That ordering faces +dir. It is correct when the low corner is inside.
          const flip = grid[ci] >= 0;

          // Dual quads are rarely planar. Splitting on the longer diagonal folds
          // the quad and inverts the smaller triangle, so always cut the short one.
          const q0 = quad[0] * 3, q1 = quad[1] * 3, q2 = quad[2] * 3, q3 = quad[3] * 3;
          const d02 =
            (vpos[q0] - vpos[q2]) ** 2 +
            (vpos[q0 + 1] - vpos[q2 + 1]) ** 2 +
            (vpos[q0 + 2] - vpos[q2 + 2]) ** 2;
          const d13 =
            (vpos[q1] - vpos[q3]) ** 2 +
            (vpos[q1 + 1] - vpos[q3 + 1]) ** 2 +
            (vpos[q1 + 2] - vpos[q3 + 2]) ** 2;

          if (d02 <= d13) {
            if (flip) {
              tris.push3(quad[0], quad[2], quad[1]);
              tris.push3(quad[0], quad[3], quad[2]);
            } else {
              tris.push3(quad[0], quad[1], quad[2]);
              tris.push3(quad[0], quad[2], quad[3]);
            }
          } else {
            if (flip) {
              tris.push3(quad[1], quad[3], quad[2]);
              tris.push3(quad[1], quad[0], quad[3]);
            } else {
              tris.push3(quad[1], quad[2], quad[3]);
              tris.push3(quad[1], quad[3], quad[0]);
            }
          }
        }
      }
    }
  }
  const g4 = performance.now();

  // --- 5. split vertices across creases so hard edges shade hard ---
  const split = splitByCrease(verts.view(), tris.view(), creaseAngle);
  const g5 = performance.now();

  // --- 6. bake occlusion by marching the field along each normal ---
  const ao = new Float32Array(split.positions.length / 3).fill(1);
  if (wantAO) {
    const reach = cell * 6;
    for (let v = 0; v < ao.length; v++) {
      const p = v * 3;
      const px = split.positions[p], py = split.positions[p + 1], pz = split.positions[p + 2];
      const nxv = split.normals[p], nyv = split.normals[p + 1], nzv = split.normals[p + 2];
      let occ = 0, sca = 1;
      for (let s = 1; s <= 5; s++) {
        const hd = (s / 5) * reach;
        const d = f(px + nxv * hd, py + nyv * hd, pz + nzv * hd);
        occ += (hd - d) * sca;
        sca *= 0.75;
      }
      evals += 5;
      ao[v] = Math.min(Math.max(1 - (2.2 * occ) / reach, 0), 1);
    }
  }
  const g6 = performance.now();

  return {
    positions: split.positions,
    normals: split.normals,
    ao,
    indices: split.indices,
    stats: {
      dims: [nx, ny, nz],
      cellSize: cell,
      fieldEvals: evals,
      gridMs: g1 - g0,
      hermiteMs: g2 - g1,
      qefMs: g3 - g2,
      quadMs: g4 - g3,
      normalMs: g5 - g4,
      aoMs: g6 - g5,
      totalMs: g6 - t0,
      vertexCount: split.positions.length / 3,
      triangleCount: split.indices.length / 3,
    },
  };
}

/**
 * Dual contouring shares one vertex between every face around a crease, so the
 * geometry is sharp but the shading is not. Duplicate each vertex per cluster of
 * similarly-facing triangles to recover a hard edge.
 */
function splitByCrease(positions: Float32Array, indices: Uint32Array, angleDeg: number) {
  const triCount = indices.length / 3;
  const vertCount = positions.length / 3;
  const cosLimit = Math.cos((angleDeg * Math.PI) / 180);

  const faceN = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    faceN[t * 3] = nx / len; faceN[t * 3 + 1] = ny / len; faceN[t * 3 + 2] = nz / len;
  }

  // CSR adjacency: which triangles touch each vertex
  const counts = new Uint32Array(vertCount + 1);
  for (let i = 0; i < indices.length; i++) counts[indices[i] + 1]++;
  for (let v = 0; v < vertCount; v++) counts[v + 1] += counts[v];
  const offsets = counts;
  const cursor = offsets.slice(0, vertCount);
  const adj = new Uint32Array(indices.length);
  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++) adj[cursor[indices[t * 3 + c]]++] = t;
  }

  const outPos = new F32(positions.length);
  const outNrm = new F32(positions.length);
  const outIdx = new Uint32Array(indices.length);
  // per (triangle corner) -> new vertex id, filled as clusters are emitted
  const remap = new Int32Array(indices.length).fill(-1);

  const clusterN: number[] = [];
  const clusterMembers: number[][] = [];

  for (let v = 0; v < vertCount; v++) {
    const start = v === 0 ? 0 : offsets[v];
    const end = offsets[v + 1];
    clusterN.length = 0;
    clusterMembers.length = 0;

    for (let a = start; a < end; a++) {
      const t = adj[a];
      const fn = t * 3;
      const fx = faceN[fn], fy = faceN[fn + 1], fz = faceN[fn + 2];
      let found = -1;
      for (let c = 0; c < clusterMembers.length; c++) {
        const cn0 = clusterN[c * 3], cn1 = clusterN[c * 3 + 1], cn2 = clusterN[c * 3 + 2];
        const l = Math.hypot(cn0, cn1, cn2) || 1;
        if ((fx * cn0 + fy * cn1 + fz * cn2) / l >= cosLimit) { found = c; break; }
      }
      if (found < 0) {
        found = clusterMembers.length;
        clusterMembers.push([]);
        clusterN.push(fx, fy, fz);
      } else {
        clusterN[found * 3] += fx;
        clusterN[found * 3 + 1] += fy;
        clusterN[found * 3 + 2] += fz;
      }
      clusterMembers[found].push(t);
    }

    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
    for (let c = 0; c < clusterMembers.length; c++) {
      const nx0 = clusterN[c * 3], ny0 = clusterN[c * 3 + 1], nz0 = clusterN[c * 3 + 2];
      const l = Math.hypot(nx0, ny0, nz0) || 1;
      const newId = outPos.len / 3;
      outPos.push3(px, py, pz);
      outNrm.push3(nx0 / l, ny0 / l, nz0 / l);
      for (const t of clusterMembers[c]) {
        for (let k = 0; k < 3; k++) {
          if (indices[t * 3 + k] === v) remap[t * 3 + k] = newId;
        }
      }
    }
  }

  for (let i = 0; i < indices.length; i++) outIdx[i] = remap[i] < 0 ? 0 : remap[i];

  return { positions: outPos.view().slice(), normals: outNrm.view().slice(), indices: outIdx };
}
