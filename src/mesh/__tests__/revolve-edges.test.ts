import { describe, expect, it } from 'vitest';
import { revolve } from '../revolve';

const finite = (mesh: ReturnType<typeof revolve>) => [...mesh.positions].every(Number.isFinite);

describe('revolve edge cases: segments count', () => {
  it('segments=1 is minimal but valid — a single wedge', () => {
    const mesh = revolve({ points: [[5, 0], [5, 10]] }, { segments: 1 });
    expect(mesh.positions.length / 3).toBeGreaterThan(0);
    expect(finite(mesh)).toBe(true);
  });

  it('segments=0 produces NaN positions rather than throwing or clamping — a real, DSL-reachable bug', () => {
    // `a = (i / segments) * arc` divides by the segment count with no floor,
    // so segments=0 gives i/0 = NaN for every row. This is not a contrived
    // internal-only input: every DSL builtin that revolves a silhouette
    // (bead, egg, pearl, bell, rivet, collar, pod, bud, setting, leaf,
    // petal...) reads `segments` straight from `a.num('segments', -1, N)`
    // with no lower bound, so a sketch that writes e.g. `bead(radius: 4,
    // segments: 0)` reaches this and gets a silently corrupted part instead
    // of a clear error. Documented here rather than asserted as correct.
    const mesh = revolve({ points: [[5, 0], [5, 10]] }, { segments: 0 });
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect([...mesh.positions].some((v) => Number.isNaN(v))).toBe(true);
  });

  it('a negative segments count produces an empty mesh rather than NaN or a throw', () => {
    // rows = segments + 1 goes negative too, so the row loop (i < rows)
    // never runs at all — an empty mesh, a milder failure than segments=0's
    // single NaN row, but still silent rather than a clear error
    const mesh = revolve({ points: [[5, 0], [5, 10]] }, { segments: -4 });
    expect(mesh.positions).toHaveLength(0);
    expect(mesh.indices).toHaveLength(0);
  });
});

describe('revolve edge cases: degenerate silhouettes', () => {
  it('a single-point silhouette throws rather than silently producing a broken mesh', () => {
    // only reachable by calling revolve() directly with a malformed
    // Silhouette — the DSL never lets a sketch supply raw silhouette points
    expect(() => revolve({ points: [[5, 0]] }, { segments: 16 })).toThrow();
  });

  it('a silhouette that runs to radius 0 at both ends (a lens/spindle shape) stays finite', () => {
    const mesh = revolve({ points: [[0, -5], [5, 0], [0, 5]] }, { segments: 16 });
    expect(finite(mesh)).toBe(true);
  });

  it('duplicate consecutive silhouette points do not throw or produce NaN', () => {
    const mesh = revolve({ points: [[5, 0], [5, 0], [5, 10]] }, { segments: 16 });
    expect(finite(mesh)).toBe(true);
  });
});

describe('revolve edge cases: the arc parameter', () => {
  it('arc=0 sweeps no angle at all — a flat sliver, but finite', () => {
    const mesh = revolve({ points: [[5, 0], [5, 10]] }, { segments: 16, arc: 0 });
    expect(finite(mesh)).toBe(true);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(mesh.positions[i + 1]).toBeCloseTo(0, 4); // every point at angle 0: y=0
    }
  });

  it('a negative arc sweeps the other way around, but stays finite and well-formed', () => {
    const mesh = revolve({ points: [[5, 0], [5, 10]] }, { segments: 16, arc: -Math.PI });
    expect(finite(mesh)).toBe(true);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(mesh.positions[i + 1]).toBeLessThanOrEqual(1e-6); // negative arc sweeps into y <= 0
    }
  });
});
