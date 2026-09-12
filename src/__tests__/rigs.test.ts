/**
 * The rig presets, and the two of them that hang a lamp rather than putting a
 * disc in the sky.
 *
 * A disc is the same light over a ring and over a candelabrum: it has a
 * direction and no place, so nothing about it depends on what it lights. A
 * lamp has a place, and a place has to be worked out against the piece — a
 * bench lamp two hundred millimetres over a brooch is a bench lamp, and two
 * hundred over a tiara is a light in the ceiling. These are the rules that
 * keeps.
 */
import { describe, expect, it } from 'vitest';
import { RIGS, rigNames, type Piece } from '../rigs';

const RING: Piece = { span: 24, top: 11 };
const TIARA: Piece = { span: 160, top: 70 };

describe('the rig presets', () => {
  it('all return lights with numbers in them', () => {
    for (const name of rigNames) {
      for (const light of RIGS[name](-0.8, 1, RING)) {
        for (const v of [light.strength, light.size, light.warmth, light.elevation, light.azimuth]) {
          expect(Number.isFinite(v), `${name}: ${v}`).toBe(true);
        }
      }
    }
  });

  it('keeps the sky in the sky and the lamps in the scene', () => {
    for (const name of ['fill', 'rim', 'three point', 'clamshell']) {
      for (const light of RIGS[name](0, 1, RING)) expect(light.at, name).toBeUndefined();
    }
    for (const name of ['bench lamp', 'case spot']) {
      const [light] = RIGS[name](0, 1, RING);
      expect(light.at, name).toBeDefined();
      expect(light.cone, name).toBeDefined();
      expect(light.aim, name).toBeDefined();
    }
  });

  it('hangs a lamp over the piece, not through it', () => {
    for (const name of ['bench lamp', 'case spot']) {
      for (const piece of [RING, TIARA]) {
        const [light] = RIGS[name](-0.8, 1, piece);
        const at = light.at!;
        // clear of the top of the piece, and further off than the piece is wide
        expect(at[2], `${name} over ${piece.span}`).toBeGreaterThan(piece.top);
        expect(Math.hypot(...at), `${name} over ${piece.span}`).toBeGreaterThan(piece.span);
        // aimed at the piece itself
        expect(light.aim![2]).toBeLessThanOrEqual(piece.top);
        expect(light.aim![0]).toBe(0);
      }
    }
  });

  it('moves a lamp out as the piece grows, so its pool covers the same piece', () => {
    for (const name of ['bench lamp', 'case spot']) {
      const near = RIGS[name](0, 1, RING)[0].at!;
      const far = RIGS[name](0, 1, TIARA)[0].at!;
      expect(Math.hypot(...far), name).toBeGreaterThan(Math.hypot(...near) * 2);
      // and its shade grows with it, or a tiara would be lit through a pinhole
      expect(RIGS[name](0, 1, TIARA)[0].size).toBeGreaterThan(RIGS[name](0, 1, RING)[0].size);
    }
  });

  it('gives every lamp a cone that opens outward', () => {
    for (const name of ['bench lamp', 'case spot']) {
      const [inner, outer] = RIGS[name](0, 1, RING)[0].cone!;
      expect(inner, name).toBeLessThan(outer);
      expect(inner, name).toBeGreaterThan(0);
      expect(outer, name).toBeLessThan(90);
    }
  });

  it('scales with the key, so the strength slider still means something', () => {
    for (const name of rigNames) {
      const half = RIGS[name](0, 0.5, RING);
      const full = RIGS[name](0, 1, RING);
      half.forEach((l, i) => expect(l.strength, name).toBeCloseTo(full[i].strength / 2));
    }
  });
});
