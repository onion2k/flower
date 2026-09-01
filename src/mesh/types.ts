export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  /** u runs along the sweep or around the revolve, v across it. Drives brushed finishes. */
  uvs: Float32Array;
  indices: Uint32Array;
}

export type Vec2 = [number, number];

/**
 * Accumulates a mesh from generators that emit vertex grids and fans.
 *
 * Everything here produces structured topology on purpose: edges follow the form,
 * so a swept tube reads smoother at 3k triangles than a grid-sampled one does at 7k,
 * and every vertex carries a real surface parameter rather than a lattice position.
 */
export class MeshBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  get vertexCount() { return this.pos.length / 3; }
  get triangleCount() { return this.idx.length / 3; }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * Stitch a (rows x cols) vertex grid whose first vertex is `base`. Grids are
   * emitted with the seam column duplicated, so `cols` is the real column count
   * and no index wrapping is needed here.
   */
  grid(base: number, rows: number, cols: number) {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i = base + r * cols + c;
        this.quad(i, i + cols, i + cols + 1, i + 1);
      }
    }
  }

  build(): Mesh {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nrm),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
    };
  }
}

/** Recompute smooth normals from face geometry, where an analytic normal is awkward. */
export function recomputeNormals(mesh: Mesh) {
  const { positions, normals, indices } = mesh;
  normals.fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      normals[v] += nx; normals[v + 1] += ny; normals[v + 2] += nz;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l;
  }
}
