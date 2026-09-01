import { resample, type Curve } from '../geom/curve';
import * as profile from '../geom/profile';
import { sweep } from '../mesh/sweep';
import { meshBounds, type Anchor, type Part } from './types';
import { normalize, sub } from '../geom/vec';
import type { Vec3 } from '../geom/types';

export interface WireSpec {
  name?: string;
  path: Curve;
  /** Section radius at the base. */
  radius: number;
  /** Fraction of the base radius left at the tip. 0.15 is a fine drawn point. */
  tipScale?: number;
  /** Turns of twist along the whole run. Only visible on a non-round section. */
  twistTurns?: number;
  /** Flatten from round at the base to a lens section at the tip. */
  flatten?: boolean;
  sections?: number;
  sides?: number;
  closed?: boolean;
  up?: Vec3;
}

/**
 * A drawn line in metal: a section swept along a curve, thinning as it runs.
 *
 * The taper is the whole point. A constant-radius tube reads as plumbing; a line
 * that starts heavy and dies away to a point is what makes a tendril look drawn
 * rather than extruded.
 */
export function wire(spec: WireSpec): Part {
  const sections = spec.sections ?? 128;
  const sides = spec.sides ?? 12;
  const closed = spec.closed ?? false;
  const tip = spec.tipScale ?? 0.2;

  const path = resample(spec.path, sections);
  const round = profile.circle(spec.radius, sides);
  const flat = profile.lens(spec.radius * 2.6, spec.radius * 0.7, sides);

  const mesh = sweep(path, {
    profile: round,
    morphTo: spec.flatten ? flat : undefined,
    // eased so the heavy end holds its weight instead of thinning immediately
    taper: closed ? () => 1 : (t) => 1 - (1 - tip) * Math.pow(t, 1.4),
    twist: spec.twistTurns ? (t) => t * spec.twistTurns! * Math.PI * 2 : undefined,
    morph: (t) => Math.pow(t, 1.6),
    closed,
    caps: true,
    up: spec.up,
  });

  const anchors: Anchor[] = [];
  if (!closed) {
    anchors.push({
      name: 'base',
      position: path[0],
      axis: normalize(sub(path[0], path[1])),
      tangent: normalize(sub(path[1], path[0])),
    });
    anchors.push({
      name: 'tip',
      position: path[path.length - 1],
      axis: normalize(sub(path[path.length - 1], path[path.length - 2])),
      tangent: normalize(sub(path[path.length - 1], path[path.length - 2])),
    });
  }

  return { name: spec.name ?? 'wire', mesh, bounds: meshBounds(mesh), anchors };
}

/**
 * A curved blade — a lens section swept along an arc, widening then dying at the
 * tip. Petals and leaves that are not flat plates are this.
 */
export interface BladeSpec {
  name?: string;
  path: Curve;
  width: number;
  thickness: number;
  /** Section width along the run, t in [0,1]. Defaults to a leaf-like swell. */
  swell?: (t: number) => number;
  twistTurns?: number;
  sections?: number;
  sides?: number;
  up?: Vec3;
}

export function blade(spec: BladeSpec): Part {
  const sections = spec.sections ?? 96;
  const sides = spec.sides ?? 16;
  const path = resample(spec.path, sections);
  const swell = spec.swell ?? ((t: number) => Math.pow(Math.sin(Math.PI * t), 0.7) * (1 - 0.25 * t) + 0.06);

  const mesh = sweep(path, {
    profile: profile.lens(spec.width, spec.thickness, sides),
    taper: swell,
    twist: spec.twistTurns ? (t) => t * spec.twistTurns! * Math.PI * 2 : undefined,
    caps: true,
    up: spec.up,
  });

  return {
    name: spec.name ?? 'blade',
    mesh,
    bounds: meshBounds(mesh),
    anchors: [
      {
        name: 'base',
        position: path[0],
        axis: normalize(sub(path[0], path[1])),
        tangent: normalize(sub(path[1], path[0])),
      },
    ],
  };
}
