import type { Vec2 } from '../geom/types';
import { line } from '../geom/curve';
import * as profile from '../geom/profile';
import { blade as bladePart } from './wire';
import { revolve } from '../mesh/revolve';
import { sweep } from '../mesh/sweep';
import { mergeMeshes } from '../mesh/types';
import { meshBounds, type Anchor, type Part } from './types';

export interface SwordSpec {
  name?: string;
  /** Blade length, guard to tip. */
  bladeLength: number;
  /** Blade width at its widest, just above the guard. */
  bladeWidth?: number;
  bladeThickness?: number;
  /** How much of the blade's length stays near full width before it tapers to the point, 0 to 1. */
  bladeTaper?: number;
  /** Grip length, pommel to guard. */
  gripLength?: number;
  gripRadius?: number;
  /** Crossguard length, tip to tip. */
  guardWidth?: number;
  guardThickness?: number;
  pommelRadius?: number;
  segments?: number;
}

/**
 * A straight sword: pommel, grip, crossguard and blade, stacked bottom to
 * top along Z the way every other standing part in this catalogue is —
 * unlike `easel`, nothing here is built from a flat `extrude()` outline, so
 * it needs no `roll`/`pitch` at `place` to stand up correctly.
 *
 * The blade itself is `wire`'s own `blade()` — a lens section swept along a
 * straight run — rather than a shape reinvented here, with a `swell` tuned
 * to hold its width most of the way rather than curving down from the base
 * the way a leaf does. Dagger proportions are this with a short `bladeLength`
 * and `gripLength`; nothing else about the part is sword-specific.
 */
export function sword(spec: SwordSpec): Part {
  const bladeWidth = spec.bladeWidth ?? spec.bladeLength * 0.09;
  const bladeThickness = spec.bladeThickness ?? bladeWidth * 0.22;
  const bladeTaper = Math.min(Math.max(spec.bladeTaper ?? 0.7, 0.05), 0.95);
  const gripLength = spec.gripLength ?? spec.bladeLength * 0.16;
  const gripRadius = spec.gripRadius ?? bladeWidth * 0.42;
  const guardWidth = spec.guardWidth ?? bladeWidth * 3.2;
  const guardThickness = spec.guardThickness ?? gripRadius * 0.9;
  const pommelRadius = spec.pommelRadius ?? gripRadius * 1.5;
  const segments = spec.segments ?? 24;
  const sides = Math.max(8, Math.round(segments / 2));

  // pommel: a plain oblate knob, pole to pole, widest at half its own height
  const pommelHeight = pommelRadius * 1.3;
  const pommelRows = 14;
  const pommelPts: Vec2[] = [];
  for (let i = 0; i <= pommelRows; i++) {
    const a = (i / pommelRows) * Math.PI;
    pommelPts.push([pommelRadius * Math.sin(a), (pommelHeight / 2) * (1 - Math.cos(a))]);
  }
  const pommel = revolve({ points: pommelPts }, { segments });

  // grip: a barrel — slightly fatter at the middle than at either end, the
  // way a hand actually wants to close round it
  const gripBase = pommelHeight;
  const guardZ = gripBase + gripLength;
  const grip = sweep([[0, 0, gripBase], [0, 0, guardZ]], {
    profile: profile.circle(gripRadius, sides),
    taper: (t) => 1 + 0.12 * Math.sin(Math.PI * t),
    caps: true,
  });

  // guard: a straight bar crossing the grip, its own length along X — the
  // same axis the blade's own width runs along, so it reads as one flat
  // plane through blade and guard together, the way a real crossguard sits
  const guard = sweep([[-guardWidth / 2, 0, guardZ], [guardWidth / 2, 0, guardZ]], {
    profile: profile.ribbon(guardThickness, gripRadius * 1.3, 4),
    caps: true,
    up: [0, 0, 1],
  });

  // blade: held near full width for `bladeTaper` of its own length, then
  // eased down to a point — a straight taper reads as ground steel, the
  // leaf-like curve wire's own blade() defaults to reads as grown, not forged
  const swell = (t: number) => {
    const past = Math.max(0, (t - bladeTaper) / (1 - bladeTaper));
    // never quite zero: a swept cross-section that actually closes to a true
    // point is degenerate (several faces sharing one coincident vertex,
    // which fails watertightness), the same reason wire's own default swell
    // floors at a small constant rather than easing all the way to nothing
    return (1 - 0.08 * t) * (1 - Math.pow(past, 1.6) * 0.97);
  };
  const bladeMesh = bladePart({
    path: line([0, 0, guardZ], [0, 0, guardZ + spec.bladeLength]),
    width: bladeWidth,
    thickness: bladeThickness,
    swell,
    sections: segments * 2,
    sides,
    // the path runs along Z itself, so the seed has to be a horizontal
    // vector — one parallel to the path's own tangent leaves the sweep
    // frame undefined rather than merely unrotated
    up: [1, 0, 0],
  }).mesh;

  const mesh = mergeMeshes([pommel, grip, guard, bladeMesh]);
  const anchors: Anchor[] = [
    { name: 'base', position: [0, 0, 0], axis: [0, 0, -1], tangent: [1, 0, 0] },
    { name: 'tip', position: [0, 0, guardZ + spec.bladeLength], axis: [0, 0, 1], tangent: [1, 0, 0] },
  ];
  return { name: spec.name ?? 'sword', mesh, bounds: meshBounds(mesh), anchors };
}
