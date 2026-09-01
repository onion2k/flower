import { box, cylinder, frustum, plane, sphere, torus } from '../sdf/primitives';
import { extrude, intersect, radialRepeat, rotateZ, subtract, translate, union } from '../sdf/ops';
import { ngon2 } from '../sdf/sdf2';
import { detailFor, padBox, type Part } from './types';
import type { SDF } from '../sdf/types';

export type HeadStyle =
  /** Domed snap head. The default rivet look. */
  | 'dome'
  /** Shallow rounded pan — reads as a machine screw. */
  | 'pan'
  /** Flush countersunk head, sits level with the plate face. */
  | 'countersunk'
  /** Hex bolt head. */
  | 'hex'
  /** Knurled collar, for standoffs and decorative work. */
  | 'knurled';

export type DriveStyle = 'none' | 'slot' | 'cross' | 'hexSocket';

export type TailStyle =
  /** Bucked over into a second dome — a real rivet, permanently set. */
  | 'bucked'
  /** Cut flush, as if the shank were trimmed. */
  | 'flush'
  /** Shank runs on past the grip, for parts that stack. */
  | 'through';

export interface RivetSpec {
  name?: string;
  headDiameter: number;
  headHeight: number;
  shankDiameter: number;
  /** Material thickness the fastener passes through. */
  grip: number;
  head?: HeadStyle;
  drive?: DriveStyle;
  tail?: TailStyle;
}

/**
 * A fastener, built along +Z with the head above the joint and the shank running
 * down through the grip. Origin sits at the seat — the face the head lands on —
 * so placing one is just aligning that origin to an anchor.
 *
 * These are tiny and there are hundreds of them, so they are meshed once at their
 * own small bounds and then instanced. Never mesh them as part of a larger field.
 */
export function rivet(spec: RivetSpec): Part {
  const headStyle = spec.head ?? 'dome';
  const drive = spec.drive ?? 'none';
  const tailStyle = spec.tail ?? 'bucked';

  const hr = spec.headDiameter / 2;
  const hh = spec.headHeight;
  const sr = spec.shankDiameter / 2;

  let head: SDF;
  let topZ = hh;

  switch (headStyle) {
    case 'dome': {
      // Sphere sized so the cap standing above the seat is exactly headHeight, and
      // its base radius comes out at exactly hr. Clip with a half-space at the seat,
      // not a cylinder — a cylinder of half-height hh/2 also lops off the top.
      const r = (hr * hr + hh * hh) / (2 * hh);
      head = intersect(translate(sphere(r), 0, 0, hh - r), plane(0, 0, -1, 0));
      break;
    }
    case 'pan': {
      head = cylinder(hr, hh / 2, Math.min(hh * 0.45, hr * 0.35));
      head = translate(head, 0, 0, hh / 2);
      break;
    }
    case 'countersunk': {
      // Widest at the top so it finishes flush with the plate face, narrowing down
      // to the shank. frustum() takes the -Z radius first, so the shank radius leads.
      head = translate(frustum(sr * 1.05, hr, hh / 2), 0, 0, -hh / 2);
      topZ = 0;
      break;
    }
    case 'hex': {
      const chamfer = hr * 0.12;
      head = extrude(ngon2(6, hr), hh / 2, chamfer);
      head = translate(head, 0, 0, hh / 2);
      break;
    }
    case 'knurled': {
      const grooves = radialRepeat(
        translate(box(hr * 0.06, hr * 0.06, hh, 0), hr, 0, hh / 2),
        Math.max(12, Math.round(hr * 9)),
      );
      head = subtract(translate(cylinder(hr, hh / 2, hh * 0.15), 0, 0, hh / 2), grooves);
      break;
    }
  }

  if (drive !== 'none') head = subtract(head, driveRecess(drive, hr, hh, topZ));

  const shankLength = tailStyle === 'through' ? spec.grip + hr : spec.grip;
  let body = union(head, translate(cylinder(sr, shankLength / 2), 0, 0, -shankLength / 2));

  if (tailStyle === 'bucked') {
    // the set tail spreads wider than the shank and sits proud of the far face
    const tr = sr * 1.55;
    const th = sr * 0.75;
    const r = (tr * tr + th * th) / (2 * th);
    const dome = intersect(
      translate(sphere(r), 0, 0, -spec.grip - th + r),
      translate(cylinder(tr, th / 2 + 0.001, 0), 0, 0, -spec.grip - th / 2),
    );
    body = union(body, dome, translate(torus(sr, sr * 0.18), 0, 0, -spec.grip));
  }

  const bottom = tailStyle === 'bucked' ? -spec.grip - sr : -shankLength;
  const halfWidth = Math.max(hr, sr * 1.6);

  // drive recesses and knurl grooves are the narrowest things on a fastener
  let section = Math.min(hh, sr * 2);
  if (drive === 'slot' || drive === 'cross') section = Math.min(section, hr * 0.24);
  if (headStyle === 'knurled') section = Math.min(section, hr * 0.12);

  return {
    name: spec.name ?? `rivet-${headStyle}`,
    detail: detailFor(section),
    sdf: body,
    bounds: padBox(
      { min: [-halfWidth, -halfWidth, bottom], max: [halfWidth, halfWidth, topZ] },
      Math.max(hr * 0.15, 0.3),
    ),
    anchors: [
      { name: 'seat', position: [0, 0, 0], axis: [0, 0, 1], tangent: [1, 0, 0], bore: spec.shankDiameter },
      { name: 'tail', position: [0, 0, -spec.grip], axis: [0, 0, -1], tangent: [1, 0, 0] },
    ],
  };
}

function driveRecess(drive: DriveStyle, hr: number, hh: number, topZ: number): SDF {
  // keyed to head height as well as radius: a shallow countersunk head is easily
  // thinner than half its own radius, and the recess would cut clean through it
  const depth = Math.min(hr * 0.5, hh * 0.5);
  switch (drive) {
    case 'slot':
      return translate(box(hr * 0.82, hr * 0.13, depth), 0, 0, topZ);
    case 'cross': {
      const a = translate(box(hr * 0.6, hr * 0.12, depth), 0, 0, topZ);
      return union(a, rotateZ(a, Math.PI / 2));
    }
    case 'hexSocket':
      return translate(extrude(ngon2(6, hr * 0.5), depth), 0, 0, topZ);
    default:
      return () => Infinity;
  }
}
