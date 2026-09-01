import type { Vec2 } from '../geom/types';
import { MeshBuilder, type Mesh } from './types';

/**
 * A silhouette to revolve about Z, as [radius, z] points.
 *
 * Traversed so that material lies to the left, which fixes the outward direction
 * as (dz, -dr) and removes all winding guesswork. For a solid of revolution that
 * means running bottom to top; for a tube, down the bore and back up the outside
 * with `closed` set, so the rims are generated too.
 */
export interface Silhouette {
  points: Vec2[];
  /** Corners that should stay hard. Defaults to all-smooth. */
  sharp?: boolean[];
  closed?: boolean;
}

export interface RevolveOptions {
  segments?: number;
  /** Sweep less than a full turn, in radians. */
  arc?: number;
}

export function revolve(sil: Silhouette, opts: RevolveOptions = {}): Mesh {
  const segments = opts.segments ?? 32;
  const arc = opts.arc ?? Math.PI * 2;
  const rows = segments + 1;
  const cols = columnsOf(sil);
  const n = cols.points.length;

  const mb = new MeshBuilder();
  for (let i = 0; i < rows; i++) {
    const u = i / segments;
    const a = u * arc;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < n; k++) {
      const [r, z] = cols.points[k];
      const [nr, nz] = cols.normals[k];
      mb.vertex(ca * r, sa * r, z, ca * nr, sa * nr, nz, u, cols.v[k]);
    }
  }

  for (let i = 0; i < rows - 1; i++) {
    for (let k = 0; k < n - 1; k++) {
      if (cols.skip[k]) continue;
      const a = i * n + k;
      const b = (i + 1) * n + k;
      const poleLow = cols.points[k][0] < 1e-9;
      const poleHigh = cols.points[k + 1][0] < 1e-9;
      if (poleLow && poleHigh) continue;
      // wound (u then v): the face normal is cross(dTheta, dSilhouette), which is
      // the (dz, -dr) outward direction the silhouette contract promises
      if (poleLow) mb.triangle(a, b + 1, a + 1);
      else if (poleHigh) mb.triangle(a, b, b + 1);
      else mb.quad(a, b, b + 1, a + 1);
    }
  }

  return mb.build();
}

interface Columns {
  points: Vec2[];
  normals: Vec2[];
  v: number[];
  /** skip[k] = the band between column k and k+1 is a crease pair with no area. */
  skip: boolean[];
}

/**
 * Expand a silhouette into shading columns, duplicating hard corners so a rim
 * shades as an edge rather than a soft roll. Mirrors the way sweep profiles work.
 */
function columnsOf(sil: Silhouette): Columns {
  const src = sil.points;
  const m = src.length;
  const closed = sil.closed ?? false;
  const sharp = sil.sharp ?? src.map(() => false);

  const edgeNormal = (a: Vec2, b: Vec2): Vec2 => {
    const dr = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dr, dz) || 1;
    return [dz / l, -dr / l];
  };

  let total = 0;
  const cum: number[] = [0];
  for (let k = 1; k < m; k++) {
    total += Math.hypot(src[k][0] - src[k - 1][0], src[k][1] - src[k - 1][1]);
    cum.push(total);
  }
  if (closed) total += Math.hypot(src[0][0] - src[m - 1][0], src[0][1] - src[m - 1][1]);

  const points: Vec2[] = [];
  const normals: Vec2[] = [];
  const v: number[] = [];
  const skip: boolean[] = [];

  for (let k = 0; k < m; k++) {
    const hasPrev = closed || k > 0;
    const hasNext = closed || k < m - 1;
    const nPrev = hasPrev ? edgeNormal(src[(k - 1 + m) % m], src[k]) : null;
    const nNext = hasNext ? edgeNormal(src[k], src[(k + 1) % m]) : null;
    const vv = total > 0 ? cum[k] / total : 0;

    if (sharp[k] && nPrev && nNext) {
      points.push(src[k]); normals.push(nPrev); v.push(vv); skip.push(true);
      points.push(src[k]); normals.push(nNext); v.push(vv); skip.push(false);
    } else {
      const a = nPrev ?? nNext!;
      const b = nNext ?? nPrev!;
      const mx = a[0] + b[0], my = a[1] + b[1];
      const l = Math.hypot(mx, my) || 1;
      points.push(src[k]); normals.push([mx / l, my / l]); v.push(vv); skip.push(false);
    }
  }

  if (closed) {
    // repeat the first column so v runs to 1 and the loop stitches without wrapping
    points.push(points[0]); normals.push(normals[0]); v.push(1); skip.push(false);
  }

  return { points, normals, v, skip };
}
