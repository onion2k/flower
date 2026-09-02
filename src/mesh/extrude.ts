import earcut from 'earcut';
import type { Vec2 } from '../geom/types';
import { MeshBuilder, type Mesh } from './types';

export interface ExtrudeOptions {
  /** Closed outer boundary, counter-clockwise. */
  outline: Vec2[];
  /** Closed hole boundaries, clockwise. */
  holes?: Vec2[][];
  thickness: number;
  /**
   * Edge break on both faces. Small but load-bearing: a plate with square edges
   * catches no light along its outline and reads as cut paper rather than metal.
   */
  bevel?: number;
  /**
   * Spacing of the interior vertices to give the cap, for a plate that is going
   * to be bent afterwards.
   *
   * Ear clipping is free to answer with long fans — one vertex joined to a run of
   * distant ones — and on a flat plate that is a perfectly good triangulation.
   * Bend it and those fans chord straight across the curve, so the middle of a
   * cupped leaf stays flat and creases where the fans meet — and every sliver
   * frays the highlight. Left undefined the cap is triangulated as before.
   */
  maxCapEdge?: number;
}

/**
 * Extrude a pierced 2D outline into a plate.
 *
 * Caps are triangulated in 2D — the only triangulation this project needs, since
 * parts are separate pieces that overlap and are riveted rather than booleaned
 * together. Walls and bevels are quad strips that follow the outline.
 */
export function extrude(opts: ExtrudeOptions): Mesh {
  const holes = opts.holes ?? [];
  const bevel = Math.min(opts.bevel ?? 0, opts.thickness / 2 - 1e-4);
  const hz = opts.thickness / 2;
  const inner = hz - bevel;

  const loops = [opts.outline, ...holes];
  const insets = loops.map((l) => (bevel > 0 ? insetLoop(l, bevel) : l));

  const mb = new MeshBuilder();
  const span = boundsOf(opts.outline);

  // --- caps, from the inset outline so the bevel has somewhere to sit ---
  for (const top of [true, false]) {
    const z = top ? hz : -hz;
    const nz = top ? 1 : -1;
    const flat: number[] = [];
    const holeIndices: number[] = [];
    for (let li = 0; li < insets.length; li++) {
      if (li > 0) holeIndices.push(flat.length / 2);
      for (const [x, y] of insets[li]) flat.push(x, y);
    }
    let tri = earcut(flat, holeIndices, 2);
    let points = flat;
    // A cap always gets some interior points, however flat it is. Per-vertex
    // shading — baked occlusion, curvature wear — interpolates across whatever
    // triangles exist, and a fan of slivers from rim to rim smears an edge value
    // over the whole face. Twenty or so points across the span is enough, and
    // still reaches the bars of a pierced leaf.
    const spacing = Math.min(opts.maxCapEdge ?? Infinity, Math.max(span.width, span.height) * 0.05);
    if (Number.isFinite(spacing) && spacing > 0) {
      ({ points, tris: tri } =
        tessellateCap(points, tri, insets, boundaryEdges(insets), spacing));
    }
    const base = mb.vertexCount;
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i], y = points[i + 1];
      mb.vertex(x, y, z, 0, 0, nz, (x - span.minX) / span.width, (y - span.minY) / span.height);
    }
    for (let i = 0; i < tri.length; i += 3) {
      // Every triangle is kept, including the occasional sliver earcut leaves
      // where an outline is nearly collinear. They are invisible, but they carry
      // edges: dropping them tears real holes in the cap around each piercing.
      if (top) mb.triangle(base + tri[i], base + tri[i + 1], base + tri[i + 2]);
      else mb.triangle(base + tri[i], base + tri[i + 2], base + tri[i + 1]);
    }
  }

  // --- bevel bands and walls, one ring pair per loop ---
  for (let li = 0; li < loops.length; li++) {
    const loop = loops[li];
    const insetLoopPts = insets[li];
    const outward = outwardNormals(loop);
    const perimeter = perimeterParam(loop);

    if (bevel > 0) {
      band(mb, insetLoopPts, loop, hz, inner, outward, perimeter, 1);
      band(mb, insetLoopPts, loop, hz, inner, outward, perimeter, -1);
    }
    // the straight wall between the two bevels
    wall(mb, loop, inner, -inner, outward, perimeter);
  }

  return mb.build();
}

const edgeKey = (a: number, b: number) => (a < b ? a * 4294967296 + b : b * 4294967296 + a);

/** The cap's own boundary, which tessellation must leave alone or it parts from the bevel. */
function boundaryEdges(loops: Vec2[][]): Set<number> {
  const out = new Set<number>();
  let base = 0;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      out.add(edgeKey(base + i, base + ((i + 1) % loop.length)));
    }
    base += loop.length;
  }
  return out;
}

/**
 * Give the cap interior vertices, then make its triangles well shaped.
 *
 * Ear clipping only ever uses the points it is given, and those are all on the
 * boundary. On a leaf that is a ribbon — a hundred points strung along two
 * margins ten millimetres apart — so every triangle it can possibly make is a
 * sliver: a fraction of a millimetre at one end and centimetres long. Flat, that
 * costs nothing, since a sliver in a plane is still exactly in the plane. Bend
 * the plate and those same slivers chord across the curve and tear the highlight
 * into a zigzag, which is what the eye actually notices.
 *
 * No amount of splitting existing edges fixes it, because splitting a sliver
 * gives two slivers. What is missing is points in the middle, so they are put
 * there directly: a lattice at the spacing the curvature asks for, each point
 * inserted into the triangle that contains it, then edges flipped toward Delaunay
 * and the interior relaxed. That is a mesh improvement pass rather than a mesher —
 * the boundary is never touched, so the cap still matches the bevel exactly.
 */
function tessellateCap(
  flat: number[], tris: number[], loops: Vec2[][], boundary: Set<number>, spacing: number,
): { points: number[]; tris: number[] } {
  const points = [...flat];
  let faces = [...tris];
  const boundaryVertices = flat.length / 2;

  const px = (i: number) => points[i * 2];
  const py = (i: number) => points[i * 2 + 1];
  const area2 = (a: number, b: number, c: number) =>
    (px(b) - px(a)) * (py(c) - py(a)) - (px(c) - px(a)) * (py(b) - py(a));

  // --- interior points, on a staggered lattice, clear of every boundary ---
  const inserted: Array<[number, number]> = [];
  {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of loops[0]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const dy = spacing * Math.sqrt(3) / 2;
    const clear = spacing * 0.62;
    for (let j = 0, y = minY + dy; y < maxY; j++, y += dy) {
      for (let x = minX + (j % 2 ? spacing / 2 : 0); x < maxX; x += spacing) {
        if (!inside([x, y], loops[0])) continue;
        if (distanceToLoop([x, y], loops[0]) < clear) continue;
        let ok = true;
        for (let h = 1; h < loops.length && ok; h++) {
          if (inside([x, y], loops[h]) || distanceToLoop([x, y], loops[h]) < clear) ok = false;
        }
        if (ok) inserted.push([x, y]);
      }
    }
  }
  if (!inserted.length) return { points, tris: faces };

  // --- split the containing triangle three ways for each new point ---
  for (const [x, y] of inserted) {
    let target = -1;
    for (let t = 0; t < faces.length; t += 3) {
      const [a, b, c] = [faces[t], faces[t + 1], faces[t + 2]];
      const s = Math.sign(area2(a, b, c)) || 1;
      const d0 = ((px(b) - px(a)) * (y - py(a)) - (x - px(a)) * (py(b) - py(a))) * s;
      const d1 = ((px(c) - px(b)) * (y - py(b)) - (x - px(b)) * (py(c) - py(b))) * s;
      const d2 = ((px(a) - px(c)) * (y - py(c)) - (x - px(c)) * (py(a) - py(c))) * s;
      if (d0 >= 0 && d1 >= 0 && d2 >= 0) { target = t; break; }
    }
    // a lattice point can miss every triangle where the inset outline has folded
    // over itself at a narrow tip; dropping it is right, it has nowhere to go
    if (target < 0) continue;
    const id = points.length / 2;
    points.push(x, y);
    const [a, b, c] = [faces[target], faces[target + 1], faces[target + 2]];
    faces[target] = a; faces[target + 1] = b; faces[target + 2] = id;
    faces.push(b, c, id, c, a, id);
  }

  // --- flip toward Delaunay, relax the interior, repeat ---
  for (let pass = 0; pass < 4; pass++) {
    flipToDelaunay(points, faces, boundary);
    relaxInterior(points, faces, boundaryVertices);
  }
  flipToDelaunay(points, faces, boundary);

  return { points, tris: faces };
}

/**
 * Flip every interior edge whose opposite vertex falls inside the other
 * triangle's circumcircle. Delaunay maximises the smallest angle, which is
 * exactly the property a sliver lacks.
 */
function flipToDelaunay(points: number[], faces: number[], boundary: Set<number>) {
  const px = (i: number) => points[i * 2];
  const py = (i: number) => points[i * 2 + 1];
  const area2 = (a: number, b: number, c: number) =>
    (px(b) - px(a)) * (py(c) - py(a)) - (px(c) - px(a)) * (py(b) - py(a));

  const inCircle = (a: number, b: number, c: number, d: number) => {
    const ax = px(a) - px(d), ay = py(a) - py(d);
    const bx = px(b) - px(d), by = py(b) - py(d);
    const cx = px(c) - px(d), cy = py(c) - py(d);
    return (
      (ax * ax + ay * ay) * (bx * cy - by * cx) -
      (bx * bx + by * by) * (ax * cy - ay * cx) +
      (cx * cx + cy * cy) * (ax * by - ay * bx)
    );
  };

  for (let sweep = 0; sweep < 12; sweep++) {
    const owner = new Map<number, number[]>();
    for (let t = 0; t < faces.length; t += 3) {
      for (let i = 0; i < 3; i++) {
        const k = edgeKey(faces[t + i], faces[t + ((i + 1) % 3)]);
        const list = owner.get(k);
        if (list) list.push(t); else owner.set(k, [t]);
      }
    }

    let flips = 0;
    const dirty = new Set<number>();
    for (const [key, ts] of owner) {
      if (ts.length !== 2 || boundary.has(key)) continue;
      const [t1, t2] = ts;
      if (dirty.has(t1) || dirty.has(t2)) continue;

      // orient: t1 carries the edge u -> v, so t2 carries v -> u
      const tri1 = [faces[t1], faces[t1 + 1], faces[t1 + 2]];
      const tri2 = [faces[t2], faces[t2 + 1], faces[t2 + 2]];
      const i1 = [0, 1, 2].find((i) => edgeKey(tri1[i], tri1[(i + 1) % 3]) === key)!;
      const u = tri1[i1], v = tri1[(i1 + 1) % 3], p = tri1[(i1 + 2) % 3];
      const q = tri2.find((x) => x !== u && x !== v)!;

      // both halves of the flipped quad must stay wound the right way round
      if (area2(u, q, p) <= 1e-12 || area2(q, v, p) <= 1e-12) continue;
      if (inCircle(u, v, p, q) <= 0) continue;

      faces[t1] = u; faces[t1 + 1] = q; faces[t1 + 2] = p;
      faces[t2] = q; faces[t2 + 1] = v; faces[t2 + 2] = p;
      dirty.add(t1); dirty.add(t2);
      flips++;
    }
    if (!flips) break;
  }
}

/**
 * Move each interior vertex to the average of its neighbours, but only when
 * every triangle it belongs to survives the move. Flipping fixes which points
 * are joined; this fixes where they are, and the two together are what turn a
 * lattice dropped into a fan triangulation into an even mesh.
 */
function relaxInterior(points: number[], faces: number[], boundaryVertices: number) {
  const count = points.length / 2;
  const neighbours: Array<Set<number>> = Array.from({ length: count }, () => new Set<number>());
  const incident: Array<number[]> = Array.from({ length: count }, () => []);
  for (let t = 0; t < faces.length; t += 3) {
    for (let i = 0; i < 3; i++) {
      const a = faces[t + i];
      neighbours[a].add(faces[t + ((i + 1) % 3)]);
      neighbours[a].add(faces[t + ((i + 2) % 3)]);
      incident[a].push(t);
    }
  }

  const px = (i: number) => points[i * 2];
  const py = (i: number) => points[i * 2 + 1];
  const area2 = (a: number, b: number, c: number) =>
    (px(b) - px(a)) * (py(c) - py(a)) - (px(c) - px(a)) * (py(b) - py(a));

  for (let v = boundaryVertices; v < count; v++) {
    if (!neighbours[v].size) continue;
    let sx = 0, sy = 0;
    for (const n of neighbours[v]) { sx += px(n); sy += py(n); }
    const ox = px(v), oy = py(v);
    points[v * 2] = sx / neighbours[v].size;
    points[v * 2 + 1] = sy / neighbours[v].size;
    for (const t of incident[v]) {
      if (area2(faces[t], faces[t + 1], faces[t + 2]) > 1e-12) continue;
      points[v * 2] = ox; points[v * 2 + 1] = oy;
      break;
    }
  }
}

function inside([x, y]: Vec2, loop: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function distanceToLoop([x, y]: Vec2, loop: Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ax, ay] = loop[j];
    const [bx, by] = loop[i];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

/** A sloped ring-to-ring band; `dir` is +1 for the upper bevel, -1 for the lower. */
/**
 * The edge break, as a quarter-round rather than a chamfer.
 *
 * A single 45° facet reads as machined: one flat glint, then nothing. A rounded
 * edge carries a highlight that slides as the piece turns, which is what a filed
 * and polished edge does, and the curvature-driven wear sees a smooth convex
 * band rather than two creases. Three steps are enough at these sizes.
 */
function band(
  mb: MeshBuilder,
  cap: Vec2[], wallLoop: Vec2[],
  hz: number, inner: number,
  outward: Vec2[],
  perimeter: number[],
  dir: number,
  steps = 3,
) {
  const n = cap.length;
  const base = mb.vertexCount;
  for (let k = 0; k <= steps; k++) {
    const theta = (k / steps) * (Math.PI / 2);
    const s = Math.sin(theta), c = Math.cos(theta);
    const z = dir * (inner + (hz - inner) * c);
    for (let i = 0; i < n; i++) {
      const [ox, oy] = outward[i];
      const x = cap[i][0] + (wallLoop[i][0] - cap[i][0]) * s;
      const y = cap[i][1] + (wallLoop[i][1] - cap[i][1]) * s;
      mb.vertex(x, y, z, ox * s, oy * s, dir * c, perimeter[i], k / steps);
    }
  }
  for (let k = 0; k < steps; k++) {
    const r0 = base + k * n, r1 = base + (k + 1) * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (dir > 0) mb.quad(r0 + i, r1 + i, r1 + j, r0 + j);
      else mb.quad(r0 + i, r0 + j, r1 + j, r1 + i);
    }
  }
}

function wall(mb: MeshBuilder, loop: Vec2[], topZ: number, botZ: number, outward: Vec2[], perimeter: number[]) {
  const n = loop.length;
  const base = mb.vertexCount;
  for (let i = 0; i < n; i++) {
    const [ox, oy] = outward[i];
    mb.vertex(loop[i][0], loop[i][1], topZ, ox, oy, 0, perimeter[i], 1);
  }
  for (let i = 0; i < n; i++) {
    const [ox, oy] = outward[i];
    mb.vertex(loop[i][0], loop[i][1], botZ, ox, oy, 0, perimeter[i], 0);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    mb.quad(base + i, base + n + i, base + n + j, base + j);
  }
}

/** Outward normal per vertex, averaged from the two adjacent edges. */
function outwardNormals(loop: Vec2[]): Vec2[] {
  const n = loop.length;
  return loop.map((_, i) => {
    const p = loop[(i - 1 + n) % n];
    const c = loop[i];
    const q = loop[(i + 1) % n];
    const e1: Vec2 = [c[0] - p[0], c[1] - p[1]];
    const e2: Vec2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1;
    const l2 = Math.hypot(e2[0], e2[1]) || 1;
    const nx = e1[1] / l1 + e2[1] / l2;
    const ny = -e1[0] / l1 - e2[0] / l2;
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  });
}

/**
 * Move every vertex inward along its bisector. Uses the loop's own winding, so a
 * clockwise hole insets outward — which is what a bevel round a piercing does.
 */
function insetLoop(loop: Vec2[], dist: number): Vec2[] {
  const outward = outwardNormals(loop);
  return loop.map(([x, y], i) => [x - outward[i][0] * dist, y - outward[i][1] * dist] as Vec2);
}

function perimeterParam(loop: Vec2[]): number[] {
  const out = [0];
  let total = 0;
  for (let i = 1; i < loop.length; i++) {
    total += Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]);
    out.push(total);
  }
  return total > 0 ? out.map((d) => d / total) : out;
}

function boundsOf(loop: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of loop) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, width: maxX - minX || 1, height: maxY - minY || 1 };
}
