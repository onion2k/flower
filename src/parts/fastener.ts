import { revolve, type Silhouette } from '../mesh/revolve';
import { meshBounds, type Part } from './types';
import type { Vec2 } from '../geom/types';

export interface RivetSpec {
  name?: string;
  headDiameter: number;
  headHeight: number;
  shankDiameter: number;
  grip: number;
  /** Bucked tail spread on the far side. 0 leaves the shank cut flush. */
  tailSpread?: number;
  segments?: number;
}

/**
 * A dome rivet, as a silhouette revolved about its own axis.
 *
 * Origin sits at the seat — the face the head lands on — so placing one is just
 * aligning that origin to an anchor. Around 700 triangles, which is what a part
 * appearing two hundred times in a sculpture ought to cost.
 */
export function rivet(spec: RivetSpec): Part {
  const hr = spec.headDiameter / 2;
  const hh = spec.headHeight;
  const sr = spec.shankDiameter / 2;
  const spread = spec.tailSpread ?? sr * 0.5;
  const domeSegments = 8;

  const points: Vec2[] = [];
  const sharp: boolean[] = [];
  const at = (r: number, z: number, hard = false) => { points.push([r, z]); sharp.push(hard); };

  const tailHeight = spread > 0 ? sr * 0.7 : 0;
  const tailBottom = -spec.grip - tailHeight;

  at(0, tailBottom);
  if (spread > 0) {
    // the last arc point already lands on (sr + spread, -grip); repeating it as an
    // explicit corner would be a zero-length edge and a band of degenerate quads
    for (let i = 1; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      at((sr + spread) * Math.sin(a), tailBottom + tailHeight * (1 - Math.cos(a)), i === 4);
    }
    at(sr, -spec.grip + sr * 0.1, true);
  }
  at(sr, 0, true);
  at(hr, 0, true);

  // circular cap: base radius hr at the seat, apex at z = hh
  const r = (hr * hr + hh * hh) / (2 * hh);
  const zc = hh - r;
  for (let i = 1; i <= domeSegments; i++) {
    const z = (i / domeSegments) * hh;
    at(Math.sqrt(Math.max(r * r - (z - zc) * (z - zc), 0)), z);
  }

  const mesh = revolve({ points, sharp }, { segments: spec.segments ?? 24 });
  return {
    name: spec.name ?? 'rivet',
    mesh,
    bounds: meshBounds(mesh),
    anchors: [
      { name: 'seat', position: [0, 0, 0], axis: [0, 0, 1], tangent: [1, 0, 0], bore: spec.shankDiameter },
      { name: 'tail', position: [0, 0, -spec.grip], axis: [0, 0, -1], tangent: [1, 0, 0] },
    ],
  };
}

export interface BeadSpec {
  name?: string;
  radius: number;
  /** Length of the drawn point at the top. 0 gives a plain ovoid. */
  point?: number;
  bore?: number;
  segments?: number;
}

/** A teardrop bead — the terminal that finishes a tendril without an engineering joint. */
export function bead(spec: BeadSpec): Part {
  const r = spec.radius;
  const point = spec.point ?? r * 1.4;
  const bore = spec.bore ?? 0;
  const rows = 20;

  const outer: Vec2[] = [];
  for (let i = 0; i <= rows; i++) {
    const a = (i / rows) * Math.PI; // 0 at the bottom pole, pi at the tip
    const pinch = Math.pow((1 - Math.cos(a)) / 2, 1.8);
    const rr = r * Math.sin(a) * (1 - 0.85 * pinch);
    const z = -Math.cos(a) * r + pinch * point;
    outer.push([Math.max(rr, bore / 2), z]);
  }

  let sil: Silhouette;
  if (bore > 0) {
    // Keep only the part of the ovoid that is actually wider than the hole, then
    // close across a real rim at each end. Clamping the outer profile to the bore
    // radius instead would leave duplicated points and zero-length edges, which
    // produce null normals and degenerate bands.
    const kept = outer.filter(([rr]) => rr > bore / 2 + 1e-6);
    const zBot = kept[0][1];
    const zTop = kept[kept.length - 1][1];
    const points: Vec2[] = [[bore / 2, zBot], ...kept, [bore / 2, zTop]];
    const sharp = points.map((_, i) => i <= 1 || i >= points.length - 2);
    sil = { points, sharp, closed: true };
  } else {
    sil = { points: outer };
  }

  const mesh = revolve(sil, { segments: spec.segments ?? 24 });
  return {
    name: spec.name ?? 'bead',
    mesh,
    bounds: meshBounds(mesh),
    anchors: [{ name: 'seat', position: [0, 0, -r], axis: [0, 0, -1], tangent: [1, 0, 0], bore: spec.bore }],
  };
}

export interface CollarSpec {
  name?: string;
  innerRadius: number;
  wall: number;
  length: number;
  /** Swell at the middle, as a fraction of the wall. Gives a cast ferrule look. */
  belly?: number;
  segments?: number;
}

/** A ferrule that binds wires where they cross — this vocabulary's rivet. */
export function collar(spec: CollarSpec): Part {
  const rows = 12;
  const belly = spec.belly ?? 0.6;
  const half = spec.length / 2;

  // down the bore, then back up the outside, closed so the two rims are made too
  const inner: Vec2[] = [];
  for (let i = 0; i <= rows; i++) {
    inner.push([spec.innerRadius, half - (i / rows) * spec.length]);
  }
  const outer: Vec2[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    outer.push([
      spec.innerRadius + spec.wall * (1 + belly * Math.sin(Math.PI * t)),
      -half + t * spec.length,
    ]);
  }
  const points = [...inner, ...outer];
  const sharp = points.map((_, i) => i === inner.length - 1 || i === points.length - 1);

  const mesh = revolve({ points, sharp, closed: true }, { segments: spec.segments ?? 24 });
  return {
    name: spec.name ?? 'collar',
    mesh,
    bounds: meshBounds(mesh),
    anchors: [
      { name: 'a', position: [0, 0, -half], axis: [0, 0, -1], tangent: [1, 0, 0], bore: spec.innerRadius * 2 },
      { name: 'b', position: [0, 0, half], axis: [0, 0, 1], tangent: [1, 0, 0], bore: spec.innerRadius * 2 },
    ],
  };
}

export interface PodSpec {
  name?: string;
  length: number;
  width: number;
  /** Number of whorls — rings around the pod. 0 leaves it smooth. */
  whorls?: number;
  whorlDepth?: number;
  segments?: number;
}

/**
 * A seed pod: an ovoid drawn to a point at both ends, optionally whorled.
 *
 * Whorls, not ribs. A surface of revolution can only vary along its silhouette,
 * so the flutes come out as rings around the pod rather than running its length —
 * a cone or a shell rather than a melon. Cut into the silhouette rather than
 * added on top, so the profile stays one closed loop and needs no boolean.
 */
export function pod(spec: PodSpec): Part {
  const rows = 48;
  const whorls = spec.whorls ?? 0;
  const depth = spec.whorlDepth ?? spec.width * 0.06;

  const points: Vec2[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const a = t * Math.PI;
    // pointed at both ends, fullest a little below the middle
    const swell = Math.pow(Math.sin(a), 0.78) * (1 - 0.12 * Math.cos(a));
    const flute = whorls > 0 ? Math.cos(t * whorls * Math.PI * 2) * depth * Math.sin(a) : 0;
    points.push([Math.max(spec.width * 0.5 * swell + flute, 0), (t - 0.5) * spec.length]);
  }

  const mesh = revolve({ points }, { segments: spec.segments ?? 32 });
  return {
    name: spec.name ?? 'pod',
    mesh,
    bounds: meshBounds(mesh),
    anchors: [
      { name: 'base', position: [0, 0, -spec.length / 2], axis: [0, 0, -1], tangent: [1, 0, 0] },
      { name: 'tip', position: [0, 0, spec.length / 2], axis: [0, 0, 1], tangent: [1, 0, 0] },
    ],
  };
}
