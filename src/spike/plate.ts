import { annulus2, circle2, radialRepeat2, subtract2, translate2, box2, rotate2 } from '../sdf/sdf2';
import { extrude } from '../sdf/ops';
import type { SDF, Box3 } from '../sdf/types';

export interface PlateSpec {
  innerRadius: number;
  outerRadius: number;
  thickness: number;
  /** Edge break on the top and bottom rims. */
  fillet: number;
  boltCount: number;
  boltRadius: number;
  boltCircle: number;
  scallopCount: number;
  scallopRadius: number;
  spokeCount: number;
  spokeWidth: number;
}

export const defaultPlate: PlateSpec = {
  innerRadius: 16,
  outerRadius: 28,
  thickness: 1.6,
  fillet: 0.3,
  boltCount: 12,
  boltRadius: 1.5,
  boltCircle: 24,
  scallopCount: 6,
  scallopRadius: 4.5,
  spokeCount: 12,
  spokeWidth: 1.1,
};

/**
 * The spike's stress test: an annular milled plate with a bolt circle, scalloped
 * rim and slotted web. Every one of those features is a hard edge that naive
 * surface nets would round off, so it is the right thing to look at first.
 */
export function plate(spec: PlateSpec = defaultPlate): { sdf: SDF; bounds: Box3 } {
  const bolts = radialRepeat2(
    translate2(circle2(spec.boltRadius), spec.boltCircle, 0),
    spec.boltCount,
  );

  const scallops = radialRepeat2(
    translate2(circle2(spec.scallopRadius), spec.outerRadius, 0),
    spec.scallopCount,
  );

  // radial slots cut through the web, rotated off the bolt circle spokes
  const slotLen = (spec.boltCircle - spec.boltRadius * 2 - spec.innerRadius) * 0.5;
  const slots = radialRepeat2(
    rotate2(
      translate2(
        box2(slotLen, spec.spokeWidth, spec.spokeWidth),
        spec.innerRadius + slotLen + 1.2,
        0,
      ),
      Math.PI / spec.spokeCount,
    ),
    spec.spokeCount,
  );

  const profile = subtract2(
    annulus2(spec.innerRadius, spec.outerRadius),
    bolts,
    scallops,
    slots,
  );

  const hz = spec.thickness / 2;
  const r = spec.outerRadius + 1;

  return {
    sdf: extrude(profile, hz, spec.fillet),
    bounds: { min: [-r, -r, -hz - 1], max: [r, r, hz + 1] },
  };
}
