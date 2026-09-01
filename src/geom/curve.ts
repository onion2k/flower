import type { Vec3 } from '../sdf/types';
import { add, mul, normalize, sub } from './vec';

/** A parametric space curve on [0, 1]. Wire paths are authored as these. */
export interface Curve {
  at(t: number): Vec3;
}

export const line = (a: Vec3, b: Vec3): Curve => ({
  at: (t) => add(a, mul(sub(b, a), t)),
});

/** Circular arc in the XY plane, swept from `from` to `to` radians. */
export const arc = (radius: number, from: number, to: number, z = 0): Curve => ({
  at: (t) => {
    const a = from + (to - from) * t;
    return [Math.cos(a) * radius, Math.sin(a) * radius, z];
  },
});

export const helix = (radius: number, height: number, turns: number): Curve => ({
  at: (t) => {
    const a = t * turns * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius, (t - 0.5) * height];
  },
});

export const bezier3 = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3): Curve => ({
  at: (t) => {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
      a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
    ];
  },
});

/**
 * An arc that starts at `a`, ends at `b` and bulges by `sag` perpendicular to the
 * chord. The most useful authoring form for a strut spanning two anchors.
 */
export const bow = (a: Vec3, b: Vec3, sag: number, upHint: Vec3 = [0, 0, 1]): Curve => {
  const mid = mul(add(a, b), 0.5);
  const chord = sub(b, a);
  const n = normalize([
    chord[1] * upHint[2] - chord[2] * upHint[1],
    chord[2] * upHint[0] - chord[0] * upHint[2],
    chord[0] * upHint[1] - chord[1] * upHint[0],
  ]);
  const apex = add(mid, mul(n, sag));
  // quadratic through a, apex, b, expressed as a cubic
  const c1 = add(a, mul(sub(apex, a), 2 / 3));
  const c2 = add(b, mul(sub(apex, b), 2 / 3));
  return bezier3(a, c1, c2, b);
};

/** Sample a curve into a polyline of `segments + 1` points. */
export function samplePath(curve: Curve, segments: number): Vec3[] {
  const pts: Vec3[] = new Array(segments + 1);
  for (let i = 0; i <= segments; i++) pts[i] = curve.at(i / segments);
  return pts;
}

export function pathTangent(pts: Vec3[], index: number): Vec3 {
  const i = Math.min(Math.max(index, 0), pts.length - 1);
  const a = pts[Math.max(i - 1, 0)];
  const b = pts[Math.min(i + 1, pts.length - 1)];
  return normalize(sub(b, a));
}
