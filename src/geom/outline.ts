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
 * A leaf: pointed at the tip, wider below the middle, gently asymmetric.
 *
 * `droop` bends the midrib sideways. A perfectly symmetric leaf reads as a logo;
 * the whole art nouveau line depends on the axis itself being a curve.
 */
export function leafOutline(
  length: number,
  width: number,
  segments = 48,
  droop = 0.18,
): Vec2[] {
  const half: Vec2[] = [];
  const other: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.3 * t);
    const spine = Math.sin(Math.PI * t) * droop * length;
    const x = t * length;
    half.push([x, spine + w]);
    other.push([x, spine - w]);
  }
  other.reverse();
  // drop the duplicated tip and base points
  return ensureWinding([...half.slice(0, -1), ...other.slice(0, -1)], true);
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
): Vec2[][] {
  const holes: Vec2[][] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.9) / (count + 1.1);
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.3 * t);
    const spine = Math.sin(Math.PI * t) * droop * length;
    const hole = teardropOutline(w * 2.1 * margin, w * 1.5 * margin, 20);
    holes.push(ensureWinding(transformLoop(hole, t * length, spine, 1, 0.18), false));
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
