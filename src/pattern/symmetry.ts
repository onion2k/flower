import type { Vec3 } from '../geom/types';
import {
  frameAlong, fromBasis, identity, multiply, reflection, rotationAbout, translation,
  uniformScale, type Mat4,
} from '../geom/transform';
import { cross, dot, normalize, sub } from '../geom/vec';

/**
 * A symmetry is just a list of placements.
 *
 * Keeping it that dumb is what makes it compose: a nested mandala is a ring of
 * rings, a mirrored rosette is a ring times a reflection, and every one of them
 * still comes out as a flat array the renderer can instance in a single draw.
 *
 * Convention: each transform's +X is the outward or growth direction and +Z is
 * the face normal, matching how parts are authored — leaves and wires run along
 * +X from their own origin — so a part drops into any of these without fixing up.
 */
export type Symmetry = Mat4[];

/** n copies rotated about Z. Each one's +X points radially outward. */
export function radial(count: number, phase = 0): Symmetry {
  const out: Symmetry = [];
  for (let i = 0; i < count; i++) {
    out.push(rotationAbout([0, 0, 1], phase + (i / count) * Math.PI * 2));
  }
  return out;
}

export interface RingOptions {
  phase?: number;
  /** Lift the whole ring along Z. */
  z?: number;
  /** Tip each copy up out of the plane, in radians. */
  tilt?: number;
  scale?: number;
}

/** n copies on a circle of the given radius, each facing outward. */
export function ring(count: number, radius: number, opts: RingOptions = {}): Symmetry {
  const { phase = 0, z = 0, tilt = 0, scale = 1 } = opts;
  const out: Symmetry = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const spin = rotationAbout([0, 0, 1], a);
    const outward: Vec3 = [Math.cos(a), Math.sin(a), 0];
    const place = translation([outward[0] * radius, outward[1] * radius, z]);
    // tilt about the local tangential axis, so copies lift out of the plane together
    const tangent: Vec3 = [-Math.sin(a), Math.cos(a), 0];
    const lift = tilt ? rotationAbout(tangent, tilt) : identity();
    out.push(multiply(multiply(place, lift), multiply(spin, uniformScale(scale))));
  }
  return out;
}

/**
 * The dihedral group: n rotations plus their mirror images. The mirrored copies
 * have a negative determinant, which reverses their triangle winding — harmless
 * while backface culling is off, because shading uses the transformed vertex
 * normal rather than one derived from the winding.
 */
export function dihedral(count: number, mirrorNormal: Vec3 = [0, 1, 0]): Symmetry {
  const rot = radial(count);
  const mir = reflection(mirrorNormal);
  return [...rot, ...rot.map((m) => multiply(m, mir))];
}

export function mirror(normal: Vec3 = [0, 1, 0]): Symmetry {
  return [identity(), reflection(normal)];
}

/** A rising, turning stack — spiral staircases, twisted columns, stems. */
export function helical(
  count: number,
  radius: number,
  rise: number,
  turns = 1,
  opts: { tilt?: number; taper?: number } = {},
): Symmetry {
  const { tilt = 0, taper = 1 } = opts;
  const out: Symmetry = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const a = t * turns * Math.PI * 2;
    const s = 1 + (taper - 1) * t;
    out.push(
      ...ring(1, radius * s, { phase: a, z: (t - 0.5) * rise, tilt, scale: s }),
    );
  }
  return out;
}

/**
 * Golden-angle spiral. The arrangement a sunflower head uses, and the reason a
 * scattered form still reads as ordered rather than random.
 */
export function phyllotaxis(
  count: number,
  spacing: number,
  opts: {
    rise?: number;
    /** Constant, or a function of the normalised index — a flower's inner petals
     *  stand up and its outer ones lie flat, which a single number cannot say. */
    tilt?: number | ((t: number) => number);
    taper?: number;
    startIndex?: number;
  } = {},
): Symmetry {
  const { rise = 0, tilt = 0, taper = 1, startIndex = 0 } = opts;
  const tiltAt = typeof tilt === 'function' ? tilt : () => tilt;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out: Symmetry = [];
  for (let i = 0; i < count; i++) {
    const k = i + startIndex;
    const t = count > 1 ? i / (count - 1) : 0;
    const r = spacing * Math.sqrt(k);
    const a = k * golden;
    const s = 1 + (taper - 1) * t;
    out.push(...ring(1, r, { phase: a, z: rise * t, tilt: tiltAt(t), scale: s }));
  }
  return out;
}

export interface ShellOptions {
  /**
   * 'radial' points each copy straight out, which spikes. 'tangential' lays it
   * along the surface with its face outward — overlapping scales or petals, and
   * the only one of the two that reads as a single body rather than a hedgehog.
   */
  orient?: 'radial' | 'tangential';
  /** Lift the far end off the surface, in radians. Gives scales their overlap. */
  lean?: number;
  turns?: number;
}

/**
 * Near-even points on a sphere about Z.
 *
 * A true icosahedral group gives only 60 placements at fixed positions; the
 * golden-angle spiral gives any count with almost the same evenness, which
 * matters more when the thing being placed is a leaf than a face of a solid.
 */
export function sphereShell(count: number, radius: number, opts: ShellOptions = {}): Symmetry {
  const { orient = 'radial', lean = 0, turns = 1 } = opts;
  const golden = Math.PI * (3 - Math.sqrt(5)) * turns;
  const out: Symmetry = [];

  for (let i = 0; i < count; i++) {
    const z = count > 1 ? 1 - (i / (count - 1)) * 2 : 0;
    const r = Math.sqrt(Math.max(1 - z * z, 0));
    const a = i * golden;
    const n = normalize([Math.cos(a) * r, Math.sin(a) * r, z]);
    const origin: Vec3 = [n[0] * radius, n[1] * radius, n[2] * radius];

    if (orient === 'radial') {
      out.push(frameAlong(origin, n, [0, 0, 1]));
      continue;
    }

    // growth direction runs up the sphere toward the pole; face normal points out
    let up: Vec3 = [0, 0, 1];
    let x = sub(up, [n[0] * dot(up, n), n[1] * dot(up, n), n[2] * dot(up, n)]);
    if (Math.hypot(x[0], x[1], x[2]) < 1e-6) {
      up = [1, 0, 0];
      x = sub(up, [n[0] * dot(up, n), n[1] * dot(up, n), n[2] * dot(up, n)]);
    }
    x = normalize(x);
    const y = cross(n, x);
    const base = fromBasis(origin, x, y, n);
    out.push(lean ? multiply(base, rotationAbout([0, 1, 0], -lean)) : base);
  }
  return out;
}

/** Every combination of two symmetries — a ring of rings. */
export function compose(outer: Symmetry, inner: Symmetry): Symmetry {
  const out: Symmetry = [];
  for (const a of outer) for (const b of inner) out.push(multiply(a, b));
  return out;
}

/** Nested copies at shrinking scale, for concentric mandala courses. */
export function nested(count: number, factor: number, spin = 0): Symmetry {
  const out: Symmetry = [];
  for (let i = 0; i < count; i++) {
    out.push(multiply(rotationAbout([0, 0, 1], spin * i), uniformScale(Math.pow(factor, i))));
  }
  return out;
}
