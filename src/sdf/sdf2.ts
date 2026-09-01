import type { SDF2 } from './types';

/** Exact-distance 2D profiles. These are the source of the "milled plate" silhouettes. */

export const circle2 = (r: number): SDF2 => (x, y) => Math.hypot(x, y) - r;

export const annulus2 = (inner: number, outer: number): SDF2 => (x, y) => {
  const d = Math.hypot(x, y);
  return Math.max(d - outer, inner - d);
};

export const box2 = (hx: number, hy: number, round = 0): SDF2 => (x, y) => {
  const dx = Math.abs(x) - hx + round;
  const dy = Math.abs(y) - hy + round;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - round;
};

/** Regular n-gon of circumradius r, exact distance. */
export const ngon2 = (n: number, r: number): SDF2 => {
  const seg = (Math.PI * 2) / n;
  const apothem = r * Math.cos(Math.PI / n);
  return (x, y) => {
    let a = Math.atan2(y, x);
    const d = Math.hypot(x, y);
    // fold into one wedge
    a = a - seg * Math.round(a / seg);
    return d * Math.cos(a) - apothem;
  };
};

export const translate2 = (f: SDF2, tx: number, ty: number): SDF2 => (x, y) => f(x - tx, y - ty);

export const rotate2 = (f: SDF2, angle: number): SDF2 => {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  return (x, y) => f(x * c - y * s, x * s + y * c);
};

export const union2 = (...fs: SDF2[]): SDF2 => (x, y) => {
  let m = Infinity;
  for (let i = 0; i < fs.length; i++) m = Math.min(m, fs[i](x, y));
  return m;
};

export const subtract2 = (base: SDF2, ...cuts: SDF2[]): SDF2 => (x, y) => {
  let d = base(x, y);
  for (let i = 0; i < cuts.length; i++) d = Math.max(d, -cuts[i](x, y));
  return d;
};

export const intersect2 = (...fs: SDF2[]): SDF2 => (x, y) => {
  let m = -Infinity;
  for (let i = 0; i < fs.length; i++) m = Math.max(m, fs[i](x, y));
  return m;
};

/** Round the corners of a profile by r (offsets inward then back out). */
export const round2 = (f: SDF2, r: number): SDF2 => (x, y) => f(x, y) - r;

/**
 * N copies of `f` arranged around the origin.
 *
 * Folding into a single wedge is only correct while a copy stays inside its own
 * wedge; anything straddling a boundary (a slot centred on the seam, say) loses
 * half of itself and the field goes wrong right where the feature is. Evaluating
 * the two nearest wedges and taking the union costs one extra call and removes
 * that whole class of authoring trap.
 */
export const radialRepeat2 = (f: SDF2, n: number): SDF2 => {
  const seg = (Math.PI * 2) / n;
  return (x, y) => {
    const kf = Math.atan2(y, x) / seg;
    const k0 = Math.round(kf);
    const k1 = kf > k0 ? k0 + 1 : k0 - 1;
    let best = Infinity;
    for (const k of [k0, k1]) {
      const t = -seg * k;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const d = f(x * c - y * s, x * s + y * c);
      if (d < best) best = d;
    }
    return best;
  };
};
