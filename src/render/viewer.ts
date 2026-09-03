/**
 * The viewer: a canvas, a camera, and one scene pass through the post chain.
 *
 * Owns every GPU resource the scene needs and nothing else: parts arrive as
 * meshes with instance matrices and leave as vertex buffers; the environment and
 * occlusion bakes hand back textures and buffers that are bound here. The
 * public surface is what main.ts drives — subject, material, light, view — and
 * it is deliberately the same surface the WebGL build had.
 */

import { createContext, bufferFrom, emptyBuffer, shader, type GpuContext } from '../gpu/context';
import { Camera, Orbit } from '../gpu/camera';
import type { Mesh as PartMesh } from '../mesh/types';
import type { Anchor } from '../parts/types';
import type { Box3, Vec3 } from '../geom/types';
import { computeWear } from '../mesh/wear';
import { bakeEnvironment, type Environment, type EnvPreset, type EnvSamples } from './env';
import { enamels, finishes, metals, patinaColour, type Finish, type Metal } from './materials';
import { bakeOcclusion, type Occlusion } from './occlusion';
import { PostChain, inverseTonemap } from './post';
import { ANCHOR_WGSL, GROUND_WGSL, PBR_WGSL, PREPASS_WGSL } from './shaders';

const BACKGROUND: [number, number, number] = [0.043, 0.047, 0.055];
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const MATERIAL_STRIDE = 256;
/** Bytes of each material record that the shader reads. */
const MATERIAL_SIZE = 96;
const FRAME_SIZE = 96;

export type Quality = 'draft' | 'final';

export interface InstanceGroup {
  mesh: PartMesh;
  matrices: Float32Array;
  /** Per-group overrides, so a rosette can have silver leaves and gold studs. */
  metal?: string;
  finish?: string;
  /** Enamel colour on the vertices the mesh marks as enamelled. */
  enamel?: string;
}

interface GpuGroup {
  source: InstanceGroup;
  position: GPUBuffer;
  normal: GPUBuffer;
  uv: GPUBuffer;
  wear: GPUBuffer;
  /** 0 or 1 per vertex: where the enamel is. Zeros on a plain part. */
  enamel: GPUBuffer;
  instance: GPUBuffer;
  index: GPUBuffer;
  indexCount: number;
  instanceCount: number;
  vertexCount: number;
}

/** Wear belongs to the mesh, so it is computed once however often the mesh is placed. */
const wearCache = new WeakMap<PartMesh, Float32Array>();
function wearOf(mesh: PartMesh) {
  let w = wearCache.get(mesh);
  if (!w) {
    w = computeWear(mesh);
    wearCache.set(mesh, w);
  }
  return w;
}

export class Viewer {
  readonly camera = new Camera();
  bloom = 0.018;

  private ctx: GpuContext;
  private host: HTMLElement;
  private controls: Orbit;
  private post: PostChain;
  private observer: ResizeObserver;
  private raf = 0;
  private background: [number, number, number];

  private frameLayout: GPUBindGroupLayout;
  private materialLayout: GPUBindGroupLayout;
  private groundLayout: GPUBindGroupLayout;
  private prepassPipeline: GPURenderPipeline;
  private pbrPipeline: GPURenderPipeline;
  private groundPipeline: GPURenderPipeline;
  private anchorPipeline: GPURenderPipeline;
  private sampler: GPUSampler;

  private frameBuffer: GPUBuffer;
  private frameBind: GPUBindGroup | null = null;
  private dummyLookup: GPUBuffer;

  private environment: Environment | null = null;
  private envSamples: EnvSamples | null = null;
  private envSpin = 0;
  private exposure = 1;
  private debugMode = 0;

  private metal: Metal = metals.gold;
  private finish: Finish = finishes.polished;

  private groups: GpuGroup[] = [];
  private materialBuffer: GPUBuffer | null = null;
  private materialBind: GPUBindGroup | null = null;

  /** An occlusion bake asked for since the last frame; coalesced so a dragged slider bakes once a frame, not once an event. */
  private bakeQueued = false;

  /** A frame is drawn only when something has changed: the scene, a setting, or the camera. */
  private dirty = true;
  /** Frames actually drawn, for measuring. */
  frameCount = 0;
  /**
   * Adaptive resolution. While the camera moves, frames are timed; if they
   * cannot keep 30 a second the internal scale steps down, and steps back up
   * when there is headroom. The user's render-scale slider is the ceiling.
   */
  private autoScale = 1;
  private lastFrameAt = 0;
  private frameMs = 16;
  /** When the scale last stepped: each step reallocates the render targets, so steps are rationed. */
  private lastScaleStep = 0;
  /** Ask for a frame on the next tick. */
  requestRender() { this.dirty = true; }
  private renderScale = 1;

  private occlusion: Occlusion | null = null;
  private groundBuffer: GPUBuffer;
  private groundBind: GPUBindGroup | null = null;
  private discPosition: GPUBuffer;
  private discIndex: GPUBuffer;
  private discCount: number;

  private anchorPosition: GPUBuffer | null = null;
  private anchorColour: GPUBuffer | null = null;
  private anchorCount = 0;

  static async create(host: HTMLElement, onLost?: (info: GPUDeviceLostInfo) => void): Promise<Viewer> {
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    const ctx = await createContext(canvas, onLost);
    return new Viewer(ctx, host);
  }

  private constructor(ctx: GpuContext, host: HTMLElement) {
    this.ctx = ctx;
    this.host = host;
    host.appendChild(ctx.canvas);
    const { device } = ctx;

    this.controls = new Orbit(this.camera, {
      element: ctx.canvas, ease: 0.18, inertia: 0.72, minDistance: 6, maxDistance: 1200,
    });
    this.post = new PostChain(ctx);
    // the scene is linear HDR until the composite, so clear to what tonemaps to the page colour
    this.background = inverseTonemap(BACKGROUND);

    this.sampler = device.createSampler({
      magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge',
    });

    // --- layouts shared by the scene pipelines ---
    const both = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.frameLayout = device.createBindGroupLayout({
      label: 'frame',
      entries: [
        { binding: 0, visibility: both, buffer: { type: 'uniform' } },
        { binding: 1, visibility: both, texture: { viewDimension: 'cube' } },
        { binding: 2, visibility: both, texture: {} },
        { binding: 3, visibility: both, sampler: {} },
        { binding: 4, visibility: both, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.materialLayout = device.createBindGroupLayout({
      label: 'material',
      entries: [{ binding: 0, visibility: both, buffer: { type: 'uniform', hasDynamicOffset: true } }],
    });
    this.groundLayout = device.createBindGroupLayout({
      label: 'ground',
      entries: [
        { binding: 0, visibility: both, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });


    const target: GPUColorTargetState = { format: this.post.colourFormat };
    const multisample = { count: this.post.sampleCount };
    const depth = (write: boolean): GPUDepthStencilState => ({
      format: this.post.depthFormat, depthWriteEnabled: write, depthCompare: write ? 'less' : 'always',
    });

    const instanceLayout: GPUVertexBufferLayout = {
      arrayStride: 64, stepMode: 'instance',
      attributes: [4, 5, 6, 7].map((loc, k) => ({ shaderLocation: loc, offset: k * 16, format: 'float32x4' as GPUVertexFormat })),
    };
    const prepass = shader(device, PREPASS_WGSL, 'prepass');
    this.prepassPipeline = device.createRenderPipeline({
      label: 'prepass',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout] }),
      vertex: {
        module: prepass, entryPoint: 'vsMain',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }, instanceLayout],
      },
      fragment: { module: prepass, entryPoint: 'fsMain', targets: [{ format: this.post.colourFormat, writeMask: 0 }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true),
      multisample,
    });

    const pbr = shader(device, PBR_WGSL, 'pbr');
    this.pbrPipeline = device.createRenderPipeline({
      label: 'pbr',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.materialLayout] }),
      vertex: {
        module: pbr, entryPoint: 'vsMain',
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
          { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] },
          { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32' }] },
          instanceLayout,
          { arrayStride: 4, attributes: [{ shaderLocation: 8, offset: 0, format: 'float32' }] },
        ],
      },
      fragment: { module: pbr, entryPoint: 'fsMain', targets: [target] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      // the prepass has written depth; only the visible surface passes here
      depthStencil: { format: this.post.depthFormat, depthWriteEnabled: false, depthCompare: 'less-equal' },
      multisample,
    });

    const ground = shader(device, GROUND_WGSL, 'ground');
    this.groundPipeline = device.createRenderPipeline({
      label: 'ground',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.groundLayout] }),
      vertex: {
        module: ground, entryPoint: 'vsMain',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      fragment: { module: ground, entryPoint: 'fsMain', targets: [target] },
      // seen from underneath, the table should not hide the piece
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: depth(true),
      multisample,
    });

    const anchor = shader(device, ANCHOR_WGSL, 'anchors');
    this.anchorPipeline = device.createRenderPipeline({
      label: 'anchors',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout] }),
      vertex: {
        module: anchor, entryPoint: 'vsMain',
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
        ],
      },
      fragment: { module: anchor, entryPoint: 'fsMain', targets: [target] },
      primitive: { topology: 'line-list' },
      depthStencil: depth(false),
      multisample,
    });

    this.frameBuffer = device.createBuffer({ label: 'frame', size: FRAME_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.dummyLookup = emptyBuffer(device, 8, GPUBufferUsage.STORAGE, 'no occlusion');
    this.groundBuffer = device.createBuffer({ label: 'ground', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const disc = unitDisc(96);
    this.discPosition = bufferFrom(device, disc.positions, GPUBufferUsage.VERTEX, 'disc');
    this.discIndex = bufferFrom(device, disc.indices, GPUBufferUsage.INDEX, 'disc index');
    this.discCount = disc.indices.length;

    this.setEnvironment('studio');

    // the host, not the window: a pane that is laid out after load, or shown
    // after being hidden, changes size without a window resize event
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.loop();
  }

  setEnvironment(preset: EnvPreset) {
    const previous = this.environment;
    const env = bakeEnvironment(this.ctx, preset);
    this.environment = env;
    this.envSamples = null;
    this.rebuildFrameBind();
    previous?.dispose();
    this.dirty = true;

    // shadows follow the light, once its radiance has been read back
    env.samples.then((samples) => {
      if (this.environment !== env) return;
      this.envSamples = samples;
      if (this.groups.length) this.bakeOcclusion();
      this.dirty = true;
    });
    return env;
  }

  setMaterial(metalName: string, finishName: string) {
    this.metal = metals[metalName] ?? this.metal;
    this.finish = finishes[finishName] ?? this.finish;
    this.writeMaterials();
  }

  setBloom(v: number) { this.bloom = v; this.dirty = true; }
  setExposure(v: number) { this.exposure = v; this.dirty = true; }

  /** Fraction of device resolution to render at, below the pixel budget. */
  setRenderScale(v: number) {
    this.renderScale = Math.min(Math.max(v, 0.25), 1);
    this.resize();
  }

  setEnvSpin(radians: number) {
    this.envSpin = radians;
    if (this.groups.length && this.envSamples) this.bakeQueued = true;
    this.dirty = true;
  }

  /** 0 shaded, 1 normals, 2 uv, 3 roughness, 4 prefiltered, 5 brdf, 6 occlusion, 7 wear. */
  setDebug(mode: number) { this.debugMode = mode; this.dirty = true; }

  /**
   * Draft is for working: a lighter shadow bake and fewer pixels, so an edit
   * shows in a fraction of a second on a dense form. Final is for looking.
   */
  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.resize();
    if (this.groups.length && this.envSamples) this.bakeQueued = true;
    this.dirty = true;
  }
  private quality: Quality = 'draft';

  /** One draw per distinct part mesh, however many times it is placed. */
  setInstanced(groups: InstanceGroup[]) {
    const { device } = this.ctx;
    for (const g of this.groups) {
      for (const b of [g.position, g.normal, g.uv, g.wear, g.enamel, g.instance, g.index]) b.destroy();
    }
    const shared = GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE;
    this.groups = groups.map((g) => ({
      source: g,
      position: bufferFrom(device, g.mesh.positions, shared, 'positions'),
      normal: bufferFrom(device, g.mesh.normals, shared, 'normals'),
      uv: bufferFrom(device, g.mesh.uvs, GPUBufferUsage.VERTEX, 'uvs'),
      wear: bufferFrom(device, wearOf(g.mesh), GPUBufferUsage.VERTEX, 'wear'),
      enamel: bufferFrom(device, g.mesh.enamel ?? new Float32Array(g.mesh.positions.length / 3), GPUBufferUsage.VERTEX, 'enamel'),
      instance: bufferFrom(device, g.matrices, shared, 'instances'),
      index: bufferFrom(device, g.mesh.indices, GPUBufferUsage.INDEX, 'indices'),
      indexCount: g.mesh.indices.length,
      instanceCount: g.matrices.length / 16,
      vertexCount: g.mesh.positions.length / 3,
    }));

    this.materialBuffer?.destroy();
    this.materialBuffer = device.createBuffer({
      label: 'materials', size: Math.max(1, this.groups.length) * MATERIAL_STRIDE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.materialBind = device.createBindGroup({
      layout: this.materialLayout,
      entries: [{ binding: 0, resource: { buffer: this.materialBuffer, size: MATERIAL_SIZE } }],
    });

    if (this.envSamples) this.bakeOcclusion();
    else this.clearOcclusion();
    this.writeMaterials();
    this.dirty = true;
  }

  /** Occlusion entries are laid out group by group, placement by placement. */
  private occlusionBases(): number[] {
    const bases: number[] = [];
    let total = 0;
    for (const g of this.groups) {
      bases.push(total);
      total += g.vertexCount * g.instanceCount;
    }
    return bases;
  }

  setMesh(data: PartMesh) {
    this.setInstanced([{ mesh: data, matrices: IDENTITY }]);
  }

  setAnchors(anchors: Anchor[], scale: number) {
    const { device } = this.ctx;
    this.anchorPosition?.destroy();
    this.anchorColour?.destroy();
    this.anchorPosition = this.anchorColour = null;
    this.anchorCount = 0;
    this.dirty = true;
    if (!anchors.length) return;

    const position = new Float32Array(anchors.length * 12);
    const colour = new Float32Array(anchors.length * 12);
    anchors.forEach((a, i) => {
      const o = i * 12;
      const axisLen = scale;
      const tanLen = scale * 0.45;
      position.set([
        a.position[0] - a.axis[0] * axisLen * 0.35, a.position[1] - a.axis[1] * axisLen * 0.35, a.position[2] - a.axis[2] * axisLen * 0.35,
        a.position[0] + a.axis[0] * axisLen, a.position[1] + a.axis[1] * axisLen, a.position[2] + a.axis[2] * axisLen,
        a.position[0] - a.tangent[0] * tanLen, a.position[1] - a.tangent[1] * tanLen, a.position[2] - a.tangent[2] * tanLen,
        a.position[0] + a.tangent[0] * tanLen, a.position[1] + a.tangent[1] * tanLen, a.position[2] + a.tangent[2] * tanLen,
      ], o);
      colour.set([1, 0.72, 0.15, 1, 0.72, 0.15, 0.25, 0.7, 1, 0.25, 0.7, 1], o);
    });
    this.anchorPosition = bufferFrom(device, position, GPUBufferUsage.VERTEX, 'anchor lines');
    this.anchorColour = bufferFrom(device, colour, GPUBufferUsage.VERTEX, 'anchor colours');
    this.anchorCount = anchors.length * 4;
  }

  frameBounds(b: Box3) {
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const radius = Math.max(
      Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
      0.001,
    );
    const dist = (radius / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.3;
    this.camera.target = [cx, cy, cz];

    // look down on a flat form and across a tall one
    const spanXY = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    const spanZ = b.max[2] - b.min[2];
    const upright = spanZ / (spanXY + spanZ + 1e-6);
    const dir: Vec3 = [0.42 + 0.2 * upright, 0.5 + 0.28 * upright, 0.9 - 0.8 * upright];
    const l = Math.hypot(dir[0], dir[1], dir[2]);
    this.camera.position = [cx + (dir[0] / l) * dist, cy + (dir[1] / l) * dist, cz + (dir[2] / l) * dist];
    this.camera.near = Math.max(radius * 0.01, 0.01);
    this.camera.far = dist + radius * 12;
    this.controls.forcePosition();
    this.dirty = true;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.remove();
    this.environment?.dispose();
    this.occlusion?.dispose();
    this.post.dispose();
  }

  // ---- internals ----

  /**
   * Pixels the scene pass is allowed. Every one is shaded four times for the
   * multisampling and carried in float, so this is the single biggest lever on
   * frame time; 3.2 million is a little under a retina laptop screen.
   */
  static readonly PIXEL_BUDGET = 3_200_000;
  /** Draft keeps to a laptop screen's worth of pixels at 1x. */
  static readonly DRAFT_PIXEL_BUDGET = 1_800_000;

  private resize = () => {
    // Render at device resolution up to a budget, then scale down. A retina
    // canvas the size of a laptop screen sits just inside it; a tall pane or a
    // large monitor comes down to the same cost rather than crawling.
    const cw = Math.max(1, this.host.clientWidth), ch = Math.max(1, this.host.clientHeight);
    const budget = this.quality === 'final' ? Viewer.PIXEL_BUDGET : Viewer.DRAFT_PIXEL_BUDGET;
    const dpr = Math.min(window.devicePixelRatio, 2, Math.sqrt(budget / (cw * ch))) * this.renderScale * this.autoScale;
    const w = Math.max(1, Math.floor(cw * dpr));
    const h = Math.max(1, Math.floor(ch * dpr));
    this.ctx.canvas.width = w;
    this.ctx.canvas.height = h;
    this.camera.aspect = w / h;
    this.post.resize(w, h);
    this.dirty = true;
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const moving = this.controls.moving;
    this.controls.update();
    this.camera.update();
    if (!this.frameBind) return;
    if (this.bakeQueued) {
      this.bakeQueued = false;
      this.bakeOcclusion();
    }
    // nothing to draw when nothing has changed: the GPU idles and the page stays responsive
    if (!this.dirty && !moving) return;
    this.dirty = false;
    this.frameCount++;
    this.pace(moving);
    const { device } = this.ctx;

    const frame = new Float32Array(FRAME_SIZE / 4);
    frame.set(this.camera.viewProjection, 0);
    frame.set([...this.camera.position, this.exposure], 16);
    frame.set([this.envSpin, this.debugMode, (this.environment?.mips ?? 1) - 1, this.occlusion ? 1 : 0], 20);
    device.queue.writeBuffer(this.frameBuffer, 0, frame);

    const encoder = device.createCommandEncoder({ label: 'frame' });
    const pass = encoder.beginRenderPass(this.post.scenePass(this.background));
    pass.setBindGroup(0, this.frameBind);

    if (this.groups.length) {
      pass.setPipeline(this.prepassPipeline);
      for (const g of this.groups) {
        pass.setVertexBuffer(0, g.position);
        pass.setVertexBuffer(1, g.instance);
        pass.setIndexBuffer(g.index, 'uint32');
        pass.drawIndexed(g.indexCount, g.instanceCount);
      }
    }

    if (this.occlusion && this.groundBind) {
      pass.setPipeline(this.groundPipeline);
      pass.setBindGroup(1, this.groundBind);
      pass.setVertexBuffer(0, this.discPosition);
      pass.setIndexBuffer(this.discIndex, 'uint32');
      pass.drawIndexed(this.discCount);
    }

    if (this.groups.length && this.materialBind) {
      pass.setPipeline(this.pbrPipeline);
      this.groups.forEach((g, k) => {
        pass.setBindGroup(1, this.materialBind!, [k * MATERIAL_STRIDE]);
        pass.setVertexBuffer(0, g.position);
        pass.setVertexBuffer(1, g.normal);
        pass.setVertexBuffer(2, g.uv);
        pass.setVertexBuffer(3, g.wear);
        pass.setVertexBuffer(4, g.instance);
        pass.setVertexBuffer(5, g.enamel);
        pass.setIndexBuffer(g.index, 'uint32');
        pass.drawIndexed(g.indexCount, g.instanceCount);
      });
    }

    if (this.anchorCount && this.anchorPosition && this.anchorColour) {
      pass.setPipeline(this.anchorPipeline);
      pass.setVertexBuffer(0, this.anchorPosition);
      pass.setVertexBuffer(1, this.anchorColour);
      pass.draw(this.anchorCount);
    }
    pass.end();

    this.post.finish(encoder, this.ctx.context.getCurrentTexture().createView(), {
      bloom: this.bloom, raw: this.debugMode > 0,
    });
    device.queue.submit([encoder.finish()]);
  };

  /**
   * Time consecutive frames during interaction and move the internal scale to
   * hold 30 a second. Measured at the tick, which is the frame rate the user
   * feels: a slow GPU backs the ticks up just as surely as slow script would.
   */
  private pace(moving: boolean) {
    const now = performance.now();
    const gap = now - this.lastFrameAt;
    this.lastFrameAt = now;
    // only consecutive frames say anything; a gap after an idle spell does not
    if (!moving || gap > 250) return;
    this.frameMs = this.frameMs * 0.8 + gap * 0.2;
    // a step swaps a few hundred megabytes of targets, so at most a few a second
    if (now - this.lastScaleStep < 300) return;
    if (this.frameMs > 36 && this.autoScale > 0.5) {
      // step by how far over budget the frame is, so a very slow frame drops straight to the floor
      this.autoScale = Math.max(0.5, this.autoScale * Math.max(0.5, Math.sqrt(33 / this.frameMs)));
      this.frameMs = 16;
      this.lastScaleStep = now;
      this.resize();
    } else if (this.frameMs < 14 && this.autoScale < 1) {
      this.autoScale = Math.min(1, this.autoScale / 0.85);
      this.frameMs = 16;
      this.lastScaleStep = now;
      this.resize();
    }
  }

  private rebuildFrameBind() {
    const env = this.environment;
    if (!env) return;
    this.frameBind = this.ctx.device.createBindGroup({
      label: 'frame',
      layout: this.frameLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: env.specular.createView({ dimension: 'cube' }) },
        { binding: 2, resource: env.brdf.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: { buffer: this.occlusion?.lookup ?? this.dummyLookup } },
      ],
    });
  }

  /** Per-group material and occlusion slice, 96 bytes at a 256-byte stride. */
  private writeMaterials() {
    if (!this.materialBuffer) return;
    const data = new ArrayBuffer(Math.max(1, this.groups.length) * MATERIAL_STRIDE);
    const f32 = new Float32Array(data);
    const u32 = new Uint32Array(data);
    const bases = this.occlusionBases();
    this.groups.forEach((g, k) => {
      const m = metals[g.source.metal ?? ''] ?? this.metal;
      const f = finishes[g.source.finish ?? ''] ?? this.finish;
      const o = (k * MATERIAL_STRIDE) / 4;
      f32.set([...m.f0, f.roughness, f.anisotropy, f.hammer, f.patina, 1, ...patinaColour(m.name), 0], o);
      u32.set([bases[k], g.vertexCount, m.model === 'nacre' ? 1 : 0, 0], o + 12);
      f32.set([...(m.colour ?? [0, 0, 0]), m.orient ?? 0], o + 16);
      const e = enamels[g.source.enamel ?? ''];
      f32.set(e ? [...e.colour, e.opacity] : [0, 0, 0, 0], o + 20);
    });
    this.ctx.device.queue.writeBuffer(this.materialBuffer, 0, data);
  }

  /**
   * Visibility for every placed vertex, and a shadow for the table under them.
   * Runs on the GPU in a few tens of milliseconds, so it simply happens whenever
   * the scene or the light does.
   */
  private bakeOcclusion() {
    const previous = this.occlusion;
    const occ = bakeOcclusion(
      this.ctx,
      this.groups.map((g) => ({
        mesh: g.source.mesh, matrices: g.source.matrices,
        position: g.position, normal: g.normal, instance: g.instance, index: g.index,
      })),
      {
        env: this.envSamples ? { samples: this.envSamples, spin: this.envSpin } : undefined,
        // a quarter of the directions at half the resolution is a tenth of the
        // work, and soft shadows on a working model do not need more
        directions: this.quality === 'final' ? 256 : 64,
        depthSize: this.quality === 'final' ? 2048 : 1024,
      },
    );
    this.occlusion = occ;
    // a superseded bake stops at its next chunk; this one redraws as each chunk lands
    previous?.dispose();
    if (occ) occ.onProgress = () => { this.dirty = true; };
    this.rebuildFrameBind();
    this.writeMaterials();
    if (!occ) { this.groundBind = null; return; }

    const { device } = this.ctx;
    device.queue.writeBuffer(this.groundBuffer, 0, new Float32Array([
      ...occ.groundCentre, occ.groundRadius,
      ...this.background, 0,
      // a dark matte table: enough to pool a little light, not enough to compete
      0.04, 0.04, 0.043, 0,
    ]));
    this.groundBind = device.createBindGroup({
      label: 'ground',
      layout: this.groundLayout,
      entries: [
        { binding: 0, resource: { buffer: this.groundBuffer } },
        { binding: 1, resource: occ.ground.createView() },
      ],
    });
  }

  private clearOcclusion() {
    this.occlusion?.dispose();
    this.occlusion = null;
    this.groundBind = null;
    this.rebuildFrameBind();
  }
}

/** A unit disc in the XY plane, wound counter-clockwise seen from +Z. */
function unitDisc(segments: number) {
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions[(i + 1) * 3] = Math.cos(a);
    positions[(i + 1) * 3 + 1] = Math.sin(a);
  }
  const indices = new Uint32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = ((i + 1) % segments) + 1;
  }
  return { positions, indices };
}
