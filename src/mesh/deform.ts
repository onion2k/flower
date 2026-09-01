import type { Mesh } from './types';

/**
 * Bending a flat plate into a petal.
 *
 * Everything in this project that is not a swept tube is a plate: cut, pierced
 * and edge-broken in 2D, then extruded. That is the right way to make it — a
 * pierced outline is a 2D problem — but no real petal or leaf is flat. It cups,
 * it curls away at the tip, it keels along the midrib, and the frilled ones wave
 * at the margin while the midrib stays put.
 *
 * So the plate is made flat and then bent. Each field below is a map with a known
 * Jacobian, which is the whole reason to do it this way rather than by displacing
 * vertices and recomputing: normals are carried through exactly, so the bevel
 * that makes the outline catch light survives the bend as a crease rather than
 * being smoothed away.
 *
 * Convention matches the rest of the parts: the plate grows along +X, its width
 * lies along Y, and +Z is the face normal.
 */
export interface DeformOptions {
  /** Total turn of the long axis from base to tip, in radians. Positive lifts the tip toward +Z. */
  curl?: number;
  /**
   * Where along the length the curl happens. 1 spreads it evenly, giving a
   * circular arc; 3 leaves the base straight and throws the tip back, which is
   * what a reflexed petal — a lily, an orchid — actually does.
   */
  curlBias?: number;
  /** Rise of each margin above the midrib, in radians. The cross-section becomes a channel. */
  cup?: number;
  /**
   * 0 bends the section as a smooth arc; 1 folds each half rigidly, leaving a
   * crease at the midrib. A grass or tulip leaf is keeled, a rose petal is not.
   */
  keel?: number;
  /** Turns of twist about the long axis, in radians over the whole length. */
  twist?: number;
  /** Waves along the margin. A frill: the edge waves, the midrib does not. */
  ruffle?: number;
  ruffleWaves?: number;
  /** Extents used to normalise the fields. Taken from the mesh if omitted. */
  length?: number;
  halfWidth?: number;
  /** The x the fields are measured from. Taken from the mesh if omitted. */
  origin?: number;
  /**
   * The y of the midrib at each x.
   *
   * A leaf's axis bows sideways — that is what `droop` is — so the midrib is not
   * the line y = 0, and a cup measured from y = 0 folds the leaf about a line
   * that runs off its own edge. Without this the whole far margin sits outside
   * the cup's range and collapses onto it.
   */
  midline?: (x: number) => number;
}

/**
 * Apply the fields in place and return the same mesh.
 *
 * Order matters, and it is chosen so each stage reads a coordinate no earlier
 * stage has touched: the cup moves y and z but not x, the twist reads x and moves
 * y and z, and the curl reads x last. Otherwise a cup applied after a twist would
 * be measured across a width that is no longer the width.
 */
export function deform(mesh: Mesh, opts: DeformOptions): Mesh {
  const { positions, normals } = mesh;
  const n = positions.length / 3;

  let minX = Infinity, maxX = -Infinity, halfW = 0;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    halfW = Math.max(halfW, Math.abs(positions[i * 3 + 1]));
  }
  const length = opts.length ?? Math.max(maxX - minX, 1e-6);
  const halfWidth = opts.halfWidth ?? Math.max(halfW, 1e-6);
  const origin = opts.origin ?? minX;

  const midline = opts.midline ?? (() => 0);
  if (opts.cup) cupField(mesh, opts.cup, opts.keel ?? 0, halfWidth, midline);
  if (opts.ruffle) {
    ruffleField(mesh, opts.ruffle, opts.ruffleWaves ?? 5, origin, length, halfWidth, midline);
  }
  if (opts.twist) twistField(mesh, opts.twist, origin, length);
  if (opts.curl) curlField(mesh, opts.curl, opts.curlBias ?? 1, origin, length);

  // guard: a field with an absurd parameter should fail loudly here rather than
  // as an invisible NaN that reaches the renderer as a vanished part
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i]) || !Number.isFinite(normals[i])) {
      throw new Error('deform produced a non-finite vertex — check curl, cup and twist');
    }
  }
  return mesh;
}

/**
 * Cumulative integral of the turned tangent.
 *
 * A bend that preserves arc length is the integral of (cos θ, sin θ) along the
 * parameter, and θ is allowed to be any function of it — which is what lets the
 * curl be biased toward the tip and the cup be a fold rather than an arc. There
 * is no closed form for either, so it is tabulated once and interpolated.
 */
function integrate(angleAt: (s: number) => number, span: number, steps = 192) {
  const along = new Float64Array(steps + 1);
  const rise = new Float64Array(steps + 1);
  const turn = new Float64Array(steps + 1);
  const ds = span / steps;
  turn[0] = angleAt(0);
  for (let i = 1; i <= steps; i++) {
    const s = (i / steps) * span;
    const a = angleAt(s);
    const mid = (turn[i - 1] + a) / 2;
    along[i] = along[i - 1] + Math.cos(mid) * ds;
    rise[i] = rise[i - 1] + Math.sin(mid) * ds;
    turn[i] = a;
  }
  // Extrapolate rather than clamp past the end. A margin that reaches further
  // than the declared half-width — a fringe pushed outward, a leaf wider than its
  // nominal width — would otherwise pile up on the last table entry, which folds
  // a band of the surface onto a line and inverts everything in it.
  return (s: number) => {
    const u = (s / span) * steps;
    const i = Math.min(Math.max(Math.floor(u), 0), steps - 1);
    const f = u - i;
    return {
      along: along[i] + (along[i + 1] - along[i]) * f,
      rise: rise[i] + (rise[i + 1] - rise[i]) * f,
      turn: turn[i] + (turn[i + 1] - turn[i]) * f,
    };
  };
}

/** Bend the long axis in the XZ plane. Positions ride the arc, normals turn with it. */
function curlField(mesh: Mesh, curl: number, bias: number, minX: number, length: number) {
  const { positions, normals } = mesh;
  const table = integrate((s) => curl * Math.pow(s / length, bias), length);
  for (let i = 0; i < positions.length; i += 3) {
    const s = positions[i] - minX;
    const { along, rise, turn } = table(s);
    const c = Math.cos(turn), sn = Math.sin(turn);
    const z = positions[i + 2];
    positions[i] = minX + along - z * sn;
    positions[i + 2] = rise + z * c;
    const nx = normals[i], nz = normals[i + 2];
    normals[i] = nx * c - nz * sn;
    normals[i + 2] = nx * sn + nz * c;
  }
}

/**
 * Bend the section in the YZ plane, symmetrically about the midrib.
 *
 * The turn angle is odd in y, so both margins rise together and the midrib stays
 * where it is — a channel, not a roll. `keel` is a constant term in that angle,
 * which means the two halves start already turned and meet at a crease.
 */
function cupField(
  mesh: Mesh, cup: number, keel: number, halfWidth: number,
  midline: (x: number) => number,
) {
  const { positions, normals } = mesh;
  const k = Math.min(Math.max(keel, 0), 1);
  const table = integrate((s) => cup * ((1 - k) * (s / halfWidth) + k), halfWidth);
  for (let i = 0; i < positions.length; i += 3) {
    const spine = midline(positions[i]);
    const y = positions[i + 1] - spine;
    const side = y < 0 ? -1 : 1;
    const { along, rise, turn } = table(Math.abs(y));
    const angle = side * turn;
    const c = Math.cos(angle), sn = Math.sin(angle);
    const z = positions[i + 2];
    positions[i + 1] = spine + side * along - z * sn;
    positions[i + 2] = rise + z * c;
    const ny = normals[i + 1], nz = normals[i + 2];
    normals[i + 1] = ny * c - nz * sn;
    normals[i + 2] = ny * sn + nz * c;
  }
}

/** Rotate the section about the long axis, linearly along it. */
function twistField(mesh: Mesh, twist: number, minX: number, length: number) {
  const { positions, normals } = mesh;
  for (let i = 0; i < positions.length; i += 3) {
    const a = twist * ((positions[i] - minX) / length);
    const c = Math.cos(a), s = Math.sin(a);
    const y = positions[i + 1], z = positions[i + 2];
    positions[i + 1] = y * c - z * s;
    positions[i + 2] = y * s + z * c;
    const ny = normals[i + 1], nz = normals[i + 2];
    normals[i + 1] = ny * c - nz * s;
    normals[i + 2] = ny * s + nz * c;
  }
}

/**
 * A frill: displace z by a wave along the length, growing quadratically out from
 * the midrib. The map is a shear along Z, so its inverse transpose is exact and
 * two derivatives are all the normal needs — no recomputation, no lost creases.
 */
function ruffleField(
  mesh: Mesh, amount: number, waves: number,
  minX: number, length: number, halfWidth: number,
  midline: (x: number) => number,
) {
  const { positions, normals } = mesh;
  const k = (Math.PI * 2 * waves) / length;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] - minX;
    const y = positions[i + 1] - midline(positions[i]);
    const across = (y / halfWidth) * (y / halfWidth);
    const dAcross = (2 * y) / (halfWidth * halfWidth);
    positions[i + 2] += amount * across * Math.sin(k * x);
    const fx = amount * across * k * Math.cos(k * x);
    const fy = amount * dAcross * Math.sin(k * x);
    const nz = normals[i + 2];
    const nx = normals[i] - fx * nz;
    const ny = normals[i + 1] - fy * nz;
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / l; normals[i + 1] = ny / l; normals[i + 2] = nz / l;
  }
}

/**
 * Put an anchor through the same fields as the surface it sits on.
 *
 * An anchor is a promise that a rivet lands on the metal, so it has to ride the
 * bend with the metal. Sending a two-point probe through `deform` rather than
 * re-deriving the map keeps the two exactly in step: whatever the fields do to
 * the plate, they do to the anchor, including anything added here later.
 */
export function deformAnchor(
  position: [number, number, number],
  axis: [number, number, number],
  opts: DeformOptions,
): { position: [number, number, number]; axis: [number, number, number] } {
  const probe: Mesh = {
    positions: new Float32Array([
      position[0], position[1], position[2],
      position[0] + axis[0] * 1e-3, position[1] + axis[1] * 1e-3, position[2] + axis[2] * 1e-3,
    ]),
    normals: new Float32Array([...axis, ...axis]),
    uvs: new Float32Array(4),
    indices: new Uint32Array(0),
  };
  // the probe is two points, so its own bounds say nothing — the fields must be
  // measured against the plate they came from
  deform(probe, { ...opts, origin: opts.origin ?? 0 });
  const p = probe.positions;
  const dx = p[3] - p[0], dy = p[4] - p[1], dz = p[5] - p[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  return {
    position: [p[0], p[1], p[2]],
    axis: [dx / l, dy / l, dz / l],
  };
}

/**
 * The longest flat chord that still follows the bent surface, within `tolerance`.
 *
 * A chord of length e across a curve of curvature k stands off it by about
 * e²k/8, so the cap only needs refining down to sqrt(8·tolerance/k) — and no
 * further. Deriving the target from the bend rather than from the part's size is
 * what keeps a gently cupped petal at a few hundred triangles while a tightly
 * ruffled one gets the density it actually needs.
 */
export function chordLimit(opts: DeformOptions, tolerance: number): number {
  const length = opts.length ?? 1;
  const halfWidth = opts.halfWidth ?? 1;
  let k = 0;
  // the biased curl is steepest at the tip, where its rate of turn is bias times
  // the average — that peak is what has to be resolved, not the mean
  if (opts.curl) k = Math.max(k, (Math.abs(opts.curl) * Math.max(opts.curlBias ?? 1, 1)) / length);
  if (opts.cup) k = Math.max(k, Math.abs(opts.cup) / halfWidth);
  if (opts.twist) k = Math.max(k, Math.abs(opts.twist) / length);
  if (opts.ruffle) {
    const w = (Math.PI * 2 * (opts.ruffleWaves ?? 5)) / length;
    k = Math.max(k, Math.abs(opts.ruffle) * w * w);
  }
  if (k <= 0) return Infinity;
  return Math.sqrt((8 * tolerance) / k);
}
