/**
 * Headless checks for the surface generators. Run with:
 *   npx tsx src/spike/validate.ts
 *
 * Swept and revolved surfaces fail differently from contoured ones: the topology
 * is regular by construction, so what goes wrong is orientation, seams that do not
 * close, creases that shade smooth, and degenerate rings at poles and tapers.
 * These assert exactly that.
 */
import { catalogue } from './catalogue';
import type { Mesh } from '../mesh/types';

interface Report {
  name: string;
  tris: number;
  verts: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  invertedNormals: number;
  degenerate: number;
  volume: number;
  uvOut: number;
  badNormals: number;
}

function analyse(name: string, mesh: Mesh): Report {
  const { positions, normals, uvs, indices } = mesh;

  // Seam and crease vertices are duplicated on purpose, so topology has to be
  // judged on welded positions or every seam reads as a hole.
  // Quantise numerically, not via toFixed: a seam vertex lands on -2.4e-16 where
  // its twin is +0, and "-0.0000" != "0.0000" would report every closed seam as a hole.
  const q = (n: number) => Math.round(n * 1e4) / 1e4 + 0;
  const key = new Map<string, number>();
  const weld = new Int32Array(positions.length / 3);
  for (let v = 0; v < weld.length; v++) {
    const k = `${q(positions[v * 3])},${q(positions[v * 3 + 1])},${q(positions[v * 3 + 2])}`;
    let id = key.get(k);
    if (id === undefined) { id = key.size; key.set(k, id); }
    weld[v] = id;
  }

  const edges = new Map<number, number>();
  const bump = (a: number, b: number) => {
    const id = Math.min(a, b) * 4294967296 + Math.max(a, b);
    edges.set(id, (edges.get(id) ?? 0) + 1);
  };

  let degenerate = 0;
  let inverted = 0;
  let volume = 0;

  for (let t = 0; t < indices.length / 3; t++) {
    const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const area = Math.hypot(nx, ny, nz) / 2;

    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;

    if (area < 1e-9) { degenerate++; continue; }

    // the authored vertex normal should agree with the face it belongs to;
    // disagreement means a winding or an orientation bug, not a smooth shading choice
    const vn = normals[ia] + normals[ib] + normals[ic];
    const vny = normals[ia + 1] + normals[ib + 1] + normals[ic + 1];
    const vnz = normals[ia + 2] + normals[ib + 2] + normals[ic + 2];
    if (nx * vn + ny * vny + nz * vnz < 0) inverted++;

    const a = weld[indices[t * 3]], b = weld[indices[t * 3 + 1]], c = weld[indices[t * 3 + 2]];
    if (a !== b && b !== c && a !== c) { bump(a, b); bump(b, c); bump(c, a); }
  }

  let boundary = 0, nonManifold = 0;
  for (const count of edges.values()) {
    if (count === 1) boundary++;
    else if (count > 2) nonManifold++;
  }

  let uvOut = 0;
  for (let i = 0; i < uvs.length; i++) {
    if (!Number.isFinite(uvs[i]) || uvs[i] < -1e-4 || uvs[i] > 1 + 1e-4) uvOut++;
  }

  let badNormals = 0;
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]);
    if (!Number.isFinite(l) || Math.abs(l - 1) > 1e-3) badNormals++;
  }

  return {
    name,
    tris: indices.length / 3,
    verts: positions.length / 3,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    invertedNormals: inverted,
    degenerate,
    volume,
    uvOut,
    badNormals,
  };
}

const rows: Report[] = [];
for (const [name, make] of Object.entries(catalogue)) {
  const t0 = performance.now();
  const part = make();
  const ms = performance.now() - t0;
  const r = analyse(name, part.mesh);
  rows.push(r);
  (r as Report & { ms: number }).ms = ms;
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  ['part'.padEnd(16), pad('tris', 7), pad('verts', 7), pad('open', 6), pad('nonmf', 6),
   pad('flip', 5), pad('degen', 6), pad('uv!', 4), pad('nrm!', 5), pad('volume', 9), pad('ms', 6)].join(' '),
);

let failures = 0;
for (const r of rows) {
  const bad = r.boundaryEdges || r.nonManifoldEdges || r.invertedNormals || r.uvOut || r.badNormals || r.volume <= 0;
  if (bad) failures++;
  console.log(
    [
      r.name.padEnd(16),
      pad(r.tris, 7),
      pad(r.verts, 7),
      pad(r.boundaryEdges, 6),
      pad(r.nonManifoldEdges, 6),
      pad(r.invertedNormals, 5),
      pad(r.degenerate, 6),
      pad(r.uvOut, 4),
      pad(r.badNormals, 5),
      pad(r.volume.toFixed(1), 9),
      pad(((r as Report & { ms: number }).ms).toFixed(1), 6),
    ].join(' ') + (bad ? '   <-' : ''),
  );
}
console.log(`\n${rows.length - failures}/${rows.length} clean`);
