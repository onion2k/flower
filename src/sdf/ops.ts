import type { SDF, SDF2 } from './types';

export const union = (...fs: SDF[]): SDF => (x, y, z) => {
  let m = Infinity;
  for (let i = 0; i < fs.length; i++) {
    const d = fs[i](x, y, z);
    if (d < m) m = d;
  }
  return m;
};

export const subtract = (base: SDF, ...cuts: SDF[]): SDF => (x, y, z) => {
  let d = base(x, y, z);
  for (let i = 0; i < cuts.length; i++) {
    const c = -cuts[i](x, y, z);
    if (c > d) d = c;
  }
  return d;
};

export const intersect = (...fs: SDF[]): SDF => (x, y, z) => {
  let m = -Infinity;
  for (let i = 0; i < fs.length; i++) {
    const d = fs[i](x, y, z);
    if (d > m) m = d;
  }
  return m;
};

/** Polynomial smooth min — the flare where a wire meets its mounting boss. */
export const smoothUnion = (k: number, a: SDF, b: SDF): SDF => (x, y, z) => {
  const da = a(x, y, z);
  const db = b(x, y, z);
  const h = Math.min(Math.max(0.5 + (0.5 * (db - da)) / k, 0), 1);
  return db + (da - db) * h - k * h * (1 - h);
};

export const smoothSubtract = (k: number, base: SDF, cut: SDF): SDF => (x, y, z) => {
  const da = base(x, y, z);
  const db = -cut(x, y, z);
  const h = Math.min(Math.max(0.5 - (0.5 * (da - db)) / k, 0), 1);
  return da + (db - da) * h + k * h * (1 - h);
};

/** Offset the surface outward by r, rounding all convex edges. */
export const round = (f: SDF, r: number): SDF => (x, y, z) => f(x, y, z) - r;

/** Hollow to a wall of thickness 2*t. */
export const shell = (f: SDF, t: number): SDF => (x, y, z) => Math.abs(f(x, y, z)) - t;

export const translate = (f: SDF, tx: number, ty: number, tz: number): SDF =>
  (x, y, z) => f(x - tx, y - ty, z - tz);

export const scale = (f: SDF, s: number): SDF => (x, y, z) => f(x / s, y / s, z / s) * s;

export const rotateX = (f: SDF, a: number): SDF => {
  const c = Math.cos(-a), s = Math.sin(-a);
  return (x, y, z) => f(x, y * c - z * s, y * s + z * c);
};

export const rotateY = (f: SDF, a: number): SDF => {
  const c = Math.cos(-a), s = Math.sin(-a);
  return (x, y, z) => f(x * c + z * s, y, -x * s + z * c);
};

export const rotateZ = (f: SDF, a: number): SDF => {
  const c = Math.cos(-a), s = Math.sin(-a);
  return (x, y, z) => f(x * c - y * s, x * s + y * c, z);
};

/**
 * Extrude a 2D profile along Z to half-height `hz`.
 * `fillet` rounds the top and bottom rims, which is what reads as a milled edge
 * break rather than a laser-cut one. The bore walls of subtracted holes stay sharp.
 */
export const extrude = (profile: SDF2, hz: number, fillet = 0): SDF => {
  const h = hz - fillet;
  return (x, y, z) => {
    const d = profile(x, y) + fillet;
    const dz = Math.abs(z) - h;
    const od = Math.max(d, 0);
    const oz = Math.max(dz, 0);
    return Math.hypot(od, oz) + Math.min(Math.max(d, dz), 0) - fillet;
  };
};

/** Revolve a 2D profile (x = radius, y = height) around the Z axis. */
export const revolve = (profile: SDF2, offset = 0): SDF =>
  (x, y, z) => profile(Math.hypot(x, y) - offset, z);

/** N rotated copies around Z. See radialRepeat2 for why two wedges are sampled. */
export const radialRepeat = (f: SDF, n: number): SDF => {
  const seg = (Math.PI * 2) / n;
  return (x, y, z) => {
    const kf = Math.atan2(y, x) / seg;
    const k0 = Math.round(kf);
    const k1 = kf > k0 ? k0 + 1 : k0 - 1;
    let best = Infinity;
    for (const k of [k0, k1]) {
      const t = -seg * k;
      const c = Math.cos(t), s = Math.sin(t);
      const d = f(x * c - y * s, x * s + y * c, z);
      if (d < best) best = d;
    }
    return best;
  };
};

export const mirrorX = (f: SDF): SDF => (x, y, z) => f(Math.abs(x), y, z);
