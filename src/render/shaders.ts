export const PBR_VERT = `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;

// one transform per placement: a form is a few meshes and a lot of matrices
in vec4 im0;
in vec4 im1;
in vec4 im2;
in vec4 im3;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;

// Baked visibility, one texel per (placement, vertex): R = sum(vis * w), G = sum(w).
uniform sampler2D uOcclusion;
uniform int uOcclusionBase;
uniform int uVertexCount;
uniform float uOcclusionOn;

out vec3 vNormal;
out vec3 vWorld;
out vec3 vObject;
out vec2 vUv;
out float vAo;

void main() {
  mat4 inst = mat4(im0, im1, im2, im3);
  vec4 world = inst * vec4(position, 1.0);

  int index = uOcclusionBase + gl_InstanceID * uVertexCount + gl_VertexID;
  int width = textureSize(uOcclusion, 0).x;
  vec2 acc = texelFetch(uOcclusion, ivec2(index % width, index / width), 0).rg;
  float ao = acc.g > 0.0 ? clamp(acc.r / acc.g, 0.0, 1.0) : 1.0;
  vAo = mix(1.0, ao, uOcclusionOn);

  // placements are rigid with uniform scale, mirrors included, so rotating the
  // authored normal and renormalising is exact — no inverse transpose needed
  vNormal = normalize(mat3(inst) * normal);
  vWorld = world.xyz;
  vObject = position;
  vUv = uv;

  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const PBR_FRAG = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorld;
in vec3 vObject;
in vec2 vUv;
in float vAo;

out vec4 fragColor;

uniform samplerCube uSpecular;
uniform sampler2D uBrdf;
uniform float uMaxLod;

uniform vec3 uF0;
uniform float uRoughness;
uniform float uAnisotropy;
uniform float uHammer;
uniform float uPatina;
uniform vec3 uPatinaColour;

uniform vec3 cameraPosition;
uniform float uExposure;
uniform float uEnvSpin;
uniform float uDebug;   // 0 shaded, 1 normals, 2 uv, 3 roughness, 4 prefiltered, 5 brdf, 6 occlusion

const float PI = 3.14159265359;

// about Z, because that is the environment's up: the studio preset reads its
// height as d.z and hangs its key light at z = 2.6. Spinning about Y tumbled the
// sky over the horizon instead of turning it round the scene.
mat3 spinZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

/**
 * Tangent frame from screen-space derivatives rather than a vertex attribute.
 *
 * The generators already give every surface a meaningful parameterisation — u runs
 * along a sweep and around a revolve — so the brush direction of a finish is just
 * dP/du, and no extra attribute has to be built, stored or instanced.
 */
mat3 tangentFrame(vec3 n, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);

  vec3 dp2perp = cross(dp2, n);
  vec3 dp1perp = cross(n, dp1);
  vec3 t = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;
  float inv = inversesqrt(max(dot(t, t), dot(b, b)) + 1e-12);
  return mat3(t * inv, b * inv, n);
}

/** Planished dimpling: three crossed waves, which reads as hand-worked metal. */
float planish(vec3 p) {
  return sin(p.x * 1.7 + p.y * 0.9)
       * sin(p.y * 1.9 - p.z * 1.1)
       * sin(p.z * 1.6 + p.x * 0.8);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  return n;
}

// Narkowicz's ACES fit. Cheap, and it rolls specular highlights off instead of
// clipping them to white, which matters when the brightest thing on screen is a
// softbox reflected in polished gold.
vec3 tonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) n = -n;

  mat3 tbn = tangentFrame(n, vWorld, vUv);

  float roughness = uRoughness;
  vec3 f0 = uF0;
  float metallic = 1.0;

  // --- planishing: perturb the normal by the gradient of a height field ---
  if (uHammer > 0.0) {
    vec3 p = vObject * 0.55;
    float eps = 0.35;
    float h0 = planish(p);
    float hx = planish(p + tbn[0] * eps);
    float hy = planish(p + tbn[1] * eps);
    vec3 bump = (tbn[0] * (hx - h0) + tbn[1] * (hy - h0)) / eps;
    n = normalize(n - bump * uHammer * 0.22);
  }

  // --- patina: an oxide fraction that is not metal any more ---
  if (uPatina > 0.0) {
    float blotch = noise3(vObject * 0.32) * 0.65 + noise3(vObject * 0.9) * 0.35;
    float mask = smoothstep(0.62 - uPatina * 0.55, 0.78 - uPatina * 0.3, blotch);
    metallic = mix(1.0, 0.0, mask * uPatina);
    f0 = mix(f0, vec3(0.04), mask * uPatina);
    roughness = mix(roughness, min(roughness + 0.35, 0.95), mask * uPatina);
  }

  roughness = clamp(roughness, 0.03, 1.0);

  // --- anisotropy: bend the reflection vector along the brush direction ---
  vec3 reflectN = n;
  if (uAnisotropy > 0.0) {
    vec3 bitangent = tbn[1];
    vec3 anisoT = cross(bitangent, v);
    vec3 anisoN = cross(anisoT, bitangent);
    reflectN = normalize(mix(n, anisoN, uAnisotropy * (1.0 - roughness * 0.4)));
  }

  vec3 r = reflect(-v, reflectN);
  float ndv = clamp(dot(n, v), 0.001, 1.0);

  mat3 spin = spinZ(uEnvSpin);

  // Never sample the environment sharper than the pixel can show. A polished
  // surface curving away compresses the whole room into a few pixels, and an
  // explicit lod of zero there is pure aliasing; the footprint of the reflected
  // ray across the pixel gives the mip that just resolves it.
  float envSize = float(textureSize(uSpecular, 0).x);
  float footprint = max(length(dFdx(r)), length(dFdy(r)));
  float footLod = log2(max(footprint * envSize * 0.5, 1.0));
  float lod = max(roughness * uMaxLod, footLod);
  vec3 prefiltered = textureLod(uSpecular, spin * r, lod).rgb;
  vec2 ab = texture(uBrdf, vec2(ndv, roughness)).rg;

  // Baked visibility darkens the diffuse term directly. A mirror is a different
  // matter: what it reflects is whatever lies along one ray, not the hemisphere
  // average, so a polished surface keeps more of its reflection than its ambient
  // occlusion suggests. Lagarde's fit bends the term toward that as roughness
  // falls and the view grazes.
  float ao = vAo;
  float specOcclusion = clamp(pow(ndv + ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + ao, 0.0, 1.0);

  vec3 specular = prefiltered * (f0 * ab.x + ab.y) * specOcclusion;

  // Metal has no diffuse lobe, so this contributes only where patina has taken
  // hold. The roughest prefiltered mip stands in for an irradiance map — close
  // enough for a dull oxide, and it saves a whole convolution pass.
  vec3 irradiance = textureLod(uSpecular, spin * n, uMaxLod).rgb;
  vec3 diffuse = irradiance * uPatinaColour * (1.0 - metallic) * ao;

  vec3 colour = specular + diffuse;
  colour *= uExposure;

  if (uDebug > 5.5) colour = vec3(ao);
  else if (uDebug > 4.5) colour = vec3(ab, 0.0) * 4.0;
  else if (uDebug > 3.5) colour = prefiltered;
  else if (uDebug > 2.5) colour = vec3(roughness);
  else if (uDebug > 1.5) colour = vec3(vUv, 0.35);
  else if (uDebug > 0.5) colour = n * 0.5 + 0.5;
  else colour = tonemap(colour);

  fragColor = vec4(pow(colour, vec3(1.0 / 2.2)), 1.0);
}`;

/**
 * The ground: a matte disc under the piece, lit by the environment's downward
 * irradiance and darkened by the baked shadow, fading into the page colour at its
 * rim so it never reads as an object in its own right.
 */
export const GROUND_VERT = `#version 300 es
in vec3 position;   // unit disc in the XY plane

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCentre;
uniform float uRadius;

out vec2 vLocal;

void main() {
  vLocal = position.xy;
  vec3 world = uCentre + vec3(position.xy * uRadius, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

export const GROUND_FRAG = `#version 300 es
precision highp float;

in vec2 vLocal;
out vec4 fragColor;

uniform sampler2D uShadow;
uniform samplerCube uSpecular;
uniform float uMaxLod;
uniform float uExposure;
uniform float uEnvSpin;
uniform vec3 uBackground;
uniform vec3 uAlbedo;
uniform float uDebug;

mat3 spinZ(float a) {
  float c = cos(a), s = sin(a);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

vec3 tonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 acc = texture(uShadow, vLocal * 0.5 + 0.5).rg;
  float ao = acc.g > 0.0 ? clamp(acc.r / acc.g, 0.0, 1.0) : 1.0;

  vec3 irradiance = textureLod(uSpecular, spinZ(uEnvSpin) * vec3(0.0, 0.0, 1.0), uMaxLod).rgb;
  vec3 lit = pow(tonemap(irradiance * uAlbedo * ao * uExposure), vec3(1.0 / 2.2));

  float fade = 1.0 - smoothstep(0.3, 1.0, length(vLocal));
  vec3 colour = mix(uBackground, lit, fade);
  if (uDebug > 5.5) colour = vec3(ao);
  else if (uDebug > 0.5) colour = uBackground;
  fragColor = vec4(colour, 1.0);
}`;
