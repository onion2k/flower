import type { Vec2 } from '../geom/types';
import { revolve } from '../mesh/revolve';
import { meshBounds, type Anchor, type Part } from './types';

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A run of eased waypoints in (radius, height), sampled into rows for
 * `revolve()`. Consecutive waypoints at the same height are a deliberate
 * corner — a cap or a step — and are never smoothed into their neighbours;
 * everything else blends by `ease` the way a lathed or moulded profile
 * actually rounds over between diameters.
 */
function profileRows(waypoints: Vec2[], perSpan: number): { points: Vec2[]; sharp: boolean[] } {
  const points: Vec2[] = [waypoints[0]];
  const sharp: boolean[] = [false];
  for (let w = 1; w < waypoints.length; w++) {
    const [r0, z0] = waypoints[w - 1];
    const [r1, z1] = waypoints[w];
    const corner = Math.abs(z1 - z0) < 1e-9;
    const steps = corner ? 1 : perSpan;
    for (let i = 1; i <= steps; i++) {
      const t = corner ? 1 : ease(i / steps);
      points.push([lerp(r0, r1, t), lerp(z0, z1, t)]);
      sharp.push(i === 1 && (corner || Math.abs(z0 - (waypoints[w - 2]?.[1] ?? z0)) < 1e-9));
    }
  }
  return { points, sharp };
}

export interface RingStandSpec {
  name?: string;
  /** Radius of the flat foot the stand rests on. */
  baseRadius: number;
  /** Height of the foot. */
  baseHeight?: number;
  /** Radius of the post a ring sits round. */
  postRadius?: number;
  /** Height of the post's straight run, before it tapers to a rounded tip. */
  postHeight?: number;
  segments?: number;
}

/**
 * A ring display stand: a flat foot and a post to slide a ring's own bore
 * onto. Plain plastic prop geometry — see the "plastic" material family in
 * `src/render/materials.ts` for how it's meant to be finished, in `matte` or
 * `flock`, never mistaken for the piece it is holding.
 */
export function ringStand(spec: RingStandSpec): Part {
  const baseHeight = spec.baseHeight ?? spec.baseRadius * 0.18;
  const postRadius = spec.postRadius ?? spec.baseRadius * 0.32;
  const postHeight = spec.postHeight ?? spec.baseRadius * 1.6;
  const segments = spec.segments ?? 48;
  const tipRows = 10;

  const waypoints: Vec2[] = [
    [0, 0],
    [spec.baseRadius, 0],
    [spec.baseRadius, baseHeight],
    [postRadius, baseHeight],
    [postRadius, baseHeight + postHeight],
  ];
  const { points, sharp } = profileRows(waypoints, 10);

  const tipBase = baseHeight + postHeight;
  for (let i = 1; i <= tipRows; i++) {
    const t = i / tipRows;
    points.push([postRadius * Math.cos((t * Math.PI) / 2), tipBase + postRadius * Math.sin((t * Math.PI) / 2)]);
    sharp.push(false);
  }

  const mesh = revolve({ points, sharp }, { segments });
  const top = tipBase + postRadius;
  const anchors: Anchor[] = [
    { name: 'base', position: [0, 0, 0], axis: [0, 0, -1], tangent: [1, 0, 0] },
    { name: 'peg', position: [0, 0, top], axis: [0, 0, 1], tangent: [1, 0, 0] },
  ];
  return { name: spec.name ?? 'ringStand', mesh, bounds: meshBounds(mesh), anchors };
}

export interface BustSpec {
  name?: string;
  /** Height from the base to the cut top of the neck. */
  height: number;
  /** Radius of the base it stands on. */
  baseRadius?: number;
  /** Radius at the shoulders, the widest point. */
  shoulderRadius?: number;
  /** Fraction of the height the shoulders sit at. */
  shoulderSpan?: number;
  /** Radius of the neck, the narrowest point. */
  neckRadius?: number;
  segments?: number;
}

/**
 * A neck bust: a plain stand for a necklace or a pair of earrings, cut off
 * at the neck rather than modelled as a head. Built as one body of
 * revolution — the same abstraction a real jeweller's bust makes, since it
 * is a prop to hang things on rather than a likeness of anyone.
 *
 * The `neck` anchor sits at the front, where a pendant naturally falls;
 * `base` is the underside, for standing it on a surface.
 */
export function bust(spec: BustSpec): Part {
  const height = spec.height;
  const baseRadius = spec.baseRadius ?? height * 0.36;
  const shoulderRadius = spec.shoulderRadius ?? height * 0.52;
  const shoulderSpan = Math.min(Math.max(spec.shoulderSpan ?? 0.34, 0.05), 0.9);
  const neckRadius = spec.neckRadius ?? height * 0.17;
  const segments = spec.segments ?? 64;

  const shoulderHeight = height * shoulderSpan;
  // the neck itself is a short cylinder, not one long taper all the way to
  // the cut top — without it the whole thing reads as a plain cone
  const neckHeight = lerp(shoulderHeight, height, 0.55);
  const waypoints: Vec2[] = [
    [0, 0],
    [baseRadius, 0],
    [shoulderRadius, shoulderHeight],
    [neckRadius, neckHeight],
    [neckRadius, height],
    [0, height],
  ];
  const { points, sharp } = profileRows(waypoints, 14);

  const mesh = revolve({ points, sharp }, { segments });
  const anchors: Anchor[] = [
    { name: 'base', position: [0, 0, 0], axis: [0, 0, -1], tangent: [1, 0, 0] },
    // pointing back toward the centreline, not out away from it: `connect`'s
    // "same" alignment carries a fastened part's own bulk opposite whatever
    // axis it lands on, so an anchor meant to hold something *outward* has
    // to point *inward* itself — checked against the shipped `display`
    // example, where a pearl fastened here sits properly proud of the neck.
    { name: 'neck', position: [neckRadius, 0, height * 0.94], axis: [-1, 0, 0], tangent: [0, 0, 1] },
  ];
  return { name: spec.name ?? 'bust', mesh, bounds: meshBounds(mesh), anchors };
}
