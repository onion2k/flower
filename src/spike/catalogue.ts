import { arc, bezier3, catmullRom, logSpiral } from '../geom/curve';
import { band, blade, wire } from '../parts/wire';
import { bar, disc, gusset } from '../parts/panel';
import { leaf } from '../parts/leaf';
import { bead, collar, pod, rivet } from '../parts/fastener';
import type { Part } from '../parts/types';

/**
 * An art nouveau vocabulary rather than an engineering one: drawn lines that
 * taper and die away, pierced leaves, beads and ferrules. Each entry exists to
 * exercise one generator honestly, at a triangle count a sculpture can afford
 * to repeat sixty times.
 */
export const catalogue: Record<string, () => Part> = {
  tendril: () =>
    wire({
      name: 'tendril',
      path: logSpiral(1.4, 1.45, 3.1),
      radius: 1.3,
      tipScale: 0.14,
      sections: 160,
      sides: 12,
    }),

  whiplash: () =>
    wire({
      name: 'whiplash',
      path: catmullRom([
        [-26, -6, 0],
        [-8, 8, 2],
        [8, -7, -1],
        [22, 6, 3],
        [30, 1, 0],
      ]),
      radius: 1.5,
      tipScale: 0.18,
      flatten: true,
      twistTurns: 0.4,
      sections: 160,
      sides: 14,
    }),

  'stem + spiral': () =>
    wire({
      name: 'stem',
      path: catmullRom([
        [0, -22, 0],
        [1.5, -8, 0],
        [-2, 4, 0],
        [2, 14, 0],
        [7, 20, 0],
      ]),
      radius: 1.7,
      tipScale: 0.3,
      sections: 128,
    }),

  petal: () =>
    blade({
      name: 'petal',
      path: bezier3([0, 0, 0], [4, 12, 3], [2, 26, 9], [-3, 34, 6]),
      width: 13,
      thickness: 1.1,
      twistTurns: 0.16,
      sections: 96,
    }),

  'leaf · pierced': () =>
    leaf({ name: 'leaf', length: 40, width: 17, thickness: 1.2, piercings: 3, bossBore: 2.6 }),

  'leaf · blank': () =>
    leaf({ name: 'leaf-blank', length: 34, width: 20, thickness: 1.4, droop: 0.26 }),

  ring: () =>
    wire({
      name: 'ring',
      path: arc(16, 0, Math.PI * 2),
      radius: 1.2,
      closed: true,
      sections: 128,
      sides: 12,
    }),

  bead: () => bead({ name: 'bead', radius: 3.2, point: 4.6 }),

  'bead · drilled': () => bead({ name: 'bead-drilled', radius: 3, point: 3.4, bore: 1.8 }),

  collar: () => collar({ name: 'collar', innerRadius: 1.6, wall: 0.7, length: 4.5 }),

  rivet: () =>
    rivet({ name: 'rivet', headDiameter: 4, headHeight: 1.3, shankDiameter: 2, grip: 2.8 }),

  // ---- constructivist ----

  'strut · square': () =>
    wire({
      name: 'strut',
      path: arc(30, -0.5, 0.5),
      radius: 1.6,
      section: 'square',
      tipScale: 1,
      sections: 48,
    }),

  bar: () => bar({ length: 34, width: 5, thickness: 1.4, bore: 2.2, intermediate: 1 }),

  'disc · bolted': () =>
    disc({ radius: 14, thickness: 1.5, bore: 6, bolts: 8, boltCircleRadius: 10, boltBore: 2.2 }),

  'polygon · hex': () => disc({ radius: 13, thickness: 1.6, sides: 6, bore: 5, bolts: 6 }),

  gusset: () => gusset({ radius: 9, thickness: 1.4, bore: 2.4, lighten: 5 }),

  // ---- botanical and orrery ----

  'pod · whorled': () => pod({ length: 20, width: 11, whorls: 7, whorlDepth: 0.55 }),

  band: () => band({ radius: 22, width: 3.4, thickness: 0.9 }),
};

export const catalogueNames = Object.keys(catalogue);
