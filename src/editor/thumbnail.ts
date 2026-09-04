import type { Mesh } from '../mesh/types';

/**
 * A small picture of a mesh, drawn on a 2D canvas.
 *
 * Painter's algorithm with flat Lambert shading, from the same three-quarter
 * view the viewer frames a part in. Not the renderer, deliberately: a palette
 * of twenty parts must not cost twenty occlusion bakes, and a thumbnail has to
 * be legible at fifty pixels, where a faithful metal render is just a smear.
 */
export function thumbnail(
  mesh: Mesh, size: number, tint: [number, number, number], enamel?: [number, number, number],
): HTMLCanvasElement {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;

  // view basis: looking down the framing direction, Z up
  const dir = normalize([0.42, 0.5, 0.9]);
  const f: V = [-dir[0], -dir[1], -dir[2]];
  const right = normalize(cross(f, [0, 0, 1]));
  const up = cross(right, f);
  const light = normalize([-0.3, 0.4, 0.85]);

  const p = mesh.positions;
  const n = p.length / 3;
  const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    sx[i] = x * right[0] + y * right[1] + z * right[2];
    sy[i] = x * up[0] + y * up[1] + z * up[2];
    sz[i] = x * f[0] + y * f[1] + z * f[2];
    if (sx[i] < minX) minX = sx[i]; if (sx[i] > maxX) maxX = sx[i];
    if (sy[i] < minY) minY = sy[i]; if (sy[i] > maxY) maxY = sy[i];
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = (size * dpr * 0.82) / span;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const half = (size * dpr) / 2;
  const px = (i: number) => half + (sx[i] - cx) * scale;
  const py = (i: number) => half - (sy[i] - cy) * scale;

  const ix = mesh.indices;
  const tris = ix.length / 3;
  const order = new Uint32Array(tris);
  const depth = new Float32Array(tris);
  for (let t = 0; t < tris; t++) {
    order[t] = t;
    depth[t] = sz[ix[t * 3]] + sz[ix[t * 3 + 1]] + sz[ix[t * 3 + 2]];
  }
  // far to near: larger sz is further along the view direction
  order.sort((a, b) => depth[b] - depth[a]);

  for (let k = 0; k < tris; k++) {
    const t = order[k] * 3;
    const a = ix[t], b = ix[t + 1], c = ix[t + 2];
    const e1: V = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
    const e2: V = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
    let nn = cross(e1, e2);
    const len = Math.hypot(nn[0], nn[1], nn[2]);
    if (len < 1e-9) continue;
    nn = [nn[0] / len, nn[1] / len, nn[2] / len];
    // either side reads as the front: parts are thin and often seen edge-on
    if (nn[0] * f[0] + nn[1] * f[1] + nn[2] * f[2] > 0) nn = [-nn[0], -nn[1], -nn[2]];
    const lambert = Math.max(0, nn[0] * light[0] + nn[1] * light[1] + nn[2] * light[2]);
    const shade = 0.28 + 0.72 * lambert;
    // a triangle is glazed when its vertices are: the mask is per vertex
    const glazed = enamel && mesh.enamel && mesh.enamel[a] + mesh.enamel[b] + mesh.enamel[c] >= 2;
    const base = glazed ? enamel : tint;
    ctx.fillStyle = `rgb(${base[0] * shade | 0},${base[1] * shade | 0},${base[2] * shade | 0})`;
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.lineTo(px(c), py(c));
    ctx.closePath();
    ctx.fill();
    // a hairline of the same colour hides the seams between fills
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  return canvas;
}

type V = [number, number, number];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v: V): V => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
