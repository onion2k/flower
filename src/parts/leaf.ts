import { leafOutline, leafPiercings, ensureWinding, teardropOutline, transformLoop } from '../geom/outline';
import { extrude } from '../mesh/extrude';
import { meshBounds, type Anchor, type Part } from './types';
import type { Vec2 } from '../geom/types';

export interface LeafSpec {
  name?: string;
  length: number;
  width: number;
  thickness: number;
  /** Edge break. Without it the outline catches no light and reads as cut paper. */
  bevel?: number;
  /** Teardrop piercings along the midrib. */
  piercings?: number;
  /** Sideways bend of the midrib. */
  droop?: number;
  segments?: number;
  /** Rivet hole at the base, and the anchor that goes with it. */
  bossBore?: number;
}

/**
 * A pierced leaf plate: the flat counterpart to a blade, and the piece that
 * carries fasteners. Cut, pierced and edge-broken — no boolean anywhere, because
 * a pierced outline is a 2D problem and only the caps need triangulating.
 */
export function leaf(spec: LeafSpec): Part {
  const segments = spec.segments ?? 64;
  const droop = spec.droop ?? 0.18;
  const bevel = spec.bevel ?? Math.min(spec.thickness * 0.28, 0.4);

  const outline = leafOutline(spec.length, spec.width, segments, droop);
  const holes: Vec2[][] = spec.piercings
    ? leafPiercings(spec.length, spec.width, spec.piercings, droop)
    : [];

  const anchors: Anchor[] = [];
  if (spec.bossBore) {
    const r = spec.bossBore / 2;
    const t = bossPosition(spec.length, spec.width, r, bevel + spec.thickness * 0.7);
    const at: Vec2 = [t * spec.length, Math.sin(Math.PI * t) * droop * spec.length];
    holes.push(ensureWinding(transformLoop(teardropOutline(r * 2, r * 2, 16), at[0], at[1]), false));
    anchors.push({
      name: 'boss',
      position: [at[0], at[1], spec.thickness / 2],
      axis: [0, 0, 1],
      tangent: [1, 0, 0],
      bore: spec.bossBore,
    });
  }

  const mesh = extrude({ outline, holes, thickness: spec.thickness, bevel });
  return { name: spec.name ?? 'leaf', mesh, bounds: meshBounds(mesh), anchors };
}

const halfWidthAt = (width: number, t: number) =>
  (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)), 0.75) * (1 - 0.3 * t);

/**
 * Slide the rivet boss along the leaf until there is metal all round it.
 *
 * A leaf narrows to nothing at its base, and the bevel insets the cap outline
 * while growing the piercing, so a hole placed by eye near the stem breaks
 * through the edge on the faces but not on the walls — a cap that no longer
 * matches its own outline. Solving for the position removes the whole class.
 */
function bossPosition(length: number, width: number, bore: number, wall: number): number {
  const need = bore + wall;
  const back = bore / length;
  for (let t = 0.02; t < 0.6; t += 0.004) {
    if (halfWidthAt(width, t - back) >= need && halfWidthAt(width, t) >= need) {
      return t;
    }
  }
  return 0.35;
}
