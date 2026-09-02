/**
 * HDR output: the scene renders into a multisampled float target, bloom is drawn
 * from what overshoots white, and one composite pass tonemaps to the canvas.
 *
 * Kept in a float target, a softbox reflected in polished gold can spill into
 * its neighbours the way it does through a real lens — a glow, not a flat white
 * patch — and the tonemap sees the whole frame at once. WebGPU resolves the
 * multisampling for free on the way out of the scene pass.
 */

import { FULLSCREEN_VERT, shader, type GpuContext } from '../gpu/context';

export interface PostOptions {
  bloom: number;
  /** Debug views want their raw values shown, not tonemapped and bloomed. */
  raw: boolean;
}

const HDR: GPUTextureFormat = 'rgba16float';
const SAMPLES = 4;
const BLOOM_LEVELS = 5;

const BRIGHT = `
${FULLSCREEN_VERT}
struct Params { threshold: f32, knee: f32, _p: vec2f };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSample(src, samp, uv).rgb;
  let l = max(max(c.r, c.g), c.b);
  var soft = clamp(l - params.threshold + params.knee, 0.0, 2.0 * params.knee);
  soft = soft * soft / (4.0 * params.knee + 1e-4);
  let contribution = max(soft, l - params.threshold) / max(l, 1e-4);
  return vec4f(c * contribution, 1.0);
}`;

const DOWN = `
${FULLSCREEN_VERT}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = 1.0 / vec2f(textureDimensions(src));
  var sum = textureSample(src, samp, uv).rgb * 4.0;
  sum += textureSample(src, samp, uv + t * vec2f(-1.0, -1.0)).rgb;
  sum += textureSample(src, samp, uv + t * vec2f( 1.0, -1.0)).rgb;
  sum += textureSample(src, samp, uv + t * vec2f(-1.0,  1.0)).rgb;
  sum += textureSample(src, samp, uv + t * vec2f( 1.0,  1.0)).rgb;
  return vec4f(sum / 8.0, 1.0);
}`;

const UP = `
${FULLSCREEN_VERT}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = 1.0 / vec2f(textureDimensions(src));
  var sum = vec3f(0.0);
  sum += textureSample(src, samp, uv + t * vec2f(-1.0,  0.0)).rgb * 2.0;
  sum += textureSample(src, samp, uv + t * vec2f( 1.0,  0.0)).rgb * 2.0;
  sum += textureSample(src, samp, uv + t * vec2f( 0.0, -1.0)).rgb * 2.0;
  sum += textureSample(src, samp, uv + t * vec2f( 0.0,  1.0)).rgb * 2.0;
  sum += textureSample(src, samp, uv + t * vec2f(-1.0, -1.0)).rgb;
  sum += textureSample(src, samp, uv + t * vec2f( 1.0, -1.0)).rgb;
  sum += textureSample(src, samp, uv + t * vec2f(-1.0,  1.0)).rgb;
  sum += textureSample(src, samp, uv + t * vec2f( 1.0,  1.0)).rgb;
  return vec4f(sum / 12.0, 1.0);
}`;

const COMPOSITE = `
${FULLSCREEN_VERT}
struct Params { bloom: f32, raw: f32, _p: vec2f };
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var bloom: texture_2d<f32>;

// Narkowicz's ACES fit, on the finished frame
fn tonemap(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSample(scene, samp, uv).rgb;
  let b = textureSample(bloom, samp, uv).rgb;
  let colour = select(tonemap(s + b * params.bloom), s, params.raw > 0.5);
  return vec4f(pow(colour, vec3f(1.0 / 2.2)), 1.0);
}`;

export class PostChain {
  private width = 0;
  private height = 0;

  private msaa: GPUTexture | null = null;
  private depth: GPUTexture | null = null;
  private resolve: GPUTexture | null = null;
  private bloom: GPUTexture[] = [];

  private sampler: GPUSampler;
  private brightPipe: GPURenderPipeline;
  private downPipe: GPURenderPipeline;
  private upPipe: GPURenderPipeline;
  private compositePipe: GPURenderPipeline;
  private brightParams: GPUBuffer;
  private compositeParams: GPUBuffer;

  private brightBind: GPUBindGroup | null = null;
  private downBinds: GPUBindGroup[] = [];
  private upBinds: GPUBindGroup[] = [];
  private compositeBind: GPUBindGroup | null = null;

  readonly depthFormat: GPUTextureFormat = 'depth24plus';
  readonly colourFormat = HDR;
  readonly sampleCount = SAMPLES;

  constructor(private ctx: GpuContext) {
    const { device } = ctx;
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const pipe = (code: string, label: string, blend?: GPUBlendState, format: GPUTextureFormat = HDR) => {
      const module = shader(device, code, label);
      return device.createRenderPipeline({
        label,
        layout: 'auto',
        vertex: { module, entryPoint: 'vsFullscreen' },
        fragment: { module, entryPoint: 'fsMain', targets: [{ format, blend }] },
        primitive: { topology: 'triangle-list' },
      });
    };
    const additive: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    };
    this.brightPipe = pipe(BRIGHT, 'bloom bright');
    this.downPipe = pipe(DOWN, 'bloom down');
    this.upPipe = pipe(UP, 'bloom up', additive);
    this.compositePipe = pipe(COMPOSITE, 'composite', undefined, ctx.format);

    this.brightParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.brightParams, 0, new Float32Array([1.2, 0.5, 0, 0]));
    this.compositeParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  resize(width: number, height: number) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.release();
    const { device } = this.ctx;

    this.msaa = device.createTexture({
      size: [width, height], format: HDR, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT, label: 'scene msaa',
    });
    this.depth = device.createTexture({
      size: [width, height], format: this.depthFormat, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT, label: 'scene depth',
    });
    this.resolve = device.createTexture({
      size: [width, height], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'scene resolve',
    });

    this.bloom = [];
    let w = width, h = height;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      this.bloom.push(device.createTexture({
        size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: `bloom ${i}`,
      }));
    }

    const view = (t: GPUTexture) => t.createView();
    this.brightBind = device.createBindGroup({
      layout: this.brightPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: view(this.resolve) },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.brightParams } },
      ],
    });
    this.downBinds = [];
    this.upBinds = [];
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      this.downBinds.push(device.createBindGroup({
        layout: this.downPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: view(this.bloom[i - 1]) }, { binding: 1, resource: this.sampler }],
      }));
    }
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      this.upBinds.push(device.createBindGroup({
        layout: this.upPipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: view(this.bloom[i + 1]) }, { binding: 1, resource: this.sampler }],
      }));
    }
    this.compositeBind = device.createBindGroup({
      layout: this.compositePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: view(this.resolve) },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.compositeParams } },
        { binding: 3, resource: view(this.bloom[0]) },
      ],
    });
  }

  /** The scene pass: multisampled HDR colour resolved on store, plus depth. */
  scenePass(clear: [number, number, number]): GPURenderPassDescriptor {
    return {
      colorAttachments: [{
        view: this.msaa!.createView(),
        resolveTarget: this.resolve!.createView(),
        clearValue: { r: clear[0], g: clear[1], b: clear[2], a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depth!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    };
  }

  /** Bloom the resolved scene and composite it onto the canvas. */
  finish(encoder: GPUCommandEncoder, canvasView: GPUTextureView, opts: PostOptions) {
    const { device } = this.ctx;
    device.queue.writeBuffer(this.compositeParams, 0, new Float32Array([opts.raw ? 0 : opts.bloom, opts.raw ? 1 : 0, 0, 0]));

    const draw = (pipeline: GPURenderPipeline, bind: GPUBindGroup, target: GPUTextureView, load: GPULoadOp) => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: target, loadOp: load, storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
    };

    if (!opts.raw) {
      draw(this.brightPipe, this.brightBind!, this.bloom[0].createView(), 'clear');
      for (let i = 1; i < BLOOM_LEVELS; i++) {
        draw(this.downPipe, this.downBinds[i - 1], this.bloom[i].createView(), 'clear');
      }
      let k = 0;
      for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
        draw(this.upPipe, this.upBinds[k++], this.bloom[i].createView(), 'load');
      }
    }
    draw(this.compositePipe, this.compositeBind!, canvasView, 'clear');
  }

  private release() {
    this.msaa?.destroy();
    this.depth?.destroy();
    this.resolve?.destroy();
    for (const t of this.bloom) t.destroy();
    this.msaa = this.depth = this.resolve = null;
    this.bloom = [];
  }

  dispose() {
    this.release();
    this.brightParams.destroy();
    this.compositeParams.destroy();
  }
}

/** The linear value that tonemaps to a given display value; used for the clear colour. */
export function inverseTonemap(display: [number, number, number]): [number, number, number] {
  const aces = (x: number) => {
    const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return Math.min(1, Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e)));
  };
  return display.map((v) => {
    const targetLinear = Math.pow(v, 2.2);
    let lo = 0, hi = 20;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (aces(mid) < targetLinear) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }) as [number, number, number];
}
