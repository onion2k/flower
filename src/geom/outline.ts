import type { Vec2 } from './types';

export function signedArea(loop: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Walls and bevels take their outward direction from winding, so it has to be right. */
export function ensureWinding(loop: Vec2[], counterClockwise: boolean): Vec2[] {
  const ccw = signedArea(loop) > 0;
  return ccw === counterClockwise ? loop : [...loop].reverse();
}

/**
 * Leaf silhouettes, by their botanical names.
 *
 * Each is the same construction — a half-width profile swept from base to tip —
 * differing only in where the leaf is widest and how fast it tapers. That is
 * genuinely most of what separates a willow from a lilac.
 */
export type LeafShape =
  | 'ovate' | 'lanceolate' | 'elliptic' | 'obovate' | 'cordate'
  | 'orbicular' | 'linear' | 'deltoid' | 'spatulate';

/** Half-width as a fraction of the maximum, along the leaf from base to tip. */
export function leafHalfWidth(shape: LeafShape, t: number): number {
  const s = Math.sin(Math.PI * Math.min(Math.max(t, 0), 1));
  switch (shape) {
    case 'lanceolate': return Math.pow(s, 0.5) * (1 - 0.42 * t);   // willow: long, narrow
    case 'elliptic': return Math.pow(s, 0.95);                     // widest at the middle
    case 'obovate': return Math.pow(s, 0.8) * (0.62 + 0.55 * t);   // widest above the middle
    case 'cordate': return Math.pow(s, 0.45) * (1 - 0.3 * t);      // heart, with a basal notch
    case 'orbicular': return Math.pow(s, 1.15);                    // nasturtium: nearly a disc
    case 'linear': return Math.pow(s, 0.22) * (1 - 0.2 * t);       // grass: parallel-sided
    case 'deltoid': return Math.max(1 - t, 0) * (t < 0.06 ? t / 0.06 : 1); // triangular, sharp
    case 'spatulate': return Math.pow(s, 0.9) * (0.3 + 0.9 * t * t); // paddle on a narrow stalk
    default: return Math.pow(s, 0.75) * (1 - 0.3 * t);             // ovate
  }
}

export interface LeafOutlineOptions {
  shape?: LeafShape;
  segments?: number;
  /** Sideways bend of the midrib. A straight axis reads as a logo, not a leaf. */
  droop?: number;
  /** Basal notch depth as a fraction of length. Cordate leaves want ~0.14. */
  notch?: number;
  /** Marginal teeth. */
  teeth?: number;
  toothDepth?: number;
}

export function leafOutline(length: number, width: number, opts: LeafOutlineOptions = {}): Vec2[] {
  const { shape = 'ovate', segments = 48, droop = 0.18, notch = 0, teeth = 0, toothDepth = 0 } = opts;

  const side = (sign: number): Vec2[] => {
    const pts: Vec2[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const w = (width / 2) * leafHalfWidth(shape, t);
      const spine = Math.sin(Math.PI * t) * droop * length;
      pts.push([t * length, spine + sign * w]);
    }
    return pts;
  };

  const upper = side(1);
  const lower = side(-1).reverse();

  let loop: Vec2[];
  if (notch > 0) {
    // A cordate base is two lobes meeting at a notch part-way up the midrib, so
    // the halves do not close at the petiole — the notch is where they meet.
    const cut: Vec2 = [notch * length, 0];
    loop = [cut, ...upper.slice(1, -1), upper[upper.length - 1], ...lower.slice(1, -1)];
  } else {
    loop = [...upper.slice(0, -1), ...lower.slice(0, -1)];
  }

  if (teeth > 0 && toothDepth > 0) loop = serrate(loop, teeth, toothDepth);
  return ensureWinding(loop, true);
}

/**
 * Saw teeth along a margin.
 *
 * Applied to the finished outline rather than built into the profile, so it works
 * on any of them — and on a palmate leaf too, where the margin is not a function
 * of distance along an axis at all.
 */
export function serrate(loop: Vec2[], teeth: number, depth: number): Vec2[] {
  const n = loop.length;
  const outward: Vec2[] = loop.map((_, i) => {
    const p = loop[(i - 1 + n) % n];
    const q = loop[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  });
  return loop.map(([x, y], i) => {
    const phase = ((i / loop.length) * teeth) % 1;
    const saw = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    return [x + outward[i][0] * saw * depth, y + outward[i][1] * saw * depth] as Vec2;
  });
}

/**
 * Petal silhouettes.
 *
 * Kept apart from the leaf families because petals are not small leaves: they
 * narrow to a claw at the base where they attach, they are widest much further
 * out, and most of them end bluntly rather than at a point. Using an ovate leaf
 * for a rose petal is the single thing that most makes a flower read as clip art.
 */
export type PetalShape = 'round' | 'pointed' | 'spoon' | 'strap' | 'lip' | 'quill';

/** Half-width as a fraction of the maximum, from the claw at 0 to the apex at 1. */
export function petalHalfWidth(shape: PetalShape, t: number): number {
  const u = Math.min(Math.max(t, 0), 1);
  switch (shape) {
    // rose, tulip: broad and obtuse, so the width has to survive almost to the apex
    case 'round': return Math.pow(u, 0.42) * Math.sqrt(Math.max(1 - Math.pow(u, 3.6), 0));
    case 'pointed': return Math.pow(u, 0.45) * Math.pow(1 - u, 0.62);
    // dianthus: a long narrow claw, then the blade opens abruptly
    case 'spoon': return (0.18 + 0.82 * smoothstep(0.26, 0.66, u)) *
      Math.sqrt(Math.max(1 - Math.pow(u, 5), 0));
    // daisy ray floret, freesia: nearly parallel-sided with a rounded end
    case 'strap': return Math.pow(u, 0.22) * Math.sqrt(Math.max(1 - Math.pow(u, 8), 0));
    // orchid labellum: flares wide and late, the lobe the whole flower reads from
    case 'lip': return Math.pow(u, 0.35) * Math.sqrt(Math.max(1 - Math.pow(u, 7), 0)) *
      (0.55 + 0.6 * u);
    // chrysanthemum, spider dahlia: a thin quill that barely opens
    default: return Math.pow(u, 0.3) * (1 - 0.55 * u) * 0.45;
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Margins.
 *
 * The edge is doing more work than the silhouette on a flower: a carnation and a
 * pink share an outline and are told apart entirely by the fringe, and a rose
 * petal with a serrated margin stops being a rose.
 */
export type PetalEdge = 'entire' | 'toothed' | 'fringed' | 'crenate' | 'notched';

export interface PetalOutlineOptions {
  shape?: PetalShape;
  edge?: PetalEdge;
  segments?: number;
  /** Depth of the edge treatment, as a fraction of the width. */
  edgeDepth?: number;
  /** Number of teeth, scallops or fringe cuts around the margin. */
  edgeCount?: number;
  /** Sideways bend of the midline, as for a leaf. */
  droop?: number;
}

export function petalOutline(
  length: number, width: number, opts: PetalOutlineOptions = {},
): Vec2[] {
  const {
    shape = 'round', edge = 'entire', segments = 64,
    edgeDepth = 0.06, edgeCount = 0, droop = 0,
  } = opts;

  const side = (sign: number): Vec2[] => {
    const pts: Vec2[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const w = (width / 2) * petalHalfWidth(shape, t);
      const spine = Math.sin(Math.PI * t) * droop * length;
      pts.push([t * length, spine + sign * w]);
    }
    return pts;
  };

  let loop: Vec2[] = [...side(1).slice(0, -1), ...side(-1).reverse().slice(0, -1)];
  const depth = edgeDepth * width;

  switch (edge) {
    case 'toothed': loop = serrate(loop, edgeCount || 24, depth); break;
    case 'crenate': loop = crenate(loop, edgeCount || 12, depth); break;
    // The fringe is confined to the apex because that is where a pink is cut;
    // running it down to the claw turns the petal into a saw blade.
    case 'fringed': loop = fringe(loop, edgeCount || 30, depth, length); break;
    case 'notched': loop = apicalNotch(loop, length, depth * 3); break;
  }
  return ensureWinding(loop, true);
}

/** Outward unit normal per vertex, from the two adjacent edges. */
function marginNormals(loop: Vec2[]): Vec2[] {
  const n = loop.length;
  return loop.map((_, i) => {
    const p = loop[(i - 1 + n) % n];
    const q = loop[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l] as Vec2;
  });
}

/** Rounded scallops — the crenate margin of a geranium or a primrose. */
export function crenate(loop: Vec2[], scallops: number, depth: number): Vec2[] {
  const outward = marginNormals(loop);
  return loop.map(([x, y], i) => {
    const wave = (1 - Math.cos((i / loop.length) * scallops * Math.PI * 2)) / 2;
    return [x + outward[i][0] * wave * depth, y + outward[i][1] * wave * depth] as Vec2;
  });
}

/**
 * A cut fringe at the apex, as a pink or a carnation has.
 *
 * Cuts in as well as out, because a fringe is slit rather than embossed, and it
 * is windowed onto the outer part of the petal so the claw stays whole.
 */
export function fringe(loop: Vec2[], cuts: number, depth: number, length: number): Vec2[] {
  const outward = marginNormals(loop);
  return loop.map(([x, y], i) => {
    const along = Math.min(Math.max(x / length, 0), 1);
    const window = smoothstep(0.42, 0.9, along);
    const phase = ((i / loop.length) * cuts) % 1;
    const saw = (phase < 0.5 ? phase * 2 : (1 - phase) * 2) * 2 - 1;
    const d = saw * window * depth;
    return [x + outward[i][0] * d, y + outward[i][1] * d] as Vec2;
  });
}

/** A single cleft at the apex — a stitchwort, a pansy, most Caryophyllaceae. */
export function apicalNotch(loop: Vec2[], length: number, depth: number): Vec2[] {
  const outward = marginNormals(loop);
  return loop.map(([x, y], i) => {
    const cut = smoothstep(length - depth * 1.6, length, x);
    return [x - outward[i][0] * cut * depth, y - outward[i][1] * cut * depth] as Vec2;
  });
}

/**
 * Palmate leaf — lobes radiating from the petiole, as a maple or a sycamore.
 *
 * Polar rather than axial: the lobes are peaks in the radius as the angle sweeps,
 * which is how the leaf actually grows, and no amount of varying a half-width
 * along an axis will produce one.
 */
export function palmateOutline(
  lobes: number,
  length: number,
  spread: number,
  sinus = 0.42,
  segments = 120,
): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const theta = (u - 0.5) * spread;
    const peak = Math.abs(Math.cos(Math.PI * u * (lobes - 1)));
    const r = length * (sinus + (1 - sinus) * Math.pow(peak, 0.5));
    pts.push([Math.cos(theta) * r, Math.sin(theta) * r]);
  }
  // close back to the petiole
  pts.push([0, 0]);
  return ensureWinding(pts, true);
}

/** Teardrop, for piercings and for bead silhouettes. */
export function teardropOutline(length: number, width: number, segments = 24): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const a = t * Math.PI * 2;
    const taper = Math.pow((1 + Math.cos(a)) / 2, 1.6);
    pts.push([
      (length / 2) * Math.cos(a),
      (width / 2) * Math.sin(a) * (1 - 0.75 * taper),
    ]);
  }
  return ensureWinding(pts, true);
}

export function transformLoop(loop: Vec2[], dx: number, dy: number, scale = 1, rotate = 0): Vec2[] {
  const c = Math.cos(rotate), s = Math.sin(rotate);
  return loop.map(([x, y]) => {
    const sx = x * scale, sy = y * scale;
    return [dx + sx * c - sy * s, dy + sx * s + sy * c] as Vec2;
  });
}

/**
 * Teardrop piercings marching along a leaf's midrib, each scaled to the width
 * available where it sits. This is what turns a blank blade into filigree.
 */
export function leafPiercings(
  length: number,
  width: number,
  count: number,
  droop = 0.18,
  margin = 0.62,
  shape: LeafShape = 'ovate',
): Vec2[][] {
  const holes: Vec2[][] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.9) / (count + 1.1);
    const w = (width / 2) * leafHalfWidth(shape, t);
    const spine = Math.sin(Math.PI * t) * droop * length;
    const hole = teardropOutline(w * 2.1 * margin, w * 1.5 * margin, 36);
    holes.push(ensureWinding(transformLoop(hole, t * length, spine, 1, 0.18), false));
  }
  return holes;
}

/**
 * Palmate venation: one vein per lobe, radiating from the petiole.
 *
 * A palmate leaf has no midrib to hang lateral veins off — its veins fan from a
 * single point, one into each lobe. Piercing it with the axial pattern puts slots
 * across the sinuses and out through the margin.
 */
export function palmateVeins(
  lobes: number,
  length: number,
  spread: number,
  opts: { reach?: number; width?: number } = {},
): Vec2[][] {
  const { reach = 0.62, width = 0.16 } = opts;
  const holes: Vec2[][] = [];
  for (let i = 0; i < lobes; i++) {
    const theta = (i / (lobes - 1) - 0.5) * spread;
    const inner = length * 0.24;
    const outer = length * reach;
    const slot = outer - inner;
    const mid = (inner + outer) / 2;
    const loop = stadiumOutline(slot, Math.max(length * width * 0.12, 0.4), 6);
    holes.push(ensureWinding(
      transformLoop(loop, Math.cos(theta) * mid, Math.sin(theta) * mid, 1, theta),
      false,
    ));
  }
  return holes;
}

/**
 * Lateral veins pierced as angled slots either side of the midrib.
 *
 * Reads far more like a leaf than a row of holes down the centre does, because
 * the eye reads the *direction* of venation before it reads the outline.
 */
export function veinPiercings(
  length: number,
  width: number,
  pairs: number,
  opts: { droop?: number; shape?: LeafShape; angle?: number; margin?: number } = {},
): Vec2[][] {
  const { droop = 0.18, shape = 'ovate', angle = 0.62, margin = 0.66 } = opts;
  const holes: Vec2[][] = [];
  for (let i = 0; i < pairs; i++) {
    const t = (i + 1) / (pairs + 1.3);
    const w = (width / 2) * leafHalfWidth(shape, t);
    const spine = Math.sin(Math.PI * t) * droop * length;
    const slot = w * 1.25 * margin;
    for (const sign of [1, -1]) {
      const loop = stadiumOutline(slot, Math.max(w * 0.2, 0.35), 10);
      const cx = t * length + Math.cos(angle) * slot * 0.45;
      const cy = spine + sign * (Math.sin(angle) * slot * 0.45 + w * 0.16);
      holes.push(ensureWinding(transformLoop(loop, cx, cy, 1, sign * angle), false));
    }
  }
  return holes;
}

/** Regular polygon plate. */
export function polygonOutline(sides: number, radius: number, rotate = 0): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i / sides) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return ensureWinding(pts, true);
}

/** Stadium: a straight member with rounded ends, the classic drilled bar. */
export function stadiumOutline(length: number, width: number, segments = 12): Vec2[] {
  const r = width / 2;
  const half = Math.max(length / 2 - r, 0);
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = -Math.PI / 2 + (i / segments) * Math.PI;
    pts.push([half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI / 2 + (i / segments) * Math.PI;
    pts.push([-half + Math.cos(a) * r, Math.sin(a) * r]);
  }
  return ensureWinding(pts, true);
}

/**
 * Triangular gusset with rounded corners.
 *
 * The corners are rounded because a real one is: a sharp point in sheet metal is
 * a place to catch and a place to crack, so it gets radiused, and the radius is
 * what makes it read as cut from stock rather than drawn on.
 */
export function gussetOutline(radius: number, fillet: number, segments = 6): Vec2[] {
  const pts: Vec2[] = [];
  for (let corner = 0; corner < 3; corner++) {
    const a = -Math.PI / 2 + (corner / 3) * Math.PI * 2;
    const cx = Math.cos(a) * (radius - fillet);
    const cy = Math.sin(a) * (radius - fillet);
    for (let i = 0; i <= segments; i++) {
      const t = a - Math.PI / 3 + (i / segments) * ((2 * Math.PI) / 3);
      pts.push([cx + Math.cos(t) * fillet, cy + Math.sin(t) * fillet]);
    }
  }
  return ensureWinding(pts, true);
}

export function circleOutline(radius: number, segments = 48): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return ensureWinding(pts, true);
}

/** A ring of drilled holes, wound for use as piercings. */
export function boltCircle(count: number, radius: number, bore: number, segments = 14): Vec2[][] {
  const holes: Vec2[][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    holes.push(ensureWinding(
      transformLoop(circleOutline(bore / 2, segments), Math.cos(a) * radius, Math.sin(a) * radius),
      false,
    ));
  }
  return holes;
}

/**
 * Does a piercing fit inside an outline with room to spare?
 *
 * The bevel insets the cap outline while growing every hole, so a piercing placed
 * by eye near a margin breaks through on the faces but not on the walls, leaving
 * a cap that no longer matches its own boundary. Rather than hand-solve a safe
 * position for each kind of piercing — a vein, a bolt hole, a boss — check the
 * one thing that actually matters and drop the ones that do not fit.
 */
export function fitsInside(hole: Vec2[], outline: Vec2[], clearance: number): boolean {
  for (const p of hole) {
    if (!pointInLoop(p, outline)) return false;
    if (distanceToLoop(p, outline) < clearance) return false;
  }
  return true;
}

/**
 * Does a piercing clear the ones already accepted?
 *
 * `fitsInside` checks a hole against the outline, which is what breaks a margin.
 * Holes can also run into each other — a wide leaf with several pairs of vein
 * slots puts the innermost pair across the midrib from one another — and two
 * overlapping loops handed to earcut are not a polygon at all, so the cap comes
 * back torn rather than merely wrong.
 */
export function clearsOthers(hole: Vec2[], others: Vec2[][], clearance: number): boolean {
  for (const other of others) {
    for (const p of hole) {
      if (pointInLoop(p, other)) return false;
      if (distanceToLoop(p, other) < clearance) return false;
    }
    for (const p of other) {
      if (pointInLoop(p, hole)) return false;
    }
  }
  return true;
}

function pointInLoop([x, y]: Vec2, loop: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToLoop([x, y]: Vec2, loop: Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ax, ay] = loop[j];
    const [bx, by] = loop[i];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}
