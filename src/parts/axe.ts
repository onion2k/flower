import { line } from '../geom/curve';
import * as profile from '../geom/profile';
import { blade as bladePart } from './wire';
import { sweep } from '../mesh/sweep';
import { enamelWhole, mergeMeshes, type Mesh } from '../mesh/types';
import type { Vec3 } from '../geom/types';
import { meshBounds, type Anchor, type Part } from './types';

export interface AxeSpec {
  name?: string;
  /** Haft length, butt to head. */
  haftLength: number;
  haftRadius?: number;
  /** How far the head's edge reaches out from the haft. */
  headReach?: number;
  /** Height of the head's face, haft to the broad edge. */
  headHeight?: number;
  headThickness?: number;
  /** A second head, mirrored on the other side of the haft. */
  doubleBit?: boolean;
  /**
   * Turns of a leather binding round the hand piece, 0 for a bare haft. The
   * binding covers `wrapLength` of the haft starting `wrapFrom` up it, both
   * as fractions of the whole — a long haft is gripped in one place, not
   * bound end to end. Same construction as sword's grip: a cord, not a decal.
   */
  wrapTurns?: number;
  wrapRadius?: number;
  wrapFrom?: number;
  wrapLength?: number;
  /** The binding's colour, by enamel name; only the binding takes it. */
  enamel?: string;
  segments?: number;
}

/**
 * An axe: a haft with one or two heads flared out near the top.
 *
 * A genuinely different silhouette from `sword` — there is no blade/guard/
 * pommel stack, just a haft and a head, and the head is not the haft's own
 * end the way a sword's point is; it flares out to the *side*.
 *
 * The head reuses `wire`'s `blade()` again, the same reasoning as sword's
 * own blade: a lens section swept along a path, its width set by a `swell`
 * function, is already the right shape for a wedge that is narrow where it
 * meets the haft and broad at the cutting edge — no new mesh generator
 * needed. The path runs along local X with `up: [0, 0, 1]`, which is what
 * keeps the head's own height along Z (the haft's axis) without ever
 * needing `extrude()` and the `roll`/`pitch` placement rotation that comes
 * with it (see `easel` for what that costs) — everything here is
 * `sweep()`, which has no fixed axis to fight.
 */
export function axe(spec: AxeSpec): Part {
  const haftRadius = spec.haftRadius ?? spec.haftLength * 0.018;
  const headReach = spec.headReach ?? spec.haftLength * 0.26;
  const headHeight = spec.headHeight ?? spec.haftLength * 0.3;
  const headThickness = spec.headThickness ?? haftRadius * 1.4;
  const segments = spec.segments ?? 24;
  const sides = Math.max(8, Math.round(segments / 2));

  // haft: a plain taper, flared briefly at the butt so the grip doesn't
  // simply slide out of a closed fist
  const haft = sweep([[0, 0, 0], [0, 0, spec.haftLength]], {
    profile: profile.circle(haftRadius, sides),
    taper: (t) => 1 + 0.35 * Math.exp(-t * 10),
    caps: true,
  });

  // head: narrow at the haft, broad by a third of the way out, and flared
  // slightly wider again right at the tip — an edge reads as struck, not
  // grown, when it doesn't ease away the way a leaf's own margin would
  const swell = (t: number) => {
    const rise = Math.min(t / 0.3, 1);
    const eased = rise * rise * (3 - 2 * rise);
    // never quite zero at t=0, the end butted against the haft: a swept
    // cross-section that actually closes to a point there is degenerate —
    // the same trap sword's own blade swell hit, this time at the start of
    // the path rather than the end
    return 0.04 + 0.96 * eased * (1 + 0.15 * Math.max(0, t - 0.6));
  };
  const headZ = spec.haftLength;
  // starts a little clear of the haft's own centreline, not exactly on it —
  // a real head has some width where it wraps the haft, and (for a double
  // bit) it keeps the two heads' near ends from sitting at one coincident
  // point, which independently-watertight solids can otherwise touch at
  // closely enough to alias together under position-rounding
  const standoff = haftRadius * 0.6;
  const head = bladePart({
    path: line([standoff, 0, headZ], [headReach, 0, headZ]),
    width: headHeight,
    thickness: headThickness,
    swell,
    sections: segments,
    sides,
    up: [0, 0, 1],
  }).mesh;

  const pieces: Mesh[] = [haft, head];

  // the hand piece: a helix round one stretch of the haft, standing a
  // little proud of it, the same cord sword's own grip is bound with
  const wrapTurns = spec.wrapTurns ?? 0;
  if (wrapTurns > 0) {
    const wrapRadius = spec.wrapRadius ?? haftRadius * 0.28;
    const wrapFrom = Math.min(Math.max(spec.wrapFrom ?? 0.06, 0), 0.95);
    const wrapLength = Math.min(Math.max(spec.wrapLength ?? 0.3, 0.01), 1 - wrapFrom);
    const z0 = wrapFrom * spec.haftLength;
    const span = wrapLength * spec.haftLength;
    const reach = haftRadius + wrapRadius * 0.55;
    const rows = Math.max(24, Math.round(wrapTurns * 14));
    const path: Vec3[] = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const a = t * wrapTurns * Math.PI * 2;
      path.push([Math.cos(a) * reach, Math.sin(a) * reach, z0 + t * span]);
    }
    const wrap = sweep(path, { profile: profile.circle(wrapRadius, 8), caps: true });
    if (spec.enamel) enamelWhole(wrap);
    pieces.push(wrap);
  }

  if (spec.doubleBit) {
    const backHead = bladePart({
      path: line([-standoff, 0, headZ], [-headReach, 0, headZ]),
      width: headHeight,
      thickness: headThickness,
      swell,
      sections: segments,
      sides,
      up: [0, 0, 1],
    }).mesh;
    pieces.push(backHead);
  }

  const mesh = mergeMeshes(pieces);
  // the head's broad face is the XZ plane, so its cheeks look out along Y;
  // a jewel fastened to one sits where the face is widest, not at the eye
  const cheekX = standoff + (headReach - standoff) * 0.55;
  const anchors: Anchor[] = [
    { name: 'butt', position: [0, 0, 0], axis: [0, 0, -1], tangent: [1, 0, 0] },
    { name: 'edge', position: [headReach, 0, headZ], axis: [1, 0, 0], tangent: [0, 0, 1] },
    { name: 'top', position: [0, 0, spec.haftLength], axis: [0, 0, 1], tangent: [1, 0, 0] },
    { name: 'poll', position: [-standoff, 0, headZ], axis: [-1, 0, 0], tangent: [0, 0, 1] },
    { name: 'cheek', position: [cheekX, headThickness / 2, headZ], axis: [0, 1, 0], tangent: [0, 0, 1] },
    { name: 'cheekBack', position: [cheekX, -headThickness / 2, headZ], axis: [0, -1, 0], tangent: [0, 0, 1] },
  ];
  return { name: spec.name ?? 'axe', mesh, bounds: meshBounds(mesh), anchors, enamel: spec.enamel };
}
