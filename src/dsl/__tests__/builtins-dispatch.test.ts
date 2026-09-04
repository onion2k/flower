import { describe, expect, it } from 'vitest';
import { evaluate } from '../eval';
import { parse } from '../parser';
import { DslError } from '../lexer';
import { transformDirection, transformPoint } from '../../geom/transform';
import {
  along, compose, dihedral, helical, mirror, nested, phyllotaxis, radial, ring, spray, sphereShell,
} from '../../pattern/symmetry';
import { arc, logSpiral } from '../../geom/curve';
import { expectVec } from '../../geom/__tests__/helpers';

/**
 * These builtins are thin translations from DSL arguments to the geometry and
 * pattern modules that are already tested directly (geom/__tests__,
 * pattern/__tests__). What is worth testing here is the wiring itself: that
 * builtins.ts reads the right argument into the right parameter, in the right
 * order, with the right default — not the underlying math again.
 */
const build = (src: string) => evaluate(parse(src));
const buildErr = (src: string): DslError => {
  try {
    build(src);
    throw new Error('expected the sketch to fail to compile');
  } catch (e) {
    if (e instanceof DslError) return e;
    throw e;
  }
};

/** A wire's base/tip anchors sit at its path's own endpoints, which makes them
 *  a cheap window onto exactly what curve a path builtin actually built. */
function wireEndpoints(src: string) {
  const sketch = build(`part w = wire(path: ${src}, radius: 1)\nform f { place w }`);
  const [p] = sketch.assembly.placements;
  return { base: p.anchor('base').position, tip: p.anchor('tip').position };
}

describe('curve builtins: DSL wiring matches the geometry function directly', () => {
  it('spiral maps start/turns/growth/rise onto logSpiral in that order', () => {
    const want = logSpiral(1.2, 1.4, 3, 2);
    const got = wireEndpoints('spiral(start: 1.2, turns: 1.4, growth: 3, rise: 2)');
    expectVec(got.base, want.at(0), 2);
    expectVec(got.tip, want.at(1), 2);
  });

  it('spiral defaults growth to 2.4 and rise to 0', () => {
    const want = logSpiral(1, 1);
    const got = wireEndpoints('spiral(start: 1, turns: 1)');
    expectVec(got.tip, want.at(1), 2);
  });

  it('arc maps radius/from/to/z, defaulting to a half turn at z=0', () => {
    const want = arc(5, 0, Math.PI, 0);
    const got = wireEndpoints('arc(radius: 5)');
    expectVec(got.base, want.at(0), 2);
    expectVec(got.tip, want.at(1), 2);
  });

  it('arc respects an explicit from/to/z', () => {
    const want = arc(5, 0.2, 1.1, 3);
    const got = wireEndpoints('arc(radius: 5, from: 0.2, to: 1.1, z: 3)');
    expectVec(got.base, want.at(0), 2);
    expectVec(got.tip, want.at(1), 2);
  });

  it('circle is a full turn regardless of a from/to, unlike arc', () => {
    const want = arc(5, 0, Math.PI * 2, 1);
    const got = wireEndpoints('circle(radius: 5, z: 1)');
    expectVec(got.base, want.at(0), 2);
    // start and end coincide on a closed circle
    expectVec(got.tip, want.at(0), 1);
  });

  it('helix maps radius/height/turns, defaulting turns to 1', () => {
    const got = wireEndpoints('helix(radius: 4, height: 10)');
    expectVec(got.base, [4, 0, -5], 2);
    expectVec(got.tip, [4, 0, 5], 2);
  });

  it('bezier maps a/b/c/d onto the four control points in order', () => {
    const got = wireEndpoints('bezier(a: (0, 0, 0), b: (0, 10, 0), c: (10, 10, 0), d: (10, 0, 0))');
    expectVec(got.base, [0, 0, 0], 2);
    expectVec(got.tip, [10, 0, 0], 2);
  });

  it('bow maps a/b/sag and starts and ends exactly at a and b', () => {
    const got = wireEndpoints('bow(a: (0, 0, 0), b: (20, 0, 0), sag: 4)');
    expectVec(got.base, [0, 0, 0], 2);
    expectVec(got.tip, [20, 0, 0], 2);
  });

  it('through builds a curve passing through the given points in order', () => {
    const got = wireEndpoints('through((0, 0, 0), (5, 5, 0), (10, 0, 0))');
    expectVec(got.base, [0, 0, 0], 2);
    expectVec(got.tip, [10, 0, 0], 2);
  });

  it('through rejects fewer than two points', () => {
    const err = buildErr('part w = wire(path: through((0, 0, 0)), radius: 1)\nform f { place w }');
    expect(err.message).toMatch(/through\(\) needs at least two points/);
  });

  it('through rejects a non-point argument', () => {
    const err = buildErr('part w = wire(path: through((0, 0, 0), 5), radius: 1)\nform f { place w }');
    expect(err.message).toMatch(/through\(\) takes points/);
  });
});

/** repeat merges a unit's placements under each transform of the symmetry, and
 *  the unit here is one part at the identity — so a placement's matrix *is*
 *  the symmetry's own transform, letting the DSL's result compare directly
 *  against calling the pattern function with the same arguments. */
function repeatMatrices(src: string) {
  const sketch = build(`part p = leaf(length: 10, width: 5)\nform f { repeat p around ${src} }`);
  return sketch.assembly.placements.map((pl) => pl.matrix);
}

describe('symmetry builtins: DSL wiring matches the pattern function directly', () => {
  it('radial maps count/phase', () => {
    const want = radial(5, 0.3);
    const got = repeatMatrices('radial(5, phase: 0.3)');
    expect(got).toHaveLength(5);
    expectVec(transformDirection(got[2], [1, 0, 0]), transformDirection(want[2], [1, 0, 0]), 3);
  });

  it('ring maps count/radius/phase/z/tilt/scale into the options object', () => {
    const want = ring(6, 12, { phase: 0.4, z: 2, tilt: 0.3, scale: 1.5 });
    const got = repeatMatrices('ring(6, radius: 12, phase: 0.4, z: 2, tilt: 0.3, scale: 1.5)');
    expect(got).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expectVec(transformPoint(got[i], [0, 0, 0]), transformPoint(want[i], [0, 0, 0]), 3);
    }
  });

  it('ring defaults radius to 0 when only a count is given', () => {
    const got = repeatMatrices('ring(4)');
    for (const m of got) expectVec(transformPoint(m, [0, 0, 0]), [0, 0, 0], 3);
  });

  it('dihedral maps count and produces 2n copies', () => {
    const want = dihedral(4);
    const got = repeatMatrices('dihedral(4)');
    expect(got).toHaveLength(want.length);
  });

  it('mirror takes no arguments', () => {
    const want = mirror();
    const got = repeatMatrices('mirror()');
    expect(got).toHaveLength(want.length);
  });

  it('mirror rejects being given an argument', () => {
    const err = buildErr('part p = leaf(length: 10, width: 5)\nform f { repeat p around mirror(1) }');
    expect(err.message).toMatch(/was given more values than it takes/);
  });

  it('helical maps count/radius/rise/turns/tilt/taper', () => {
    const want = helical(5, 8, 20, 2, { tilt: 0.2, taper: 0.6 });
    const got = repeatMatrices('helical(5, radius: 8, rise: 20, turns: 2, tilt: 0.2, taper: 0.6)');
    expect(got).toHaveLength(5);
    expectVec(transformPoint(got[3], [0, 0, 0]), transformPoint(want[3], [0, 0, 0]), 2);
  });

  it('phyllotaxis maps count/spacing/rise/tilt/taper/start, with fade off by default', () => {
    const want = phyllotaxis(12, 3, { rise: 4, tilt: 0.5, taper: 0.8, startIndex: 2 });
    const got = repeatMatrices('phyllotaxis(12, spacing: 3, rise: 4, tilt: 0.5, taper: 0.8, start: 2)');
    expect(got).toHaveLength(12);
    expectVec(transformPoint(got[7], [0, 0, 0]), transformPoint(want[7], [0, 0, 0]), 2);
  });

  it('phyllotaxis turns tilt into a function of position when fade is given', () => {
    const withoutFade = repeatMatrices('phyllotaxis(10, spacing: 3, tilt: 0.6)');
    const withFade = repeatMatrices('phyllotaxis(10, spacing: 3, tilt: 0.6, fade: 2)');
    // fade decays the tilt toward the outer copies, so the last copy differs
    const a = transformDirection(withoutFade[9], [0, 0, 1]);
    const b = transformDirection(withFade[9], [0, 0, 1]);
    expect(Math.abs(a[2] - b[2])).toBeGreaterThan(1e-3);
  });

  it('shell maps count/radius/orient/lean/turns, checking orient against its word list', () => {
    const want = sphereShell(15, 10, { orient: 'flat', lean: 0.2, turns: 1.5 });
    const got = repeatMatrices('shell(15, radius: 10, orient: flat, lean: 0.2, turns: 1.5)');
    expect(got).toHaveLength(15);
    expectVec(transformPoint(got[5], [0, 0, 0]), transformPoint(want[5], [0, 0, 0]), 2);
  });

  it('shell rejects an orient that is not outward or flat', () => {
    const err = buildErr('part p = leaf(length: 10, width: 5)\nform f { repeat p around shell(6, radius: 10, orient: sideways) }');
    expect(err.message).toMatch(/there is no orient called "sideways" — try outward, flat/);
  });

  it('along takes its path positionally and maps count/from/to/taper/tilt/alternate', () => {
    const path = arc(10, 0, Math.PI);
    const want = along(path, 6, { from: 0.1, to: 0.9, taper: 0.5, tilt: 0.2, alternate: true });
    const got = repeatMatrices('along(path: arc(radius: 10, to: 3.14159265), count: 6, from: 0.1, to: 0.9, taper: 0.5, tilt: 0.2, alternate: yes)');
    expect(got).toHaveLength(6);
    expectVec(transformPoint(got[4], [0, 0, 0]), transformPoint(want[4], [0, 0, 0]), 1);
  });

  it('spray maps count/radius/lean/rise/taper/spin, defaulting lean to 0.5', () => {
    const want = spray(9, 6, { lean: 0.5, rise: 3, taper: 0.7, spin: 0.4 });
    const got = repeatMatrices('spray(9, radius: 6, rise: 3, taper: 0.7, spin: 0.4)');
    expect(got).toHaveLength(9);
    expectVec(transformPoint(got[8], [0, 0, 0]), transformPoint(want[8], [0, 0, 0]), 2);
  });

  it('nested maps count/factor/spin', () => {
    const want = nested(4, 0.7, 0.3);
    const got = repeatMatrices('nested(4, factor: 0.7, spin: 0.3)');
    expect(got).toHaveLength(4);
    expectVec(transformDirection(got[2], [1, 0, 0]), transformDirection(want[2], [1, 0, 0]), 3);
  });

  it('compose takes outer and inner by name, in that order', () => {
    const want = compose(ring(3, 10), mirror());
    const got = repeatMatrices('compose(outer: ring(3, radius: 10), inner: mirror())');
    expect(got).toHaveLength(want.length);
  });

  it('rejects a symmetry-taking argument that does not evaluate to a symmetry', () => {
    const err = buildErr('part p = leaf(length: 10, width: 5)\nform f { repeat p around compose(outer: 5, inner: mirror()) }');
    expect(err.message).toMatch(/must be a symmetry/);
  });
});

describe('part builtins: word arguments are checked against a fixed list', () => {
  it('rejects an unknown leaf shape, naming the choices', () => {
    const err = buildErr('part p = leaf(length: 10, width: 5, shape: hexagonal)\nform f { place p }');
    expect(err.message).toMatch(/there is no shape called "hexagonal" — try ovate, lanceolate/);
  });

  it('rejects an unknown gem cut', () => {
    const err = buildErr('part p = gem(cut: square, width: 5)\nform f { place p }');
    expect(err.message).toMatch(/there is no cut called "square" — try brilliant/);
  });

  it('rejects an unknown setting style', () => {
    const err = buildErr('part p = setting(width: 5, style: prong)\nform f { place p }');
    expect(err.message).toMatch(/there is no style called "prong" — try claw, bezel/);
  });

  it('rejects an unknown wire section', () => {
    const err = buildErr('part p = wire(path: circle(radius: 5), radius: 1, section: triangle)\nform f { place p }');
    expect(err.message).toMatch(/there is no section called "triangle"/);
  });

  it('rejects an unknown petal shape or edge independently', () => {
    const badShape = buildErr('part p = petal(length: 10, width: 5, shape: fancy)\nform f { place p }');
    expect(badShape.message).toMatch(/there is no shape called "fancy"/);
    const badEdge = buildErr('part p = petal(length: 10, width: 5, edge: scalloped)\nform f { place p }');
    expect(badEdge.message).toMatch(/there is no edge called "scalloped"/);
  });

  it('rejects an unknown enamel colour, naming the choices', () => {
    const err = buildErr('part p = leaf(length: 10, width: 5, enamel: chartreuse)\nform f { place p }');
    expect(err.message).toMatch(/there is no enamel called "chartreuse" — try/);
  });

  it('rejects an unknown vein metal', () => {
    const err = buildErr('part p = leaf(length: 10, width: 5, enamel: cobalt, veinMetal: unobtainium)\nform f { place p }');
    expect(err.message).toMatch(/there is no metal called "unobtainium" for veins/);
  });

  it('accepts a valid word and carries it onto the resulting part', () => {
    const sketch = build('part p = leaf(length: 10, width: 5, enamel: cobalt)\nform f { place p }');
    expect(sketch.assembly.placements[0].part.enamel).toBe('cobalt');
  });
});

describe('part builtins: identical calls share geometry, calls with a path do not', () => {
  it('two identical leaf() declarations produce the same mesh object', () => {
    const sketch = build(`
      part a = leaf(length: 20, width: 10, piercings: 2)
      part b = leaf(length: 20, width: 10, piercings: 2)
      form f { place a\n place b }
    `);
    const [pa, pb] = sketch.assembly.placements;
    expect(pa.part.mesh).toBe(pb.part.mesh);
    // each declaration is still its own Part, so material does not leak between them
    expect(pa.part).not.toBe(pb.part);
  });

  it('two leaf() declarations with different arguments do not share a mesh', () => {
    const sketch = build(`
      part a = leaf(length: 20, width: 10)
      part b = leaf(length: 25, width: 10)
      form f { place a\n place b }
    `);
    const [pa, pb] = sketch.assembly.placements;
    expect(pa.part.mesh).not.toBe(pb.part.mesh);
  });

  it('a wire, taking a path, is rebuilt rather than shared across identical declarations', () => {
    const sketch = build(`
      part a = wire(path: circle(radius: 5), radius: 1)
      part b = wire(path: circle(radius: 5), radius: 1)
      form f { place a\n place b }
    `);
    const [pa, pb] = sketch.assembly.placements;
    expect(pa.part.mesh).not.toBe(pb.part.mesh);
  });
});
