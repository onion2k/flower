/**
 * Wear: where a piece of worked metal is bright and where it is dull.
 *
 * A finish is never uniform. Edges and ridges get handled, buffed and knocked, so
 * they end up brighter and smoother than the field; creases and hollows collect
 * polish residue, oxide and grime, so they end up rougher and darker. That
 * pattern is what the eye uses to tell a made object from a rendered one, and it
 * follows curvature almost exactly: convex is bright, concave is dark.
 *
 * This computes a signed curvature per vertex from the mesh alone — no knowledge
 * of how the part was generated — and squashes it to [-1, 1], where +1 is a sharp
 * exposed edge and -1 a tight crease. It lives on the vertex because it belongs
 * to the object, not to the placement: every copy of a petal wears the same way.
 */

import type { Mesh } from './types';

/**
 * Curvature is 1/length, and the parts are in millimetres, so a reference radius
 * says what counts as "tight". At 0.6 mm a broken edge or a rivet head saturates
 * while the sweep of a petal barely registers, which is right: a cupped petal is
 * not worn along its whole face just for being curved.
 */
const REFERENCE_RADIUS = 0.6;

export function computeWear(mesh: Mesh, reference = REFERENCE_RADIUS): Float32Array {
  const { positions: p, indices } = mesh;
  const count = p.length / 3;
  // Curvature is read from the geometry's own normals, not the shading ones.
  // A plate's vertex normals leave out its chased relief, which the shader
  // adds per pixel; the wear on a ridge still has to see the ridge.
  const n = geometricNormals(mesh);
  const kSum = new Float64Array(count);
  const kCount = new Uint32Array(count);
  const nbSum = new Float64Array(count * 3);

  // --- edge curvature: how fast the normal turns along each edge ---
  const edge = (a: number, b: number) => {
    const dx = p[b * 3] - p[a * 3];
    const dy = p[b * 3 + 1] - p[a * 3 + 1];
    const dz = p[b * 3 + 2] - p[a * 3 + 2];
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-12) return;
    const dnx = n[b * 3] - n[a * 3];
    const dny = n[b * 3 + 1] - n[a * 3 + 1];
    const dnz = n[b * 3 + 2] - n[a * 3 + 2];
    // normals spreading apart along the edge means the surface bends away: convex
    const k = (dnx * dx + dny * dy + dnz * dz) / len2;
    kSum[a] += k; kCount[a]++;
    kSum[b] += k; kCount[b]++;
    nbSum[a * 3] += p[b * 3]; nbSum[a * 3 + 1] += p[b * 3 + 1]; nbSum[a * 3 + 2] += p[b * 3 + 2];
    nbSum[b * 3] += p[a * 3]; nbSum[b * 3 + 1] += p[a * 3 + 1]; nbSum[b * 3 + 2] += p[a * 3 + 2];
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (a < b) edge(a, b);
    if (b < c) edge(b, c);
    if (c < a) edge(c, a);
  }

  const wear = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const k = kCount[v] ? kSum[v] / kCount[v] : 0;
    wear[v] = Math.tanh(k * reference);
  }

  // --- sharp edges: vertices sharing a position but not a normal ---
  // Generators duplicate a vertex where the surface creases, so the edge loop
  // above never sees the crease at all: each copy only connects to its own face.
  // Find the copies and judge the crease by whether one face falls below the
  // other's tangent plane.
  const buckets = new Map<string, number[]>();
  for (let v = 0; v < count; v++) {
    const key = `${Math.round(p[v * 3] * 1e4)},${Math.round(p[v * 3 + 1] * 1e4)},${Math.round(p[v * 3 + 2] * 1e4)}`;
    const list = buckets.get(key);
    if (list) list.push(v); else buckets.set(key, [v]);
  }
  const sharp = new Float32Array(count);
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    for (const a of group) {
      let verdict = 0;
      for (const b of group) {
        if (a === b || !kCount[b]) continue;
        const cos = n[a * 3] * n[b * 3] + n[a * 3 + 1] * n[b * 3 + 1] + n[a * 3 + 2] * n[b * 3 + 2];
        if (cos > 0.94) continue; // same face, just a seam
        // centroid of b's neighbours, relative to the shared position
        const cx = nbSum[b * 3] / kCount[b] - p[a * 3];
        const cy = nbSum[b * 3 + 1] / kCount[b] - p[a * 3 + 1];
        const cz = nbSum[b * 3 + 2] / kCount[b] - p[a * 3 + 2];
        const below = n[a * 3] * cx + n[a * 3 + 1] * cy + n[a * 3 + 2] * cz;
        verdict += below < 0 ? 1 : -1;
      }
      if (verdict > 0) sharp[a] = 1;
      else if (verdict < 0) sharp[a] = -1;
    }
  }
  for (let v = 0; v < count; v++) {
    if (sharp[v] > 0) wear[v] = Math.max(wear[v], 0.9);
    else if (sharp[v] < 0) wear[v] = Math.min(wear[v], -0.9);
  }

  // --- one smoothing pass, so a bright edge bleeds a little into its face ---
  // Wear spreads across duplicate positions too, or a seam would show as a line.
  const out = new Float32Array(count);
  const acc = new Float64Array(count);
  const cnt = new Uint32Array(count);
  for (let t = 0; t < indices.length; t += 3) {
    for (let i = 0; i < 3; i++) {
      const a = indices[t + i], b = indices[t + ((i + 1) % 3)];
      acc[a] += wear[b]; cnt[a]++;
      acc[b] += wear[a]; cnt[b]++;
    }
  }
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    let s = 0;
    for (const v of group) s += wear[v];
    for (const v of group) { acc[v] += s - wear[v]; cnt[v] += group.length - 1; }
  }
  for (let v = 0; v < count; v++) {
    const mean = cnt[v] ? acc[v] / cnt[v] : wear[v];
    out[v] = 0.5 * wear[v] + 0.5 * mean;
  }
  return out;
}

/** Area-weighted normals from the triangles alone. */
function geometricNormals(mesh: Mesh): Float32Array {
  const { positions: p, indices } = mesh;
  const n = new Float32Array(p.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
