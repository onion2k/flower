/**
 * Procedural image-based lighting, baked on the GPU.
 *
 * Metal is essentially all reflection: with nothing around it, gold renders as a
 * flat brown blob. So before any shading is worth looking at there has to be an
 * environment, and it has to have *shape* — softboxes with defined edges, not a
 * smooth gradient, because the edge of a reflected light source is what tells the
 * eye a surface is polished.
 *
 * Three textures come out: the sharp background cube with a mip chain, a
 * GGX-prefiltered cube whose mip level maps to roughness, and the split-sum
 * BRDF lookup. A small mip of the background is also read back, because the
 * occlusion bake draws its directions from where the light is.
 */

import { FULLSCREEN_VERT, halfToFloat, readbackLayer, shader, type GpuContext } from '../gpu/context';

export type EnvPreset = 'studio' | 'dusk' | 'gallery';

export interface EnvSamples {
  /** Radiance per face, RGBA floats, row 0 first, in GL face order. */
  faces: Float32Array[];
  size: number;
}

export interface Environment {
  background: GPUTexture;
  specular: GPUTexture;
  brdf: GPUTexture;
  /** Face size of mip 0. */
  size: number;
  mips: number;
  /** Always true here: the bake is float end to end. Kept for the UI. */
  highDynamicRange: boolean;
  /** Resolves once the small-mip readback lands. */
  samples: Promise<EnvSamples>;
  dispose(): void;
}

const FORMAT: GPUTextureFormat = 'rgba16float';

const CUBE_BASIS = `
struct Basis { forward: vec3f, _p0: f32, right: vec3f, _p1: f32, up: vec3f, _p2: f32, preset: f32, roughness: f32, sourceSize: f32, _p3: f32 };
@group(0) @binding(0) var<uniform> basis: Basis;
`;

const SKY = `
${FULLSCREEN_VERT}
${CUBE_BASIS}

// A rectangular area light, hit-tested against the ray. Not a dot-product
// falloff: a soft blob reflects as a soft blob and reads like plastic.
fn rectLight(d: vec3f, centre: vec3f, right: vec3f, up: vec3f, halfSize: vec2f, colour: vec3f, softness: f32) -> vec3f {
  let n = normalize(cross(right, up));
  let denom = dot(d, n);
  let t = dot(centre, n) / denom;
  if (t <= 0.0) { return vec3f(0.0); }
  let local = d * t - centre;
  let q = vec2f(dot(local, normalize(right)), dot(local, normalize(up)));
  let e = smoothstep(halfSize + softness, halfSize - softness, abs(q));
  let f = q / halfSize;
  let middle = 1.0 - 0.3 * clamp(dot(f, f), 0.0, 1.0);
  return colour * e.x * e.y * middle;
}

fn floorHit(d: vec3f) -> vec2f { return d.xy * (-1.0 / min(d.z, -1e-3)); }

fn studio(d: vec3f) -> vec3f {
  let h = d.z;
  var wall = mix(vec3f(0.016, 0.017, 0.02), vec3f(0.05, 0.056, 0.07), smoothstep(-0.2, 1.0, h));
  wall += vec3f(0.014, 0.012, 0.01) * smoothstep(0.35, -0.1, h);
  var col = wall;
  if (h < 0.0) {
    let hit = floorHit(d);
    let toPool = hit - vec2f(0.45, -0.75);
    let pool = exp(-dot(toPool, toPool) * 0.3);
    let floorCol = vec3f(0.022, 0.022, 0.025) + vec3f(0.11, 0.105, 0.098) * pool;
    col = mix(floorCol, wall, smoothstep(-0.1, 0.0, h));
  }
  col += rectLight(d, vec3f(0.9, -1.5, 2.6), vec3f(2.4, 0.0, 0.0), vec3f(0.0, 1.5, 0.9), vec2f(1.5, 1.0), vec3f(22.0, 21.0, 19.5), 0.35);
  col += rectLight(d, vec3f(-2.6, 0.6, 0.5), vec3f(0.0, 1.8, 0.0), vec3f(0.0, 0.0, 1.8), vec2f(1.1, 1.4), vec3f(2.4, 2.8, 3.6), 0.5);
  col += rectLight(d, vec3f(1.4, 2.8, 0.9), vec3f(1.6, -0.8, 0.0), vec3f(0.0, 0.0, 1.4), vec2f(0.9, 0.7), vec3f(5.5, 4.4, 3.2), 0.4);
  col += rectLight(d, vec3f(-0.6, 1.4, 2.3), vec3f(3.0, 0.9, 0.0), vec3f(0.0, -0.5, 1.6), vec2f(2.4, 0.09), vec3f(9.0, 9.2, 9.8), 0.05);
  col += rectLight(d, vec3f(0.0, 0.0, 3.6), vec3f(3.0, 0.0, 0.0), vec3f(0.0, 3.0, 0.0), vec2f(2.6, 2.6), vec3f(0.9, 0.93, 1.0), 1.4);
  return col;
}

fn dusk(d: vec3f) -> vec3f {
  let h = d.z;
  let sky = mix(vec3f(0.25, 0.32, 0.5), vec3f(0.03, 0.05, 0.12), smoothstep(0.0, 0.85, h));
  let horizon = mix(vec3f(1.15, 0.55, 0.24), sky, smoothstep(0.0, 0.28, h));
  let ground = mix(vec3f(0.045, 0.038, 0.032), vec3f(0.14, 0.10, 0.08), smoothstep(-0.7, 0.0, h));
  var col = select(ground, horizon, h > 0.0);
  let sunDir = normalize(vec3f(0.86, 0.36, 0.10));
  let sun = smoothstep(0.9965, 0.9992, dot(d, sunDir));
  col += vec3f(46.0, 26.0, 12.0) * sun;
  col += vec3f(1.5, 0.7, 0.3) * pow(max(dot(d, sunDir), 0.0), 22.0);
  return col;
}

fn gallery(d: vec3f) -> vec3f {
  let h = d.z * 0.5 + 0.5;
  var col = mix(vec3f(0.10, 0.10, 0.105), vec3f(0.30, 0.31, 0.33), smoothstep(0.1, 0.95, h));
  if (d.z < 0.0) {
    let hit = floorHit(d);
    let near = exp(-dot(hit, hit) * 0.08);
    let floorCol = vec3f(0.13, 0.128, 0.125) + vec3f(0.07, 0.068, 0.065) * near;
    col = mix(floorCol, col, smoothstep(-0.08, 0.0, d.z));
  }
  for (var i = -1; i <= 1; i++) {
    let x = f32(i) * 2.1;
    col += rectLight(d, vec3f(x, 0.0, 3.0), vec3f(0.75, 0.0, 0.0), vec3f(0.0, 3.0, 0.0), vec2f(0.42, 1.9), vec3f(9.0, 9.0, 9.2), 0.18);
  }
  col += rectLight(d, vec3f(0.0, -3.2, 0.3), vec3f(4.0, 0.0, 0.0), vec3f(0.0, 0.0, 2.2), vec2f(2.4, 1.4), vec3f(0.9, 0.92, 1.0), 0.7);
  return col;
}

@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * 2.0 - 1.0;
  let d = normalize(basis.forward + basis.right * p.x + basis.up * p.y);
  var col: vec3f;
  if (basis.preset < 0.5) { col = studio(d); }
  else if (basis.preset < 1.5) { col = dusk(d); }
  else { col = gallery(d); }
  return vec4f(col, 1.0);
}`;

/** One mip level down: a linear sample at the centre of each texel averages the four beneath. */
const DOWNSAMPLE = `
${FULLSCREEN_VERT}
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(src, samp, uv, 0.0).rgb, 1.0);
}`;

const GGX_COMMON = `
const PI: f32 = 3.14159265359;

fn radicalInverse(bits0: u32) -> f32 {
  var bits = bits0;
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return f32(bits) * 2.3283064365386963e-10;
}

fn importanceGGX(xi: vec2f, n: vec3f, a: f32) -> vec3f {
  let phi = 2.0 * PI * xi.x;
  let cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  let h = vec3f(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  let up = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(n.z) < 0.999);
  let tx = normalize(cross(up, n));
  let ty = cross(n, tx);
  return normalize(tx * h.x + ty * h.y + n * h.z);
}
`;

const PREFILTER = `
${FULLSCREEN_VERT}
${CUBE_BASIS}
${GGX_COMMON}
@group(0) @binding(1) var source: texture_cube<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * 2.0 - 1.0;
  let n = normalize(basis.forward + basis.right * p.x + basis.up * p.y);
  let v = n;
  let SAMPLES = 128u;
  // never let alpha reach zero: the pdf becomes 0/0 and mip 0 fills with NaN
  let a = max(basis.roughness * basis.roughness, 1e-3);
  var sum = vec3f(0.0);
  var weight = 0.0;
  for (var i = 0u; i < SAMPLES; i++) {
    let xi = vec2f(f32(i) / f32(SAMPLES), radicalInverse(i));
    let h = importanceGGX(xi, n, a);
    let l = normalize(2.0 * dot(v, h) * h - v);
    let ndl = dot(n, l);
    if (ndl <= 0.0) { continue; }
    // sample from a mip chosen by solid angle, or a bright softbox turns into fireflies
    let ndh = max(dot(n, h), 0.0);
    let d = (ndh * ndh * (a * a - 1.0) + 1.0);
    let pdf = (a * a) / max(PI * d * d, 1e-8) * 0.25 + 1e-4;
    let saTexel = 4.0 * PI / (6.0 * basis.sourceSize * basis.sourceSize);
    let saSample = 1.0 / (f32(SAMPLES) * pdf + 0.0001);
    let lod = select(0.5 * log2(saSample / saTexel), 0.0, basis.roughness == 0.0);
    sum += textureSampleLevel(source, samp, l, lod).rgb * ndl;
    weight += ndl;
  }
  return vec4f(sum / max(weight, 0.001), 1.0);
}`;

const BRDF = `
${FULLSCREEN_VERT}
${GGX_COMMON}

fn geometrySmith(ndv: f32, ndl: f32, roughness: f32) -> f32 {
  let k = (roughness * roughness) / 2.0;
  let gv = ndv / (ndv * (1.0 - k) + k);
  let gl = ndl / (ndl * (1.0 - k) + k);
  return gv * gl;
}

@fragment fn fsMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ndv = max(uv.x, 0.001);
  let roughness = uv.y;
  let v = vec3f(sqrt(1.0 - ndv * ndv), 0.0, ndv);
  let n = vec3f(0.0, 0.0, 1.0);
  let a = roughness * roughness;
  var scale = 0.0;
  var bias = 0.0;
  let SAMPLES = 512u;
  for (var i = 0u; i < SAMPLES; i++) {
    let xi = vec2f(f32(i) / f32(SAMPLES), radicalInverse(i));
    let h = importanceGGX(xi, n, a);
    let l = normalize(2.0 * dot(v, h) * h - v);
    let ndl = max(l.z, 0.0);
    if (ndl <= 0.0) { continue; }
    let ndh = max(h.z, 0.0);
    let vdh = max(dot(v, h), 0.0);
    let g = geometrySmith(ndv, ndl, roughness);
    let gVis = (g * vdh) / max(ndh * ndv, 0.0001);
    let fc = pow(1.0 - vdh, 5.0);
    scale += (1.0 - fc) * gVis;
    bias += fc * gVis;
  }
  return vec4f(scale / f32(SAMPLES), bias / f32(SAMPLES), 0.0, 1.0);
}`;

/** [forward, right, up] per cube face, in GL's face order, which WebGPU shares. */
const FACES: Array<[number[], number[], number[]]> = [
  [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
];

const PRESET_INDEX: Record<EnvPreset, number> = { studio: 0, dusk: 1, gallery: 2 };
const BASIS_STRIDE = 256;

interface Pipelines {
  sky: GPURenderPipeline;
  down: GPURenderPipeline;
  prefilter: GPURenderPipeline;
  brdf: GPURenderPipeline;
  sampler: GPUSampler;
}

const pipelines = new WeakMap<GPUDevice, Pipelines>();

function getPipelines(device: GPUDevice): Pipelines {
  let p = pipelines.get(device);
  if (p) return p;
  // The basis slot is addressed by dynamic offset, which an automatic layout
  // never grants, so the two pipelines that use it get explicit layouts.
  const basisEntry: GPUBindGroupLayoutEntry = {
    binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true },
  };
  const skyLayout = device.createBindGroupLayout({ entries: [basisEntry] });
  const prefilterLayout = device.createBindGroupLayout({
    entries: [
      basisEntry,
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: 'cube' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });
  const make = (code: string, label: string, layout?: GPUBindGroupLayout) => {
    const module = shader(device, code, label);
    return device.createRenderPipeline({
      label,
      layout: layout ? device.createPipelineLayout({ bindGroupLayouts: [layout] }) : 'auto',
      vertex: { module, entryPoint: 'vsFullscreen' },
      fragment: { module, entryPoint: 'fsMain', targets: [{ format: FORMAT }] },
    });
  };
  p = {
    sky: make(SKY, 'env sky', skyLayout),
    down: make(DOWNSAMPLE, 'env downsample'),
    prefilter: make(PREFILTER, 'env prefilter', prefilterLayout),
    brdf: make(BRDF, 'env brdf'),
    sampler: device.createSampler({
      magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', addressModeW: 'clamp-to-edge',
    }),
  };
  pipelines.set(device, p);
  return p;
}

export function bakeEnvironment(
  ctx: GpuContext,
  preset: EnvPreset,
  opts: { size?: number; mips?: number; brdfSize?: number; sampleSize?: number } = {},
): Environment {
  const { device } = ctx;
  const size = opts.size ?? 512;
  const mips = opts.mips ?? 8;
  const brdfSize = opts.brdfSize ?? 128;
  const sampleSize = opts.sampleSize ?? 64;
  const pipes = getPipelines(device);

  const cube = (levels: number, label: string) => device.createTexture({
    label, size: [size, size, 6], format: FORMAT, mipLevelCount: levels,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const backgroundMips = Math.floor(Math.log2(size)) + 1;
  const background = cube(backgroundMips, 'env background');
  const specular = cube(mips, 'env specular');
  const brdf = device.createTexture({
    label: 'env brdf', size: [brdfSize, brdfSize], format: FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  // one uniform buffer with a slot per (face, level) draw, addressed by dynamic offset
  const slots = 6 + 6 * mips;
  const basisBuffer = device.createBuffer({ size: slots * BASIS_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const basisData = new Float32Array((slots * BASIS_STRIDE) / 4);
  const setBasis = (slot: number, face: number, roughness: number) => {
    const [f, r, u] = FACES[face];
    basisData.set(
      [f[0], f[1], f[2], 0, r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, PRESET_INDEX[preset], roughness, size, 0],
      (slot * BASIS_STRIDE) / 4,
    );
  };
  for (let face = 0; face < 6; face++) setBasis(face, face, 0);
  for (let level = 0; level < mips; level++) {
    for (let face = 0; face < 6; face++) setBasis(6 + level * 6 + face, face, mips > 1 ? level / (mips - 1) : 0);
  }
  device.queue.writeBuffer(basisBuffer, 0, basisData);

  const faceView = (tex: GPUTexture, face: number, level: number) =>
    tex.createView({ dimension: '2d', baseArrayLayer: face, arrayLayerCount: 1, baseMipLevel: level, mipLevelCount: 1 });
  const drawTo = (encoder: GPUCommandEncoder, view: GPUTextureView, pipeline: GPURenderPipeline, bind: GPUBindGroup, offsets?: number[]) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind, offsets);
    pass.draw(3);
    pass.end();
  };

  const encoder = device.createCommandEncoder({ label: 'env bake' });

  // --- 1. the environment itself, then its mip chain one level at a time ---
  const skyBind = device.createBindGroup({
    layout: pipes.sky.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: basisBuffer, size: BASIS_STRIDE } }],
  });
  for (let face = 0; face < 6; face++) {
    drawTo(encoder, faceView(background, face, 0), pipes.sky, skyBind, [face * BASIS_STRIDE]);
  }
  for (let level = 1; level < backgroundMips; level++) {
    for (let face = 0; face < 6; face++) {
      const bind = device.createBindGroup({
        layout: pipes.down.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: faceView(background, face, level - 1) },
          { binding: 1, resource: pipes.sampler },
        ],
      });
      drawTo(encoder, faceView(background, face, level), pipes.down, bind);
    }
  }

  // --- 2. GGX prefilter into a second cube, level by level ---
  const prefilterBind = device.createBindGroup({
    layout: pipes.prefilter.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: basisBuffer, size: BASIS_STRIDE } },
      { binding: 1, resource: background.createView({ dimension: 'cube' }) },
      { binding: 2, resource: pipes.sampler },
    ],
  });
  for (let level = 0; level < mips; level++) {
    for (let face = 0; face < 6; face++) {
      drawTo(encoder, faceView(specular, face, level), pipes.prefilter, prefilterBind, [(6 + level * 6 + face) * BASIS_STRIDE]);
    }
  }

  // --- 3. split-sum BRDF lookup ---
  const brdfBind = device.createBindGroup({ layout: pipes.brdf.getBindGroupLayout(0), entries: [] });
  drawTo(encoder, brdf.createView(), pipes.brdf, brdfBind);

  device.queue.submit([encoder.finish()]);

  // --- 4. a small mip of the background, read back for direction sampling ---
  const sampleLod = Math.max(0, Math.round(Math.log2(size / sampleSize)));
  const realSize = Math.max(1, size >> sampleLod);
  const samples = (async () => {
    const faces: Float32Array[] = [];
    for (let face = 0; face < 6; face++) {
      const raw = new Uint16Array(await readbackLayer(device, background, face, sampleLod, realSize, 8));
      const out = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = halfToFloat(raw[i]);
      faces.push(out);
    }
    return { faces, size: realSize };
  })();

  return {
    background,
    specular,
    brdf,
    size,
    mips,
    highDynamicRange: true,
    samples,
    dispose() {
      background.destroy();
      specular.destroy();
      brdf.destroy();
      basisBuffer.destroy();
    },
  };
}
