import { arc, bezier3, bow, catmullRom, helix, logSpiral, type Curve } from '../geom/curve';
import type { Vec3 } from '../geom/types';
import { leaf } from '../parts/leaf';
import { bead, collar, rivet } from '../parts/fastener';
import { blade, wire } from '../parts/wire';
import type { Part } from '../parts/types';
import {
  compose, dihedral, helical, mirror, nested, phyllotaxis, radial, ring, sphereShell,
  type Symmetry,
} from '../pattern/symmetry';
import { DslError, type Span } from './lexer';

export type Value = number | string | Vec3 | Curve | Part | Symmetry;

export const isVec = (v: Value): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number');

export const isSymmetry = (v: Value): v is Symmetry =>
  Array.isArray(v) && (v.length === 0 || v[0] instanceof Float32Array);

export const isCurve = (v: Value): v is Curve =>
  typeof v === 'object' && v !== null && typeof (v as Curve).at === 'function';

export const isPart = (v: Value): v is Part =>
  typeof v === 'object' && v !== null && 'mesh' in (v as Part) && 'anchors' in (v as Part);

export interface CallArg {
  name?: string;
  value: Value;
  span: Span;
}

/**
 * Argument reader for builtin calls.
 *
 * The point of `done()` is the error it produces: an unrecognised argument name
 * is the single most common thing to get wrong in a language like this, and
 * silently falling back to a default would leave someone staring at a shape that
 * ignored what they wrote.
 */
export class Args {
  private used = new Set<number>();

  constructor(
    private callee: string,
    private args: CallArg[],
    readonly span: Span,
    private known: string[],
  ) {
    // Check names up front, not in done(). Otherwise a misspelled argument reads
    // as a missing one — "leaf needs width" when what was written was "widht" —
    // and points the writer at the wrong problem entirely.
    for (const arg of args) {
      if (arg.name && !known.includes(arg.name)) {
        throw new DslError(
          `${callee} has no "${arg.name}" — it takes ${known.join(', ')}`,
          arg.span,
        );
      }
    }
  }

  private find(name: string, positional: number): CallArg | undefined {
    for (let i = 0; i < this.args.length; i++) {
      if (this.args[i].name === name) { this.used.add(i); return this.args[i]; }
    }
    let seen = -1;
    for (let i = 0; i < this.args.length; i++) {
      if (this.args[i].name) continue;
      seen++;
      if (seen === positional) { this.used.add(i); return this.args[i]; }
    }
    return undefined;
  }

  num(name: string, positional: number, fallback?: number): number {
    const arg = this.find(name, positional);
    if (!arg) {
      if (fallback !== undefined) return fallback;
      throw new DslError(`${this.callee} needs "${name}"`, this.span);
    }
    if (typeof arg.value !== 'number') {
      throw new DslError(`"${name}" must be a number in ${this.callee}`, arg.span);
    }
    return arg.value;
  }

  flag(name: string, positional: number, fallback: boolean): boolean {
    const arg = this.find(name, positional);
    if (!arg) return fallback;
    if (typeof arg.value === 'number') return arg.value !== 0;
    if (arg.value === 'yes' || arg.value === 'true') return true;
    if (arg.value === 'no' || arg.value === 'false') return false;
    throw new DslError(`"${name}" must be yes or no in ${this.callee}`, arg.span);
  }

  word(name: string, positional: number, fallback: string): string {
    const arg = this.find(name, positional);
    if (!arg) return fallback;
    if (typeof arg.value !== 'string') {
      throw new DslError(`"${name}" must be a word in ${this.callee}`, arg.span);
    }
    return arg.value;
  }

  vec(name: string, positional: number, fallback?: Vec3): Vec3 {
    const arg = this.find(name, positional);
    if (!arg) {
      if (fallback) return fallback;
      throw new DslError(`${this.callee} needs a point for "${name}"`, this.span);
    }
    if (!isVec(arg.value)) {
      throw new DslError(`"${name}" must be a point like (0, 10, 2)`, arg.span);
    }
    return arg.value;
  }

  curve(name: string, positional: number): Curve {
    const arg = this.find(name, positional);
    if (!arg) throw new DslError(`${this.callee} needs a path`, this.span);
    if (!isCurve(arg.value)) {
      throw new DslError(
        `"${name}" must be a path — try spiral, arc, circle, helix, bezier, through or bow`,
        arg.span,
      );
    }
    return arg.value;
  }

  symmetry(name: string, positional: number): Symmetry {
    const arg = this.find(name, positional);
    if (!arg) throw new DslError(`${this.callee} needs a symmetry for "${name}"`, this.span);
    if (!isSymmetry(arg.value)) {
      throw new DslError(`"${name}" must be a symmetry, like ring(8, radius: 20)`, arg.span);
    }
    return arg.value;
  }

  rest(): Value[] {
    const out: Value[] = [];
    for (let i = 0; i < this.args.length; i++) {
      if (this.used.has(i) || this.args[i].name) continue;
      this.used.add(i);
      out.push(this.args[i].value);
    }
    return out;
  }

  done() {
    for (let i = 0; i < this.args.length; i++) {
      if (this.used.has(i)) continue;
      const arg = this.args[i];
      throw new DslError(
        `${this.callee} was given more values than it takes — it takes ${this.known.join(', ')}`,
        arg.span,
      );
    }
  }
}

type Builtin = (args: Args) => Value;

const define = (known: string[], fn: (a: Args) => Value) =>
  ({ known, fn }) as { known: string[]; fn: Builtin };

/** Curves. A wire or blade path is one of these. */
const CURVES = {
  spiral: define(['start', 'turns', 'growth', 'rise'], (a) =>
    logSpiral(a.num('start', 0), a.num('turns', 1), a.num('growth', 2, 2.4), a.num('rise', 3, 0))),

  arc: define(['radius', 'from', 'to', 'z'], (a) =>
    arc(a.num('radius', 0), a.num('from', 1, 0), a.num('to', 2, Math.PI), a.num('z', 3, 0))),

  circle: define(['radius', 'z'], (a) =>
    arc(a.num('radius', 0), 0, Math.PI * 2, a.num('z', 1, 0))),

  helix: define(['radius', 'height', 'turns'], (a) =>
    helix(a.num('radius', 0), a.num('height', 1), a.num('turns', 2, 1))),

  bezier: define(['a', 'b', 'c', 'd'], (a) =>
    bezier3(a.vec('a', 0), a.vec('b', 1), a.vec('c', 2), a.vec('d', 3))),

  bow: define(['a', 'b', 'sag'], (a) =>
    bow(a.vec('a', 0), a.vec('b', 1), a.num('sag', 2))),

  through: define(['points'], (a) => {
    const points = a.rest();
    if (points.length < 2) throw new DslError('through() needs at least two points', a.span);
    for (const p of points) {
      if (!isVec(p)) throw new DslError('through() takes points like (0, 10, 2)', a.span);
    }
    return catmullRom(points as Vec3[]);
  }),
};

/** Parts. Each call makes real geometry, so results are cached by the caller. */
const PARTS = {
  leaf: define(['length', 'width', 'thickness', 'bevel', 'piercings', 'droop', 'boss', 'segments'], (a) =>
    leaf({
      length: a.num('length', 0),
      width: a.num('width', 1),
      thickness: a.num('thickness', 2, 1.1),
      bevel: a.num('bevel', -1, NaN) || undefined,
      piercings: a.num('piercings', -1, 0) || undefined,
      droop: a.num('droop', -1, 0.18),
      bossBore: a.num('boss', -1, 0) || undefined,
      segments: a.num('segments', -1, 64),
    })),

  wire: define(['path', 'radius', 'tip', 'twist', 'flatten', 'closed', 'sections', 'sides'], (a) =>
    wire({
      path: a.curve('path', 0),
      radius: a.num('radius', 1),
      tipScale: a.num('tip', -1, 0.2),
      twistTurns: a.num('twist', -1, 0) / (Math.PI * 2) || undefined,
      flatten: a.flag('flatten', -1, false),
      closed: a.flag('closed', -1, false),
      sections: a.num('sections', -1, 128),
      sides: a.num('sides', -1, 12),
    })),

  blade: define(['path', 'width', 'thickness', 'twist', 'sections', 'sides'], (a) =>
    blade({
      path: a.curve('path', 0),
      width: a.num('width', 1),
      thickness: a.num('thickness', 2, 1),
      twistTurns: a.num('twist', -1, 0) / (Math.PI * 2) || undefined,
      sections: a.num('sections', -1, 96),
      sides: a.num('sides', -1, 16),
    })),

  rivet: define(['head', 'height', 'shank', 'grip', 'tail', 'segments'], (a) =>
    rivet({
      headDiameter: a.num('head', 0),
      headHeight: a.num('height', 1),
      shankDiameter: a.num('shank', 2),
      grip: a.num('grip', 3),
      tailSpread: a.num('tail', -1, NaN) || undefined,
      segments: a.num('segments', -1, 24),
    })),

  bead: define(['radius', 'point', 'bore', 'segments'], (a) =>
    bead({
      radius: a.num('radius', 0),
      point: a.num('point', 1, NaN) || undefined,
      bore: a.num('bore', -1, 0) || undefined,
      segments: a.num('segments', -1, 24),
    })),

  collar: define(['inner', 'wall', 'length', 'belly', 'segments'], (a) =>
    collar({
      innerRadius: a.num('inner', 0),
      wall: a.num('wall', 1),
      length: a.num('length', 2),
      belly: a.num('belly', -1, 0.6),
      segments: a.num('segments', -1, 24),
    })),
};

/** Symmetries. Everything a form repeats around. */
const SYMMETRIES = {
  radial: define(['count', 'phase'], (a) => radial(a.num('count', 0), a.num('phase', 1, 0))),

  ring: define(['count', 'radius', 'phase', 'z', 'tilt', 'scale'], (a) =>
    ring(a.num('count', 0), a.num('radius', 1, 0), {
      phase: a.num('phase', -1, 0),
      z: a.num('z', -1, 0),
      tilt: a.num('tilt', -1, 0),
      scale: a.num('scale', -1, 1),
    })),

  dihedral: define(['count'], (a) => dihedral(a.num('count', 0))),

  mirror: define([], (a) => { a.done(); return mirror(); }),

  helical: define(['count', 'radius', 'rise', 'turns', 'tilt', 'taper'], (a) =>
    helical(a.num('count', 0), a.num('radius', 1), a.num('rise', 2), a.num('turns', 3, 1), {
      tilt: a.num('tilt', -1, 0),
      taper: a.num('taper', -1, 1),
    })),

  phyllotaxis: define(['count', 'spacing', 'rise', 'tilt', 'fade', 'taper', 'start'], (a) => {
    const tilt = a.num('tilt', -1, 0);
    const fade = a.num('fade', -1, 0);
    return phyllotaxis(a.num('count', 0), a.num('spacing', 1), {
      rise: a.num('rise', -1, 0),
      // fade is why a flower is not a rosette: inner courses stand up, outer lie flat
      tilt: fade === 0 ? tilt : (t: number) => tilt * Math.pow(1 - t, fade),
      taper: a.num('taper', -1, 1),
      startIndex: a.num('start', -1, 0),
    });
  }),

  shell: define(['count', 'radius', 'orient', 'lean', 'turns'], (a) =>
    sphereShell(a.num('count', 0), a.num('radius', 1), {
      orient: a.word('orient', -1, 'tangential') as 'radial' | 'tangential',
      lean: a.num('lean', -1, 0),
      turns: a.num('turns', -1, 1),
    })),

  nested: define(['count', 'factor', 'spin'], (a) =>
    nested(a.num('count', 0), a.num('factor', 1), a.num('spin', 2, 0))),

  compose: define(['outer', 'inner'], (a) =>
    compose(a.symmetry('outer', 0), a.symmetry('inner', 1))),
};

export const BUILTINS: Record<string, { known: string[]; fn: Builtin }> = {
  ...CURVES, ...PARTS, ...SYMMETRIES,
};

export const PART_NAMES = Object.keys(PARTS);
export const BUILTIN_NAMES = Object.keys(BUILTINS);
