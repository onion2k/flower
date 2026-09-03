import { arc, bezier3, catmullRom, logSpiral } from '../geom/curve';
import { band, blade, wire } from '../parts/wire';
import { bar, disc, gusset } from '../parts/panel';
import { leaf } from '../parts/leaf';
import { bead, bell, bud, collar, egg, pod, rivet } from '../parts/fastener';
import { petal } from '../parts/petal';
import { gem, type GemCut } from '../parts/gem';
import { setting } from '../parts/setting';
import { branch, stem } from '../parts/stem';
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

  bell: () => bell({ length: 12, mouth: 16, throat: 6, wall: 0.7, flare: 2.6 }),

  'leaf · lanceolate': () =>
    leaf({ length: 34, width: 9, thickness: 0.7, shape: 'lanceolate', veins: 4, teeth: 20 }),

  'leaf · cordate': () =>
    leaf({ length: 26, width: 22, thickness: 0.8, shape: 'cordate', veins: 3, droop: 0.05 }),

  'leaf · palmate': () =>
    leaf({ length: 30, width: 30, thickness: 0.8, lobes: 5, spread: 2.7, veins: 5, teeth: 40, toothDepth: 0.45 }),

  // ---- flowers ----

  'petal · rose': () =>
    petal({ length: 26, width: 22, thickness: 0.6, shape: 'round', cup: 0.75, curl: -0.5, curlBias: 2.6 }),

  'petal · fringed': () =>
    petal({
      name: 'petal-fringed', length: 30, width: 15, thickness: 0.5, shape: 'spoon',
      edge: 'fringed', edgeDepth: 0.1, edgeCount: 34, cup: 0.5, ruffle: 1.1, ruffleWaves: 4,
    }),

  'petal · strap': () =>
    petal({ length: 24, width: 6, thickness: 0.45, shape: 'strap', edge: 'notched', cup: 0.32, curl: 0.3 }),

  'petal · lip': () =>
    petal({ length: 22, width: 18, thickness: 0.5, shape: 'lip', edge: 'crenate', cup: 0.6, curl: -0.7, curlBias: 2.2, twist: 0.25 }),

  'leaf · keeled': () =>
    leaf({ length: 44, width: 10, thickness: 0.7, shape: 'linear', cup: 0.55, keel: 0.7, curl: 0.5, curlBias: 2.4 }),

  'leaf · orbicular': () =>
    leaf({ length: 22, width: 22, thickness: 0.7, shape: 'orbicular', veins: 4, droop: 0.02, cup: 0.3 }),

  bud: () => bud({ length: 14, width: 8, lobes: 5, lobeDepth: 0.13 }),

  stem: () =>
    stem({
      path: catmullRom([[0, 0, 0], [1.5, 0, 14], [-1, 0, 28], [2, 0, 42]]),
      radius: 1.5, tipScale: 0.5, nodes: 4,
    }),

  branch: () =>
    branch({
      path: catmullRom([[0, 0, 0], [2, 0, 16], [-1, 0, 32], [3, 0, 46]]),
      radius: 1.8, tipScale: 0.4, limbs: 4, limbLength: 0.4,
    }),

  'pod · ribbed': () => pod({ length: 18, width: 12, ribs: 8, ribDepth: 0.13 }),

  'bell · lobed': () => bell({ length: 13, mouth: 17, throat: 5, wall: 0.6, flare: 2.4, lobes: 5, lobeDepth: 0.2 }),

  // Stones carry their own species, since a cut is not worth looking at in the
  // panel's metal, and the mounts that hold them.
  'gem · brilliant': stone('brilliant', 'diamond'),
  'gem · step': stone('step', 'emerald'),
  'gem · pear': stone('pear', 'ruby'),
  'gem · marquise': stone('marquise', 'sapphire'),
  'gem · rose': stone('rose', 'garnet'),
  'gem · cabochon': stone('cabochon', 'moonstone'),

  egg: () => egg({ radius: 11, taper: 0.34 }),

  'setting · claw': () => setting({ width: 14, style: 'claw', claws: 4, height: 6 }),
  'setting · bezel': () => setting({ width: 14, style: 'bezel', height: 5 }),
};

/** A stone of a given cut, in its own species rather than the panel's metal. */
function stone(cut: GemCut, species: string): () => Part {
  return () => ({ ...gem({ name: cut, cut, width: 14 }), material: { metal: species } });
}

export const catalogueNames = Object.keys(catalogue);
