import type { Box3, Vec3 } from '../geom/types';
import type { Mesh } from '../mesh/types';

/**
 * A named place where one part fastens to another.
 *
 * Joints are declared, not discovered. `axis` points out of the material along
 * the fastener; `tangent` orients anything that is not rotationally symmetric.
 */
export interface Anchor {
  name: string;
  position: Vec3;
  axis: Vec3;
  tangent: Vec3;
  /** Nominal drilled diameter, where the anchor is a hole. */
  bore?: number;
}

/**
 * The unit every generator produces and every consumer takes.
 *
 * Deliberately says nothing about how the geometry was made, which is what let
 * the geometry layer be replaced without touching assembly or the DSL plan.
 */
export interface Part {
  name: string;
  mesh: Mesh;
  bounds: Box3;
  anchors: Anchor[];
  /** Optional override, so one form can mix metals the way real work does. */
  material?: { metal?: string; finish?: string };
}

export const findAnchor = (part: Part, name: string): Anchor => {
  const a = part.anchors.find((x) => x.name === name);
  if (!a) throw new Error(`part "${part.name}" has no anchor "${name}"`);
  return a;
};

export function meshBounds(mesh: Mesh): Box3 {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k];
      if (p[i + k] > max[k]) max[k] = p[i + k];
    }
  }
  return { min, max };
}
