import type { SDF, Box3, Vec3 } from '../sdf/types';

/**
 * A named place where one part fastens to another.
 *
 * Joints are declared, not discovered: solving them by intersecting meshes is a
 * rabbit hole, and an anchor gives the DSL something concrete to name. `axis`
 * points out of the material along the fastener, which is the direction a rivet
 * head sits in.
 */
export interface Anchor {
  name: string;
  position: Vec3;
  axis: Vec3;
  /** In-plane reference direction, perpendicular to `axis`. Orients hex heads and slots. */
  tangent: Vec3;
  /** Nominal drilled diameter, where the anchor is a hole. */
  bore?: number;
}

/** The unit every generator produces and every consumer — mesher, assembly, DSL — takes. */
export interface Part {
  name: string;
  sdf: SDF;
  bounds: Box3;
  anchors: Anchor[];
  /**
   * Suggested mesher cell size, derived from this part's smallest real feature.
   * Only the generator knows that a knurl groove is 0.36 mm wide, so the part
   * carries the number rather than the caller guessing from its bounding box.
   */
  detail: number;
}

export const findAnchor = (part: Part, name: string): Anchor => {
  const a = part.anchors.find((x) => x.name === name);
  if (!a) throw new Error(`part "${part.name}" has no anchor "${name}"`);
  return a;
};

/** Grow a box by a uniform margin — bounds always need clearance for the mesher. */
export const padBox = (b: Box3, m: number): Box3 => ({
  min: [b.min[0] - m, b.min[1] - m, b.min[2] - m],
  max: [b.max[0] + m, b.max[1] + m, b.max[2] + m],
});

/**
 * Cell size for a part whose narrowest cross-section is `section` wide.
 *
 * Dual contouring needs at least two cells across a thin section to keep its two
 * surfaces apart; below that they fuse and the edges go non-manifold. 3.5 leaves a
 * margin without paying for detail nobody sees. Deliberately keyed to *sections*,
 * not to fillets or chamfers: an under-resolved round just reads a little softer,
 * whereas an under-resolved web changes the topology.
 */
export const detailFor = (section: number) => Math.max(section / 3.5, 0.02);

export function boxAround(points: Vec3[], margin: number): Box3 {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  }
  return padBox({ min, max }, margin);
}
