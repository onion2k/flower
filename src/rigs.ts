/**
 * The studio rig, as presets set round the key.
 *
 * Each takes the key's azimuth and strength and the piece's own extent, and
 * returns the lights beside it. A fill is broad, low and cool on the far
 * side, at a fraction of the key, to open the shadows without casting one of
 * its own to speak of; a rim is small and behind, opposite the key, to draw a
 * bright line round the piece's edge.
 *
 * The last two are not in the sky at all. A rig light may stand in the scene
 * — a place, an aim and a cone — and those are lamps: a bench lamp leaned
 * over the work, and the narrow spot a case gets in a gallery. They are the
 * reason this takes the piece's extent: a light in the sky is the same light
 * over a ring and over a candelabrum, and a lamp has to hang at a height that
 * means something against what it lights.
 */

import type { RigLight } from 'artshape-render/render/viewer';

/** How big the piece is and how high it stands, in millimetres. */
export interface Piece {
  /** The longest side of its bounding box. */
  span: number;
  /** The top of it, over the table. */
  top: number;
}

/** A place in the sky, at a distance, as a point: elevation and azimuth in radians. */
function spherical(azimuth: number, elevation: number, distance: number, z: number): [number, number, number] {
  const ce = Math.cos(elevation);
  return [Math.cos(azimuth) * ce * distance, Math.sin(azimuth) * ce * distance, Math.sin(elevation) * distance + z];
}

export const RIGS: Record<string, (azimuth: number, strength: number, piece: Piece) => RigLight[]> = {
  none: () => [],
  fill: (a, k) => [
    { elevation: 0.35, azimuth: a + 2.0, strength: 0.3 * k, warmth: -0.25, size: 0.45 },
  ],
  rim: (a, k) => [
    { elevation: 0.65, azimuth: a + Math.PI, strength: 0.9 * k, warmth: 0.1, size: 0.05 },
  ],
  'three point': (a, k) => [
    { elevation: 0.35, azimuth: a + 2.0, strength: 0.3 * k, warmth: -0.25, size: 0.45 },
    { elevation: 0.65, azimuth: a + Math.PI, strength: 0.9 * k, warmth: 0.1, size: 0.05 },
  ],
  clamshell: (a, k) => [
    { elevation: 0.15, azimuth: a, strength: 0.4 * k, warmth: 0, size: 0.5 },
    { elevation: 0.7, azimuth: a - 2.4, strength: 0.6 * k, warmth: 0.15, size: 0.08 },
    { elevation: 0.7, azimuth: a + 2.4, strength: 0.6 * k, warmth: 0.15, size: 0.08 },
  ],
  /**
   * A lamp leaned over the work, from the key's side and a little in front of
   * it, as one stands on a bench. It hangs two spans away, which keeps it out
   * of the frame and puts the piece well inside its pool; its shade is a
   * third of a span across, so a wire's shadow is sharp where it touches and
   * soft a centimetre away.
   */
  'bench lamp': (a, k, piece) => [{
    elevation: 0, azimuth: 0, warmth: 0.35,
    strength: 1.2 * k,
    size: Math.max(piece.span * 0.3, 4),
    at: spherical(a + 0.45, 0.85, Math.max(piece.span * 2.1, 60), piece.top),
    aim: [0, 0, piece.top * 0.45],
    cone: [26, 46],
  }],
  /**
   * The narrow spot a piece gets in a case: nearly overhead, tight, and cool
   * against the warm of a bench. It leaves the table dark a little way out
   * from the piece, which is the whole of what a case does for one.
   */
  'case spot': (a, k, piece) => [{
    elevation: 0, azimuth: 0, warmth: -0.1,
    strength: 1.5 * k,
    size: Math.max(piece.span * 0.12, 1.5),
    at: spherical(a + 0.2, 1.24, Math.max(piece.span * 2.6, 80), piece.top),
    aim: [0, 0, piece.top * 0.4],
    cone: [11, 19],
  }],
};

export type RigName = keyof typeof RIGS;
export const rigNames = Object.keys(RIGS);
