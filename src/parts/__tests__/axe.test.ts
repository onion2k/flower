import { describe, expect, it } from 'vitest';
import { axe } from '../axe';
import { findAnchor } from '../types';
import { expectWatertight, expectWellFormed, boundsOf } from '../../mesh/__tests__/helpers';

describe('axe: base contract', () => {
  it('is a well-formed, watertight solid', () => {
    const p = axe({ haftLength: 100 });
    expectWellFormed(p.mesh);
    expectWatertight(p.mesh);
  });

  it('stands from z=0 (the butt) to at least the haft length', () => {
    const p = axe({ haftLength: 100 });
    const b = boundsOf(p.mesh);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.max[2]).toBeGreaterThanOrEqual(100 - 1);
  });

  it('a longer haftLength makes a taller axe', () => {
    const short = axe({ haftLength: 60 });
    const long = axe({ haftLength: 160 });
    expect(boundsOf(long.mesh).max[2]).toBeGreaterThan(boundsOf(short.mesh).max[2]);
  });

  it('butt and edge anchors sit at the bottom and the head tip', () => {
    const p = axe({ haftLength: 100, headReach: 26 });
    const butt = findAnchor(p, 'butt');
    const edge = findAnchor(p, 'edge');
    expect(butt.position).toEqual([0, 0, 0]);
    expect(edge.position[0]).toBeCloseTo(26, 0);
  });
});

describe('axe: head', () => {
  it('the head reaches out to one side, well past the haft radius', () => {
    const p = axe({ haftLength: 100, haftRadius: 1.8, headReach: 26 });
    const b = boundsOf(p.mesh);
    expect(b.max[0]).toBeGreaterThan(20);
  });

  it('a single-bit axe only reaches out on the +X side', () => {
    const p = axe({ haftLength: 100, headReach: 26 });
    const b = boundsOf(p.mesh);
    // the -X side never goes past the haft's own radius (~1.8 here)
    expect(-b.min[0]).toBeLessThan(5);
    expect(b.max[0]).toBeGreaterThan(20);
  });

  it('doubleBit mirrors a second head on the -X side', () => {
    const p = axe({ haftLength: 100, headReach: 26, doubleBit: true });
    const b = boundsOf(p.mesh);
    expect(-b.min[0]).toBeGreaterThan(20);
    expect(b.max[0]).toBeGreaterThan(20);
  });

  it('a taller headHeight makes a taller head', () => {
    const short = axe({ haftLength: 100, headHeight: 10 });
    const tall = axe({ haftLength: 100, headHeight: 40 });
    const spanAt = (p: typeof short) => {
      const b = boundsOf(p.mesh);
      return b.max[2] - b.min[2];
    };
    expect(spanAt(tall)).toBeGreaterThan(spanAt(short));
  });

  it('is well-formed and watertight with a double bit too', () => {
    const p = axe({ haftLength: 100, doubleBit: true });
    expectWellFormed(p.mesh);
    expectWatertight(p.mesh);
  });

  it('is well-formed and watertight at hatchet-like proportions', () => {
    const p = axe({ haftLength: 30, headReach: 10, headHeight: 12 });
    expectWellFormed(p.mesh);
    expectWatertight(p.mesh);
  });
});
