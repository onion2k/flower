import type { SDF, Vec3 } from '../sdf/types';

/**
 * A tube swept along a polyline is a union of capsules, and a wire path is easily
 * 100+ segments. Evaluating all of them per sample would dominate meshing cost, so
 * segments go into a bounding-volume hierarchy and the traversal prunes on the
 * point-to-box distance — which is a valid lower bound on the capsule distance.
 */
export function tube(points: Vec3[], radius: number): SDF {
  const segCount = points.length - 1;
  if (segCount < 1) throw new Error('tube() needs at least two points');

  // segment endpoints, flattened
  const ax = new Float64Array(segCount), ay = new Float64Array(segCount), az = new Float64Array(segCount);
  const bx = new Float64Array(segCount), by = new Float64Array(segCount), bz = new Float64Array(segCount);
  const invLen2 = new Float64Array(segCount);

  for (let i = 0; i < segCount; i++) {
    const a = points[i], b = points[i + 1];
    ax[i] = a[0]; ay[i] = a[1]; az[i] = a[2];
    bx[i] = b[0] - a[0]; by[i] = b[1] - a[1]; bz[i] = b[2] - a[2];
    const l2 = bx[i] * bx[i] + by[i] * by[i] + bz[i] * bz[i];
    invLen2[i] = l2 > 0 ? 1 / l2 : 0;
  }

  // --- build: median split on the longest axis of the centroid spread ---
  const order = new Uint32Array(segCount);
  for (let i = 0; i < segCount; i++) order[i] = i;

  // node layout: [minx,miny,minz,maxx,maxy,maxz, start, count, left, right]
  const NODE = 10;
  const nodes: number[] = [];

  const boundsOf = (start: number, count: number) => {
    let n0 = Infinity, n1 = Infinity, n2 = Infinity;
    let x0 = -Infinity, x1 = -Infinity, x2 = -Infinity;
    for (let i = start; i < start + count; i++) {
      const s = order[i];
      const p0 = ax[s], p1 = ay[s], p2 = az[s];
      const q0 = p0 + bx[s], q1 = p1 + by[s], q2 = p2 + bz[s];
      n0 = Math.min(n0, p0, q0); x0 = Math.max(x0, p0, q0);
      n1 = Math.min(n1, p1, q1); x1 = Math.max(x1, p1, q1);
      n2 = Math.min(n2, p2, q2); x2 = Math.max(x2, p2, q2);
    }
    return [n0, n1, n2, x0, x1, x2];
  };

  const LEAF = 4;
  const build = (start: number, count: number): number => {
    const self = nodes.length / NODE;
    const b = boundsOf(start, count);
    nodes.push(b[0], b[1], b[2], b[3], b[4], b[5], start, count, -1, -1);

    if (count <= LEAF) return self;

    const ext = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const axis = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : ext[1] > ext[2] ? 1 : 2;
    const centre = (s: number) =>
      axis === 0 ? ax[s] + bx[s] * 0.5 : axis === 1 ? ay[s] + by[s] * 0.5 : az[s] + bz[s] * 0.5;

    const slice = Array.from(order.subarray(start, start + count)).sort((p, q) => centre(p) - centre(q));
    order.set(slice, start);

    const half = count >> 1;
    const left = build(start, half);
    const right = build(start + half, count - half);
    nodes[self * NODE + 7] = 0; // interior
    nodes[self * NODE + 8] = left;
    nodes[self * NODE + 9] = right;
    return self;
  };

  build(0, segCount);
  const tree = new Float64Array(nodes);
  const stack = new Int32Array(64);

  return (x, y, z) => {
    let best2 = Infinity;
    let sp = 0;
    stack[sp++] = 0;

    while (sp > 0) {
      const n = stack[--sp] * NODE;

      // point-to-box distance: a lower bound on every capsule axis inside
      const dx = Math.max(tree[n] - x, 0, x - tree[n + 3]);
      const dy = Math.max(tree[n + 1] - y, 0, y - tree[n + 4]);
      const dz = Math.max(tree[n + 2] - z, 0, z - tree[n + 5]);
      const boxD2 = dx * dx + dy * dy + dz * dz;
      if (boxD2 >= best2) continue;

      const count = tree[n + 7];
      if (count === 0) {
        stack[sp++] = tree[n + 8];
        stack[sp++] = tree[n + 9];
        continue;
      }

      const start = tree[n + 6];
      for (let i = start; i < start + count; i++) {
        const s = order[i];
        const px = x - ax[s], py = y - ay[s], pz = z - az[s];
        let h = (px * bx[s] + py * by[s] + pz * bz[s]) * invLen2[s];
        h = h < 0 ? 0 : h > 1 ? 1 : h;
        const qx = px - bx[s] * h, qy = py - by[s] * h, qz = pz - bz[s] * h;
        const d2 = qx * qx + qy * qy + qz * qz;
        if (d2 < best2) best2 = d2;
      }
    }

    return Math.sqrt(best2) - radius;
  };
}
