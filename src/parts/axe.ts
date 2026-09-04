import { line } from '../geom/curve';
import * as profile from '../geom/profile';
import { blade as bladePart } from './wire';
import { sweep } from '../mesh/sweep';
import { mergeMeshes, type Mesh } from '../mesh/types';
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
  const anchors: Anchor[] = [
    { name: 'butt', position: [0, 0, 0], axis: [0, 0, -1], tangent: [1, 0, 0] },
    { name: 'edge', position: [headReach, 0, headZ], axis: [1, 0, 0], tangent: [0, 0, 1] },
  ];
  return { name: spec.name ?? 'axe', mesh, bounds: meshBounds(mesh), anchors };
}
