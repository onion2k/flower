import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SLOW_MS_PER_MPX, TIERS, VERDICT_TTL, median, startingScale, tierFor, verdicts } from '../calibrate';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('startingScale', () => {
  it('opens at full size on a machine with headroom', () => {
    // a desktop: 6 ms a megapixel, a 1.4 Mpx frame, a 60 Hz panel
    expect(startingScale(6, 1.4, 16.7)).toBe(1);
  });

  it('comes down on a slow machine, to the size that fits a tick and a half', () => {
    // an integrated GPU at 80 ms a megapixel: 112 ms a frame at full size
    const s = startingScale(80, 1.4, 16.7);
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThanOrEqual(0.5);
    // the frame it opens at is inside the budget
    expect(80 * 1.4 * s * s).toBeLessThanOrEqual(16.7 * 1.5 + 6 + 1e-9);
  });

  it('never goes below the floor, however slow', () => {
    expect(startingScale(1000, 4, 16.7)).toBe(0.5);
    expect(startingScale(1000, 4, 16.7, 0.35)).toBe(0.35);
  });

  it('is full size when nothing was measured', () => {
    expect(startingScale(0, 1.4, 16.7)).toBe(1);
    expect(startingScale(NaN, 1.4, 16.7)).toBe(1);
    expect(startingScale(20, 0, 16.7)).toBe(1);
  });

  it('gives a 120 Hz panel less room, since its tick is shorter', () => {
    expect(startingScale(40, 1.4, 8.3)).toBeLessThan(startingScale(40, 1.4, 16.7));
  });
});

describe('tierFor', () => {
  it('suggests balanced for a desktop and fast for a slow laptop, never fine', () => {
    expect(tierFor(5)).toBe('balanced');
    expect(tierFor(SLOW_MS_PER_MPX)).toBe('balanced');
    expect(tierFor(SLOW_MS_PER_MPX + 1)).toBe('fast');
    expect(tierFor(500)).toBe('fast');
  });

  it('orders the tiers by what they ask', () => {
    expect(TIERS.fast.detail).toBeLessThan(TIERS.balanced.detail);
    expect(TIERS.balanced.detail).toBeLessThan(TIERS.fine.detail);
    expect(TIERS.fast.renderScale).toBeLessThan(TIERS.balanced.renderScale);
    expect(TIERS.fine.quality).toBe('final');
    expect(TIERS.fast.quality).toBe('draft');
  });
});

describe('median', () => {
  it('is the middle value, unmoved by one slow frame', () => {
    expect(median([5, 300, 6])).toBe(6);
    expect(median([4, 8])).toBe(6);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNaN();
  });
});

describe('verdicts', () => {
  const v = { key: 'intel/gen-12lp', msPerMpx: 70, scale: 0.6, at: 1_000_000 };

  it('keeps a verdict against its adapter and gives it back', () => {
    verdicts.save(v);
    expect(verdicts.load('intel/gen-12lp', v.at + 1000)).toEqual(v);
    expect(verdicts.load('apple/m2', v.at + 1000)).toBeNull();
  });

  it('keeps one verdict per adapter', () => {
    verdicts.save(v);
    verdicts.save({ ...v, key: 'apple/m2', msPerMpx: 4, scale: 1 });
    verdicts.save({ ...v, scale: 0.7 });
    expect(verdicts.load('intel/gen-12lp', v.at + 1)!.scale).toBe(0.7);
    expect(verdicts.load('apple/m2', v.at + 1)!.msPerMpx).toBe(4);
  });

  it('forgets a verdict older than its shelf life', () => {
    verdicts.save(v);
    expect(verdicts.load(v.key, v.at + VERDICT_TTL - 1)).not.toBeNull();
    expect(verdicts.load(v.key, v.at + VERDICT_TTL)).toBeNull();
  });

  it('is empty when the shelf is missing, malformed, or unavailable', () => {
    expect(verdicts.load(v.key)).toBeNull();
    localStorage.setItem('artshape.gpu', '{not json');
    expect(verdicts.load(v.key)).toBeNull();
    localStorage.setItem('artshape.gpu', JSON.stringify({ [v.key]: { key: v.key, at: Date.now() } }));
    expect(verdicts.load(v.key)).toBeNull();
    vi.stubGlobal('localStorage', undefined);
    expect(verdicts.load(v.key)).toBeNull();
    expect(() => verdicts.save(v)).not.toThrow();
  });

  it('can be cleared', () => {
    verdicts.save(v);
    verdicts.clear();
    expect(verdicts.load(v.key, v.at + 1)).toBeNull();
  });
});
