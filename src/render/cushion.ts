/**
 * A cushion under the piece.
 *
 * A cloth table is not a plane: a pillow is a plump pad with rounded edges,
 * and whatever is set on it sinks in, the cloth draping down to meet it.
 * This bakes that shape as a height map over the ground disc, in three steps:
 *
 * 1. The piece is rendered straight down into a depth map, so every texel
 *    of the ground knows how high the underside of the piece is above it.
 * 2. A min-plus "cone" pass spreads that outward: the cloth may be no higher
 *    than the piece's underside at any point, nor higher than that plus a
 *    slope times the distance away — which is what a draped cloth does. It
 *    is run along four directions in turn, so the cone is an octagon rather
 *    than a diamond.
 * 3. The result is capped by the cushion's own dome: a rounded-square pad
 *    that stands `puff` millimetres proud and falls to the table at its rim.
 *
 * The ground mesh reads the height in its vertex shader and its fragment
 * shader takes the normal from the height's gradient, so lighting, shadow
 * and sheen all see the real shape.
 */
import { shader, type GpuContext } from '../gpu/context';

export const CUSHION_SIZE = 512;

const CONE_WGSL = `
struct Params {
  centre: vec3f,
  radius: f32,     // of the ground disc: the map spans 2r
  puff: f32,       // how proud the cushion stands, mm
  slope: f32,      // how steeply the cloth drapes off a part, mm per mm
  clearance: f32,  // the cloth stays this far under a part's underside
  size: f32,       // the cushion's half-side as a fraction of the radius
  dir: vec2i,      // the direction this pass sweeps
  stage: u32,      // 0 read the depth map; 1 read the height map; 2 finish
  _pad: u32,
};
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var pieceDepth: texture_depth_2d;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;

const FAR = 1e9;

// height texel -> where the piece's depth render put that point
fn undersideAt(p: vec2i) -> f32 {
  let s = f32(${CUSHION_SIZE});
  let local = (vec2f(p) + 0.5) / s * 2.0 - 1.0;
  // the depth render looked straight down with its x along -y and its y along +x
  let ndc = vec2f(-local.y, local.x);
  let uv = vec2f(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
  let q = vec2i(clamp(uv * s, vec2f(0.0), vec2f(s - 1.0)));
  let d = textureLoad(pieceDepth, q, 0);
  if (d >= 0.9999) { return FAR; }
  // depth runs 0 at the eye, 2r above the centre, to 1 at 4r below that
  return params.centre.z + params.radius * 2.0 - d * params.radius * 4.0 - params.clearance;
}

fn valueAt(p: vec2i) -> f32 {
  if (params.stage == 0u) { return undersideAt(p); }
  return textureLoad(src, p, 0).r;
}

fn dome(p: vec2i) -> f32 {
  let s = f32(${CUSHION_SIZE});
  let local = (vec2f(p) + 0.5) / s * 2.0 - 1.0;
  let q = abs(local) / params.size;
  // a rounded square, plump: a gentle crown across the top, and a soft
  // shoulder rolling down to the rim rather than a wall
  let e = pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25);
  let shoulder = 1.0 - smoothstep(0.45, 1.0, e);
  let crown = 0.8 + 0.2 * max(0.0, 1.0 - e * e);
  return params.puff * shoulder * crown;
}

@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  let s = i32(${CUSHION_SIZE});
  if (p.x >= s || p.y >= s) { return; }
  if (params.stage == 2u) {
    // the cushion's own shape, and no higher than the drape allows; a part
    // set on the table itself may push the cloth a little below it
    let cone = textureLoad(src, p, 0).r;
    let h = min(dome(p), cone - params.centre.z);
    textureStore(dst, p, vec4f(max(h, -params.clearance), 0.0, 0.0, 0.0));
    return;
  }
  let texel = params.radius * 2.0 / f32(s);
  let stepLength = length(vec2f(params.dir)) * texel;
  var best = valueAt(p);
  for (var k = 1; k <= 40; k++) {
    let rise = params.slope * f32(k) * stepLength;
    let a = p + params.dir * k;
    let b = p - params.dir * k;
    if (a.x >= 0 && a.y >= 0 && a.x < s && a.y < s) { best = min(best, valueAt(a) + rise); }
    if (b.x >= 0 && b.y >= 0 && b.x < s && b.y < s) { best = min(best, valueAt(b) + rise); }
  }
  textureStore(dst, p, vec4f(best, 0.0, 0.0, 0.0));
}
`;

export interface CushionShape {
  /** How proud the cushion stands, mm. */
  puff: number;
  /** How steeply the cloth drapes away from a part, mm per mm. */
  slope: number;
  /** The cushion's half-side, as a fraction of the ground radius. */
  size: number;
}

export class CushionBake {
  readonly height: GPUTexture;
  private scratch: GPUTexture;
  private pipeline: GPUComputePipeline;
  private layout: GPUBindGroupLayout;
  private params: GPUBuffer;

  constructor(private ctx: GpuContext) {
    const { device } = ctx;
    const make = (label: string) => device.createTexture({
      label, size: [CUSHION_SIZE, CUSHION_SIZE], format: 'r32float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.height = make('cushion height');
    this.scratch = make('cushion scratch');
    this.layout = device.createBindGroupLayout({
      label: 'cushion',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: 'r32float', access: 'write-only' } },
      ],
    });
    this.pipeline = device.createComputePipeline({
      label: 'cushion',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      compute: { module: shader(device, CONE_WGSL, 'cushion'), entryPoint: 'main' },
    });
    // five passes, each with its own slice of parameters
    this.params = device.createBuffer({ label: 'cushion params', size: 256 * 5, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  /**
   * Bake from a depth render of the piece seen straight down over the ground
   * disc (centre, radius). Records the passes on the encoder.
   */
  bake(encoder: GPUCommandEncoder, pieceDepth: GPUTextureView, centre: number[], radius: number, shape: CushionShape) {
    const { device } = this.ctx;
    const clearance = 0.25;
    const sweeps: Array<{ dir: [number, number]; stage: number; from: GPUTexture; to: GPUTexture }> = [
      { dir: [1, 0], stage: 0, from: this.scratch, to: this.height },
      { dir: [0, 1], stage: 1, from: this.height, to: this.scratch },
      { dir: [1, 1], stage: 1, from: this.scratch, to: this.height },
      { dir: [1, -1], stage: 1, from: this.height, to: this.scratch },
      { dir: [0, 0], stage: 2, from: this.scratch, to: this.height },
    ];
    const data = new ArrayBuffer(256 * sweeps.length);
    sweeps.forEach((s, i) => {
      const f32 = new Float32Array(data, i * 256, 8);
      const i32 = new Int32Array(data, i * 256 + 32, 4);
      f32.set([centre[0], centre[1], centre[2], radius, shape.puff, shape.slope, clearance, shape.size]);
      i32.set([s.dir[0], s.dir[1], s.stage, 0]);
    });
    device.queue.writeBuffer(this.params, 0, data);
    const groups = Math.ceil(CUSHION_SIZE / 8);
    sweeps.forEach((s, i) => {
      const bind = device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: this.params, offset: i * 256, size: 48 } },
          { binding: 1, resource: pieceDepth },
          { binding: 2, resource: s.from.createView() },
          { binding: 3, resource: s.to.createView() },
        ],
      });
      const pass = encoder.beginComputePass({ label: `cushion ${i}` });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(groups, groups);
      pass.end();
    });
  }
}
