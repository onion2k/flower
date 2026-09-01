import type { Vec3 } from '../geom/types';

/**
 * Screen-space ambient occlusion.
 *
 * The occlusion this project actually needs is *between* parts — a rivet head
 * against the plate it fastens, a scale against the one beneath it. That is not
 * something a part can know about itself, so baking it per part would neither
 * capture it nor survive instancing. It has to be found after the parts are
 * placed, which means screen space.
 */

export const KERNEL_SIZE = 24;
export const NOISE_SIZE = 4;

/**
 * Hemisphere kernel, weighted toward the origin so most samples land close to the
 * shaded point. An evenly spread kernel spends its budget on distant geometry and
 * misses exactly the tight contact this is for.
 */
export function makeKernel(count = KERNEL_SIZE): Vec3[] {
  // An array of triples, not a flat Float32Array: ogl resolves an indexed uniform
  // like uKernel[0] by testing Array.isArray on the value, which a typed array
  // fails. It then warns and uploads nothing, so every sample sits exactly on the
  // shaded point and the whole buffer comes back unoccluded.
  const kernel: Vec3[] = [];
  let seed = 1;
  const rand = () => {
    // deterministic, so a screenshot of one build matches the next
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    let v: Vec3 = [rand() * 2 - 1, rand() * 2 - 1, rand()];
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    v = [v[0] / length, v[1] / length, v[2] / length];
    const t = i / count;
    const scale = 0.1 + 0.9 * t * t;
    kernel.push([v[0] * scale, v[1] * scale, v[2] * scale]);
  }
  return kernel;
}

/** Per-pixel rotations, tiled 4x4. The blur below is sized to match this tile. */
export function makeNoise(size = NOISE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const angle = rand() * Math.PI * 2;
    data[i * 4] = Math.round((Math.cos(angle) * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((Math.sin(angle) * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  return data;
}

export const PREPASS_VERT = `#version 300 es
in vec3 position;
in vec3 normal;
in vec4 im0;
in vec4 im1;
in vec4 im2;
in vec4 im3;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

out vec3 vViewNormal;
out vec3 vViewPosition;

void main() {
  mat4 inst = mat4(im0, im1, im2, im3);
  vec4 world = inst * vec4(position, 1.0);
  vec4 view = viewMatrix * world;

  vViewNormal = mat3(viewMatrix) * (mat3(inst) * normal);
  vViewPosition = view.xyz;
  gl_Position = projectionMatrix * view;
}`;

export const PREPASS_FRAG = `#version 300 es
precision highp float;

in vec3 vViewNormal;
in vec3 vViewPosition;
out vec4 fragColor;

void main() {
  vec3 n = normalize(vViewNormal);
  // Two-sided geometry is normal here — pierced plates and thin blades are seen
  // from behind constantly — and a back-facing normal would occlude its own pixel.
  if (!gl_FrontFacing) n = -n;
  fragColor = vec4(n, -vViewPosition.z);
}`;

export const AO_VERT = `#version 300 es
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const AO_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uNormalDepth;
uniform sampler2D uNoise;
uniform vec3 uKernel[${KERNEL_SIZE}];
uniform mat4 uProjection;
uniform vec2 uResolution;
uniform vec2 uFocal;      // projectionMatrix[0][0], [1][1]
uniform float uRadius;
uniform float uBias;      // fraction of the radius
uniform float uIntensity;

/** Rebuild the view-space point from linear depth, without a position buffer. */
vec3 viewPositionFrom(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uFocal.x, ndc.y / uFocal.y, -1.0) * depth;
}

void main() {
  vec4 sampled = texture(uNormalDepth, vUv);
  float depth = sampled.w;

  // nothing was drawn here: background stays unoccluded
  if (depth <= 0.0) { fragColor = vec4(1.0); return; }

  vec3 normal = normalize(sampled.xyz);

  // Nudge the origin off the surface along its own normal. Without it the very
  // first samples sit within a texel's depth of the surface they came from.
  vec3 origin = viewPositionFrom(vUv, depth) + normal * (uRadius * 0.03);

  // The bias has to cover the depth uncertainty inside a single texel, and that
  // is not a constant: it is how many millimetres a pixel covers at this distance,
  // times the surface slope. Get it wrong and a tilted plate reads as occluding
  // itself in bands along its own depth gradient — and only when zoomed out,
  // because a pixel then spans far more of the surface. A fixed bias cannot be
  // right at both ends of that range.
  float facing = max(abs(normal.z), 0.05);
  float slope = sqrt(max(1.0 - facing * facing, 0.0)) / facing;
  float pixelSize = depth * 2.0 / (uFocal.y * uResolution.y);
  float bias = uRadius * uBias + pixelSize * slope * 2.0;

  vec2 noiseScale = uResolution / ${NOISE_SIZE}.0;
  vec3 rotation = texture(uNoise, vUv * noiseScale).xyz * 2.0 - 1.0;

  // Gram-Schmidt against the noise vector: a per-pixel rotated basis turns
  // banding from a small kernel into high-frequency noise the blur can remove
  vec3 tangent = normalize(rotation - normal * dot(rotation, normal));
  vec3 bitangent = cross(normal, tangent);
  mat3 tbn = mat3(tangent, bitangent, normal);

  float occlusion = 0.0;
  for (int i = 0; i < ${KERNEL_SIZE}; i++) {
    vec3 samplePos = origin + tbn * uKernel[i] * uRadius;

    vec4 clip = uProjection * vec4(samplePos, 1.0);
    vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

    float sceneDepth = texture(uNormalDepth, sampleUv).w;
    if (sceneDepth <= 0.0) continue;

    float sampleDepth = -samplePos.z;
    // Reject occluders far outside the radius, or a rivet in the foreground
    // darkens the whole plate behind it instead of its own contact ring.
    float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(abs(depth - sceneDepth), 1e-5));
    occlusion += (sceneDepth <= sampleDepth - bias ? 1.0 : 0.0) * rangeCheck;
  }

  float ao = 1.0 - (occlusion / float(${KERNEL_SIZE})) * uIntensity;
  fragColor = vec4(clamp(ao, 0.0, 1.0));
}`;

export const BLUR_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uAo;
uniform sampler2D uNormalDepth;
uniform vec2 uTexel;

void main() {
  float centreDepth = texture(uNormalDepth, vUv).w;
  float sum = 0.0;
  float weight = 0.0;

  // Box the size of the noise tile, but depth-aware: blurring across a silhouette
  // would smear a rivet's contact shadow out onto whatever is behind it.
  for (int x = -2; x < 2; x++) {
    for (int y = -2; y < 2; y++) {
      vec2 offset = vec2(float(x), float(y)) * uTexel;
      float d = texture(uNormalDepth, vUv + offset).w;
      float w = centreDepth <= 0.0 ? 1.0 : exp(-abs(d - centreDepth) * 8.0 / max(centreDepth, 1e-3));
      sum += texture(uAo, vUv + offset).r * w;
      weight += w;
    }
  }

  fragColor = vec4(sum / max(weight, 1e-5));
}`;
