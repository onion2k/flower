/**
 * Procedural image-based lighting.
 *
 * Metal is essentially all reflection: with nothing around it, gold renders as a
 * flat brown blob. So before any shading is worth looking at there has to be an
 * environment, and it has to have *shape* — softboxes with defined edges, not a
 * smooth gradient, because the edge of a reflected light source is what tells the
 * eye a surface is polished.
 *
 * Written against raw WebGL2 rather than ogl's RenderTarget, which only makes 2D
 * attachments; prefiltering needs to render into individual cubemap faces.
 */

export type EnvPreset = 'studio' | 'dusk' | 'gallery';

export interface Environment {
  /** Sharp cube for the backdrop, with a mip chain for cheap blur. */
  background: WebGLTexture;
  /** GGX-prefiltered chain: mip level maps to roughness. */
  specular: WebGLTexture;
  /** Split-sum lookup: scale and bias for F0, by (NdotV, roughness). */
  brdf: WebGLTexture;
  /** Face size of mip 0. */
  size: number;
  mips: number;
  /** False when the context cannot render to float, so the bake ran at 8 bits. */
  highDynamicRange: boolean;
  dispose(): void;
}

const FULLSCREEN_VERT = `#version 300 es
// three vertices, no buffers: the classic oversized triangle
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const SKY_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform int uPreset;

/**
 * A rectangular area light, hit-tested against the ray.
 *
 * Deliberately not a dot-product falloff: a soft blob reflects as a soft blob and
 * reads like plastic. A rectangle with a narrow gradient at its border gives the
 * hard-edged bar of light that makes a polished surface look polished.
 */
vec3 rectLight(vec3 d, vec3 centre, vec3 right, vec3 up, vec2 halfSize, vec3 colour, float softness) {
  vec3 n = normalize(cross(right, up));
  float denom = dot(d, n);
  float t = dot(centre, n) / denom;
  if (t <= 0.0) return vec3(0.0);
  vec3 local = d * t - centre;
  vec2 q = vec2(dot(local, normalize(right)), dot(local, normalize(up)));
  vec2 e = smoothstep(halfSize + softness, halfSize - softness, abs(q));
  return colour * e.x * e.y;
}

vec3 studio(vec3 d) {
  // cool dark room, warm key overhead, cool fill, cold rim behind
  float h = d.z * 0.5 + 0.5;
  vec3 col = mix(vec3(0.012, 0.013, 0.016), vec3(0.05, 0.056, 0.07), smoothstep(0.0, 1.0, h));
  col += vec3(0.02, 0.019, 0.017) * smoothstep(0.5, 0.0, h);

  col += rectLight(d, vec3(0.9, -1.5, 2.6), vec3(2.4, 0.0, 0.0), vec3(0.0, 1.5, 0.9), vec2(1.5, 1.0), vec3(22.0, 21.0, 19.5), 0.35);
  col += rectLight(d, vec3(-2.6, 0.6, 0.5), vec3(0.0, 1.8, 0.0), vec3(0.0, 0.0, 1.8), vec2(1.1, 1.4), vec3(2.4, 2.8, 3.6), 0.5);
  col += rectLight(d, vec3(1.4, 2.8, 0.9), vec3(1.6, -0.8, 0.0), vec3(0.0, 0.0, 1.4), vec2(0.9, 0.7), vec3(5.5, 4.4, 3.2), 0.4);
  return col;
}

vec3 dusk(vec3 d) {
  float h = d.z;
  vec3 sky = mix(vec3(0.25, 0.32, 0.5), vec3(0.03, 0.05, 0.12), smoothstep(0.0, 0.85, h));
  vec3 horizon = mix(vec3(1.15, 0.55, 0.24), sky, smoothstep(0.0, 0.28, h));
  vec3 ground = mix(vec3(0.045, 0.038, 0.032), vec3(0.14, 0.10, 0.08), smoothstep(-0.7, 0.0, h));
  vec3 col = h > 0.0 ? horizon : ground;

  // low sun, small and very bright, which is what gives a hard specular glint
  vec3 sunDir = normalize(vec3(0.86, 0.36, 0.10));
  float sun = smoothstep(0.9965, 0.9992, dot(d, sunDir));
  col += vec3(46.0, 26.0, 12.0) * sun;
  col += vec3(1.5, 0.7, 0.3) * pow(max(dot(d, sunDir), 0.0), 22.0);
  return col;
}

vec3 gallery(vec3 d) {
  float h = d.z * 0.5 + 0.5;
  vec3 col = mix(vec3(0.10, 0.10, 0.105), vec3(0.30, 0.31, 0.33), smoothstep(0.1, 0.95, h));

  // a row of ceiling panels: repeated hard-edged sources read as a real room
  for (int i = -1; i <= 1; i++) {
    float x = float(i) * 2.1;
    col += rectLight(d, vec3(x, 0.0, 3.0), vec3(0.75, 0.0, 0.0), vec3(0.0, 3.0, 0.0), vec2(0.42, 1.9), vec3(9.0, 9.0, 9.2), 0.18);
  }
  col += rectLight(d, vec3(0.0, -3.2, 0.3), vec3(4.0, 0.0, 0.0), vec3(0.0, 0.0, 2.2), vec2(2.4, 1.4), vec3(0.9, 0.92, 1.0), 0.7);
  return col;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec3 d = normalize(uForward + uRight * p.x + uUp * p.y);
  vec3 col = uPreset == 0 ? studio(d) : uPreset == 1 ? dusk(d) : gallery(d);
  fragColor = vec4(col, 1.0);
}`;

const PREFILTER_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform samplerCube uSource;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uRoughness;
uniform float uSourceSize;

const float PI = 3.14159265359;

float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}

vec3 importanceGGX(vec2 xi, vec3 n, float a) {
  float phi = 2.0 * PI * xi.x;
  float cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  vec3 h = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, n));
  vec3 ty = cross(n, tx);
  return normalize(tx * h.x + ty * h.y + n * h.z);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec3 n = normalize(uForward + uRight * p.x + uUp * p.y);
  vec3 v = n; // the usual N = V = R simplification

  const uint SAMPLES = 128u;
  // Never let alpha reach zero. At roughness 0 the GGX half-vector is exactly the
  // normal, the distribution denominator collapses to zero, and the pdf becomes
  // 0/0 — so mip 0 fills with NaN and every lookup below lod 1 blends against it,
  // which is to say every polished surface in the scene renders black.
  float a = max(uRoughness * uRoughness, 1e-3);
  vec3 sum = vec3(0.0);
  float weight = 0.0;

  for (uint i = 0u; i < SAMPLES; i++) {
    vec2 xi = vec2(float(i) / float(SAMPLES), radicalInverse(i));
    vec3 h = importanceGGX(xi, n, a);
    vec3 l = normalize(2.0 * dot(v, h) * h - v);
    float ndl = dot(n, l);
    if (ndl <= 0.0) continue;

    // Sample from a mip chosen by solid angle, or sparse sampling of a bright
    // softbox turns into a field of fireflies rather than a blurred highlight.
    float ndh = max(dot(n, h), 0.0);
    float d = (ndh * ndh * (a * a - 1.0) + 1.0);
    float pdf = (a * a) / max(PI * d * d, 1e-8) * 0.25 + 1e-4;
    float saTexel = 4.0 * PI / (6.0 * uSourceSize * uSourceSize);
    float saSample = 1.0 / (float(SAMPLES) * pdf + 0.0001);
    float lod = uRoughness == 0.0 ? 0.0 : 0.5 * log2(saSample / saTexel);

    sum += textureLod(uSource, l, lod).rgb * ndl;
    weight += ndl;
  }

  fragColor = vec4(sum / max(weight, 0.001), 1.0);
}`;

const BRDF_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

const float PI = 3.14159265359;

float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}

vec3 importanceGGX(vec2 xi, vec3 n, float a) {
  float phi = 2.0 * PI * xi.x;
  float cosTheta = sqrt((1.0 - xi.y) / (1.0 + (a * a - 1.0) * xi.y));
  float sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  vec3 h = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, n));
  vec3 ty = cross(n, tx);
  return normalize(tx * h.x + ty * h.y + n * h.z);
}

float geometrySmith(float ndv, float ndl, float roughness) {
  // Schlick-GGX with the IBL k, not the direct-light one
  float k = (roughness * roughness) / 2.0;
  float gv = ndv / (ndv * (1.0 - k) + k);
  float gl = ndl / (ndl * (1.0 - k) + k);
  return gv * gl;
}

void main() {
  float ndv = max(vUv.x, 0.001);
  float roughness = vUv.y;

  vec3 v = vec3(sqrt(1.0 - ndv * ndv), 0.0, ndv);
  vec3 n = vec3(0.0, 0.0, 1.0);
  float a = roughness * roughness;

  float scale = 0.0;
  float bias = 0.0;
  const uint SAMPLES = 512u;

  for (uint i = 0u; i < SAMPLES; i++) {
    vec2 xi = vec2(float(i) / float(SAMPLES), radicalInverse(i));
    vec3 h = importanceGGX(xi, n, a);
    vec3 l = normalize(2.0 * dot(v, h) * h - v);

    float ndl = max(l.z, 0.0);
    if (ndl <= 0.0) continue;
    float ndh = max(h.z, 0.0);
    float vdh = max(dot(v, h), 0.0);

    float g = geometrySmith(ndv, ndl, roughness);
    float gVis = (g * vdh) / max(ndh * ndv, 0.0001);
    float fc = pow(1.0 - vdh, 5.0);
    scale += (1.0 - fc) * gVis;
    bias += fc * gVis;
  }

  fragColor = vec4(scale / float(SAMPLES), bias / float(SAMPLES), 0.0, 1.0);
}`;

/** GL cube face conventions: forward, right and up per face. */
const FACES: Array<[number[], number[], number[]]> = [
  [[1, 0, 0], [0, 0, -1], [0, -1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
];

const PRESET_INDEX: Record<EnvPreset, number> = { studio: 0, dusk: 1, gallery: 2 };

export function bakeEnvironment(
  gl: WebGL2RenderingContext,
  preset: EnvPreset,
  opts: { size?: number; mips?: number; brdfSize?: number } = {},
): Environment {
  const size = opts.size ?? 128;
  const mips = opts.mips ?? 6;
  const brdfSize = opts.brdfSize ?? 128;

  const canFloat = !!gl.getExtension('EXT_color_buffer_float');
  const internal = canFloat ? gl.RGBA16F : gl.RGBA8;

  const fbo = gl.createFramebuffer()!;
  const vao = gl.createVertexArray()!;
  const skyProgram = compile(gl, FULLSCREEN_VERT, SKY_FRAG);
  const preProgram = compile(gl, FULLSCREEN_VERT, PREFILTER_FRAG);
  const brdfProgram = compile(gl, FULLSCREEN_VERT, BRDF_FRAG);

  const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
  gl.bindVertexArray(vao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);

  // --- 1. the environment itself, with its own mip chain for prefiltering ---
  const backgroundMips = Math.floor(Math.log2(size)) + 1;
  const background = makeCube(gl, size, backgroundMips, internal);
  gl.useProgram(skyProgram);
  gl.uniform1i(gl.getUniformLocation(skyProgram, 'uPreset'), PRESET_INDEX[preset]);
  for (let face = 0; face < 6; face++) {
    attachFace(gl, fbo, background, face, 0);
    gl.viewport(0, 0, size, size);
    setBasis(gl, skyProgram, face);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, background);
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

  // --- 2. GGX prefilter into a second cube, level by level ---
  // A second texture, not more levels of the first: sampling a texture while
  // rendering into any level of it is a feedback loop.
  const specular = makeCube(gl, size, mips, internal);
  gl.useProgram(preProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, background);
  gl.uniform1i(gl.getUniformLocation(preProgram, 'uSource'), 0);
  gl.uniform1f(gl.getUniformLocation(preProgram, 'uSourceSize'), size);
  const roughnessLoc = gl.getUniformLocation(preProgram, 'uRoughness');

  for (let level = 0; level < mips; level++) {
    const levelSize = Math.max(1, size >> level);
    gl.uniform1f(roughnessLoc, mips > 1 ? level / (mips - 1) : 0);
    for (let face = 0; face < 6; face++) {
      attachFace(gl, fbo, specular, face, level);
      gl.viewport(0, 0, levelSize, levelSize);
      setBasis(gl, preProgram, face);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  // --- 3. split-sum BRDF lookup ---
  const brdf = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, brdf);
  gl.texStorage2D(gl.TEXTURE_2D, 1, canFloat ? gl.RGBA16F : gl.RGBA8, brdfSize, brdfSize);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, brdf, 0);
  gl.viewport(0, 0, brdfSize, brdfSize);
  gl.useProgram(brdfProgram);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // --- self-check: a NaN in a prefiltered mip shows up only as black metal ---
  const bad = [
    verifyLevel(gl, fbo, specular, 0, size, 'specular mip 0'),
    verifyLevel(gl, fbo, specular, mips - 1, Math.max(1, size >> (mips - 1)), `specular mip ${mips - 1}`),
  ].filter(Boolean);
  if (bad.length) console.error(`environment bake produced non-finite texels: ${bad.join(', ')}`);

  // --- restore ---
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindVertexArray(null);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  gl.deleteFramebuffer(fbo);
  gl.deleteVertexArray(vao);
  gl.deleteProgram(skyProgram);
  gl.deleteProgram(preProgram);
  gl.deleteProgram(brdfProgram);

  return {
    background,
    specular,
    brdf,
    size,
    mips,
    highDynamicRange: canFloat,
    dispose() {
      gl.deleteTexture(background);
      gl.deleteTexture(specular);
      gl.deleteTexture(brdf);
    },
  };
}

/**
 * Read one texel back and check it is finite.
 *
 * Worth the two microseconds: a single NaN mip renders as solid black metal with
 * no error anywhere, and that is a genuinely slow thing to track down from the
 * symptom.
 */
function verifyLevel(
  gl: WebGL2RenderingContext,
  fbo: WebGLFramebuffer,
  tex: WebGLTexture,
  level: number,
  size: number,
  label: string,
): string | null {
  try {
    attachFace(gl, fbo, tex, 2, level);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    const px = new Float32Array(4);
    gl.readPixels(size >> 1, size >> 1, 1, 1, gl.RGBA, gl.FLOAT, px);
    return Number.isFinite(px[0]) && Number.isFinite(px[1]) && Number.isFinite(px[2]) ? null : label;
  } catch {
    return null;
  }
}

function makeCube(gl: WebGL2RenderingContext, size: number, levels: number, internal: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  gl.texStorage2D(gl.TEXTURE_CUBE_MAP, levels, internal, size, size);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  return tex;
}

function attachFace(gl: WebGL2RenderingContext, fbo: WebGLFramebuffer, tex: WebGLTexture, face: number, level: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, tex, level,
  );
}

function setBasis(gl: WebGL2RenderingContext, program: WebGLProgram, face: number) {
  const [f, r, u] = FACES[face];
  gl.uniform3f(gl.getUniformLocation(program, 'uForward'), f[0], f[1], f[2]);
  gl.uniform3f(gl.getUniformLocation(program, 'uRight'), r[0], r[1], r[2]);
  gl.uniform3f(gl.getUniformLocation(program, 'uUp'), u[0], u[1], u[2]);
}

function compile(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`environment shader failed: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  const vs = make(gl.VERTEX_SHADER, vertexSrc);
  const fs = make(gl.FRAGMENT_SHADER, fragmentSrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`environment program failed: ${gl.getProgramInfoLog(p)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}
