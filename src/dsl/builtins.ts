import { arc, bezier3, bow, catmullRom, ellipse, helix, logSpiral, type Curve } from '../geom/curve';
import type { Vec3 } from '../geom/types';
import { leaf } from '../parts/leaf';
import { enamels, enamelNames, metalNames } from '../render/materials';
import type { LeafShape, PetalEdge, PetalShape } from '../geom/outline';
import { bead, bell, bud, collar, egg, pod, rivet } from '../parts/fastener';
import { petal } from '../parts/petal';
import { pearl } from '../parts/pearl';
import { gem, type GemCut } from '../parts/gem';
import { setting, type SettingStyle } from '../parts/setting';
import { shank } from '../parts/ring';
import { clasp } from '../parts/clasp';
import { jumpRing } from '../parts/jumpring';
import { leverBack } from '../parts/leverback';
import { bust, earringStand, easel, ringStand } from '../parts/display';
import { sword } from '../parts/sword';
import { axe } from '../parts/axe';
import { branch, stem } from '../parts/stem';
import { band, blade, wire, type Section } from '../parts/wire';
import { bar, disc, gusset } from '../parts/panel';
import type { Part } from '../parts/types';
import {
  along, compose, dihedral, helical, mirror, nested, phyllotaxis, radial, ring, spray,
  sphereShell, type Symmetry,
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
export type ParamKind = 'number' | 'word' | 'flag' | 'point' | 'path' | 'symmetry' | 'points';

/** What a builtin asked for, as recorded by a probe call. */
export interface ParamInfo {
  name: string;
  kind: ParamKind;
  required: boolean;
  fallback?: number | string | boolean;
  /** For words drawn from a fixed set. */
  choices?: readonly string[];
}

export class Args {
  private used = new Set<number>();
  /** Set on a probe: every read is noted and answered with a stand-in value. */
  recorder?: ParamInfo[];

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

  private record(info: ParamInfo) {
    if (!this.recorder!.some((p) => p.name === info.name)) this.recorder!.push(info);
  }

  num(name: string, positional: number, fallback?: number): number {
    if (this.recorder) {
      this.record({ name, kind: 'number', required: fallback === undefined, fallback });
      return fallback === undefined || Number.isNaN(fallback) ? 1 : fallback;
    }
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

  /** Like num(), but for a tessellation count that a generator divides by — segments, sides and the like are never 0 or negative. */
  count(name: string, positional: number, fallback: number): number {
    const n = this.num(name, positional, fallback);
    if (this.recorder) return n;
    if (n < 1) throw new DslError(`"${name}" must be at least 1 in ${this.callee}`, this.span);
    return n;
  }

  flag(name: string, positional: number, fallback: boolean): boolean {
    if (this.recorder) {
      this.record({ name, kind: 'flag', required: false, fallback });
      return fallback;
    }
    const arg = this.find(name, positional);
    if (!arg) return fallback;
    if (typeof arg.value === 'number') return arg.value !== 0;
    if (arg.value === 'yes' || arg.value === 'true') return true;
    if (arg.value === 'no' || arg.value === 'false') return false;
    throw new DslError(`"${name}" must be yes or no in ${this.callee}`, arg.span);
  }

  word(name: string, positional: number, fallback: string, choices?: readonly string[]): string {
    if (this.recorder) {
      this.record({ name, kind: 'word', required: false, fallback, choices });
      return fallback;
    }
    const arg = this.find(name, positional);
    if (!arg) return fallback;
    if (typeof arg.value !== 'string') {
      throw new DslError(`"${name}" must be a word in ${this.callee}`, arg.span);
    }
    return arg.value;
  }

  vec(name: string, positional: number, fallback?: Vec3): Vec3 {
    if (this.recorder) {
      this.record({ name, kind: 'point', required: fallback === undefined });
      return fallback ?? [0, 0, 0];
    }
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
    if (this.recorder) {
      this.record({ name, kind: 'path', required: true });
      return arc(1, 0, Math.PI * 2, 0);
    }
    const arg = this.find(name, positional);
    if (!arg) throw new DslError(`${this.callee} needs a path`, this.span);
    if (!isCurve(arg.value)) {
      throw new DslError(
        `"${name}" must be a path — try spiral, arc, circle, ellipse, helix, bezier, through or bow`,
        arg.span,
      );
    }
    return arg.value;
  }

  symmetry(name: string, positional: number): Symmetry {
    if (this.recorder) {
      this.record({ name, kind: 'symmetry', required: true });
      return radial(1);
    }
    const arg = this.find(name, positional);
    if (!arg) throw new DslError(`${this.callee} needs a symmetry for "${name}"`, this.span);
    if (!isSymmetry(arg.value)) {
      throw new DslError(`"${name}" must be a symmetry, like ring(8, radius: 20)`, arg.span);
    }
    return arg.value;
  }

  rest(): Value[] {
    if (this.recorder) {
      this.record({ name: this.known[this.known.length - 1] ?? 'values', kind: 'points', required: true });
      return [];
    }
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

  ellipse: define(['rx', 'ry', 'z'], (a) =>
    ellipse(a.num('rx', 0), a.num('ry', 1), a.num('z', 2, 0))),

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

/** An argument that may be absent (NaN) or deliberately zero — 0 must survive. */
const optional = (v: number) => (Number.isNaN(v) ? undefined : v);

/** An enamel colour by its trade name, checked here so a misspelling names the choices. */
function enamelName(a: Args): string | undefined {
  const name = a.word('enamel', -1, '', enamelNames);
  if (!name) return undefined;
  if (!enamels[name]) {
    throw new DslError(`there is no enamel called "${name}" — try ${enamelNames.join(', ')}`, a.span);
  }
  return name;
}

/** One of a fixed set of words, named in the error when it is not. */
function oneOf<T extends string>(a: Args, name: string, allowed: readonly T[], fallback: T): T {
  const word = a.word(name, -1, fallback, allowed);
  if (!allowed.includes(word as T)) {
    throw new DslError(`there is no ${name} called "${word}" — try ${allowed.join(', ')}`, a.span);
  }
  return word as T;
}

const GEM_CUTS = ['brilliant', 'oval', 'pear', 'marquise', 'trillion', 'step', 'baguette', 'rose', 'cabochon'] as const;
const SETTING_STYLES = ['claw', 'bezel'] as const;
const LEAF_SHAPES = ['ovate', 'lanceolate', 'elliptic', 'obovate', 'cordate', 'orbicular', 'linear', 'deltoid', 'spatulate'] as const;
const PETAL_SHAPES = ['round', 'pointed', 'spoon', 'strap', 'lip', 'quill'] as const;
const PETAL_EDGES = ['entire', 'toothed', 'fringed', 'crenate', 'notched'] as const;
const SECTIONS = ['round', 'square', 'hex', 'octagon', 'flat', 'lens'] as const;
const ORIENTS = ['outward', 'flat'] as const;

/** A metal for the vein wires of an enamelled plate; pearls are not wire. */
function veinMetalName(a: Args): string | undefined {
  const name = a.word('veinMetal', -1, '', metalNames);
  if (!name) return undefined;
  if (!metalNames.includes(name)) {
    throw new DslError(`there is no metal called "${name}" for veins — try ${metalNames.join(', ')}`, a.span);
  }
  return name;
}

/** Parts. Each call makes real geometry, so results are cached by the caller. */
const PARTS = {
  leaf: define(
    ['length', 'width', 'thickness', 'shape', 'bevel', 'piercings', 'veins', 'teeth',
     'toothDepth', 'lobes', 'spread', 'droop', 'cup', 'keel', 'curl', 'curlBias', 'twist',
     'relief', 'reliefVeins', 'boss', 'segments', 'enamel', 'veinMetal'],
    (a) => leaf({
      length: a.num('length', 0),
      width: a.num('width', 1),
      thickness: a.num('thickness', 2, 1.1),
      shape: oneOf(a, 'shape', LEAF_SHAPES, 'ovate') as LeafShape,
      bevel: a.num('bevel', -1, NaN) || undefined,
      piercings: a.num('piercings', -1, 0) || undefined,
      veins: a.num('veins', -1, 0) || undefined,
      teeth: a.num('teeth', -1, 0) || undefined,
      toothDepth: a.num('toothDepth', -1, NaN) || undefined,
      lobes: a.num('lobes', -1, 0) || undefined,
      spread: a.num('spread', -1, NaN) || undefined,
      droop: a.num('droop', -1, 0.18),
      cup: a.num('cup', -1, 0) || undefined,
      keel: a.num('keel', -1, 0) || undefined,
      curl: a.num('curl', -1, 0) || undefined,
      curlBias: a.num('curlBias', -1, 1),
      twist: a.num('twist', -1, 0) || undefined,
      relief: optional(a.num('relief', -1, NaN)),
      reliefVeins: a.num('reliefVeins', -1, 0) || undefined,
      bossBore: a.num('boss', -1, 0) || undefined,
      segments: a.num('segments', -1, 64),
      enamel: enamelName(a),
      veinMetal: veinMetalName(a),
    })),

  gem: define(['cut', 'width', 'length', 'depth', 'facets', 'table', 'segments'], (a) =>
    gem({
      cut: oneOf(a, 'cut', GEM_CUTS, 'brilliant') as GemCut,
      width: a.num('width', 0),
      length: a.num('length', -1, 0) || undefined,
      depth: a.num('depth', -1, 0) || undefined,
      facets: a.num('facets', -1, 0) || undefined,
      table: a.num('table', -1, 0) || undefined,
      segments: a.count('segments', -1, 40),
    })),

  setting: define(['width', 'style', 'claws', 'height', 'wall', 'grip', 'segments'], (a) =>
    setting({
      width: a.num('width', 0),
      style: oneOf(a, 'style', SETTING_STYLES, 'claw') as SettingStyle,
      claws: a.num('claws', -1, 0) || undefined,
      height: a.num('height', -1, 0) || undefined,
      wall: a.num('wall', -1, 0) || undefined,
      grip: a.num('grip', -1, 0) || undefined,
      segments: a.count('segments', -1, 32),
    })),

  wire: define(['path', 'radius', 'section', 'tip', 'twist', 'flatten', 'closed', 'sections', 'sides', 'enamel'], (a) =>
    wire({
      enamel: enamelName(a),
      path: a.curve('path', 0),
      radius: a.num('radius', 1),
      section: oneOf(a, 'section', SECTIONS, 'round') as Section,
      tipScale: a.num('tip', -1, 0.2),
      twistTurns: a.num('twist', -1, 0) / (Math.PI * 2) || undefined,
      flatten: a.flag('flatten', -1, false),
      closed: a.flag('closed', -1, false),
      sections: a.num('sections', -1, 128),
      sides: a.num('sides', -1, 12),
    })),

  blade: define(['path', 'width', 'thickness', 'twist', 'sections', 'sides', 'enamel'], (a) =>
    blade({
      enamel: enamelName(a),
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
      segments: a.count('segments', -1, 24),
    })),

  bead: define(['radius', 'point', 'bore', 'enamel', 'segments'], (a) =>
    bead({
      radius: a.num('radius', 0),
      point: a.num('point', 1, NaN) || undefined,
      bore: a.num('bore', -1, 0) || undefined,
      enamel: enamelName(a),
      segments: a.count('segments', -1, 24),
    })),

  egg: define(['radius', 'height', 'taper', 'enamel', 'segments'], (a) =>
    egg({
      radius: a.num('radius', 0),
      height: a.num('height', 1, 0) || undefined,
      taper: a.num('taper', -1, NaN) || undefined,
      enamel: enamelName(a),
      segments: a.count('segments', -1, 48),
    })),

  pearl: define(['radius', 'oblate', 'segments'], (a) =>
    pearl({
      radius: a.num('radius', 0),
      oblate: a.num('oblate', -1, 0) || undefined,
      segments: a.count('segments', -1, 48),
    })),

  band: define(['radius', 'width', 'thickness', 'segments'], (a) =>
    band({
      radius: a.num('radius', 0),
      width: a.num('width', 1),
      thickness: a.num('thickness', 2, 0.8),
      segments: a.num('segments', -1, 128),
    })),

  pod: define(['length', 'width', 'whorls', 'whorlDepth', 'ribs', 'ribDepth', 'segments'], (a) =>
    pod({
      length: a.num('length', 0),
      width: a.num('width', 1),
      whorls: a.num('whorls', -1, 0) || undefined,
      whorlDepth: a.num('whorlDepth', -1, NaN) || undefined,
      ribs: a.num('ribs', -1, 0) || undefined,
      ribDepth: a.num('ribDepth', -1, NaN) || undefined,
      segments: a.count('segments', -1, 32),
    })),

  bell: define(['length', 'mouth', 'throat', 'wall', 'flare', 'lobes', 'lobeDepth', 'rows', 'segments', 'enamel'], (a) =>
    bell({
      enamel: enamelName(a),
      length: a.num('length', 0),
      mouth: a.num('mouth', 1),
      throat: a.num('throat', 2),
      wall: a.num('wall', -1, NaN) || undefined,
      flare: a.num('flare', -1, 2.2),
      lobes: a.num('lobes', -1, 0) || undefined,
      lobeDepth: a.num('lobeDepth', -1, NaN) || undefined,
      rows: a.num('rows', -1, 24),
      segments: a.count('segments', -1, 40),
    })),

  petal: define(
    ['length', 'width', 'thickness', 'shape', 'edge', 'edgeDepth', 'edgeCount', 'bevel',
     'veins', 'cup', 'keel', 'curl', 'curlBias', 'twist', 'ruffle', 'ruffleWaves',
     'droop', 'relief', 'reliefVeins', 'boss', 'segments', 'enamel', 'veinMetal'],
    (a) => petal({
      length: a.num('length', 0),
      width: a.num('width', 1),
      thickness: a.num('thickness', 2, 0.7),
      shape: oneOf(a, 'shape', PETAL_SHAPES, 'round') as PetalShape,
      edge: oneOf(a, 'edge', PETAL_EDGES, 'entire') as PetalEdge,
      edgeDepth: a.num('edgeDepth', -1, 0.06),
      edgeCount: a.num('edgeCount', -1, 0) || undefined,
      bevel: a.num('bevel', -1, NaN) || undefined,
      veins: a.num('veins', -1, 0) || undefined,
      cup: a.num('cup', -1, 0) || undefined,
      keel: a.num('keel', -1, 0) || undefined,
      curl: a.num('curl', -1, 0) || undefined,
      curlBias: a.num('curlBias', -1, 1),
      twist: a.num('twist', -1, 0) || undefined,
      ruffle: a.num('ruffle', -1, 0) || undefined,
      ruffleWaves: a.num('ruffleWaves', -1, 5),
      droop: a.num('droop', -1, 0),
      relief: optional(a.num('relief', -1, NaN)),
      reliefVeins: a.num('reliefVeins', -1, 0) || undefined,
      bossBore: a.num('boss', -1, 0) || undefined,
      segments: a.num('segments', -1, 72),
      enamel: enamelName(a),
      veinMetal: veinMetalName(a),
    })),

  stem: define(['path', 'radius', 'tip', 'nodes', 'swell', 'from', 'to', 'sections', 'sides', 'enamel'], (a) =>
    stem({
      enamel: enamelName(a),
      path: a.curve('path', 0),
      radius: a.num('radius', 1),
      tipScale: a.num('tip', -1, 0.35),
      nodes: a.num('nodes', -1, 0) || undefined,
      nodeSwell: a.num('swell', -1, 0.28),
      from: a.num('from', -1, 0.12),
      to: a.num('to', -1, 0.92),
      sections: a.num('sections', -1, 96),
      sides: a.num('sides', -1, 10),
    })),

  branch: define(
    ['path', 'radius', 'tip', 'limbs', 'limbLength', 'limbAngle', 'limbSag', 'limbTaper',
     'from', 'to', 'sections', 'sides', 'enamel'],
    (a) => branch({
      enamel: enamelName(a),
      path: a.curve('path', 0),
      radius: a.num('radius', 1),
      tipScale: a.num('tip', -1, 0.35),
      limbs: a.num('limbs', -1, 3),
      limbLength: a.num('limbLength', -1, 0.42),
      limbAngle: a.num('limbAngle', -1, 0.85),
      limbSag: a.num('limbSag', -1, 0.18),
      limbTaper: a.num('limbTaper', -1, 0.55),
      from: a.num('from', -1, 0.12),
      to: a.num('to', -1, 0.92),
      sections: a.num('sections', -1, 96),
      sides: a.num('sides', -1, 10),
    })),

  bud: define(['length', 'width', 'lobes', 'lobeDepth', 'point', 'swell', 'rows', 'segments'], (a) =>
    bud({
      length: a.num('length', 0),
      width: a.num('width', 1),
      lobes: a.num('lobes', -1, 5),
      lobeDepth: a.num('lobeDepth', -1, 0.1),
      point: a.num('point', -1, 0.22),
      swell: a.num('swell', -1, 1),
      rows: a.num('rows', -1, 40),
      segments: a.count('segments', -1, 36),
    })),

  bar: define(['length', 'width', 'thickness', 'bore', 'intermediate', 'bevel'], (a) =>
    bar({
      length: a.num('length', 0),
      width: a.num('width', 1),
      thickness: a.num('thickness', 2, 1.2),
      bore: a.num('bore', 3, 2),
      intermediate: a.num('intermediate', -1, 0) || undefined,
      bevel: a.num('bevel', -1, NaN) || undefined,
    })),

  disc: define(['radius', 'thickness', 'sides', 'bore', 'bolts', 'boltCircle', 'boltBore', 'bevel'], (a) =>
    disc({
      radius: a.num('radius', 0),
      thickness: a.num('thickness', 1, 1.2),
      sides: a.num('sides', -1, 0) || undefined,
      bore: a.num('bore', -1, 0) || undefined,
      bolts: a.num('bolts', -1, 0) || undefined,
      boltCircleRadius: a.num('boltCircle', -1, NaN) || undefined,
      boltBore: a.num('boltBore', -1, NaN) || undefined,
      bevel: a.num('bevel', -1, NaN) || undefined,
    })),

  gusset: define(['radius', 'thickness', 'bore', 'fillet', 'lighten', 'bevel'], (a) =>
    gusset({
      radius: a.num('radius', 0),
      thickness: a.num('thickness', 1, 1.2),
      bore: a.num('bore', 2, 2),
      fillet: a.num('fillet', -1, NaN) || undefined,
      lighten: a.num('lighten', -1, 0) || undefined,
      bevel: a.num('bevel', -1, NaN) || undefined,
    })),

  collar: define(['inner', 'wall', 'length', 'belly', 'segments'], (a) =>
    collar({
      innerRadius: a.num('inner', 0),
      wall: a.num('wall', 1),
      length: a.num('length', 2),
      belly: a.num('belly', -1, 0.6),
      segments: a.count('segments', -1, 24),
    })),

  shank: define(['size', 'width', 'thickness', 'shoulder', 'shoulderSpread', 'gap', 'segments'], (a) =>
    shank({
      size: a.num('size', 0),
      width: a.num('width', 1),
      thickness: a.num('thickness', 2),
      shoulder: a.num('shoulder', -1, 0) || undefined,
      shoulderSpread: a.num('shoulderSpread', -1, 0.9),
      gap: a.num('gap', -1, 0) || undefined,
      segments: a.count('segments', -1, 96),
    })),

  clasp: define(['radius', 'hookRadius', 'sweep', 'tip', 'sections', 'sides'], (a) =>
    clasp({
      radius: a.num('radius', 0),
      hookRadius: a.num('hookRadius', 1),
      sweep: a.num('sweep', -1, Math.PI * 2 * 0.72),
      tip: a.num('tip', -1, 0.55),
      sections: a.count('sections', -1, 64),
      sides: a.count('sides', -1, 12),
    })),

  jumpRing: define(['radius', 'wireRadius', 'gap', 'sections', 'sides'], (a) =>
    jumpRing({
      radius: a.num('radius', 0),
      wireRadius: a.num('wireRadius', 1),
      gap: a.num('gap', -1, 0) || undefined,
      sections: a.count('sections', -1, 64),
      sides: a.count('sides', -1, 12),
    })),

  leverBack: define(['radius', 'wireRadius', 'gap', 'leverWidth', 'leverThickness', 'sections', 'sides'], (a) =>
    leverBack({
      radius: a.num('radius', 0),
      wireRadius: a.num('wireRadius', -1, NaN) || undefined,
      gap: a.num('gap', -1, 0.8),
      leverWidth: a.num('leverWidth', -1, NaN) || undefined,
      leverThickness: a.num('leverThickness', -1, NaN) || undefined,
      sections: a.count('sections', -1, 64),
      sides: a.count('sides', -1, 12),
    })),

  ringStand: define(['baseRadius', 'baseHeight', 'postRadius', 'postHeight', 'segments'], (a) =>
    ringStand({
      baseRadius: a.num('baseRadius', 0),
      baseHeight: a.num('baseHeight', -1, NaN) || undefined,
      postRadius: a.num('postRadius', -1, NaN) || undefined,
      postHeight: a.num('postHeight', -1, NaN) || undefined,
      segments: a.count('segments', -1, 48),
    })),

  earringStand: define(
    ['baseRadius', 'baseHeight', 'postRadius', 'postHeight', 'barLength', 'barRadius', 'segments'],
    (a) =>
      earringStand({
        baseRadius: a.num('baseRadius', 0),
        baseHeight: a.num('baseHeight', -1, NaN) || undefined,
        postRadius: a.num('postRadius', -1, NaN) || undefined,
        postHeight: a.num('postHeight', -1, NaN) || undefined,
        barLength: a.num('barLength', -1, NaN) || undefined,
        barRadius: a.num('barRadius', -1, NaN) || undefined,
        segments: a.count('segments', -1, 48),
      }),
  ),

  bust: define(['height', 'baseRadius', 'shoulderRadius', 'shoulderSpan', 'neckRadius', 'segments'], (a) =>
    bust({
      height: a.num('height', 0),
      baseRadius: a.num('baseRadius', -1, NaN) || undefined,
      shoulderRadius: a.num('shoulderRadius', -1, NaN) || undefined,
      shoulderSpan: a.num('shoulderSpan', -1, NaN) || undefined,
      neckRadius: a.num('neckRadius', -1, NaN) || undefined,
      segments: a.count('segments', -1, 64),
    })),

  easel: define(
    ['width', 'height', 'cornerRadius', 'thickness', 'bevel', 'pegRadius', 'pegLength', 'legDepth', 'segments'],
    (a) =>
      easel({
        width: a.num('width', 0),
        height: a.num('height', 1),
        cornerRadius: a.num('cornerRadius', -1, NaN) || undefined,
        thickness: a.num('thickness', -1, NaN) || undefined,
        bevel: a.num('bevel', -1, NaN) || undefined,
        pegRadius: a.num('pegRadius', -1, NaN) || undefined,
        pegLength: a.num('pegLength', -1, NaN) || undefined,
        legDepth: a.num('legDepth', -1, NaN) || undefined,
        segments: a.count('segments', -1, 10),
      }),
  ),

  sword: define(
    [
      'bladeLength', 'bladeWidth', 'bladeThickness', 'bladeTaper', 'gripLength', 'gripRadius',
      'guardWidth', 'guardThickness', 'pommelRadius', 'segments',
    ],
    (a) =>
      sword({
        bladeLength: a.num('bladeLength', 0),
        bladeWidth: a.num('bladeWidth', -1, NaN) || undefined,
        bladeThickness: a.num('bladeThickness', -1, NaN) || undefined,
        bladeTaper: a.num('bladeTaper', -1, NaN) || undefined,
        gripLength: a.num('gripLength', -1, NaN) || undefined,
        gripRadius: a.num('gripRadius', -1, NaN) || undefined,
        guardWidth: a.num('guardWidth', -1, NaN) || undefined,
        guardThickness: a.num('guardThickness', -1, NaN) || undefined,
        pommelRadius: a.num('pommelRadius', -1, NaN) || undefined,
        segments: a.count('segments', -1, 24),
      }),
  ),

  axe: define(
    ['haftLength', 'haftRadius', 'headReach', 'headHeight', 'headThickness', 'doubleBit', 'segments'],
    (a) =>
      axe({
        haftLength: a.num('haftLength', 0),
        haftRadius: a.num('haftRadius', -1, NaN) || undefined,
        headReach: a.num('headReach', -1, NaN) || undefined,
        headHeight: a.num('headHeight', -1, NaN) || undefined,
        headThickness: a.num('headThickness', -1, NaN) || undefined,
        doubleBit: a.flag('doubleBit', -1, false),
        segments: a.count('segments', -1, 24),
      }),
  ),
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
      orient: oneOf(a, 'orient', ORIENTS, 'flat') as 'outward' | 'flat',
      lean: a.num('lean', -1, 0),
      turns: a.num('turns', -1, 1),
    })),

  along: define(['path', 'count', 'from', 'to', 'taper', 'tilt', 'fade', 'alternate'], (a) => {
    const tilt = a.num('tilt', -1, 0);
    const fade = a.num('fade', -1, 0);
    return along(a.curve('path', 0), a.num('count', 1), {
      from: a.num('from', -1, 0),
      to: a.num('to', -1, 1),
      taper: a.num('taper', -1, 1),
      tilt: fade === 0 ? tilt : (t: number) => tilt * Math.pow(1 - t, fade),
      alternate: a.flag('alternate', -1, false),
    });
  }),

  spray: define(['count', 'radius', 'lean', 'rise', 'taper', 'spin'], (a) =>
    spray(a.num('count', 0), a.num('radius', 1), {
      lean: a.num('lean', -1, 0.5),
      rise: a.num('rise', -1, 0),
      taper: a.num('taper', -1, 1),
      spin: a.num('spin', -1, 0),
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

const signatures = new Map<string, ParamInfo[]>();

/**
 * What a builtin takes, with defaults, learned by calling it.
 *
 * The argument reads inside each builtin are the one true record of its
 * parameters, so rather than keep a second table in step with them the probe
 * runs the builtin once with a recording Args that answers every read with a
 * stand-in. Whatever the builtin then does with those stand-ins is discarded.
 * The result is ordered by the declared list, which is also the positional order.
 */
export function signature(name: string): ParamInfo[] | undefined {
  const builtin = BUILTINS[name];
  if (!builtin) return undefined;
  let sig = signatures.get(name);
  if (sig) return sig;
  const args = new Args(name, [], { start: 0, end: 0, line: 1, column: 1 }, builtin.known);
  args.recorder = [];
  try { builtin.fn(args); } catch { /* stand-in values need not make a shape */ }
  const read = new Map(args.recorder.map((p) => [p.name, p]));
  sig = builtin.known.map((n) => read.get(n) ?? { name: n, kind: 'number' as const, required: false });
  signatures.set(name, sig);
  return sig;
}
export const BUILTIN_NAMES = Object.keys(BUILTINS);
