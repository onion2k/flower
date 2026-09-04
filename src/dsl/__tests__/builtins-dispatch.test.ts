import { describe, expect, it } from 'vitest';
import { evaluate } from '../eval';
import { parse } from '../parser';
import { DslError } from '../lexer';
import { transformDirection, transformPoint } from '../../geom/transform';
import {
  along, compose, dihedral, helical, mirror, nested, phyllotaxis, radial, ring, spray, sphereShell,
} from '../../pattern/symmetry';
import { arc, ellipse, lissajous, logSpiral, rose, sine, superellipse, torusKnot } from '../../geom/curve';
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

  it('ellipse maps rx/ry/z independently, defaulting z to 0', () => {
    const want = ellipse(10, 4, 2);
    const got = wireEndpoints('ellipse(rx: 10, ry: 4, z: 2)');
    expectVec(got.base, want.at(0), 2);
    expectVec(got.tip, want.at(0), 1); // closed, same as circle
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

describe('part builtins: a tessellation count of 0 or less is a compile error, not a corrupted mesh', () => {
  it('rejects segments: 0 on a revolved part with a clear message', () => {
    const err = buildErr('part p = bead(radius: 4, segments: 0)\nform f { place p }');
    expect(err.message).toMatch(/"segments" must be at least 1 in bead/);
  });

  it('rejects a negative segments the same way', () => {
    const err = buildErr('part p = egg(radius: 10, segments: -3)\nform f { place p }');
    expect(err.message).toMatch(/"segments" must be at least 1 in egg/);
  });

  it('still accepts segments: 1, the boundary case', () => {
    expect(() => build('part p = pearl(radius: 4, segments: 1)\nform f { place p }')).not.toThrow();
  });
});

describe('shank builtin: DSL wiring reaches the crown anchor a setting fastens onto', () => {
  it('fastens a setting to the crown, seating it at the shank\'s own outer radius', () => {
    const sketch = build(`
      part band = shank(size: 17, width: 2.4, thickness: 1.7, shoulder: 0.5)
      part mount = setting(width: 6, style: claw, claws: 6)
      form f { place band\n fasten mount to band.crown }
    `);
    // the shank, the setting, and the solder fillet solderFillet adds at the join
    expect(sketch.assembly.placements).toHaveLength(3);
    const radius = 17 / 2 + 1.7 / 2;
    const mount = sketch.assembly.placements[1];
    expect(mount.anchor('base').position[0]).toBeCloseTo(radius, 3);
  });

  it('rejects shank with no shape at all — size, width and thickness are all required', () => {
    const err = buildErr('part p = shank(width: 2.4, thickness: 1.7)\nform f { place p }');
    expect(err.message).toMatch(/shank needs "size"/);
  });
});

describe('outline builtins and plate', () => {
  it('plate cuts a part to an outline value, positional or named', () => {
    const a = build('part p = plate(fan(radius: 10, blades: 5), thickness: 1)\nform f { place p }');
    const b = build('part p = plate(outline: fan(radius: 10, blades: 5), thickness: 1)\nform f { place p }');
    expect(a.assembly.placements[0].part.mesh.positions.length)
      .toBe(b.assembly.placements[0].part.mesh.positions.length);
    expect(a.assembly.placements[0].part.mesh.positions.length).toBeGreaterThan(0);
  });

  it('every outline builtin makes a plate', () => {
    const calls = [
      'fan(radius: 10)', 'chevron(width: 20, rise: 8, bar: 3)', 'sunburst(radius: 10, rays: 8)',
      'ziggurat(width: 20, height: 10, steps: 3)', 'keystone(width: 10, height: 6, corner: 1)',
      'scallop(radius: 10, lobes: 8)', 'lozenge(length: 20, width: 10, bulge: 0.2)',
      'polygon(sides: 8, radius: 10)', 'roundel(radius: 10)', 'stadium(length: 20, width: 6)',
      'card(width: 10, height: 14, corner: 2)',
    ];
    for (const call of calls) {
      const sketch = build(`part p = plate(${call}, thickness: 1)\nform f { place p }`);
      expect(sketch.assembly.placements[0].part.mesh.indices.length, call).toBeGreaterThan(0);
    }
  });

  it('cut pierces the plate with a second outline', () => {
    const cut = build('part p = plate(roundel(radius: 10), thickness: 1, cut: sunburst(radius: 5, rays: 6))\nform f { place p }');
    const pos = cut.assembly.placements[0].part.mesh.positions;
    // the sunburst's sharp ray tips are on the hole's wall, so they appear as vertices
    let tips = 0;
    for (let i = 0; i < pos.length; i += 3) {
      if (Math.abs(Math.hypot(pos[i], pos[i + 1]) - 5) < 1e-3) tips++;
    }
    expect(tips).toBeGreaterThan(0);
  });

  it('names the outline shapes when handed something else', () => {
    const e = buildErr('part p = plate(circle(radius: 10), thickness: 1)\nform f { place p }');
    expect(e.message).toMatch(/must be an outline — try fan/);
  });

  it('an outline is not a part', () => {
    const e = buildErr('part p = fan(radius: 10)\nform f { place p }');
    expect(e.message).toMatch(/is not a part — it is an outline/);
  });
});

describe('mathematical curve builtins', () => {
  it('lissajous maps width/height/a/b positionally and phase/rise by name', () => {
    const want = lissajous(10, 6, 3, 2, 0.4, 5);
    const got = wireEndpoints('lissajous(10, 6, 3, 2, phase: 0.4, rise: 5)');
    expectVec(got.base, want.at(0));
    expectVec(got.tip, want.at(1));
  });

  it('rhodonea is the rose curve, and "rose" stays a gem cut', () => {
    const want = rose(12, 3, 4);
    const got = wireEndpoints('rhodonea(12, 3, rise: 4)');
    expectVec(got.base, want.at(0));
    expectVec(got.tip, want.at(1));
    expect(() => build('part s = gem(cut: rose, width: 5) in diamond\nform f { place s }')).not.toThrow();
  });

  it('sine, knot and superellipse reach their geometry functions', () => {
    expectVec(wireEndpoints('sine(40, 3, 2, rise: 6)').tip, sine(40, 3, 2, 6).at(1));
    expectVec(wireEndpoints('knot(10, 3, 2, 3)').base, torusKnot(10, 3, 2, 3).at(0));
    expectVec(wireEndpoints('superellipse(10, 6, 4, z: 2)').base, superellipse(10, 6, 4, 2).at(0));
  });

  it('a knot closes into a loop when the wire is told so', () => {
    const sketch = build('part k = wire(path: knot(10, 3), radius: 1, closed: yes)\nform f { place k }');
    expect(sketch.assembly.placements[0].part.mesh.indices.length).toBeGreaterThan(0);
  });
});

describe('engraving', () => {
  it('"engraved" after a part attaches a pattern with pitch, depth and angle', () => {
    const sketch = build('part p = disc(radius: 10, thickness: 1) in gold satin engraved guilloche(scale: 0.8, depth: 0.05, angle: 0.3)\nform f { place p }');
    const part = sketch.assembly.placements[0].part;
    expect(part.engraving).toEqual({ pattern: 'guilloche', scale: 0.8, depth: 0.05, angle: 0.3 });
    expect(part.material).toEqual({ metal: 'gold', finish: 'satin' });
  });

  it('works without a material clause, and every pattern is known', () => {
    for (const name of ['hatch', 'crosshatch', 'guilloche', 'basketweave', 'rays', 'wave', 'stipple']) {
      const sketch = build(`part p = disc(radius: 10, thickness: 1) engraved ${name}(0.5)\nform f { place p }`);
      expect(sketch.assembly.placements[0].part.engraving?.pattern).toBe(name);
    }
  });

  it('crosshatch turns a quarter by default so its two families cross the grain', () => {
    const sketch = build('part p = disc(radius: 10, thickness: 1) engraved crosshatch(0.5)\nform f { place p }');
    expect(sketch.assembly.placements[0].part.engraving?.angle).toBeCloseTo(Math.PI / 4);
  });

  it('rejects something that is not a pattern, naming the patterns', () => {
    const e = buildErr('part p = disc(radius: 10, thickness: 1) engraved circle(radius: 3)\nform f { place p }');
    expect(e.message).toMatch(/"engraved" needs a pattern or lettering — try hatch, crosshatch/);
  });

  it('an engraving is not a part', () => {
    const e = buildErr('part p = hatch(0.5)\nform f { place p }');
    expect(e.message).toMatch(/is not a part — it is an engraving/);
  });

  it('the same call in two materials still yields two distinct parts', () => {
    const sketch = build('part a = bead(radius: 3, point: 2) in gold polished\npart b = bead(radius: 3, point: 2) in silver polished engraved stipple(0.4)\nform f { place a\n place b at (10, 0, 0) }');
    const [a, b] = sketch.assembly.placements.map((p) => p.part);
    expect(a.mesh).toBe(b.mesh);
    expect(a.engraving).toBeUndefined();
    expect(b.engraving?.pattern).toBe('stipple');
  });
});

describe('lettering', () => {
  it('text() after a part attaches an inscription, centred unless placed', () => {
    const sketch = build('part p = disc(radius: 10, thickness: 1) engraved text("1928", size: 4, depth: 0.1, angle: 0.2, font: sans)\nform f { place p }');
    const part = sketch.assembly.placements[0].part;
    expect(part.inscription).toEqual({ script: 'text', text: '1928', size: 4, depth: 0.1, angle: 0.2, font: 'sans', at: undefined });
  });

  it('at: places the line in surface millimetres', () => {
    const sketch = build('part p = disc(radius: 10, thickness: 1) engraved runes("odin", at: (2, -3, 0))\nform f { place p }');
    const ins = sketch.assembly.placements[0].part.inscription!;
    expect(ins.script).toBe('runes');
    expect(ins.at).toEqual([2, -3]);
    expect(ins.font).toBe('serif');
  });

  it('a part may carry a pattern and lettering together, in either order', () => {
    const a = build('part p = disc(radius: 10, thickness: 1) engraved guilloche(0.7) engraved text("A")\nform f { place p }');
    const b = build('part p = disc(radius: 10, thickness: 1) engraved text("A") engraved guilloche(0.7)\nform f { place p }');
    for (const s of [a, b]) {
      const part = s.assembly.placements[0].part;
      expect(part.engraving?.pattern).toBe('guilloche');
      expect(part.inscription?.text).toBe('A');
    }
  });

  it('refuses a font it does not have', () => {
    const e = buildErr('part p = disc(radius: 10, thickness: 1) engraved text("A", font: gothic)\nform f { place p }');
    expect(e.message).toMatch(/no font called "gothic" — try serif, sans, mono/);
  });
});
