import {
  boltCircle, circleOutline, ensureWinding, gussetOutline, polygonOutline,
  stadiumOutline, transformLoop,
} from '../geom/outline';
import { extrude } from '../mesh/extrude';
import { meshBounds, type Anchor, type Part } from './types';
import type { Vec2, Vec3 } from '../geom/types';

/**
 * Flat cut members: bar, disc, ring, polygon, gusset.
 *
 * These are the constructivist half of the vocabulary. Where the art nouveau
 * parts hide their joints in blends and tapers, these show them — every one is a
 * plate of constant thickness with drilled holes at known positions, and the
 * anchors sit in those holes, so what fastens where is legible in the form
 * itself rather than being a detail of how it was assembled.
 */

const bevelFor = (thickness: number, given?: number) =>
  given ?? Math.min(thickness * 0.3, 0.4);

export interface BarSpec {
  name?: string;
  length: number;
  width: number;
  thickness: number;
  bore: number;
  /** Extra holes evenly spaced between the ends. */
  intermediate?: number;
  bevel?: number;
}

/** A drilled straight member. Anchors `a` and `b` sit in the end holes. */
export function bar(spec: BarSpec): Part {
  const inset = spec.width / 2;
  const span = spec.length - inset * 2;
  const count = 2 + (spec.intermediate ?? 0);

  const holes: Vec2[][] = [];
  const anchors: Anchor[] = [];
  for (let i = 0; i < count; i++) {
    const x = -span / 2 + (count > 1 ? (i / (count - 1)) * span : 0);
    holes.push(ensureWinding(transformLoop(circleOutline(spec.bore / 2, 14), x, 0), false));
    anchors.push({
      name: i === 0 ? 'a' : i === count - 1 ? 'b' : `hole${i}`,
      position: [x, 0, spec.thickness / 2],
      axis: [0, 0, 1],
      tangent: [1, 0, 0],
      bore: spec.bore,
    });
  }

  const mesh = extrude({
    outline: stadiumOutline(spec.length, spec.width, 14),
    holes,
    thickness: spec.thickness,
    bevel: bevelFor(spec.thickness, spec.bevel),
  });
  return { name: spec.name ?? 'bar', mesh, bounds: meshBounds(mesh), anchors };
}

export interface DiscSpec {
  name?: string;
  radius: number;
  thickness: number;
  /** Number of sides. 0 or absent gives a circle. */
  sides?: number;
  /** Central hole. */
  bore?: number;
  bolts?: number;
  boltCircleRadius?: number;
  boltBore?: number;
  bevel?: number;
}

/** A disc, ring or regular polygon plate, optionally on a bolt circle. */
export function disc(spec: DiscSpec): Part {
  const sides = spec.sides ?? 0;
  const outline = sides >= 3
    ? polygonOutline(sides, spec.radius, Math.PI / 2)
    : circleOutline(spec.radius, 64);

  const holes: Vec2[][] = [];
  // Both faces, at the centre. A disc is usually the piece everything else is
  // built on — a receptacle, a hub — so it needs somewhere to be built on.
  const anchors: Anchor[] = [
    { name: 'face', position: [0, 0, spec.thickness / 2], axis: [0, 0, 1], tangent: [1, 0, 0], bore: spec.bore },
    { name: 'back', position: [0, 0, -spec.thickness / 2], axis: [0, 0, -1], tangent: [1, 0, 0], bore: spec.bore },
  ];

  if (spec.bore) holes.push(ensureWinding(circleOutline(spec.bore / 2, 32), false));

  if (spec.bolts) {
    const r = spec.boltCircleRadius ?? spec.radius * 0.72;
    const bore = spec.boltBore ?? spec.radius * 0.12;
    holes.push(...boltCircle(spec.bolts, r, bore));
    for (let i = 0; i < spec.bolts; i++) {
      const a = (i / spec.bolts) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      anchors.push({
        name: `bolt${i}`,
        position: [c * r, s * r, spec.thickness / 2],
        axis: [0, 0, 1],
        tangent: [c, s, 0],
        bore,
      });
    }
  }

  const mesh = extrude({
    outline, holes,
    thickness: spec.thickness,
    bevel: bevelFor(spec.thickness, spec.bevel),
  });
  return { name: spec.name ?? (sides >= 3 ? 'polygon' : 'disc'), mesh, bounds: meshBounds(mesh), anchors };
}

export interface GussetSpec {
  name?: string;
  radius: number;
  thickness: number;
  bore: number;
  fillet?: number;
  /** Lightening hole through the middle. */
  lighten?: number;
  bevel?: number;
}

/** A three-holed corner plate — the joint that makes a frame rigid. */
export function gusset(spec: GussetSpec): Part {
  const fillet = spec.fillet ?? spec.radius * 0.26;
  const holeRadius = spec.radius - fillet;

  const holes: Vec2[][] = [];
  const anchors: Anchor[] = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    const x = Math.cos(a) * holeRadius;
    const y = Math.sin(a) * holeRadius;
    holes.push(ensureWinding(transformLoop(circleOutline(spec.bore / 2, 14), x, y), false));
    anchors.push({
      name: ['a', 'b', 'c'][i],
      position: [x, y, spec.thickness / 2] as Vec3,
      axis: [0, 0, 1],
      tangent: [Math.cos(a), Math.sin(a), 0],
      bore: spec.bore,
    });
  }
  if (spec.lighten) holes.push(ensureWinding(circleOutline(spec.lighten / 2, 24), false));

  const mesh = extrude({
    outline: gussetOutline(spec.radius, fillet, 8),
    holes,
    thickness: spec.thickness,
    bevel: bevelFor(spec.thickness, spec.bevel),
  });
  return { name: spec.name ?? 'gusset', mesh, bounds: meshBounds(mesh), anchors };
}
