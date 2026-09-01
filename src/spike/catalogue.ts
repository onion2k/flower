import { plate, defaultPlate } from '../parts/plate';
import { wire, wireRing, eyeEnd } from '../parts/wire';
import { rivet } from '../parts/rivet';
import { arc, bow, helix } from '../geom/curve';
import type { Part } from '../parts/types';

/**
 * The shapes the spike meshes. Each is chosen to stress something specific rather
 * than to look good: thin sections, blended junctions, small features against a
 * large bound, and hard edges that must survive contouring.
 */
export const catalogue: Record<string, () => Part> = {
  plate: () => plate(defaultPlate),

  'wire · bowed strut': () =>
    wire({
      name: 'strut',
      path: bow([-22, 0, 0], [22, 0, 0], 9),
      radius: 1.1,
      start: eyeEnd(3.2, 1.5, 1.6),
      end: eyeEnd(3.2, 1.5, 1.6),
    }),

  'wire · arc': () =>
    wire({
      name: 'arc',
      path: arc(20, Math.PI * 0.15, Math.PI * 0.85),
      radius: 1.3,
      start: eyeEnd(3.4, 1.5, 1.8),
      end: eyeEnd(3.4, 1.5, 1.8),
    }),

  'wire · helix': () =>
    wire({
      name: 'helix',
      path: helix(9, 26, 2.5),
      segments: 192,
      radius: 1.1,
      start: eyeEnd(3, 1.4, 1.6),
      end: eyeEnd(3, 1.4, 1.6),
    }),

  'wire · ring': () => wireRing(18, 1.4),

  'rivet · dome': () =>
    rivet({ headDiameter: 4.4, headHeight: 1.5, shankDiameter: 2.4, grip: 3.2 }),

  'rivet · countersunk': () =>
    rivet({
      head: 'countersunk', drive: 'slot',
      headDiameter: 5, headHeight: 1.8, shankDiameter: 2.4, grip: 3.2, tail: 'flush',
    }),

  'rivet · hex bolt': () =>
    rivet({
      head: 'hex', drive: 'hexSocket',
      headDiameter: 5.2, headHeight: 2.2, shankDiameter: 2.6, grip: 4, tail: 'through',
    }),

  'rivet · pan + cross': () =>
    rivet({
      head: 'pan', drive: 'cross',
      headDiameter: 5, headHeight: 1.6, shankDiameter: 2.4, grip: 3.2, tail: 'flush',
    }),

  'rivet · knurled': () =>
    rivet({
      head: 'knurled',
      headDiameter: 6, headHeight: 3, shankDiameter: 2.4, grip: 3, tail: 'flush',
    }),
};

export const catalogueNames = Object.keys(catalogue);
