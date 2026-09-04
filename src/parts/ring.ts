import * as profile from '../geom/profile';
import { sweep } from '../mesh/sweep';
import { meshBounds, type Anchor, type Part } from './types';
import type { Vec3 } from '../geom/types';

export interface ShankSpec {
  name?: string;
  /** Inner diameter — this is what "ring size" means here. */
  size: number;
  /** Band width, front to back along the finger, at the back of the shank. */
  width: number;
  /** Band thickness, radially. */
  thickness: number;
  /**
   * How much wider the shank swells toward the crown, as a fraction of
   * width. 0 is a plain wedding band; a stone wants somewhere to sit.
   */
  shoulder?: number;
  /** Angular reach of the shoulder swell either side of the crown, in radians. */
  shoulderSpread?: number;
  segments?: number;
}

/**
 * A ring shank: a closed band sized to a finger, with a crown anchor to
 * fasten a setting onto.
 *
 * `size` is the inner diameter, the thing a ring's own size actually means —
 * everything else (width, thickness, the shoulder) is built outward from it,
 * the way a shank is cut from stock rather than drawn from a centreline. The
 * crown sits at the seam the sweep closes on, angle zero, so a shoulder swell
 * has to straddle both ends of the taper table rather than just the start of
 * it, or the bump would land at an arbitrary point round the band instead of
 * where the stone actually goes.
 */
export function shank(spec: ShankSpec): Part {
  const segments = spec.segments ?? 96;
  const shoulder = spec.shoulder ?? 0;
  const spread = Math.max(spec.shoulderSpread ?? 0.9, 1e-3);
  const radius = spec.size / 2 + spec.thickness / 2;

  const path: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    path.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);
  }
  path.push(path[0]);

  const bump = (t: number) => {
    const d = Math.min(t, 1 - t); // distance from the seam, wrapped
    return Math.exp(-(d * d) / (spread * spread));
  };

  const mesh = sweep(path, {
    profile: profile.ribbon(spec.width, spec.thickness, 4),
    taper: shoulder ? (t) => 1 + shoulder * bump(t) : undefined,
    closed: true,
    caps: false,
    // seeds the frame so width lies along the ring's own axis, the same
    // construction band() uses to stand a ribbon on edge
    up: [0, 0, 1],
  });

  const anchors: Anchor[] = [
    { name: 'crown', position: [radius, 0, 0], axis: [1, 0, 0], tangent: [0, 0, 1] },
  ];

  return { name: spec.name ?? 'shank', mesh, bounds: meshBounds(mesh), anchors };
}
