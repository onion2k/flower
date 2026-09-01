import { cylinder } from '../sdf/primitives';
import { box2, translate2 } from '../sdf/sdf2';
import { extrude, frame, smoothUnion, subtract } from '../sdf/ops';
import { tube } from '../geom/segmentTree';
import { add, cross, frameFrom, mul, normalize } from '../geom/vec';
import { pathTangent, samplePath, type Curve } from '../geom/curve';
import { boxAround, detailFor, type Anchor, type Part } from './types';
import type { Vec3 } from '../sdf/types';

export type WireEnd =
  /** Hemispherical cap. Nothing fastens here. */
  | { kind: 'round' }
  /** Wire flattened into a drilled paddle — the standard place to put a rivet. */
  | {
      kind: 'eye';
      outerRadius: number;
      boreRadius: number;
      thickness: number;
      /** Blend radius where the paddle swells out of the round section. */
      blend?: number;
    };

export interface WireSpec {
  name?: string;
  path: Curve;
  /** Polyline segments used to approximate the path. */
  segments?: number;
  radius: number;
  start?: WireEnd;
  end?: WireEnd;
}

const ROUND: WireEnd = { kind: 'round' };

/**
 * A drawn wire strut: a swept tube with optional flattened eyes at each end.
 *
 * The eye is what makes wire usable in an assembly — a bare tube end has nothing
 * to fasten through, and blending the paddle into the round section with a smooth
 * union is what reads as forged rather than glued together.
 */
export function wire(spec: WireSpec): Part {
  const segments = spec.segments ?? 96;
  const pts = samplePath(spec.path, segments);
  const startEnd = spec.start ?? ROUND;
  const endEnd = spec.end ?? ROUND;

  let sdf = tube(pts, spec.radius);
  const anchors: Anchor[] = [];
  let reach = spec.radius;
  let section = spec.radius * 2;
  for (const e of [startEnd, endEnd]) if (e.kind === 'eye') section = Math.min(section, e.thickness);

  const attach = (
    end: WireEnd,
    point: Vec3,
    along: Vec3,
    label: string,
  ) => {
    if (end.kind === 'round') {
      // the tube's capsules already round the end; nothing to add
      return;
    }

    // A flattened eye is the last stretch of wire beaten into a paddle and then
    // drilled, so model it that way: a stadium-shaped boss lying in the plane that
    // contains the wire, with the hole out at its far end.
    //
    // The bore has to clear the *blend*, not merely the tube tip. Punch it any
    // closer and it breaks into the fillet at a grazing angle, which leaves a
    // feather edge that goes non-manifold and gets worse the finer you mesh.
    const axis = normalize(cross(along, pickUp(along)));
    const basis = frameFrom(axis, along);

    const blend = end.blend ?? spec.radius * 0.9;
    const outer = Math.max(end.outerRadius, end.boreRadius + spec.radius * 0.9);
    const boreOffset = end.boreRadius + blend + spec.radius * 0.5;

    // stadium from the tube tip out to the bore centre, capped by `outer`
    const paddle2d = translate2(
      box2(boreOffset / 2 + outer, outer, outer),
      boreOffset / 2,
      0,
    );
    const paddle = frame(
      extrude(paddle2d, end.thickness / 2, Math.min(end.thickness / 2, 0.35)),
      point, basis.x, basis.y, basis.z,
    );

    const centre = add(point, mul(along, boreOffset));
    const bore = frame(
      cylinder(end.boreRadius, end.thickness * 4),
      centre, basis.x, basis.y, basis.z,
    );

    sdf = subtract(smoothUnion(blend, sdf, paddle), bore);

    anchors.push({
      name: label,
      position: centre,
      axis,
      tangent: normalize(along),
      bore: end.boreRadius * 2,
    });
    reach = Math.max(reach, boreOffset + outer + end.thickness);
  };

  const startTangent = mul(pathTangent(pts, 0), -1);
  const endTangent = pathTangent(pts, pts.length - 1);
  attach(startEnd, pts[0], startTangent, 'start');
  attach(endEnd, pts[pts.length - 1], endTangent, 'end');

  return {
    name: spec.name ?? 'wire',
    detail: detailFor(section),
    sdf,
    bounds: boxAround(pts, reach + spec.radius),
    anchors,
  };
}

/** Bias the eye plane toward global up, falling back when the wire runs vertically. */
function pickUp(along: Vec3): Vec3 {
  const up: Vec3 = Math.abs(along[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return up;
}

/** A closed ring of wire — the simplest decorative element and a good mesher test. */
export function wireRing(radius: number, thickness: number, name = 'ring'): Part {
  const pts: Vec3[] = [];
  const n = 128;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);
  }
  return {
    name,
    detail: detailFor(thickness * 2),
    sdf: tube(pts, thickness),
    bounds: boxAround(pts, thickness * 2),
    anchors: [],
  };
}

/** Kept for callers that want a bare cap explicitly rather than by omission. */
export const roundEnd = (): WireEnd => ({ kind: 'round' });

export const eyeEnd = (
  outerRadius: number,
  boreRadius: number,
  thickness: number,
  blend?: number,
): WireEnd => ({ kind: 'eye', outerRadius, boreRadius, thickness, blend });
