/**
 * WGSL for the three things drawn in the scene pass: the metal, the ground disc
 * and the anchor lines. All three share bind group 0, the frame: camera,
 * exposure, environment textures and the baked occlusion.
 *
 * Every shader here writes linear HDR; tonemapping is the post chain's job.
 */

export const FRAME_STRUCT = `
struct Frame {
  viewProj: mat4x4f,
  cameraPos: vec3f,
  exposure: f32,
  envSpin: f32,
  debug: f32,      // 0 shaded, 1 normals, 2 uv, 3 roughness, 4 prefiltered, 5 brdf, 6 occlusion, 7 wear
  maxLod: f32,
  occlusionOn: f32,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var envSpecular: texture_cube<f32>;
@group(0) @binding(2) var envBrdf: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<storage, read> occlusion: array<u32>;
`;

const COMMON = `
// about Z, because that is the environment's up
fn spinZ(a: f32) -> mat3x3f {
  let c = cos(a); let s = sin(a);
  return mat3x3f(vec3f(c, -s, 0.0), vec3f(s, c, 0.0), vec3f(0.0, 0.0, 1.0));
}

fn hash13(p0: vec3f) -> f32 {
  var p = fract(p0 * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

fn noise3(p: vec3f) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3f(0.0, 0.0, 0.0)), hash13(i + vec3f(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3f(0.0, 1.0, 0.0)), hash13(i + vec3f(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3f(0.0, 0.0, 1.0)), hash13(i + vec3f(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3f(0.0, 1.0, 1.0)), hash13(i + vec3f(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;

export const PBR_WGSL = `
${FRAME_STRUCT}
${COMMON}

struct Material {
  f0: vec3f,
  roughness: f32,
  anisotropy: f32,
  hammer: f32,
  patina: f32,
  wear: f32,
  patinaColour: vec3f,
  _pad: f32,
  occlusionBase: u32,
  vertexCount: u32,
  _pad2: vec2u,
};
@group(1) @binding(0) var<uniform> material: Material;

struct VsIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) wear: f32,
  @location(4) im0: vec4f,
  @location(5) im1: vec4f,
  @location(6) im2: vec4f,
  @location(7) im3: vec4f,
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
};

struct VsOut {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) world: vec3f,
  @location(2) object: vec3f,
  @location(3) uv: vec2f,
  @location(4) ao: f32,
  @location(5) wear: f32,
};

@vertex fn vsMain(in: VsIn) -> VsOut {
  let inst = mat4x4f(in.im0, in.im1, in.im2, in.im3);
  let world = inst * vec4f(in.position, 1.0);

  // baked visibility, one pair of fixed-point sums per (placement, vertex)
  let index = material.occlusionBase + in.iid * material.vertexCount + in.vid;
  let r = f32(occlusion[2u * index]);
  let g = f32(occlusion[2u * index + 1u]);
  let ao = select(1.0, clamp(r / g, 0.0, 1.0), g > 0.0);

  var out: VsOut;
  out.clip = frame.viewProj * world;
  // placements are rigid with uniform scale, so rotating the normal is exact
  out.normal = normalize(mat3x3f(inst[0].xyz, inst[1].xyz, inst[2].xyz) * in.normal);
  out.world = world.xyz;
  out.object = in.position;
  out.uv = in.uv;
  out.ao = mix(1.0, ao, frame.occlusionOn);
  out.wear = in.wear;
  return out;
}

// Tangent frame from screen-space derivatives: u runs along a sweep and around
// a revolve, so dP/du is the brush direction of a finish.
fn tangentFrame(n: vec3f, p: vec3f, uv: vec2f) -> mat3x3f {
  let dp1 = dpdx(p); let dp2 = dpdy(p);
  let duv1 = dpdx(uv); let duv2 = dpdy(uv);
  let dp2perp = cross(dp2, n);
  let dp1perp = cross(n, dp1);
  let t = dp2perp * duv1.x + dp1perp * duv2.x;
  let b = dp2perp * duv1.y + dp1perp * duv2.y;
  let inv = inverseSqrt(max(dot(t, t), dot(b, b)) + 1e-12);
  return mat3x3f(t * inv, b * inv, n);
}

/** Planished dimpling: three crossed waves. */
fn planish(p: vec3f) -> f32 {
  return sin(p.x * 1.7 + p.y * 0.9) * sin(p.y * 1.9 - p.z * 1.1) * sin(p.z * 1.6 + p.x * 0.8);
}

@fragment fn fsMain(in: VsOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  let v = normalize(frame.cameraPos - in.world);
  if (!frontFacing) { n = -n; }

  let tbn = tangentFrame(n, in.world, in.uv);

  var roughness = material.roughness;
  var f0 = material.f0;
  var metallic = 1.0;

  // --- planishing: perturb the normal by the gradient of a height field ---
  if (material.hammer > 0.0) {
    let p = in.object * 0.55;
    let eps = 0.35;
    let h0 = planish(p);
    let hx = planish(p + tbn[0] * eps);
    let hy = planish(p + tbn[1] * eps);
    let bump = (tbn[0] * (hx - h0) + tbn[1] * (hy - h0)) / eps;
    n = normalize(n - bump * material.hammer * 0.22);
  }

  // --- patina: an oxide fraction that is not metal any more ---
  if (material.patina > 0.0) {
    let blotch = noise3(in.object * 0.32) * 0.65 + noise3(in.object * 0.9) * 0.35;
    let mask = smoothstep(0.62 - material.patina * 0.55, 0.78 - material.patina * 0.3, blotch);
    metallic = mix(1.0, 0.0, mask * material.patina);
    f0 = mix(f0, vec3f(0.04), mask * material.patina);
    roughness = mix(roughness, min(roughness + 0.35, 0.95), mask * material.patina);
  }

  // --- wear: edges handled bright, creases left dull ---
  let edge = smoothstep(0.05, 0.8, in.wear) * material.wear;
  var crease = smoothstep(0.05, 0.8, -in.wear) * material.wear;
  crease *= 0.7 + 0.6 * noise3(in.object * 1.7);
  roughness = mix(roughness, roughness * 0.45, edge);
  roughness = mix(roughness, min(roughness + 0.3, 0.95), crease);
  f0 = mix(f0, f0 * 0.55, crease * 0.8);
  metallic = mix(metallic, metallic * 0.6, crease * 0.6);

  // --- specular anti-aliasing: widen the lobe by the normal's variance across the pixel ---
  {
    let dnx = dpdx(n); let dny = dpdy(n);
    let variance = 0.25 * (dot(dnx, dnx) + dot(dny, dny));
    let kernel = min(2.0 * variance, 0.18);
    let alpha = roughness * roughness;
    roughness = sqrt(sqrt(alpha * alpha + kernel));
  }

  roughness = clamp(roughness, 0.03, 1.0);

  // --- anisotropy: bend the reflection vector along the brush direction ---
  var reflectN = n;
  if (material.anisotropy > 0.0) {
    let bitangent = tbn[1];
    let anisoT = cross(bitangent, v);
    let anisoN = cross(anisoT, bitangent);
    reflectN = normalize(mix(n, anisoN, material.anisotropy * (1.0 - roughness * 0.4)));
  }

  let r = reflect(-v, reflectN);
  let ndv = clamp(dot(n, v), 0.001, 1.0);
  let spin = spinZ(frame.envSpin);

  // never sample the environment sharper than the pixel can show
  let envSize = f32(textureDimensions(envSpecular).x);
  let footprint = max(length(dpdx(r)), length(dpdy(r)));
  let footLod = log2(max(footprint * envSize * 0.5, 1.0));
  let lod = max(roughness * frame.maxLod, footLod);
  let prefiltered = textureSampleLevel(envSpecular, linearSampler, spin * r, lod).rgb;
  let ab = textureSampleLevel(envBrdf, linearSampler, vec2f(ndv, roughness), 0.0).rg;

  // Lagarde's specular occlusion: a mirror keeps more of its reflection than
  // its hemisphere visibility suggests
  let ao = in.ao;
  let specOcclusion = clamp(pow(ndv + ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + ao, 0.0, 1.0);
  let specular = prefiltered * (f0 * ab.x + ab.y) * specOcclusion;

  // metal has no diffuse lobe, so this only shows where patina has taken hold
  let irradiance = textureSampleLevel(envSpecular, linearSampler, spin * n, frame.maxLod).rgb;
  let diffuse = irradiance * material.patinaColour * (1.0 - metallic) * ao;

  var colour = (specular + diffuse) * frame.exposure;

  let d = frame.debug;
  if (d > 6.5) {
    colour = select(vec3f(0.3, 0.3 * (1.0 + in.wear), 0.3 * (1.0 + in.wear)), vec3f(0.3 + in.wear * 0.7), in.wear > 0.0);
  } else if (d > 5.5) { colour = vec3f(ao); }
  else if (d > 4.5) { colour = vec3f(ab, 0.0) * 4.0; }
  else if (d > 3.5) { colour = prefiltered; }
  else if (d > 2.5) { colour = vec3f(roughness); }
  else if (d > 1.5) { colour = vec3f(in.uv, 0.35); }
  else if (d > 0.5) { colour = n * 0.5 + 0.5; }

  return vec4f(colour, 1.0);
}
`;

export const GROUND_WGSL = `
${FRAME_STRUCT}
${COMMON}

struct Ground {
  centre: vec3f,
  radius: f32,
  background: vec3f,   // linear: what tonemaps to the page colour
  _pad: f32,
  albedo: vec3f,
  _pad2: f32,
};
@group(1) @binding(0) var<uniform> ground: Ground;
@group(1) @binding(1) var shadow: texture_2d<f32>;

struct VsOut { @builtin(position) clip: vec4f, @location(0) local: vec2f };

@vertex fn vsMain(@location(0) position: vec3f) -> VsOut {
  var out: VsOut;
  out.local = position.xy;
  let world = ground.centre + vec3f(position.xy * ground.radius, 0.0);
  out.clip = frame.viewProj * vec4f(world, 1.0);
  return out;
}

@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let acc = textureSample(shadow, linearSampler, in.local * 0.5 + 0.5).rg;
  let ao = select(1.0, clamp(acc.r / acc.g, 0.0, 1.0), acc.g > 0.0);
  let irradiance = textureSampleLevel(envSpecular, linearSampler, spinZ(frame.envSpin) * vec3f(0.0, 0.0, 1.0), frame.maxLod).rgb;
  let lit = irradiance * ground.albedo * ao * frame.exposure;
  let fade = 1.0 - smoothstep(0.3, 1.0, length(in.local));
  var colour = mix(ground.background, lit, fade);
  if (frame.debug > 5.5 && frame.debug < 6.5) { colour = vec3f(ao); }
  else if (frame.debug > 0.5) { colour = ground.background; }
  return vec4f(colour, 1.0);
}
`;

export const ANCHOR_WGSL = `
${FRAME_STRUCT}
struct VsOut { @builtin(position) clip: vec4f, @location(0) colour: vec3f };
@vertex fn vsMain(@location(0) position: vec3f, @location(1) colour: vec3f) -> VsOut {
  var out: VsOut;
  out.clip = frame.viewProj * vec4f(position, 1.0);
  out.colour = colour;
  return out;
}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f { return vec4f(in.colour, 1.0); }
`;
