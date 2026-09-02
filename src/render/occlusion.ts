/**
 * Baked ambient occlusion and a ground shadow, from the same set of depth maps.
 *
 * Image-based lighting on its own lights the inside of a cup as brightly as its
 * rim, which is the single biggest reason a rendered rose reads as foil rather
 * than metal. The cure is visibility: for every vertex of every placement, what
 * fraction of the sky above its surface can it actually see?
 *
 * Instancing makes this awkward — the same petal mesh is placed forty times and
 * each copy is shadowed differently — so the answer cannot live in a vertex
 * attribute. It lives in a texture instead, one texel per (placement, vertex),
 * and the main vertex shader fetches its own texel by gl_InstanceID and
 * gl_VertexID.
 *
 * The bake itself is shadow accumulation: render scene depth from a few hundred
 * directions, then for each direction splat one point per (placement,
 * vertex) into the lookup texture, adding weighted visibility with additive
 * blending. A ground disc under the piece is rendered into the same depth maps as
 * an occluder and receives its own shadow texture the same way, which is what
 * finally puts the piece on a table rather than in space.
 *
 * The directions are drawn in proportion to the environment's brightness, not
 * spread uniformly. Uniform hemisphere occlusion is a poor fit for a studio: a
 * small flower on a tall stem blocks a sliver of the sky from any point on the
 * table, so its ambient shadow is a faint smudge — yet under a softbox it casts a
 * clear soft shadow, because nearly all the light comes from that one patch of
 * sky. Sampling by radiance makes the result the fraction of incoming light that
 * actually arrives, which is what the eye reads as shadow, and it puts the sample
 * budget where it shows: hundreds of directions across the softbox give a smooth
 * penumbra where the same count spread over the sphere gave a handful of hard
 * shadows stacked on top of one another.
 */

import type { Mesh } from '../mesh/types';

export interface OcclusionGroup {
  mesh: Mesh;
  /** Column-major 4x4 per placement, 16 floats each. */
  matrices: Float32Array;
}

export interface Occlusion {
  /** Per-(placement, vertex) visibility: R = sum(vis * w), G = sum(w). */
  lookup: WebGLTexture;
  width: number;
  height: number;
  /** First texel index of each group, in the order the groups were given. */
  bases: number[];
  /** Ground shadow, same encoding, covering the square around the disc. */
  ground: WebGLTexture;
  groundSize: number;
  groundCentre: [number, number, number];
  groundRadius: number;
  dispose(): void;
}

export interface OcclusionOptions {
  /**
   * The environment to draw directions from: a float cube, its level-0 face
   * size, the mip to read (a small one — a few thousand texels is plenty) and
   * its spin about Z.
   */
  env?: { cube: WebGLTexture; size: number; lod: number; spin: number };
  directions?: number;
  depthSize?: number;
  groundSize?: number;
  /** Ground disc radius as a multiple of the piece's bounding radius. */
  groundScale?: number;
}

const LOOKUP_WIDTH = 2048;

// Attribute slots, shared by every program and VAO here.
const A_POSITION = 0;
const A_NORMAL = 1;
const A_IM0 = 2;

const INSTANCE_ATTRS = `
in vec4 im0;
in vec4 im1;
in vec4 im2;
in vec4 im3;
`;

const DEPTH_VERT = `#version 300 es
in vec3 position;
${INSTANCE_ATTRS}
uniform mat4 uViewProj;
void main() {
  mat4 inst = mat4(im0, im1, im2, im3);
  gl_Position = uViewProj * inst * vec4(position, 1.0);
}`;

const DEPTH_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`;



/** One point per (placement, vertex), splatted at its own texel. */
const ACCUM_VERT = `#version 300 es
in vec3 position;
in vec3 normal;
${INSTANCE_ATTRS}

uniform mat4 uViewProj;
uniform vec3 uDir;
uniform float uBase;
uniform float uVertexCount;
uniform vec2 uLookupSize;
uniform float uNormalOffset;
uniform float uDepthBias;
uniform sampler2D uDepth;

out vec2 vAccum;

void main() {
  mat4 inst = mat4(im0, im1, im2, im3);
  vec3 p = (inst * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(inst) * normal);

  float w = dot(n, uDir);
  float vis = 0.0;
  if (w > 0.0) {
    // Step off the surface toward the light before testing, so a vertex never
    // shadows itself, then test with a small slack in depth for the rest.
    vec4 clip = uViewProj * vec4(p + n * uNormalOffset, 1.0);
    vec3 ndc = clip.xyz / clip.w;
    vec2 uv = ndc.xy * 0.5 + 0.5;
    float depth = ndc.z * 0.5 + 0.5;
    float stored = texture(uDepth, uv).r;
    vis = depth - uDepthBias <= stored ? 1.0 : 0.0;
  } else {
    w = 0.0;
  }
  vAccum = vec2(vis * w, w);

  float index = uBase + float(gl_InstanceID) * uVertexCount + float(gl_VertexID);
  float px = mod(index, uLookupSize.x);
  float py = floor(index / uLookupSize.x);
  gl_Position = vec4((vec2(px, py) + 0.5) / uLookupSize * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;

const ACCUM_FRAG = `#version 300 es
precision highp float;
in vec2 vAccum;
uniform float uScale;
out vec4 fragColor;
void main() { fragColor = vec4(vAccum * uScale, 0.0, 0.0); }`;

const GROUND_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const GROUND_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat4 uViewProj;
uniform vec3 uDir;
uniform vec3 uCentre;
uniform float uRadius;
uniform float uNormalOffset;
uniform float uDepthBias;
uniform float uScale;
uniform sampler2D uDepth;
out vec4 fragColor;
void main() {
  vec3 p = uCentre + vec3((vUv - 0.5) * 2.0 * uRadius, uNormalOffset);
  vec4 clip = uViewProj * vec4(p, 1.0);
  vec3 ndc = clip.xyz / clip.w;
  float depth = ndc.z * 0.5 + 0.5;
  float stored = texture(uDepth, ndc.xy * 0.5 + 0.5).r;
  float vis = depth - uDepthBias <= stored ? 1.0 : 0.0;
  float w = uDir.z;
  fragColor = vec4(vis * w, w, 0.0, 0.0) * uScale;
}`;

export function bakeOcclusion(
  gl: WebGL2RenderingContext,
  groups: OcclusionGroup[],
  opts: OcclusionOptions = {},
): Occlusion | null {
  if (!groups.length) return null;

  const directions = opts.directions ?? 256;
  const depthSize = opts.depthSize ?? 2048;
  const groundSize = opts.groundSize ?? 512;
  const groundScale = opts.groundScale ?? 1.8;

  // --- world bounds, from the eight corners of each placed local box ---
  const bounds = worldBounds(groups);
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const pieceRadius = Math.max(
    Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) / 2,
    1e-3,
  );
  const groundZ = bounds.min[2];
  const groundRadius = pieceRadius * groundScale;
  const groundCentre: [number, number, number] = [cx, cy, groundZ];
  // everything the depth maps must cover: the piece and the disc beneath it
  const sceneRadius = Math.hypot(groundRadius, cz - groundZ) * 1.05;
  const texel = (2 * sceneRadius) / depthSize;

  // --- lookup layout ---
  const bases: number[] = [];
  let total = 0;
  for (const g of groups) {
    bases.push(total);
    total += (g.mesh.positions.length / 3) * (g.matrices.length / 16);
  }
  const width = LOOKUP_WIDTH;
  const height = Math.max(1, Math.ceil(total / width));
  if (height > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
    console.warn(`occlusion: ${total} vertices exceed the lookup texture; skipping`);
    return null;
  }

  // Float targets accumulate exactly; the 8-bit fallback scales each sample so
  // the sum of weights lands near 1 (cos over a sphere averages 1/4).
  const canFloat = !!gl.getExtension('EXT_color_buffer_float');
  const internal = canFloat ? gl.RG16F : gl.RGBA8;
  const scale = canFloat ? 1 : 4 / directions;

  const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
  const prevClear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;

  const dirs = opts.env
    ? sampleEnvironment(gl, opts.env, directions)
    : Array.from({ length: directions }, (_, i) => fibonacciDirection(i, directions));

  const depthProgram = compile(gl, DEPTH_VERT, DEPTH_FRAG);
  const accumProgram = compile(gl, ACCUM_VERT, ACCUM_FRAG);
  const groundProgram = compile(gl, GROUND_VERT, GROUND_FRAG);

  // --- geometry: a VAO per group, plus the ground disc ---
  const buffers: WebGLBuffer[] = [];
  const vaos = groups.map((g) => {
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    bindArray(gl, buffers, g.mesh.positions, A_POSITION, 3, 0);
    bindArray(gl, buffers, g.mesh.normals, A_NORMAL, 3, 0);
    const inst = gl.createBuffer()!;
    buffers.push(inst);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, g.matrices, gl.STATIC_DRAW);
    for (let k = 0; k < 4; k++) {
      gl.enableVertexAttribArray(A_IM0 + k);
      gl.vertexAttribPointer(A_IM0 + k, 4, gl.FLOAT, false, 64, k * 16);
      gl.vertexAttribDivisor(A_IM0 + k, 1);
    }
    const idx = gl.createBuffer()!;
    buffers.push(idx);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.mesh.indices, gl.STATIC_DRAW);
    return vao;
  });

  const disc = discMesh(groundCentre, groundRadius, 64);
  const discVao = gl.createVertexArray()!;
  gl.bindVertexArray(discVao);
  bindArray(gl, buffers, disc.positions, A_POSITION, 3, 0);
  const discIdx = gl.createBuffer()!;
  buffers.push(discIdx);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, discIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, disc.indices, gl.STATIC_DRAW);
  // a single identity placement, as constant attributes
  gl.vertexAttrib4f(A_IM0, 1, 0, 0, 0);
  gl.vertexAttrib4f(A_IM0 + 1, 0, 1, 0, 0);
  gl.vertexAttrib4f(A_IM0 + 2, 0, 0, 1, 0);
  gl.vertexAttrib4f(A_IM0 + 3, 0, 0, 0, 1);
  gl.bindVertexArray(null);

  // --- targets ---
  const depthTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, depthSize, depthSize);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const depthFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, depthFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);

  const lookup = makeTarget(gl, width, height, internal);
  const lookupFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, lookupFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lookup, 0);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const ground = makeTarget(gl, groundSize, groundSize, internal);
  const groundFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, groundFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ground, 0);
  gl.viewport(0, 0, groundSize, groundSize);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // --- uniforms that never change across directions ---
  const normalOffset = texel * 2.5;
  const depthBias = 1.5 / depthSize; // depth spans 4 * sceneRadius; ~1.5 texels of slack
  const dLoc = {
    viewProj: gl.getUniformLocation(depthProgram, 'uViewProj'),
  };
  gl.useProgram(accumProgram);
  gl.uniform2f(gl.getUniformLocation(accumProgram, 'uLookupSize'), width, height);
  gl.uniform1f(gl.getUniformLocation(accumProgram, 'uNormalOffset'), normalOffset);
  gl.uniform1f(gl.getUniformLocation(accumProgram, 'uDepthBias'), depthBias);
  gl.uniform1f(gl.getUniformLocation(accumProgram, 'uScale'), scale);
  gl.uniform1i(gl.getUniformLocation(accumProgram, 'uDepth'), 0);
  const aLoc = {
    viewProj: gl.getUniformLocation(accumProgram, 'uViewProj'),
    dir: gl.getUniformLocation(accumProgram, 'uDir'),
    base: gl.getUniformLocation(accumProgram, 'uBase'),
    vertexCount: gl.getUniformLocation(accumProgram, 'uVertexCount'),
  };
  gl.useProgram(groundProgram);
  gl.uniform3f(gl.getUniformLocation(groundProgram, 'uCentre'), cx, cy, groundZ);
  gl.uniform1f(gl.getUniformLocation(groundProgram, 'uRadius'), groundRadius);
  gl.uniform1f(gl.getUniformLocation(groundProgram, 'uNormalOffset'), normalOffset);
  gl.uniform1f(gl.getUniformLocation(groundProgram, 'uDepthBias'), depthBias);
  gl.uniform1f(gl.getUniformLocation(groundProgram, 'uScale'), scale);
  gl.uniform1i(gl.getUniformLocation(groundProgram, 'uDepth'), 0);
  const gLoc = {
    viewProj: gl.getUniformLocation(groundProgram, 'uViewProj'),
    dir: gl.getUniformLocation(groundProgram, 'uDir'),
  };

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);

  const viewProj = new Float32Array(16);
  for (let i = 0; i < directions; i++) {
    const d = dirs[i];
    orthoFromDirection(viewProj, d, [cx, cy, (groundZ + bounds.max[2]) / 2], sceneRadius);

    // 1. depth of everything, seen from this direction
    gl.bindFramebuffer(gl.FRAMEBUFFER, depthFbo);
    gl.viewport(0, 0, depthSize, depthSize);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(depthProgram);
    gl.uniformMatrix4fv(dLoc.viewProj, false, viewProj);
    groups.forEach((g, k) => {
      gl.bindVertexArray(vaos[k]);
      gl.drawElementsInstanced(gl.TRIANGLES, g.mesh.indices.length, gl.UNSIGNED_INT, 0, g.matrices.length / 16);
    });
    if (d[2] > 0) {
      // the disc only occludes from above; from below it is the table's underside
      gl.bindVertexArray(discVao);
      gl.drawElements(gl.TRIANGLES, disc.indices.length, gl.UNSIGNED_INT, 0);
    }

    // 2. splat visibility for every (placement, vertex)
    gl.bindFramebuffer(gl.FRAMEBUFFER, lookupFbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(accumProgram);
    gl.uniformMatrix4fv(aLoc.viewProj, false, viewProj);
    gl.uniform3f(aLoc.dir, d[0], d[1], d[2]);
    groups.forEach((g, k) => {
      const vertexCount = g.mesh.positions.length / 3;
      gl.uniform1f(aLoc.base, bases[k]);
      gl.uniform1f(aLoc.vertexCount, vertexCount);
      gl.bindVertexArray(vaos[k]);
      gl.drawArraysInstanced(gl.POINTS, 0, vertexCount, g.matrices.length / 16);
    });

    // 3. the ground, for directions that come from above it
    if (d[2] > 0.02) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, groundFbo);
      gl.viewport(0, 0, groundSize, groundSize);
      gl.useProgram(groundProgram);
      gl.uniformMatrix4fv(gLoc.viewProj, false, viewProj);
      gl.uniform3f(gLoc.dir, d[0], d[1], d[2]);
      gl.bindVertexArray(discVao); // any VAO will do; the triangle comes from gl_VertexID
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  // --- cleanup: the lookup and ground textures survive, everything else goes ---
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  gl.clearColor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]);
  gl.deleteFramebuffer(depthFbo);
  gl.deleteFramebuffer(lookupFbo);
  gl.deleteFramebuffer(groundFbo);
  gl.deleteTexture(depthTex);
  for (const v of vaos) gl.deleteVertexArray(v);
  gl.deleteVertexArray(discVao);
  for (const b of buffers) gl.deleteBuffer(b);
  gl.deleteProgram(depthProgram);
  gl.deleteProgram(accumProgram);
  gl.deleteProgram(groundProgram);

  return {
    lookup,
    width,
    height,
    bases,
    ground,
    groundSize,
    groundCentre,
    groundRadius,
    dispose() {
      gl.deleteTexture(lookup);
      gl.deleteTexture(ground);
    },
  };
}

function bindArray(
  gl: WebGL2RenderingContext,
  keep: WebGLBuffer[],
  data: Float32Array,
  slot: number,
  size: number,
  divisor: number,
) {
  const buf = gl.createBuffer()!;
  keep.push(buf);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(slot);
  gl.vertexAttribPointer(slot, size, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(slot, divisor);
}

function makeTarget(gl: WebGL2RenderingContext, w: number, h: number, internal: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
  // the lookup is fetched by texel; the ground is filtered when drawn
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function discMesh(centre: [number, number, number], radius: number, segments: number) {
  const positions = new Float32Array((segments + 1) * 3);
  positions.set(centre, 0);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions[(i + 1) * 3] = centre[0] + Math.cos(a) * radius;
    positions[(i + 1) * 3 + 1] = centre[1] + Math.sin(a) * radius;
    positions[(i + 1) * 3 + 2] = centre[2];
  }
  const indices = new Uint32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = ((i + 1) % segments) + 1;
  }
  return { positions, indices };
}

function worldBounds(groups: OcclusionGroup[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const g of groups) {
    const p = g.mesh.positions;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < lo[k]) lo[k] = p[i + k];
        if (p[i + k] > hi[k]) hi[k] = p[i + k];
      }
    }
    for (let m = 0; m < g.matrices.length; m += 16) {
      const M = g.matrices;
      for (let corner = 0; corner < 8; corner++) {
        const x = corner & 1 ? hi[0] : lo[0];
        const y = corner & 2 ? hi[1] : lo[1];
        const z = corner & 4 ? hi[2] : lo[2];
        const wx = M[m] * x + M[m + 4] * y + M[m + 8] * z + M[m + 12];
        const wy = M[m + 1] * x + M[m + 5] * y + M[m + 9] * z + M[m + 13];
        const wz = M[m + 2] * x + M[m + 6] * y + M[m + 10] * z + M[m + 14];
        if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
        if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
        if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
      }
    }
  }
  return { min, max };
}

/**
 * Directions drawn from a cube map in proportion to radiance times solid angle.
 *
 * Reads one small mip back, builds a distribution over its texels, then walks it
 * with a stratified sequence so the samples tile each bright patch evenly rather
 * than clumping. A floor on the radiance keeps a few samples in the dark, so a
 * shadow stays darker than its surroundings rather than black.
 *
 * With directions chosen this way, the per-sample weight in the bake reduces to
 * the cosine alone: radiance over its own probability is a constant, and the
 * ratio that comes out of the accumulation buffer cancels constants.
 */
function sampleEnvironment(
  gl: WebGL2RenderingContext,
  env: NonNullable<OcclusionOptions['env']>,
  count: number,
): Array<[number, number, number]> {
  const real = Math.max(1, env.size >> env.lod);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const faces: Float32Array[] = [];
  for (let f = 0; f < 6; f++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, env.cube, env.lod);
    const buf = new Float32Array(real * real * 4);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      return Array.from({ length: count }, (_, i) => fibonacciDirection(i, count));
    }
    gl.readPixels(0, 0, real, real, gl.RGBA, gl.FLOAT, buf);
    faces.push(buf);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  const faceSize = real;

  // --- distribution over texels ---
  const n = 6 * real * real;
  const cdf = new Float64Array(n);
  let acc = 0;
  let mean = 0;
  for (let f = 0; f < 6; f++) {
    for (let y = 0; y < real; y++) {
      for (let x = 0; x < real; x++) {
        const i = (y * faceSize + x) * 4;
        const lum = 0.2126 * faces[f][i] + 0.7152 * faces[f][i + 1] + 0.0722 * faces[f][i + 2];
        mean += lum;
      }
    }
  }
  mean /= n;
  const floor = mean * 0.08;
  for (let f = 0; f < 6; f++) {
    for (let y = 0; y < real; y++) {
      for (let x = 0; x < real; x++) {
        const i = (y * faceSize + x) * 4;
        const lum = 0.2126 * faces[f][i] + 0.7152 * faces[f][i + 1] + 0.0722 * faces[f][i + 2];
        const sc = (2 * (x + 0.5)) / real - 1;
        const tc = (2 * (y + 0.5)) / real - 1;
        const solid = 4 / Math.pow(1 + sc * sc + tc * tc, 1.5);
        acc += (lum + floor) * solid;
        cdf[(f * real + y) * real + x] = acc;
      }
    }
  }

  // --- stratified draw ---
  const c = Math.cos(env.spin), s = Math.sin(env.spin);
  const out: Array<[number, number, number]> = [];
  for (let k = 0; k < count; k++) {
    const u = ((k + 0.5) / count) * acc;
    // binary search
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1; else hi = mid;
    }
    const f = Math.floor(lo / (real * real));
    const rem = lo - f * real * real;
    const y = Math.floor(rem / real);
    const x = rem - y * real;
    const sc = (2 * (x + radicalInverse(k, 2))) / real - 1;
    const tc = (2 * (y + radicalInverse(k, 3))) / real - 1;
    const d = cubeDirection(f, sc, tc);
    // the shader samples the cube at spin * d, so the world direction is the inverse spin
    out.push([c * d[0] - s * d[1], s * d[0] + c * d[1], d[2]]);
  }
  return out;
}

/** GL cube face texel (sc, tc) to a unit direction. */
function cubeDirection(face: number, sc: number, tc: number): [number, number, number] {
  let v: [number, number, number];
  switch (face) {
    case 0: v = [1, -tc, -sc]; break;
    case 1: v = [-1, -tc, sc]; break;
    case 2: v = [sc, 1, tc]; break;
    case 3: v = [sc, -1, -tc]; break;
    case 4: v = [sc, -tc, 1]; break;
    default: v = [-sc, -tc, -1]; break;
  }
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function radicalInverse(i: number, base: number) {
  let inv = 1 / base, r = 0, f = inv;
  while (i > 0) {
    r += f * (i % base);
    i = Math.floor(i / base);
    f *= inv;
  }
  return r;
}

/** Point i of n, spread evenly over the sphere. */
function fibonacciDirection(i: number, n: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const z = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const a = golden * i;
  return [Math.cos(a) * r, Math.sin(a) * r, z];
}

/**
 * Orthographic view looking along -d at `centre`, with the camera pulled back
 * far enough that a sphere of `radius` fits in depth: the range is 4 * radius.
 */
function orthoFromDirection(out: Float32Array, d: [number, number, number], centre: number[], radius: number) {
  const up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  // right = up x d, trueUp = d x right
  const rx = up[1] * d[2] - up[2] * d[1];
  const ry = up[2] * d[0] - up[0] * d[2];
  const rz = up[0] * d[1] - up[1] * d[0];
  const rl = Math.hypot(rx, ry, rz);
  const r = [rx / rl, ry / rl, rz / rl];
  const u = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]];

  const eye = [centre[0] + d[0] * radius * 2, centre[1] + d[1] * radius * 2, centre[2] + d[2] * radius * 2];
  // view: rows are r, u, d (camera looks along -d, so d is the +z axis of view space)
  const view = [
    r[0], u[0], d[0], 0,
    r[1], u[1], d[1], 0,
    r[2], u[2], d[2], 0,
    -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]),
    -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]),
    -(d[0] * eye[0] + d[1] * eye[1] + d[2] * eye[2]),
    1,
  ];
  const near = 0, far = radius * 4;
  const proj = [
    1 / radius, 0, 0, 0,
    0, 1 / radius, 0, 0,
    0, 0, -2 / (far - near), 0,
    0, 0, -(far + near) / (far - near), 1,
  ];
  // out = proj * view, column-major
  for (let c = 0; c < 4; c++) {
    for (let rI = 0; rI < 4; rI++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += proj[k * 4 + rI] * view[c * 4 + k];
      out[c * 4 + rI] = s;
    }
  }
}

function compile(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`occlusion shader failed: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  const vs = make(gl.VERTEX_SHADER, vertexSrc);
  const fs = make(gl.FRAGMENT_SHADER, fragmentSrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, A_POSITION, 'position');
  gl.bindAttribLocation(p, A_NORMAL, 'normal');
  for (let k = 0; k < 4; k++) gl.bindAttribLocation(p, A_IM0 + k, `im${k}`);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`occlusion program failed: ${gl.getProgramInfoLog(p)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}
