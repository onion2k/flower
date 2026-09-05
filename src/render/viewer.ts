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
import { Camera, Orbit, lookAt, multiply as multiplyMat, perspective } from '../gpu/camera';
import type { Mesh as PartMesh } from '../mesh/types';
import type { Anchor, PlateRelief } from '../parts/types';
import type { Box3, Vec3 } from '../geom/types';
import { invert, transformDirection, transformPoint } from '../geom/transform';
import { computeWear } from '../mesh/wear';
import { engraveCoords } from '../mesh/types';
import { ENGRAVING_PATTERNS, type Engraving, type Inscription } from '../parts/types';
import { CushionBake, CUSHION_SIZE } from './cushion';
import { ContactOcclusion } from './ao';
import { CanvasRasteriser, CELL, GlyphAtlas, layout as layoutGlyphs, transliterate, type GlyphKey } from './glyphs';
import { bakeEnvironment, filterCube, type EnvImage, type Environment, type EnvPreset, type EnvSamples } from './env';
import { enamels, finishes, metals, patinaColour, type Finish, type Metal } from './materials';
import { bakeOcclusion, orthoFromDirection, worldBounds, type Occlusion } from './occlusion';
import { PostChain, inverseTonemap, type Film } from './post';
import { ANCHOR_WGSL, GROUND_WGSL, PBR_WGSL, PREPASS_WGSL } from './shaders';

const BACKGROUND: [number, number, number] = [0.043, 0.047, 0.055];
/** The studio preset's mean radiance over the sphere; a loaded photograph is scaled to match it. */
const PRESET_MEAN_RADIANCE = 1.08;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const MATERIAL_STRIDE = 512;
/** Bytes of each material record that the shader reads. */
const MATERIAL_SIZE = 272;
const FRAME_SIZE = 272;
/** The reflection probe: face size and prefilter levels. */
const PROBE_SIZE = 256;
const PROBE_MIPS = 6;
const MAX_LIGHTS = 48;
/** Lights beyond this many cast no shadow; the first ones get a cube each. */
const MAX_LOCAL_SHADOWS = 32;
const LOCAL_SHADOW_SIZE = 160;
const LIGHTS_SIZE = 16 + MAX_LIGHTS * 32;

export type Quality = 'draft' | 'final';

export interface InstanceGroup {
  mesh: PartMesh;
  matrices: Float32Array;
  /** Per-group overrides, so a rosette can have silver leaves and gold studs. */
  metal?: string;
  finish?: string;
  /** Enamel colour on the vertices the mesh marks as enamelled. */
  enamel?: string;
  /** Chased relief, shaded per pixel on the caps. */
  relief?: PlateRelief;
  /** Metal of the wires along the veins of an enamelled face. */
  veinMetal?: string;
  /** Facets round a stone's pavilion. */
  pavilionFacets?: number;
  /** A pattern cut into the surface. */
  engraving?: Engraving;
  /** Lettering cut into the surface. */
  inscription?: Inscription;
  /** Radiance of a light, in sky units, overriding its material's. */
  glow?: number;
  /** A cut stone's facet planes, and its width. */
  gemPlanes?: Float32Array;
  gemSize?: number;
}

interface GpuGroup {
  source: InstanceGroup;
  position: GPUBuffer;
  normal: GPUBuffer;
  uv: GPUBuffer;
  wear: GPUBuffer;
  /** Per vertex: enamel 0 or 1, and which cap (+1 top, -1 bottom, 0 neither). */
  face: GPUBuffer;
  /** Per vertex: surface coordinates in millimetres, for engraving. */
  engrave: GPUBuffer;
  instance: GPUBuffer;
  /** One float per instance: 1 when it is selected. */
  selected: GPUBuffer;
  index: GPUBuffer;
  indexCount: number;
  instanceCount: number;
  vertexCount: number;
}

/** Enamel and cap flags, interleaved as one vec2 per vertex. */
function faceOf(mesh: PartMesh): Float32Array {
  const n = mesh.positions.length / 3;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = mesh.enamel?.[i] ?? 0;
    out[i * 2 + 1] = mesh.cap?.[i] ?? 0;
  }
  return out;
}

/**
 * Where to put a glowing part's lights: a few points down its longest axis,
 * each the centre of the vertices in its slice, with that slice's share of
 * the surface and a radius that fits the part's cross-section.
 */
interface EmitterSample { centre: [number, number, number]; radius: number; area: number }
const emitterCache = new WeakMap<PartMesh, EmitterSample[]>();
export function emitterSamples(mesh: PartMesh): EmitterSample[] {
  let out = emitterCache.get(mesh);
  if (out) return out;
  const p = mesh.positions;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
  }
  const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const axis = extent.indexOf(Math.max(...extent));
  const across = Math.max(...extent.filter((_, k) => k !== axis));
  // a sample every 8 mm or so, up to six; a diode is one
  const slices = Math.max(1, Math.min(6, Math.round(extent[axis] / 8)));
  let area = 0;
  const idx = mesh.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    area += 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
  }
  out = [];
  for (let sIdx = 0; sIdx < slices; sIdx++) {
    const lo = min[axis] + (extent[axis] * sIdx) / slices;
    const hi = min[axis] + (extent[axis] * (sIdx + 1)) / slices;
    const sum = [0, 0, 0]; let n = 0;
    for (let i = 0; i < p.length; i += 3) {
      const t = p[i + axis];
      if (t < lo || (t > hi && sIdx < slices - 1)) continue;
      sum[0] += p[i]; sum[1] += p[i + 1]; sum[2] += p[i + 2]; n++;
    }
    if (n === 0) continue;
    out.push({
      centre: [sum[0] / n, sum[1] / n, sum[2] / n],
      radius: Math.max(across / 2, 0.2),
      area: area / slices,
    });
  }
  emitterCache.set(mesh, out);
  return out;
}

/** The middle of a mesh's engraving coordinates: where lettering goes unless told otherwise. */
function centreOf(mesh: PartMesh): [number, number] {
  const c = engraveCoords(mesh);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < c.length; i += 2) {
    minX = Math.min(minX, c[i]); maxX = Math.max(maxX, c[i]);
    minY = Math.min(minY, c[i + 1]); maxY = Math.max(maxY, c[i + 1]);
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

/** Half the larger extent of a mesh's engraving coordinates, once per mesh: a radius for a ray pattern. */
const extentCache = new WeakMap<PartMesh, number>();
function extentOf(mesh: PartMesh): number {
  let e = extentCache.get(mesh);
  if (e === undefined) {
    const c = engraveCoords(mesh);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < c.length; i += 2) {
      minX = Math.min(minX, c[i]); maxX = Math.max(maxX, c[i]);
      minY = Math.min(minY, c[i + 1]); maxY = Math.max(maxY, c[i + 1]);
    }
    e = Math.max(maxX - minX, maxY - minY, 1e-3) / 2;
    extentCache.set(mesh, e);
  }
  return e;
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

export type TableName = 'matte' | 'oak' | 'walnut' | 'slate' | 'linen' | 'velvet' | 'silk';
export const tableNames: TableName[] = ['matte', 'oak', 'walnut', 'slate', 'linen', 'velvet', 'silk'];

/**
 * The ground shader's surfaces: which one, how glossy, the size of its
 * pattern in mm, and for a cloth how far it sags under the piece, in mm.
 */
const TABLES: Record<TableName, { kind: number; roughness: number; scale: number; cushion?: { puff: number; slope: number; size: number } }> = {
  matte: { kind: 0, roughness: 0.9, scale: 1 },
  oak: { kind: 1, roughness: 0.35, scale: 60 },
  walnut: { kind: 2, roughness: 0.35, scale: 75 },
  slate: { kind: 3, roughness: 0.55, scale: 90 },
  linen: { kind: 4, roughness: 0.95, scale: 1.8 },
  // the cloths are cushions: a plump pad the piece sinks into. Velvet is
  // thick and holds its shape; silk is thin over its stuffing and drapes wider
  // slope is the collar's: how steeply the cloth climbs back from whatever
  // touches it. The broad sag comes from how much the piece covers
  velvet: { kind: 5, roughness: 0.8, scale: 1.2, cushion: { puff: 6, slope: 1.8, size: 0.64 } },
  silk: { kind: 6, roughness: 0.3, scale: 0.4, cushion: { puff: 5, slope: 1.3, size: 0.64 } },
};

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
  private table: TableName = 'matte';

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
  /** The key light: direction (world, toward the light), strength, linear colour. */
  private keyDir: Vec3 = [0.5, -0.6, 0.62];
  private keyStrength = 0;
  private keySize = 0;
  private keyColour: Vec3 = [1, 1, 1];
  private envStrength = 1;
  /** Depth of field: strength (0 off) and focus as a multiple of the orbit distance, so the target is what's sharp. */
  private dof = 0;
  private focusScale = 1;

  private metal: Metal = metals.gold;
  private finish: Finish = finishes.polished;

  private groups: GpuGroup[] = [];
  private materialBuffer: GPUBuffer | null = null;
  private materialBind: GPUBindGroup | null = null;
  /** The piece's own lights: the glowing parts, sampled as spheres. */
  private lightsBuffer: GPUBuffer;
  private glowScale = 1;
  /** Each light's shadow: a cube of depth per light, one layer of six faces each. */
  private localShadowMap: GPUTexture;
  private localShadowView: GPUTextureView;
  private dummyLocalShadowView: GPUTextureView;
  private faceFrames: GPUBuffer[] = [];
  private faceBinds: GPUBindGroup[] = [];
  private localShadowDirty = false;
  /** The reflection probe: the lit piece and table from their centre, drawn then filtered like the sky. */
  private probeRaw: GPUTexture;
  private probeBackground: GPUTexture;
  private probeSpecular: GPUTexture;
  private probeDepth: GPUTexture;
  private probeView: GPUTextureView;
  private dummyProbeView: GPUTextureView;
  private probeFrames: GPUBuffer[] = [];
  private probeBinds: GPUBindGroup[] = [];
  private probeDirty = true;
  private probeReady = false;
  private prepassProbePipeline: GPURenderPipeline;
  private pbrProbePipeline: GPURenderPipeline;
  private groundProbePipeline: GPURenderPipeline;
  private groundDepthPipeline: GPURenderPipeline;
  /** The lights as last written: where each is, and which group it belongs to (not shadowed by itself). */
  private lightList: Array<{ position: [number, number, number]; group: number }> = [];
  /** Glyphs for engraved lettering: the atlas, its texture, and each group's placed glyphs. */
  private atlas: GlyphAtlas | null = null;
  private atlasTexture: GPUTexture | null = null;
  private glyphBuffer: GPUBuffer | null = null;
  private glyphRanges: Array<{ base: number; count: number }> = [];

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
  /**
   * What the display itself can do, measured on the ticks we draw nothing on.
   * Everything about pacing is judged against this rather than a number picked
   * in advance.
   */
  private tickMs = 16.7;
  private lastTickAt = 0;
  /** Rewritten in place each frame rather than allocated. */
  private frameData = new Float32Array(FRAME_SIZE / 4);
  /** Ask for a frame on the next tick. */
  requestRender() { this.dirty = true; }
  /** Called after every drawn frame, with the camera settled: for overlays laid over the canvas. */
  onFrame: (() => void) | null = null;

  /** A world point in CSS pixels over the canvas, or null when it is behind the camera. */
  project(p: Vec3): [number, number] | null {
    const m = this.camera.viewProjection;
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0) return null;
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
    const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    return [((x + 1) / 2) * this.host.clientWidth, ((1 - y) / 2) * this.host.clientHeight];
  }
  private renderScale = 1;

  private occlusion: Occlusion | null = null;
  private groundBuffer: GPUBuffer;
  private groundBind: GPUBindGroup | null = null;
  private discPosition: GPUBuffer;
  private discIndex: GPUBuffer;
  private discCount: number;

  /** The key light's shadow map: its own depth-only view of the scene, redrawn whenever the scene or the key moves. */
  private shadowMap: GPUTexture;
  private shadowView: GPUTextureView;
  /** Stands in for the shadow map in the shadow pass's own bind group: a pass may not read the texture it is drawing. */
  private dummyShadowView: GPUTextureView;
  private shadowSampler: GPUSampler;
  private shadowPipeline: GPURenderPipeline;
  /** The frame uniform as the key sees it: only viewProj differs. */
  private shadowFrameBuffer: GPUBuffer;
  private cushion: CushionBake;
  private cushionDepth: GPUTexture;
  private cushionDepthView: GPUTextureView;
  private cushionFrameBuffer: GPUBuffer;
  private cushionFrameBind: GPUBindGroup | null = null;
  private cushionDirty = true;
  private shadowFrameBind: GPUBindGroup | null = null;
  private lightViewProj = new Float32Array(16);
  private sceneCentre: Vec3 = [0, 0, 0];
  private sceneRadius = 1;
  private shadowDirty = true;
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
    this.ao = new ContactOcclusion(ctx, this.post.depthFormat);
    const white = device.createTexture({ label: 'no contact occlusion', size: [1, 1], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: white }, new Uint8Array([255]), { bytesPerRow: 1 }, [1, 1]);
    this.dummyAoView = white.createView();
    // the scene is linear HDR until the composite, so clear to what tonemaps to the page colour
    this.background = inverseTonemap(BACKGROUND, this.film.tonemap);

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
        { binding: 5, visibility: both, texture: { sampleType: 'depth' } },
        { binding: 6, visibility: both, sampler: { type: 'comparison' } },
        { binding: 7, visibility: both, buffer: { type: 'uniform' } },
        { binding: 8, visibility: both, texture: { sampleType: 'depth', viewDimension: '2d-array' } },
        { binding: 9, visibility: both, texture: { viewDimension: 'cube' } },
        { binding: 10, visibility: both, texture: {} },
      ],
    });
    this.materialLayout = device.createBindGroupLayout({
      label: 'material',
      entries: [
        { binding: 0, visibility: both, buffer: { type: 'uniform', hasDynamicOffset: true } },
        // lettering: every placed glyph in the scene, and the atlas they are read from
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        // every stone's facet planes, for tracing light through them
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.groundLayout = device.createBindGroupLayout({
      label: 'ground',
      entries: [
        { binding: 0, visibility: both, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        // the cushion's height, read by the vertex stage to shape the mesh and by the fragment for its normal
        { binding: 2, visibility: both, texture: { sampleType: 'unfilterable-float' } },
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
    const prepassPipelineDesc = (ms: GPUMultisampleState): GPURenderPipelineDescriptor => ({
      label: 'prepass',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout] }),
      vertex: {
        module: prepass, entryPoint: 'vsMain',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }, instanceLayout],
      },
      fragment: { module: prepass, entryPoint: 'fsMain', targets: [{ format: this.post.colourFormat, writeMask: 0 }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depth(true),
      multisample: ms,
    });
    this.prepassPipeline = device.createRenderPipeline(prepassPipelineDesc(multisample));
    this.prepassProbePipeline = device.createRenderPipeline({ ...prepassPipelineDesc({ count: 1 }), label: 'prepass probe' });

    // the key's shadow: the prepass vertex shader with the key's own
    // viewProj, into a depth-only target; there is no fragment stage at all
    const SHADOW_SIZE = 2048;
    this.shadowMap = device.createTexture({
      size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'key shadow',
    });
    this.shadowView = this.shadowMap.createView();
    this.dummyShadowView = device.createTexture({
      size: [1, 1], format: 'depth24plus', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT, label: 'no shadow',
    }).createView();
    this.shadowSampler = device.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.shadowPipeline = device.createRenderPipeline({
      label: 'key shadow',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout] }),
      vertex: {
        module: prepass, entryPoint: 'vsMain',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }, instanceLayout],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.shadowFrameBuffer = device.createBuffer({ label: 'shadow frame', size: FRAME_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // the piece seen straight down, for the cushion to take its shape from
    this.cushionDepth = device.createTexture({
      size: [CUSHION_SIZE, CUSHION_SIZE], format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING, label: 'cushion depth',
    });
    this.cushionDepthView = this.cushionDepth.createView();
    this.cushionFrameBuffer = device.createBuffer({ label: 'cushion frame', size: FRAME_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.cushion = new CushionBake(ctx);
    this.localShadowMap = device.createTexture({
      label: 'local shadows', size: [LOCAL_SHADOW_SIZE, LOCAL_SHADOW_SIZE, 6 * MAX_LOCAL_SHADOWS], format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.localShadowView = this.localShadowMap.createView({ dimension: '2d-array' });
    // the depth-only passes bind the frame group too, and may not see the
    // array they are drawing into: they get an empty stand-in
    this.dummyLocalShadowView = device.createTexture({
      size: [1, 1, 6], format: 'depth24plus', usage: GPUTextureUsage.TEXTURE_BINDING, label: 'no local shadows',
    }).createView({ dimension: '2d-array' });
    for (let i = 0; i < 6 * MAX_LOCAL_SHADOWS; i++) {
      this.faceFrames.push(device.createBuffer({ label: `light face ${i}`, size: FRAME_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    }
    const probeCube = (label: string, mips: number) => device.createTexture({
      label, size: [PROBE_SIZE, PROBE_SIZE, 6], format: 'rgba16float', mipLevelCount: mips,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.probeRaw = probeCube('probe raw', 1);
    this.probeBackground = probeCube('probe background', Math.floor(Math.log2(PROBE_SIZE)) + 1);
    this.probeSpecular = probeCube('probe specular', PROBE_MIPS);
    this.probeView = this.probeSpecular.createView({ dimension: 'cube' });
    this.probeDepth = device.createTexture({
      label: 'probe depth', size: [PROBE_SIZE, PROBE_SIZE], format: this.post.depthFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.dummyProbeView = device.createTexture({
      label: 'no probe', size: [1, 1, 6], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING,
    }).createView({ dimension: 'cube' });
    for (let i = 0; i < 6; i++) {
      this.probeFrames.push(device.createBuffer({ label: `probe face ${i}`, size: FRAME_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    }

    const pbr = shader(device, PBR_WGSL, 'pbr');
    const pbrPipelineDesc = (ms: GPUMultisampleState): GPURenderPipelineDescriptor => ({
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
          { arrayStride: 8, attributes: [{ shaderLocation: 8, offset: 0, format: 'float32x2' }] },
          { arrayStride: 4, stepMode: 'instance', attributes: [{ shaderLocation: 9, offset: 0, format: 'float32' }] },
          { arrayStride: 8, attributes: [{ shaderLocation: 10, offset: 0, format: 'float32x2' }] },
        ],
      },
      fragment: { module: pbr, entryPoint: 'fsMain', targets: [target] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      // the prepass has written depth; only the visible surface passes here
      depthStencil: { format: this.post.depthFormat, depthWriteEnabled: false, depthCompare: 'less-equal' },
      multisample: ms,
    });
    this.pbrPipeline = device.createRenderPipeline(pbrPipelineDesc(multisample));
    this.pbrProbePipeline = device.createRenderPipeline({ ...pbrPipelineDesc({ count: 1 }), label: 'pbr probe' });

    const ground = shader(device, GROUND_WGSL, 'ground');
    const groundPipelineDesc = (ms: GPUMultisampleState): GPURenderPipelineDescriptor => ({
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
      multisample: ms,
    });
    this.groundPipeline = device.createRenderPipeline(groundPipelineDesc(multisample));
    this.groundProbePipeline = device.createRenderPipeline({ ...groundPipelineDesc({ count: 1 }), label: 'ground probe' });
    // the table's depth alone, for the contact occlusion: its own vertex
    // shader, since a cushion is not flat, and no fragment stage
    this.groundDepthPipeline = device.createRenderPipeline({
      label: 'ground depth',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout, this.groundLayout] }),
      vertex: {
        module: ground, entryPoint: 'vsMain',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
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
    this.lightsBuffer = device.createBuffer({ label: 'lights', size: LIGHTS_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.lightsBuffer, 0, new Uint32Array([0, 0, 0, 0]));
    this.dummyLookup = emptyBuffer(device, 8, GPUBufferUsage.STORAGE, 'no occlusion');
    this.groundBuffer = device.createBuffer({ label: 'ground', size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    // a grid rather than a fan, so a cushion has vertices to rise through
    const disc = unitGrid(256);
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

  /** The current preset, so a moving sun knows whether it has a sky to move. */
  private preset: EnvPreset | 'image' = 'studio';
  private sunRebake = 0;

  /** A loaded photograph, once one has been given; 'image' in the picker then bakes from it. */
  private envImage: EnvImage | null = null;

  /**
   * Take a photographed environment. The image is brought to the presets'
   * scale by its mean radiance, so exposure means the same under it as under
   * the studio, and any further difference is the slider's to make.
   */
  setEnvironmentImage(img: { width: number; height: number; data: Float32Array }, meanRadiance: number) {
    this.envImage = { ...img, scale: meanRadiance > 0 ? PRESET_MEAN_RADIANCE / meanRadiance : 1 };
    this.setEnvironment('image');
  }

  setEnvironment(preset: EnvPreset | 'image') {
    if (preset === 'image' && !this.envImage) return this.environment!;
    this.preset = preset;
    this.invalidateProbe();
    const previous = this.environment;
    const env = bakeEnvironment(this.ctx, preset === 'image' ? 'studio' : preset, {
      sun: this.keyDir, sunSize: this.keySize, image: preset === 'image' ? this.envImage! : undefined,
    });
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

  /** How much of the small stuff is drawn: polish swirls and smudges on metal, dust on cloth. */
  private detail = 0.6;
  setDetail(v: number) { this.detail = v; this.invalidateProbe(); }

  /** The film look: which tonemap, and how much vignette, grain and fringe. */
  film: Film = { tonemap: 1, vignette: 0.3, grain: 0.25, fringe: 0.3 };
  private backgroundSrgb: Vec3 = BACKGROUND;
  setFilm(film: Partial<Film>) {
    this.film = { ...this.film, ...film };
    // the page colour behind the piece is painted in radiance the film maps
    // back to it, so a change of film moves it
    this.setBackground(this.backgroundSrgb);
    this.dirty = true;
  }

  /** Scale every light in the piece, tubes and diodes alike: 0 puts them out. */
  setGlow(v: number) { this.glowScale = v; this.writeMaterials(); this.dirty = true; }

  /**
   * The key light by where it hangs: elevation above the table and azimuth
   * round it, in radians; strength as a multiple of the environment's own
   * brightness; warmth from -1 (cool, blue-white) through 0 (white) to 1
   * (warm, amber). It sits over the baked environment rather than in it,
   * so the occlusion bake does not follow it: its shadowing is the ambient
   * occlusion's, soft, not a cast shadow.
   */
  setKeyLight(opts: { elevation: number; azimuth: number; strength: number; warmth: number; size?: number }) {
    this.invalidateProbe();
    const ce = Math.cos(opts.elevation);
    this.keyDir = [Math.cos(opts.azimuth) * ce, Math.sin(opts.azimuth) * ce, Math.sin(opts.elevation)];
    this.keyStrength = opts.strength;
    this.keySize = Math.max(0, opts.size ?? 0);
    const w = Math.max(-1, Math.min(1, opts.warmth));
    this.keyColour = w >= 0
      ? [1, 1 - 0.28 * w, 1 - 0.62 * w]
      : [1 + 0.45 * w, 1 + 0.2 * w, 1];
    this.shadowDirty = true;
    this.dirty = true;
    // in daylight the key *is* the sun: the sky is re-baked round it once
    // the slider has settled, so its aureole, its disc in a polished face
    // and the shadow all agree on where it is
    if (this.preset === 'daylight') {
      clearTimeout(this.sunRebake);
      this.sunRebake = window.setTimeout(() => this.setEnvironment('daylight'), 180);
    }
  }

  /** Depth of field: 0 off, 1 a lens wide open; focus as a multiple of the distance to the orbit target, 1 being the target itself. */
  setDepthOfField(strength: number, focusScale: number) { this.dof = strength; this.focusScale = focusScale; this.dirty = true; }

  /** How much of the baked environment lights the piece: 1 as baked, 0 none — turn it down to let the key light carry the scene. */
  setEnvStrength(v: number) { this.envStrength = v; this.invalidateProbe(); }

  /** What the piece stands on. `matte` is a cloth in the page's colour; the rest are their own material. */
  setTable(name: TableName) {
    this.invalidateProbe();
    this.table = name;
    this.writeTable();
    this.dirty = true;
  }

  private writeTable() {
    const t = TABLES[this.table];
    const c = t.cushion;
    this.ctx.device.queue.writeBuffer(this.groundBuffer, 48, new Float32Array([
      t.kind, t.roughness, t.scale, c ? c.puff : 0,
      c ? c.size : 1, c ? c.slope : 0, 0, 0,
    ]));
    this.cushionDirty = true;
    this.dirty = true;
  }

  /** The canvas's own colour behind the piece, as sRGB 0..1. The ground disc fades into it. */
  setBackground(rgb: Vec3) {
    this.backgroundSrgb = rgb;
    this.background = inverseTonemap(rgb, this.film.tonemap);
    this.dirty = true;
    if (this.occlusion) {
      this.ctx.device.queue.writeBuffer(this.groundBuffer, 16, new Float32Array([...this.background, 0]));
    }
  }
  setExposure(v: number) { this.exposure = v; this.dirty = true; }

  /** Fraction of device resolution to render at, below the pixel budget. */
  setRenderScale(v: number) {
    this.renderScale = Math.min(Math.max(v, 0.25), 1);
    this.resize();
  }

  setEnvSpin(radians: number) {
    this.envSpin = radians;
    this.invalidateProbe();
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
    if (groups.length) {
      const b = worldBounds(groups.map((g) => ({ mesh: g.mesh, matrices: g.matrices })));
      this.sceneCentre = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      this.sceneTop = b.max[2];
      // the table under the piece is in the shadow's view too, so it reaches out to the occlusion bake's ground radius
      this.sceneRadius = Math.max(1e-3, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2) * 1.9;
    }
    this.shadowDirty = true;
    for (const g of this.groups) {
      for (const b of [g.position, g.normal, g.uv, g.wear, g.face, g.engrave, g.instance, g.selected, g.index]) b.destroy();
    }
    const shared = GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE;
    this.groups = groups.map((g) => ({
      source: g,
      position: bufferFrom(device, g.mesh.positions, shared, 'positions'),
      normal: bufferFrom(device, g.mesh.normals, shared, 'normals'),
      uv: bufferFrom(device, g.mesh.uvs, GPUBufferUsage.VERTEX, 'uvs'),
      wear: bufferFrom(device, wearOf(g.mesh), GPUBufferUsage.VERTEX, 'wear'),
      face: bufferFrom(device, faceOf(g.mesh), GPUBufferUsage.VERTEX, 'face'),
      engrave: bufferFrom(device, engraveCoords(g.mesh), GPUBufferUsage.VERTEX, 'engrave'),
      instance: bufferFrom(device, g.matrices, shared, 'instances'),
      selected: emptyBuffer(device, (g.matrices.length / 16) * 4, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, 'selected'),
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
    this.layoutLettering();
    this.packGemPlanes();
    this.materialBind = device.createBindGroup({
      layout: this.materialLayout,
      entries: [
        { binding: 0, resource: { buffer: this.materialBuffer, size: MATERIAL_SIZE } },
        { binding: 1, resource: { buffer: this.glyphBuffer! } },
        { binding: 2, resource: this.atlasTexture!.createView() },
        { binding: 3, resource: { buffer: this.gemPlaneBuffer! } },
      ],
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

  private selecting = false;

  /**
   * Mark instances as selected, one array per group in the order they were
   * given to setInstanced, or nothing to clear. With any selection on, the
   * unselected instances are dimmed.
   */
  setSelection(selected: Array<Float32Array<ArrayBuffer>> | null) {
    const { device } = this.ctx;
    let any = false;
    this.groups.forEach((g, k) => {
      const flags: Float32Array<ArrayBuffer> = selected?.[k] ?? new Float32Array(g.instanceCount);
      for (let i = 0; i < flags.length && !any; i++) if (flags[i]) any = true;
      device.queue.writeBuffer(g.selected, 0, flags);
    });
    this.selecting = any;
    this.dirty = true;
  }

  /**
   * The instance under a canvas pixel, or null. A ray is cast on the CPU
   * against each placement's box and then its triangles, in the part's own
   * space so the mesh is tested untransformed.
   */
  pick(x: number, y: number): { group: number; instance: number } | null {
    const canvas = this.ctx.canvas;
    const rect = canvas.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((y - rect.top) / rect.height) * 2;
    this.camera.update();
    const inv = invert(this.camera.viewProjection);
    if (!inv) return null;
    const near = unproject(inv, nx, ny, 0);
    const far = unproject(inv, nx, ny, 1);
    if (!near || !far) return null;
    const dir: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];

    let best = Infinity;
    let hit: { group: number; instance: number } | null = null;
    this.groups.forEach((g, k) => {
      const mesh = g.source.mesh;
      const box = boundsOf(mesh);
      for (let i = 0; i < g.instanceCount; i++) {
        const m = g.source.matrices.subarray(i * 16, i * 16 + 16);
        const local = invert(m);
        if (!local) continue;
        const o = transformPoint(local, near);
        const d = transformDirection(local, dir);
        const t = raySlab(o, d, box);
        if (t === null || t > best) continue;
        const th = rayMesh(o, d, mesh, best);
        if (th !== null && th < best) { best = th; hit = { group: k, instance: i }; }
      }
    });
    return hit;
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
   * frame time. Final is meant to fill a 2x display: anything short of device
   * resolution is upscaled, and an upscaled edge stair-steps however well it
   * was multisampled. Frames are drawn on demand, so at rest the cost is one
   * frame; while the camera moves the adaptive scale takes over.
   */
  static readonly PIXEL_BUDGET = 12_000_000;
  /** Draft keeps to a laptop screen's worth of pixels, and never less than 1x. */
  static readonly DRAFT_PIXEL_BUDGET = 1_800_000;

  private resize = () => {
    // Render at device resolution up to a budget, then scale down. A retina
    // canvas the size of a laptop screen sits just inside it; a tall pane or a
    // large monitor comes down to the same cost rather than crawling.
    const cw = Math.max(1, this.host.clientWidth), ch = Math.max(1, this.host.clientHeight);
    const budget = this.quality === 'final' ? Viewer.PIXEL_BUDGET : Viewer.DRAFT_PIXEL_BUDGET;
    // never below one pixel per CSS pixel at rest: under that, edges stair-step
    // however well they were multisampled, because each rendered pixel is
    // stretched over more than one on screen
    const budgeted = Math.max(Math.min(window.devicePixelRatio, Math.sqrt(budget / (cw * ch))), 1);
    const dpr = Math.min(budgeted, 2) * this.renderScale * this.autoScale;
    const w = Math.max(1, Math.floor(cw * dpr));
    const h = Math.max(1, Math.floor(ch * dpr));
    this.ctx.canvas.width = w;
    this.ctx.canvas.height = h;
    this.camera.aspect = w / h;
    this.post.resize(w, h);
    this.ao.resize(w, h);
    // the occlusion texture is new: the frame group must point at it
    this.rebuildFrameBind();
    this.dirty = true;
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const tickNow = performance.now();
    const sinceTick = tickNow - this.lastTickAt;
    this.lastTickAt = tickNow;
    const moving = this.controls.moving;
    this.controls.update();
    this.camera.update();
    if (!this.frameBind) return;
    if (this.bakeQueued) {
      this.bakeQueued = false;
      this.bakeOcclusion();
    }
    // nothing to draw when nothing has changed: the GPU idles and the page stays responsive
    if (!this.dirty && !moving) {
      // A tick we spend nothing on is the display's own cadence, and it costs
      // nothing to measure. It is the only honest yardstick for the pacing
      // below: a frame gap can never be shorter than the screen's own.
      if (sinceTick > 1 && sinceTick < 250) this.tickMs = this.tickMs * 0.9 + sinceTick * 0.1;
      return;
    }
    this.dirty = false;
    this.frameCount++;
    this.pace(moving);
    const { device } = this.ctx;

    const frame = this.frameData;
    frame.set(this.camera.viewProjection, 0);
    frame.set(this.camera.position, 16);
    frame[19] = this.exposure;
    frame[20] = this.envSpin;
    frame[21] = this.debugMode;
    frame[22] = (this.environment?.mips ?? 1) - 1;
    frame[23] = this.occlusion ? 1 : 0;
    frame[24] = this.selecting ? 1 : 0;
    frame.set(this.keyDir, 28);
    frame[31] = this.keyStrength;
    frame.set(this.keyColour, 32);
    frame[35] = this.envStrength;
    // the key's view: pulled back 2r along its own direction, 4r deep
    const dir: [number, number, number] = [this.keyDir[0], this.keyDir[1], this.keyDir[2]];
    orthoFromDirection(this.lightViewProj, dir, this.sceneCentre, this.sceneRadius);
    frame.set(this.lightViewProj, 36);
    const texel = (2 * this.sceneRadius) / 2048;
    frame[52] = texel * 2.5;
    frame[53] = 1.5 / 2048;
    frame[54] = this.keyStrength > 0 && this.groups.length ? 1 : 0;
    frame[55] = this.keySize;
    // the probe: just over the piece, where nothing is in the way, reaching
    // out to take the table in
    frame.set(this.probeCentre(), 56);
    frame[59] = this.sceneRadius * 2.2;
    frame[60] = this.probeReady && this.groups.length ? 1 : 0;
    frame[61] = PROBE_MIPS - 1;
    frame[62] = this.detail;
    frame[64] = this.ctx.canvas.width;
    frame[65] = this.ctx.canvas.height;
    frame[66] = this.contact > 0 && this.groups.length ? 1 : 0;
    device.queue.writeBuffer(this.frameBuffer, 0, frame);

    const encoder = device.createCommandEncoder({ label: 'frame' });

    if (this.shadowDirty && this.groups.length && this.shadowFrameBind) {
      this.shadowDirty = false;
      // the same frame, seen from the key: only the camera differs
      const lf = new Float32Array(frame);
      lf.set(this.lightViewProj, 0);
      device.queue.writeBuffer(this.shadowFrameBuffer, 0, lf);
      const shadowPass = encoder.beginRenderPass({
        label: 'key shadow',
        colorAttachments: [],
        depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      shadowPass.setPipeline(this.shadowPipeline);
      shadowPass.setBindGroup(0, this.shadowFrameBind);
      for (const g of this.groups) {
        shadowPass.setVertexBuffer(0, g.position);
        shadowPass.setVertexBuffer(1, g.instance);
        shadowPass.setIndexBuffer(g.index, 'uint32');
        shadowPass.drawIndexed(g.indexCount, g.instanceCount);
      }
      shadowPass.end();
    }
    if (this.localShadowDirty && this.lightList.length && this.faceBinds.length) {
      this.localShadowDirty = false;
      this.bakeLocalShadows(encoder, frame);
    }

    const cushionShape = TABLES[this.table].cushion;
    if (this.cushionDirty && cushionShape && this.groups.length && this.occlusion && this.cushionFrameBind) {
      this.cushionDirty = false;
      // the piece from straight above, over the ground disc
      const cf = new Float32Array(frame);
      const down = new Float32Array(16);
      orthoFromDirection(down, [0, 0, 1], this.occlusion.groundCentre, this.occlusion.groundRadius);
      cf.set(down, 0);
      device.queue.writeBuffer(this.cushionFrameBuffer, 0, cf);
      const downPass = encoder.beginRenderPass({
        label: 'cushion depth',
        colorAttachments: [],
        depthStencilAttachment: { view: this.cushionDepthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      downPass.setPipeline(this.shadowPipeline);
      downPass.setBindGroup(0, this.cushionFrameBind);
      for (const g of this.groups) {
        downPass.setVertexBuffer(0, g.position);
        downPass.setVertexBuffer(1, g.instance);
        downPass.setIndexBuffer(g.index, 'uint32');
        downPass.drawIndexed(g.indexCount, g.instanceCount);
      }
      downPass.end();
      this.cushion.bake(encoder, this.cushionDepthView, this.occlusion.groundCentre, this.occlusion.groundRadius, cushionShape);
    }

    if (this.probeDirty && this.groups.length && this.occlusion && this.probeBinds.length) {
      this.probeDirty = false;
      this.bakeProbe(encoder, frame);
      // the probe is filtered later in this same encoder; the frame that
      // follows reads it, and the bind group already points at it
      this.probeReady = true;
      frame[60] = 1;
      device.queue.writeBuffer(this.frameBuffer, 0, frame);
    }

    if (this.contact > 0 && this.groups.length && this.ao.depthView) {
      // the piece's depth alone, for the contact occlusion
      const dp = encoder.beginRenderPass({
        label: 'contact depth', colorAttachments: [],
        depthStencilAttachment: { view: this.ao.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      dp.setPipeline(this.shadowPipeline);
      dp.setBindGroup(0, this.frameBind!);
      for (const g of this.groups) {
        dp.setVertexBuffer(0, g.position);
        dp.setVertexBuffer(1, g.instance);
        dp.setIndexBuffer(g.index, 'uint32');
        dp.drawIndexed(g.indexCount, g.instanceCount);
      }
      if (this.occlusion && this.groundBind) {
        dp.setPipeline(this.groundDepthPipeline);
        dp.setBindGroup(1, this.groundBind);
        dp.setVertexBuffer(0, this.discPosition);
        dp.setIndexBuffer(this.discIndex, 'uint32');
        dp.drawIndexed(this.discCount);
      }
      dp.end();
      this.ao.run(encoder, { fovY: (this.camera.fov * Math.PI) / 180, aspect: this.camera.aspect, near: this.camera.near, far: this.camera.far });
    }

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
        pass.setVertexBuffer(5, g.face);
        pass.setVertexBuffer(7, g.engrave);
        pass.setVertexBuffer(6, g.selected);
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
      bloom: this.bloom, raw: this.debugMode > 0, film: this.film,
      focus: this.controls.distance * this.focusScale, dof: this.dof, subject: this.controls.distance,
    });
    device.queue.submit([encoder.finish()]);
    this.onFrame?.();
  };

  /**
   * Time consecutive frames during interaction and move the internal scale to
   * keep up with the display.
   *
   * What counts as fast enough has to be the display's own cadence, not a
   * number chosen in advance. A frame gap is floored by the screen: on a sixty
   * hertz panel nothing is ever quicker than sixteen milliseconds, so a scale
   * that waits for fourteen before stepping back up can only ever fall, and
   * one slow moment leaves the piece soft for the rest of the session. Both
   * thresholds are therefore multiples of what the idle ticks report.
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
    const missing = this.tickMs * 1.5 + 6;
    const keepingUp = this.tickMs * 1.2;
    if (this.frameMs > missing && this.autoScale > 0.5) {
      // step by how far over budget the frame is, so a very slow frame drops straight to the floor
      this.autoScale = Math.max(0.5, this.autoScale * Math.max(0.5, Math.sqrt(missing / this.frameMs)));
      this.frameMs = this.tickMs;
      this.lastScaleStep = now;
      this.resize();
    } else if (this.frameMs < keepingUp && this.autoScale < 1) {
      this.autoScale = Math.min(1, this.autoScale / 0.85);
      this.frameMs = this.tickMs;
      this.lastScaleStep = now;
      this.resize();
    }
  }

  private rebuildFrameBind() {
    const env = this.environment;
    if (!env) return;
    const entries = (buffer: GPUBuffer, shadow: GPUTextureView, local = this.localShadowView, probe = this.probeView, ao = this.ao.view ?? this.dummyAoView): GPUBindGroupEntry[] => [
      { binding: 0, resource: { buffer } },
      { binding: 1, resource: env.specular.createView({ dimension: 'cube' }) },
      { binding: 2, resource: env.brdf.createView() },
      { binding: 3, resource: this.sampler },
      { binding: 4, resource: { buffer: this.occlusion?.lookup ?? this.dummyLookup } },
      { binding: 5, resource: shadow },
      { binding: 6, resource: this.shadowSampler },
      { binding: 7, resource: { buffer: this.lightsBuffer } },
      { binding: 8, resource: local },
      { binding: 9, resource: probe },
      { binding: 10, resource: ao },
    ];
    this.frameBind = this.ctx.device.createBindGroup({ label: 'frame', layout: this.frameLayout, entries: entries(this.frameBuffer, this.shadowView) });
    this.shadowFrameBind = this.ctx.device.createBindGroup({ label: 'shadow frame', layout: this.frameLayout, entries: entries(this.shadowFrameBuffer, this.dummyShadowView, this.dummyLocalShadowView) });
    this.cushionFrameBind = this.ctx.device.createBindGroup({ label: 'cushion frame', layout: this.frameLayout, entries: entries(this.cushionFrameBuffer, this.dummyShadowView, this.dummyLocalShadowView) });
    this.faceBinds = this.faceFrames.map((b, i) => this.ctx.device.createBindGroup({ label: `light face ${i}`, layout: this.frameLayout, entries: entries(b, this.dummyShadowView, this.dummyLocalShadowView, this.probeView, this.dummyAoView) }));
    // the probe's own faces see the key's shadow and the local shadows, but not the probe: it is what they are drawing
    this.probeBinds = this.probeFrames.map((b, i) => this.ctx.device.createBindGroup({ label: `probe face ${i}`, layout: this.frameLayout, entries: entries(b, this.shadowView, this.localShadowView, this.dummyProbeView, this.dummyAoView) }));
  }

  /** All the stones' facet planes in one buffer, each group's run remembered for its material record. */
  private gemPlaneBuffer: GPUBuffer | null = null;
  private gemPlaneRanges: Array<{ base: number; count: number }> = [];
  private packGemPlanes() {
    const planes: number[] = [];
    this.gemPlaneRanges = this.groups.map((g) => {
      const p = g.source.gemPlanes;
      if (!p || p.length / 4 > 160) return { base: 0, count: 0 };
      const base = planes.length / 4;
      planes.push(...p);
      return { base, count: p.length / 4 };
    });
    this.gemPlaneBuffer?.destroy();
    this.gemPlaneBuffer = bufferFrom(this.ctx.device, planes.length ? new Float32Array(planes) : new Float32Array(4), GPUBufferUsage.STORAGE, 'gem planes');
  }

  /**
   * Lay every group's lettering out into one glyph buffer and make sure the
   * atlas holds every glyph used. Each glyph is a cell's box in the surface's
   * millimetres, before the inscription's turn, and the atlas rectangle it
   * reads from.
   */
  private layoutLettering() {
    const { device } = this.ctx;
    if (!this.atlas) this.atlas = new GlyphAtlas(new CanvasRasteriser());
    const atlas = this.atlas;
    const records: number[] = [];
    this.glyphRanges = this.groups.map((g) => {
      const ins = g.source.inscription;
      if (!ins || !ins.text) return { base: 0, count: 0 };
      const keys: (GlyphKey | ' ')[] = ins.script === 'runes'
        ? transliterate(ins.text).map((r) => (r === ' ' ? ' ' : { kind: 'rune' as const, rune: r }))
        : [...ins.text].map((c) => (c === ' ' ? ' ' : { kind: 'char' as const, char: c, font: ins.font }));
      const line = layoutGlyphs(atlas, keys);
      const base = records.length / 8;
      const em = ins.size;
      // centre the line on the pen's start, and drop the baseline so caps sit on the centre line
      const dx = -line.width * em / 2, dy = -0.35 * em;
      for (const gl of line.glyphs) {
        records.push(gl.x0 * em + dx, gl.y0 * em + dy, gl.x1 * em + dx, gl.y1 * em + dy);
        records.push(gl.rect.u0, gl.rect.v0, gl.rect.u1, gl.rect.v1);
      }
      return { base, count: line.glyphs.length };
    });
    this.glyphBuffer?.destroy();
    this.glyphBuffer = bufferFrom(device, records.length ? new Float32Array(records) : new Float32Array(8), GPUBufferUsage.STORAGE, 'glyphs');
    if (!this.atlasTexture || atlas.dirty || this.atlasTexture.width !== atlas.width || this.atlasTexture.height !== atlas.height) {
      if (!this.atlasTexture || this.atlasTexture.width !== atlas.width || this.atlasTexture.height !== atlas.height) {
        this.atlasTexture?.destroy();
        this.atlasTexture = device.createTexture({
          label: 'glyph atlas', size: [atlas.width, atlas.height], format: 'r8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
      }
      device.queue.writeTexture({ texture: this.atlasTexture }, atlas.pixels as Uint8Array<ArrayBuffer>, { bytesPerRow: atlas.width }, [atlas.width, atlas.height]);
      atlas.dirty = false;
    }
  }

  /** Per-group material and occlusion slice, 240 bytes at a 256-byte stride. */
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
      u32.set([bases[k], g.vertexCount, m.model === 'nacre' ? 1 : m.model === 'gem' ? 2 : m.model === 'plastic' ? 3 : m.model === 'wood' ? 4 : m.model === 'light' ? 5 : 0, 0], o + 12);
      f32.set([...(m.colour ?? [0, 0, 0]), m.orient ?? 0], o + 16);
      const e = enamels[g.source.enamel ?? ''];
      f32.set(e ? [...e.colour, e.opacity] : [0, 0, 0, 0], o + 20);
      const r = g.source.relief;
      f32.set(r
        ? [r.height, r.veins, r.length, r.halfWidth, ...r.span, r.droop, 0, 0, 0]
        : [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0], o + 24);
      const v = metals[g.source.veinMetal ?? ''];
      f32.set(v && e && !v.model ? [...v.f0, 1] : [0, 0, 0, 0], o + 36);
      f32.set([m.ior ?? 1.5, m.dispersion ?? 0, m.sparkle ?? 0, g.source.pavilionFacets ?? 8], o + 40);
      const eng = g.source.engraving;
      const patternIndex = eng ? ENGRAVING_PATTERNS.indexOf(eng.pattern) + 1 : 0;
      u32.set([patternIndex, g.source.mesh.cap ? 0 : 1, 0, 0], o + 44);
      f32.set(eng ? [eng.scale, eng.depth, eng.angle, extentOf(g.source.mesh)] : [1, 0, 0, 1], o + 48);
      const ins = g.source.inscription;
      const range = this.glyphRanges[k] ?? { base: 0, count: 0 };
      u32.set([range.base, range.count, 0, 0], o + 52);
      if (ins) {
        const mid = centreOf(g.source.mesh);
        const centre = ins.at ? [mid[0] + ins.at[0], mid[1] + ins.at[1]] : mid;
        // the atlas saturates `spread` px either side of the edge; in mm that is spread * size / fontPx
        f32[o + 54] = (CELL.spread * ins.size) / CELL.fontPx;
        f32.set([ins.depth, ins.angle, centre[0], centre[1]], o + 56);
      } else {
        f32[o + 54] = 1;
        f32.set([0, 0, 0, 0], o + 56);
      }
      const glow = m.model === 'light' ? (g.source.glow ?? m.glow ?? 1) * this.glowScale : 0;
      const c = m.colour ?? [1, 1, 1];
      f32.set(glow > 0 ? [c[0] * glow, c[1] * glow, c[2] * glow, 1] : [0, 0, 0, 0], o + 60);
      const gp = this.gemPlaneRanges[k] ?? { base: 0, count: 0 };
      u32.set([gp.base, gp.count], o + 64);
      f32.set([g.source.gemSize ?? 5, 0], o + 66);
    });
    this.ctx.device.queue.writeBuffer(this.materialBuffer, 0, data);
    this.writeLights();
    this.invalidateProbe();
  }

  /**
   * The piece's own lights. Every placement of a glowing part becomes a few
   * spheres of light along its length, each carrying its share of the part's
   * surface: a Lambertian emitter of radiance L and area A throws L·A/π
   * toward whatever faces it.
   */
  private writeLights() {
    const out = new Float32Array(LIGHTS_SIZE / 4);
    const u32 = new Uint32Array(out.buffer);
    let count = 0;
    const list: Array<{ position: [number, number, number]; group: number }> = [];
    this.groups.forEach((g, groupIndex) => {
      const m = metals[g.source.metal ?? ''] ?? this.metal;
      if (m.model !== 'light' || count >= MAX_LIGHTS) return;
      const glow = (g.source.glow ?? m.glow ?? 1) * this.glowScale;
      if (glow <= 0) return;
      const samples = emitterSamples(g.source.mesh);
      const c = m.colour ?? [1, 1, 1];
      const matrices = g.source.matrices;
      for (let k = 0; k < matrices.length / 16 && count < MAX_LIGHTS; k++) {
        const mat = matrices.subarray(k * 16, k * 16 + 16);
        const scale = Math.hypot(mat[0], mat[1], mat[2]);
        for (const sm of samples) {
          if (count >= MAX_LIGHTS) break;
          const p = transformPoint(mat, sm.centre);
          const o = 4 + count * 8;
          out.set([p[0], p[1], p[2], sm.radius * scale], o);
          const area = sm.area * scale * scale;
          const intensity = (glow * area) / Math.PI;
          out.set([c[0] * intensity, c[1] * intensity, c[2] * intensity, count < MAX_LOCAL_SHADOWS ? count : -1], o + 4);
          list.push({ position: [p[0], p[1], p[2]], group: groupIndex });
          count++;
        }
      }
    });
    u32[0] = count;
    out[1] = 0.4;
    out[2] = Math.max(this.sceneRadius * 4, 10);
    this.ctx.device.queue.writeBuffer(this.lightsBuffer, 0, out);
    // a light that moved, or a piece that changed, needs its shadows again;
    // a change of brightness alone does not
    const moved = list.length !== this.lightList.length
      || list.some((l, i) => l.group !== this.lightList[i].group || l.position.some((v, k) => v !== this.lightList[i].position[k]));
    if (moved) { this.lightList = list; this.localShadowDirty = true; this.dirty = true; }
  }

  /**
   * The reflection probe: the lit piece and its table, seen from the scene's
   * centre in six directions, then filtered by roughness the way the sky is.
   * Everything the frame has already baked — the key's shadow, the lights'
   * shadows, the cushion — is in it; the probe itself is not, so it holds one
   * bounce. Alpha is left at zero where a face saw only sky.
   */
  private bakeProbe(encoder: GPUCommandEncoder, frame: Float32Array) {
    const { device } = this.ctx;
    const near = Math.max(this.sceneRadius * 0.01, 0.2), far = Math.max(this.sceneRadius * 6, 50);
    const proj = new Float32Array(16);
    perspective(proj, Math.PI / 2, 1, near, far);
    const view = new Float32Array(16);
    const viewProj = new Float32Array(16);
    const faces: Array<[[number, number, number], [number, number, number]]> = [
      [[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]],
      [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]],
      [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]],
    ];
    const eye = this.probeCentre();
    faces.forEach(([dir, up], fi) => {
      lookAt(view, eye, [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]], up);
      multiplyMat(viewProj, proj, view);
      const pf = new Float32Array(frame);
      pf.set(viewProj, 0);
      pf.set(eye, 16);
      pf[60] = 0;   // no probe within the probe
      pf[66] = 0;   // nor the frame's contact occlusion, drawn for another view
      device.queue.writeBuffer(this.probeFrames[fi], 0, pf);
      const pass = encoder.beginRenderPass({
        label: `probe face ${fi}`,
        colorAttachments: [{
          view: this.probeRaw.createView({ dimension: '2d', baseArrayLayer: fi, arrayLayerCount: 1 }),
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store',
        }],
        depthStencilAttachment: { view: this.probeDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      });
      pass.setBindGroup(0, this.probeBinds[fi]);
      pass.setPipeline(this.prepassProbePipeline);
      for (const g of this.groups) {
        pass.setVertexBuffer(0, g.position);
        pass.setVertexBuffer(1, g.instance);
        pass.setIndexBuffer(g.index, 'uint32');
        pass.drawIndexed(g.indexCount, g.instanceCount);
      }
      if (this.groundBind) {
        pass.setPipeline(this.groundProbePipeline);
        pass.setBindGroup(1, this.groundBind);
        pass.setVertexBuffer(0, this.discPosition);
        pass.setIndexBuffer(this.discIndex, 'uint32');
        pass.drawIndexed(this.discCount);
      }
      if (this.materialBind) {
        pass.setPipeline(this.pbrProbePipeline);
        this.groups.forEach((g, k) => {
          pass.setBindGroup(1, this.materialBind!, [k * MATERIAL_STRIDE]);
          pass.setVertexBuffer(0, g.position);
          pass.setVertexBuffer(1, g.normal);
          pass.setVertexBuffer(2, g.uv);
          pass.setVertexBuffer(3, g.wear);
          pass.setVertexBuffer(4, g.instance);
          pass.setVertexBuffer(5, g.face);
          pass.setVertexBuffer(6, g.selected);
          pass.setVertexBuffer(7, g.engrave);
          pass.setIndexBuffer(g.index, 'uint32');
          pass.drawIndexed(g.indexCount, g.instanceCount);
        });
      }
      pass.end();
    });
    this.probeFilter?.dispose();
    this.probeFilter = filterCube(this.ctx, encoder, this.probeRaw, this.probeBackground, this.probeSpecular, PROBE_SIZE, PROBE_MIPS);
  }
  /** The filter's own buffer, kept until its encoder has been submitted. */
  private probeFilter: { dispose(): void } | null = null;
  /** Contact occlusion, per pixel, from the frame's own depth. */
  private ao: ContactOcclusion;
  private dummyAoView: GPUTextureView;
  private contact = 1;
  setContact(v: number) { this.contact = v; this.ao.strength = v; this.dirty = true; }

  /**
   * Where the probe stands: above the piece's top by a little, at its
   * centre. The scene's centroid is often inside a part — the stone at the
   * heart of a cluster — and a probe drawn from inside a gem fills every
   * reflection with the inside of a gem.
   */
  private probeCentre(): [number, number, number] {
    return [this.sceneCentre[0], this.sceneCentre[1], this.sceneTop + this.sceneRadius * 0.12];
  }
  private sceneTop = 0;

  /** Anything that changes what the probe would see: the piece, its lights, the table, the sky, the key. */
  private invalidateProbe() { this.probeDirty = true; this.dirty = true; }

  /**
   * Render the piece from each light, six faces round it, into that light's
   * layer of the shadow array. The light's own part is left out: the sample
   * sits inside the tube, and the tube would otherwise shadow everything.
   */
  private bakeLocalShadows(encoder: GPUCommandEncoder, frame: Float32Array) {
    const { device } = this.ctx;
    const near = 0.4, far = Math.max(this.sceneRadius * 4, 10);
    const proj = new Float32Array(16);
    perspective(proj, Math.PI / 2, 1, near, far);
    const view = new Float32Array(16);
    const viewProj = new Float32Array(16);
    // the faces in the order a cube map wants them, each with its own up
    const faces: Array<[[number, number, number], [number, number, number]]> = [
      [[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]],
      [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]],
      [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]],
    ];
    const shadowed = this.lightList.slice(0, MAX_LOCAL_SHADOWS);
    shadowed.forEach((light, li) => {
      faces.forEach(([dir, up], fi) => {
        const slot = li * 6 + fi;
        const target: [number, number, number] = [light.position[0] + dir[0], light.position[1] + dir[1], light.position[2] + dir[2]];
        lookAt(view, light.position, target, up);
        multiplyMat(viewProj, proj, view);
        const lf = new Float32Array(frame);
        lf.set(viewProj, 0);
        device.queue.writeBuffer(this.faceFrames[slot], 0, lf);
        const pass = encoder.beginRenderPass({
          label: `light ${li} face ${fi}`,
          colorAttachments: [],
          depthStencilAttachment: {
            view: this.localShadowMap.createView({ dimension: '2d', baseArrayLayer: slot, arrayLayerCount: 1 }),
            depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store',
          },
        });
        pass.setPipeline(this.shadowPipeline);
        pass.setBindGroup(0, this.faceBinds[slot]);
        this.groups.forEach((g, gi) => {
          if (gi === light.group) return;
          pass.setVertexBuffer(0, g.position);
          pass.setVertexBuffer(1, g.instance);
          pass.setIndexBuffer(g.index, 'uint32');
          pass.drawIndexed(g.indexCount, g.instanceCount);
        });
        pass.end();
      });
    });
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
    if (occ) occ.onProgress = () => { this.invalidateProbe(); };
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
    this.writeTable();
    this.groundBind = device.createBindGroup({
      label: 'ground',
      layout: this.groundLayout,
      entries: [
        { binding: 0, resource: { buffer: this.groundBuffer } },
        { binding: 1, resource: occ.ground.createView() },
        { binding: 2, resource: this.cushion.height.createView() },
      ],
    });
    this.cushionDirty = true;
  }

  private clearOcclusion() {
    this.occlusion?.dispose();
    this.occlusion = null;
    this.groundBind = null;
    this.rebuildFrameBind();
  }
}

function unproject(inv: Float32Array, x: number, y: number, z: number): Vec3 | null {
  const w = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
  if (!w) return null;
  return [
    (inv[0] * x + inv[4] * y + inv[8] * z + inv[12]) / w,
    (inv[1] * x + inv[5] * y + inv[9] * z + inv[13]) / w,
    (inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) / w,
  ];
}

const boundsCache = new WeakMap<PartMesh, Box3>();
function boundsOf(mesh: PartMesh): Box3 {
  let b = boundsCache.get(mesh);
  if (b) return b;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < min[k]) min[k] = p[i + k];
      if (p[i + k] > max[k]) max[k] = p[i + k];
    }
  }
  b = { min, max };
  boundsCache.set(mesh, b);
  return b;
}

/** Entry parameter of a ray into a box, or null when it misses. */
function raySlab(o: Vec3, d: Vec3, b: Box3): number | null {
  let t0 = 0;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < b.min[k] || o[k] > b.max[k]) return null;
      continue;
    }
    let a = (b.min[k] - o[k]) / d[k];
    let c = (b.max[k] - o[k]) / d[k];
    if (a > c) [a, c] = [c, a];
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return null;
  }
  return t0;
}

/** Nearest triangle hit under `limit`, by Möller–Trumbore, either facing. */
function rayMesh(o: Vec3, d: Vec3, mesh: PartMesh, limit: number): number | null {
  const p = mesh.positions;
  const ix = mesh.indices;
  let best: number | null = null;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o[0] - p[a], ty = o[1] - p[a + 1], tz = o[2] - p[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 0 && t < limit && (best === null || t < best)) best = t;
  }
  return best;
}

/** A unit disc in the XY plane, wound counter-clockwise seen from +Z. */
/** A square grid over [-1, 1]², (n + 1)² vertices, wound counter-clockwise seen from +Z. */
function unitGrid(n: number) {
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const o = (j * (n + 1) + i) * 3;
      positions[o] = (i / n) * 2 - 1;
      positions[o + 1] = (j / n) * 2 - 1;
    }
  }
  const indices = new Uint32Array(n * n * 6);
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      indices[k++] = a; indices[k++] = b; indices[k++] = d;
      indices[k++] = a; indices[k++] = d; indices[k++] = c;
    }
  }
  return { positions, indices };
}

