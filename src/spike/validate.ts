/**
 * Headless checks for the mesher. Run with: npx tsx src/spike/validate.ts
 *
 * A dual contourer can look plausible in a screenshot while being topologically
 * broken, so this asserts the properties that actually matter downstream:
 * watertightness, consistent winding, and how far the surface sits from the field.
 */
import { dualContour } from '../mesh/dualContour';
import { sphere, box, torus } from '../sdf/primitives';
import { subtract, union, translate } from '../sdf/ops';
import { catalogue } from './catalogue';
import { plate, defaultPlate } from '../parts/plate';
import type { SDF, Box3 } from '../sdf/types';

interface Report {
  name: string;
  resolution: number | string;
  tris: number;
  verts: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  flippedFaces: number | null;
  maxOffset: number;
  rmsOffset: number;
  ms: number;
}

function analyse(
  name: string,
  f: SDF,
  bounds: Box3,
  resolution: number,
  outwardFrom?: [number, number, number],
  cellSize?: number,
): Report {
  const m = dualContour(f, cellSize ? { bounds, cellSize, ao: false } : { bounds, resolution, ao: false });
  const { positions, indices } = m;

  // weld the crease-split duplicates so edge counts reflect real topology
  const key = new Map<string, number>();
  const weld = new Int32Array(positions.length / 3);
  for (let v = 0; v < weld.length; v++) {
    const k = `${positions[v * 3].toFixed(5)},${positions[v * 3 + 1].toFixed(5)},${positions[v * 3 + 2].toFixed(5)}`;
    let id = key.get(k);
    if (id === undefined) { id = key.size; key.set(k, id); }
    weld[v] = id;
  }

  const edges = new Map<number, number>();
  const bump = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const id = lo * 4294967296 + hi;
    edges.set(id, (edges.get(id) ?? 0) + 1);
  };

  let flipped = 0;
  let maxOffset = 0;
  let sumSq = 0;

  for (let t = 0; t < indices.length / 3; t++) {
    const a = weld[indices[t * 3]], b = weld[indices[t * 3 + 1]], c = weld[indices[t * 3 + 2]];
    if (a === b || b === c || a === c) continue; // degenerate, ignore for topology
    bump(a, b); bump(b, c); bump(c, a);

    const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
    const e1 = [positions[ib] - positions[ia], positions[ib + 1] - positions[ia + 1], positions[ib + 2] - positions[ia + 2]];
    const e2 = [positions[ic] - positions[ia], positions[ic + 1] - positions[ia + 1], positions[ic + 2] - positions[ia + 2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    if (outwardFrom) {
      const cx = (positions[ia] + positions[ib] + positions[ic]) / 3 - outwardFrom[0];
      const cy = (positions[ia + 1] + positions[ib + 1] + positions[ic + 1]) / 3 - outwardFrom[1];
      const cz = (positions[ia + 2] + positions[ib + 2] + positions[ic + 2]) / 3 - outwardFrom[2];
      if (n[0] * cx + n[1] * cy + n[2] * cz < 0) flipped++;
    }
  }

  for (let v = 0; v < positions.length / 3; v++) {
    const d = Math.abs(f(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]));
    if (d > maxOffset) maxOffset = d;
    sumSq += d * d;
  }

  let boundary = 0, nonManifold = 0;
  for (const count of edges.values()) {
    if (count === 1) boundary++;
    else if (count > 2) nonManifold++;
  }

  return {
    name,
    resolution,
    tris: m.stats.triangleCount,
    verts: m.stats.vertexCount,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    flippedFaces: outwardFrom ? flipped : null,
    maxOffset,
    rmsOffset: Math.sqrt(sumSq / (positions.length / 3)),
    ms: m.stats.totalMs,
  };
}

const cases: Array<[string, SDF, Box3, [number, number, number] | undefined]> = [
  ['sphere r10', sphere(10), { min: [-11, -11, -11], max: [11, 11, 11] }, [0, 0, 0]],
  ['box 8x6x4', box(8, 6, 4), { min: [-9, -7, -5], max: [9, 7, 5] }, [0, 0, 0]],
  ['torus 10/3', torus(10, 3), { min: [-14, -14, -4], max: [14, 14, 4] }, undefined],
  [
    'box minus sphere',
    subtract(box(8, 8, 8), translate(sphere(6), 4, 4, 4)),
    { min: [-9, -9, -9], max: [9, 9, 9] },
    undefined,
  ],
  [
    'two spheres',
    union(translate(sphere(6), -4, 0, 0), translate(sphere(6), 4, 0, 0)),
    { min: [-11, -7, -7], max: [11, 7, 7] },
    [0, 0, 0],
  ],
];

const rows: Report[] = [];
for (const [name, f, bounds, outward] of cases) {
  rows.push(analyse(name, f, bounds, 64, outward));
}
for (const res of [48, 64, 96, 128, 160]) {
  const p = plate(defaultPlate);
  rows.push(analyse('plate', p.sdf, p.bounds, res, undefined));
}

// every catalogue entry at the detail its own generator asks for
for (const [name, make] of Object.entries(catalogue)) {
  const part = make();
  const r = analyse(name, part.sdf, part.bounds, 0, undefined, part.detail);
  r.resolution = part.detail.toFixed(2);
  rows.push(r);
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  ['case'.padEnd(18), pad('res', 4), pad('tris', 8), pad('bound', 6), pad('nonmf', 6), pad('flip', 6), pad('maxOff', 8), pad('rmsOff', 8), pad('ms', 7)].join(' '),
);
for (const r of rows) {
  console.log(
    [
      r.name.padEnd(18),
      pad(r.resolution, 4),
      pad(r.tris, 8),
      pad(r.boundaryEdges, 6),
      pad(r.nonManifoldEdges, 6),
      pad(r.flippedFaces ?? '-', 6),
      pad(r.maxOffset.toFixed(4), 8),
      pad(r.rmsOffset.toFixed(4), 8),
      pad(r.ms.toFixed(1), 7),
    ].join(' '),
  );
}
