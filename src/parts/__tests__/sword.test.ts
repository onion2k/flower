import { describe, expect, it } from 'vitest';
import { sword } from '../sword';
import { findAnchor } from '../types';
import { expectWatertight, expectWellFormed, boundsOf } from '../../mesh/__tests__/helpers';

describe('sword: base contract', () => {
  it('is a well-formed, watertight solid', () => {
    const p = sword({ bladeLength: 80 });
    expectWellFormed(p.mesh);
    expectWatertight(p.mesh);
  });

  it('stands from z=0 to base + grip + blade, tip above base', () => {
    const p = sword({ bladeLength: 80 });
    const b = boundsOf(p.mesh);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.max[2]).toBeGreaterThan(80);
  });

  it('a longer bladeLength makes a taller sword', () => {
    const short = sword({ bladeLength: 40 });
    const long = sword({ bladeLength: 120 });
    expect(boundsOf(long.mesh).max[2]).toBeGreaterThan(boundsOf(short.mesh).max[2]);
  });

  it('base and tip anchors sit at the very bottom and the blade point', () => {
    const p = sword({ bladeLength: 80 });
    const base = findAnchor(p, 'base');
    const tip = findAnchor(p, 'tip');
    expect(base.position).toEqual([0, 0, 0]);
    expect(tip.position[2]).toBeCloseTo(boundsOf(p.mesh).max[2], 1);
  });
});

describe('sword: guard and blade', () => {
  it('the guard reaches wider than the blade or the grip alone', () => {
    const p = sword({ bladeLength: 80, guardWidth: 40 });
    const b = boundsOf(p.mesh);
    expect(b.max[0] - b.min[0]).toBeCloseTo(40, 0);
  });

  it('a wider bladeWidth widens the blade (and, by default, the guard with it)', () => {
    const narrow = sword({ bladeLength: 80, bladeWidth: 4 });
    const wide = sword({ bladeLength: 80, bladeWidth: 12 });
    const spanAt = (p: typeof narrow, z: number) => {
      let max = 0;
      for (let i = 0; i < p.mesh.positions.length; i += 3) {
        if (Math.abs(p.mesh.positions[i + 2] - z) < 1) max = Math.max(max, Math.abs(p.mesh.positions[i]));
      }
      return max * 2;
    };
    // partway up the blade, well clear of the guard
    const z = boundsOf(narrow.mesh).max[2] * 0.6;
    expect(spanAt(wide, z)).toBeGreaterThan(spanAt(narrow, z));
  });

  it('bladeTaper closer to 1 holds full width for longer before the point', () => {
    const early = sword({ bladeLength: 80, bladeTaper: 0.2 });
    const late = sword({ bladeLength: 80, bladeTaper: 0.9 });
    // at 60% up the blade's own span, a blade that only starts tapering at
    // 90% should still be near full width; one that started at 20% should not
    const bladeZAt = (p: typeof early, frac: number) => {
      const tip = findAnchor(p, 'tip').position[2];
      const guardZ = tip - 80;
      return guardZ + frac * 80;
    };
    const widthAt = (p: typeof early, z: number) => {
      let max = 0;
      for (let i = 0; i < p.mesh.positions.length; i += 3) {
        if (Math.abs(p.mesh.positions[i + 2] - z) < 1) max = Math.max(max, Math.abs(p.mesh.positions[i]));
      }
      return max;
    };
    const z = bladeZAt(early, 0.6);
    expect(widthAt(late, z)).toBeGreaterThan(widthAt(early, z));
  });

  it('is well-formed and watertight at dagger-like proportions too', () => {
    const p = sword({ bladeLength: 18, gripLength: 8 });
    expectWellFormed(p.mesh);
    expectWatertight(p.mesh);
  });
});
