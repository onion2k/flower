import type { SDF } from './types';

export const sphere = (r: number): SDF => (x, y, z) => Math.hypot(x, y, z) - r;

export const box = (hx: number, hy: number, hz: number, round = 0): SDF => (x, y, z) => {
  const dx = Math.abs(x) - hx + round;
  const dy = Math.abs(y) - hy + round;
  const dz = Math.abs(z) - hz + round;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(dx, dy, dz), 0) - round;
};

/** Cylinder along +Z, total height 2*hz. `round` fillets the rim. */
export const cylinder = (r: number, hz: number, round = 0): SDF => (x, y, z) => {
  const dr = Math.hypot(x, y) - r + round;
  const dz = Math.abs(z) - hz + round;
  const or_ = Math.max(dr, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(or_, oz) + Math.min(Math.max(dr, dz), 0) - round;
};

/** Torus in the XY plane, tube radius `t` around ring radius `r`. */
export const torus = (r: number, t: number): SDF => (x, y, z) => {
  const q = Math.hypot(x, y) - r;
  return Math.hypot(q, z) - t;
};

/** Capsule from a to b with radius r — the workhorse for wire segments. */
export const capsule = (
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
): SDF => {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const bb = bax * bax + bay * bay + baz * baz;
  return (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    let h = (px * bax + py * bay + pz * baz) / bb;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    return Math.hypot(px - bax * h, py - bay * h, pz - baz * h) - r;
  };
};

/** Half-space with outward normal n (must be unit), offset h from origin. */
export const plane = (nx: number, ny: number, nz: number, h = 0): SDF =>
  (x, y, z) => x * nx + y * ny + z * nz - h;

/** Cone frustum along +Z — screw head tapers, countersinks. */
export const frustum = (r0: number, r1: number, hz: number): SDF => (x, y, z) => {
  const q = Math.hypot(x, y);
  const t = Math.min(Math.max((z + hz) / (2 * hz), 0), 1);
  const r = r0 + (r1 - r0) * t;
  const dr = q - r;
  const dz = Math.abs(z) - hz;
  const or_ = Math.max(dr, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(or_, oz) + Math.min(Math.max(dr, dz), 0);
};
