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
    const tri = earcut(flat, holeIndices, 2);
    const base = mb.vertexCount;
    for (let i = 0; i < flat.length; i += 2) {
      const x = flat[i], y = flat[i + 1];
      mb.vertex(x, y, z, 0, 0, nz, (x - span.minX) / span.width, (y - span.minY) / span.height);
    }
    for (let i = 0; i < tri.length; i += 3) {
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
      band(mb, insetLoopPts, hz, loop, inner, outward, perimeter, 1);
      band(mb, loop, -inner, insetLoopPts, -hz, outward, perimeter, -1);
    }
    // the straight wall between the two bevels
    wall(mb, loop, inner, -inner, outward, perimeter);
  }

  return mb.build();
}

/** A sloped ring-to-ring band; `dir` is +1 for the upper bevel, -1 for the lower. */
function band(
  mb: MeshBuilder,
  a: Vec2[], az: number,
  b: Vec2[], bz: number,
  outward: Vec2[],
  perimeter: number[],
  dir: number,
) {
  const n = a.length;
  const base = mb.vertexCount;
  const k = Math.SQRT1_2;
  for (let i = 0; i < n; i++) {
    const [ox, oy] = outward[i];
    mb.vertex(a[i][0], a[i][1], az, ox * k, oy * k, dir * k, perimeter[i], 0);
  }
  for (let i = 0; i < n; i++) {
    const [ox, oy] = outward[i];
    mb.vertex(b[i][0], b[i][1], bz, ox * k, oy * k, dir * k, perimeter[i], 1);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    mb.quad(base + i, base + n + i, base + n + j, base + j);
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
