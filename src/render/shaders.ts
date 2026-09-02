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
  model: u32,          // 0 metal, 1 nacre
  _pad2: u32,
  baseColour: vec3f,
  orient: f32,
};
@group(1) @binding(0) var<uniform> material: Material;

// --- the scene, for tracing reflected rays ---
struct Node { bmin: vec3f, left: u32, bmax: vec3f, count: u32 };
struct Inst {
  worldToObject: mat4x4f,
  objectToWorld: mat4x4f,
  bmin: vec3f, nodeOffset: u32,
  bmax: vec3f, triOffset: u32,
  group: u32, occlusionBase: u32, _p: vec2u,
};
struct MaterialRec {
  f0: vec3f, roughness: f32,
  anisotropy: f32, hammer: f32, patina: f32, wear: f32,
  patinaColour: vec3f, _pad: f32,
  occlusionBase: u32, vertexCount: u32, model: u32, _pad2: u32,
  baseColour: vec3f, orient: f32,
  _fill: array<vec4f, 11>,
};
struct Trace { instanceCount: u32, enabled: u32, eps: f32, _p: f32 };
@group(2) @binding(0) var<storage, read> nodes: array<Node>;
@group(2) @binding(1) var<storage, read> tris: array<vec4f>;      // 6 per triangle: v0 v1 v2 n0 n1 n2
@group(2) @binding(2) var<storage, read> triIdx: array<vec4u>;    // i0 i1 i2, for the occlusion lookup
@group(2) @binding(3) var<storage, read> instances: array<Inst>;
@group(2) @binding(4) var<storage, read> materials: array<MaterialRec>;
@group(2) @binding(5) var<uniform> trace: Trace;
@group(2) @binding(6) var<storage, read> tlas: array<Node>;

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
  // invariant, so the depth prepass and this pass agree to the bit
  @builtin(position) @invariant clip: vec4f,
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

// ---- ray tracing against the placed parts ----

const NO_HIT: u32 = 0xffffffffu;

/** Slab test: the entry distance, or a large number when the ray misses or the box is beyond tMax. */
fn rayBox(o: vec3f, invD: vec3f, bmin: vec3f, bmax: vec3f, tMax: f32) -> f32 {
  let t0 = (bmin - o) * invD;
  let t1 = (bmax - o) * invD;
  let tn = min(t0, t1);
  let tf = max(t0, t1);
  let tEnter = max(max(tn.x, tn.y), max(tn.z, 0.0));
  let tExit = min(min(tf.x, tf.y), min(tf.z, tMax));
  return select(1e30, tEnter, tExit >= tEnter);
}

/** Möller–Trumbore: (t, u, v), with t < 0 for a miss. */
fn rayTri(o: vec3f, d: vec3f, v0: vec3f, v1: vec3f, v2: vec3f) -> vec3f {
  let e1 = v1 - v0;
  let e2 = v2 - v0;
  let p = cross(d, e2);
  let det = dot(e1, p);
  if (abs(det) < 1e-9) { return vec3f(-1.0); }
  let inv = 1.0 / det;
  let s = o - v0;
  let u = dot(s, p) * inv;
  if (u < 0.0 || u > 1.0) { return vec3f(-1.0); }
  let q = cross(s, e1);
  let v = dot(d, q) * inv;
  if (v < 0.0 || u + v > 1.0) { return vec3f(-1.0); }
  return vec3f(dot(e2, q) * inv, u, v);
}

struct Hit { t: f32, inst: u32, tri: u32, u: f32, v: f32 };

fn safeDir(d: vec3f) -> vec3f {
  return select(d, vec3f(1e-6), abs(d) < vec3f(1e-6));
}

/** Walk one mesh's hierarchy in its own space, front to back, tightening the hit. */
fn traceInstance(i: u32, o: vec3f, d: vec3f, tMin: f32, hit: ptr<function, Hit>) {
  let inst = instances[i];
  let oo = (inst.worldToObject * vec4f(o, 1.0)).xyz;
  let od = safeDir((inst.worldToObject * vec4f(d, 0.0)).xyz);
  let oinv = 1.0 / od;
  var stack: array<u32, 32>;
  var stackT: array<f32, 32>;
  var sp = 1u;
  stack[0] = inst.nodeOffset;
  stackT[0] = 0.0;
  while (sp > 0u) {
    sp--;
    if (stackT[sp] >= (*hit).t) { continue; }
    let node = nodes[stack[sp]];
    if ((node.count & 0x80000000u) != 0u) {
      let li = inst.nodeOffset + node.left;
      let ri = inst.nodeOffset + (node.count & 0x7fffffffu);
      let ln = nodes[li];
      let rn = nodes[ri];
      var tl = rayBox(oo, oinv, ln.bmin, ln.bmax, (*hit).t);
      var tr = rayBox(oo, oinv, rn.bmin, rn.bmax, (*hit).t);
      var near = li; var far = ri;
      if (tr < tl) { near = ri; far = li; let tt = tl; tl = tr; tr = tt; }
      if (sp + 2u <= 32u) {
        if (tr < (*hit).t) { stack[sp] = far; stackT[sp] = tr; sp++; }
        if (tl < (*hit).t) { stack[sp] = near; stackT[sp] = tl; sp++; }
      }
      continue;
    }
    let first = inst.triOffset + node.left;
    for (var k = 0u; k < node.count; k++) {
      let b = (first + k) * 6u;
      let r = rayTri(oo, od, tris[b].xyz, tris[b + 1u].xyz, tris[b + 2u].xyz);
      if (r.x > tMin && r.x < (*hit).t) {
        (*hit).t = r.x; (*hit).inst = i; (*hit).tri = first + k; (*hit).u = r.y; (*hit).v = r.z;
      }
    }
  }
}

/**
 * Closest hit along a world-space ray. The hierarchy over placements finds the
 * few this ray can touch, nearest first; each takes the ray into its mesh's
 * space and walks that mesh's tree. Directions are never renormalised after a
 * transform, so t stays in world units and the nearest hit is the nearest hit.
 */
fn traceRay(o: vec3f, dIn: vec3f, tMin: f32) -> Hit {
  var hit: Hit;
  hit.t = 1e30;
  hit.inst = NO_HIT;
  if (trace.instanceCount == 0u) { return hit; }
  let d = safeDir(dIn);
  let invD = 1.0 / d;
  var stack: array<u32, 24>;
  var stackT: array<f32, 24>;
  var sp = 1u;
  stack[0] = 0u;
  stackT[0] = 0.0;
  while (sp > 0u) {
    sp--;
    if (stackT[sp] >= hit.t) { continue; }
    let node = tlas[stack[sp]];
    if ((node.count & 0x80000000u) != 0u) {
      let li = node.left;
      let ri = node.count & 0x7fffffffu;
      let ln = tlas[li];
      let rn = tlas[ri];
      var tl = rayBox(o, invD, ln.bmin, ln.bmax, hit.t);
      var tr = rayBox(o, invD, rn.bmin, rn.bmax, hit.t);
      var near = li; var far = ri;
      if (tr < tl) { near = ri; far = li; let tt = tl; tl = tr; tr = tt; }
      if (sp + 2u <= 24u) {
        if (tr < hit.t) { stack[sp] = far; stackT[sp] = tr; sp++; }
        if (tl < hit.t) { stack[sp] = near; stackT[sp] = tl; sp++; }
      }
      continue;
    }
    for (var k = 0u; k < node.count; k++) {
      traceInstance(node.left + k, o, d, tMin, &hit);
    }
  }
  return hit;
}

/**
 * Nacre: light gets under the surface and comes back out diffused, so the
 * body is lit by a broad, wrapped irradiance rather than the normal's alone,
 * with a little bleeding through from behind at the rim. Over it sits a soft
 * dielectric lustre, and an iridescent sheen — the trade calls it orient —
 * that shifts hue as the view turns across the plates.
 */
fn orientTint(ndv: f32, strength: f32) -> vec3f {
  let phase = ndv * 1.3;
  return vec3f(1.0) + strength * vec3f(
    sin(6.2832 * phase), sin(6.2832 * (phase + 0.33)), sin(6.2832 * (phase + 0.67)));
}

fn nacreBody(n: vec3f, v: vec3f, ndv: f32, base: vec3f, ao: f32) -> vec3f {
  let spin = spinZ(frame.envSpin);
  let irrN = textureSampleLevel(envSpecular, linearSampler, spin * n, frame.maxLod).rgb;
  let irrWrap = textureSampleLevel(envSpecular, linearSampler, spin * normalize(n + v), frame.maxLod).rgb;
  let irrBack = textureSampleLevel(envSpecular, linearSampler, spin * (-n), frame.maxLod).rgb;
  let scattered = irrN * 0.7 + irrWrap * 0.3;
  let rim = pow(1.0 - ndv, 2.5) * 0.35;
  // multiple scattering loses some light on every pass through the plates:
  // nacre returns about half of what falls on it, not all of it
  return base * (scattered + irrBack * rim) * ao * 0.55;
}

struct Surface { n: vec3f, ao: f32, m: MaterialRec };

/** Normal, occlusion and material at a hit, facing the ray. */
fn surfaceAt(hit: Hit, d: vec3f) -> Surface {
  let inst = instances[hit.inst];
  let b = hit.tri * 6u;
  let w0 = 1.0 - hit.u - hit.v;
  let nObj = tris[b + 3u].xyz * w0 + tris[b + 4u].xyz * hit.u + tris[b + 5u].xyz * hit.v;
  var n = normalize((inst.objectToWorld * vec4f(nObj, 0.0)).xyz);
  if (dot(n, d) > 0.0) { n = -n; }
  let idx = triIdx[hit.tri];
  let base = inst.occlusionBase;
  var s: Surface;
  s.n = n;
  s.ao = occlusionAt(base + idx.x) * w0 + occlusionAt(base + idx.y) * hit.u + occlusionAt(base + idx.z) * hit.v;
  s.m = materials[inst.group];
  return s;
}

/** Lighting at a surface given what its reflection ray sees. */
fn shadeSurface(s: Surface, d: vec3f, reflected: vec3f) -> vec3f {
  let v = -d;
  let ndv = clamp(dot(s.n, v), 0.001, 1.0);
  let spin = spinZ(frame.envSpin);
  if (s.m.model == 1u) {
    let roughness = max(s.m.roughness, 0.18);
    let ab = textureSampleLevel(envBrdf, linearSampler, vec2f(ndv, roughness), 0.0).rg;
    let fresnel = s.m.f0 * ab.x + ab.y;
    return nacreBody(s.n, v, ndv, s.m.baseColour, s.ao) * (1.0 - fresnel) + reflected * fresnel * orientTint(ndv, s.m.orient);
  }
  let roughness = clamp(s.m.roughness, 0.03, 1.0);
  let ab = textureSampleLevel(envBrdf, linearSampler, vec2f(ndv, roughness), 0.0).rg;
  let specOcclusion = clamp(pow(ndv + s.ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + s.ao, 0.0, 1.0);
  let specular = reflected * (s.m.f0 * ab.x + ab.y) * specOcclusion;
  let irradiance = textureSampleLevel(envSpecular, linearSampler, spin * s.n, frame.maxLod).rgb;
  let diffuse = irradiance * s.m.patinaColour * s.m.patina * 0.5 * s.ao;
  return specular + diffuse;
}

fn envAt(dir: vec3f, roughness: f32) -> vec3f {
  return textureSampleLevel(envSpecular, linearSampler, spinZ(frame.envSpin) * dir, roughness * frame.maxLod).rgb;
}

/** The last bounce: what this surface reflects is the environment. */
fn shadeHit2(hit: Hit, d: vec3f) -> vec3f {
  let s = surfaceAt(hit, d);
  let r = reflect(d, s.n);
  return shadeSurface(s, d, envAt(r, select(s.m.roughness, max(s.m.roughness, 0.18), s.m.model == 1u)));
}

/**
 * Shade the point a reflected ray landed on, through that surface's own
 * material, so a rose-gold rivet reflected in a gold leaf still reads as rose
 * gold. Two bounces: this surface's reflection is traced once more, which is
 * what lights the deep folds of a cup, where a petal reflects a petal that
 * reflects the room.
 */
fn shadeHit(o: vec3f, hit: Hit, d: vec3f) -> vec3f {
  let s = surfaceAt(hit, d);
  let p = o + d * hit.t;
  let r = reflect(d, s.n);
  let roughness = select(s.m.roughness, max(s.m.roughness, 0.18), s.m.model == 1u);
  var reflected = envAt(r, roughness);
  if (roughness < 0.45) {
    let hit2 = traceRay(p + s.n * trace.eps, r, trace.eps);
    if (hit2.inst != NO_HIT) {
      reflected = mix(reflected, shadeHit2(hit2, r), 1.0 - smoothstep(0.12, 0.45, roughness));
    }
  }
  return shadeSurface(s, d, reflected);
}

fn occlusionAt(index: u32) -> f32 {
  let r = f32(occlusion[2u * index]);
  let g = f32(occlusion[2u * index + 1u]);
  return select(1.0, clamp(r / g, 0.0, 1.0), g > 0.0);
}

@fragment fn fsMain(in: VsOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  let v = normalize(frame.cameraPos - in.world);
  if (!frontFacing) { n = -n; }

  let tbn = tangentFrame(n, in.world, in.uv);

  var roughness = material.roughness;
  var f0 = material.f0;
  var metallic = 1.0;
  // nacre has a soft lustre whatever finish the sketch asked for, and no
  // planishing, patina or wear: those are things done to metal
  let nacre = material.model == 1u;
  if (nacre) { roughness = max(roughness, 0.18); }

  // --- planishing: perturb the normal by the gradient of a height field ---
  if (material.hammer > 0.0 && !nacre) {
    let p = in.object * 0.55;
    let eps = 0.35;
    let h0 = planish(p);
    let hx = planish(p + tbn[0] * eps);
    let hy = planish(p + tbn[1] * eps);
    let bump = (tbn[0] * (hx - h0) + tbn[1] * (hy - h0)) / eps;
    n = normalize(n - bump * material.hammer * 0.22);
  }

  // --- patina: an oxide fraction that is not metal any more ---
  if (material.patina > 0.0 && !nacre) {
    let blotch = noise3(in.object * 0.32) * 0.65 + noise3(in.object * 0.9) * 0.35;
    let mask = smoothstep(0.62 - material.patina * 0.55, 0.78 - material.patina * 0.3, blotch);
    metallic = mix(1.0, 0.0, mask * material.patina);
    f0 = mix(f0, vec3f(0.04), mask * material.patina);
    roughness = mix(roughness, min(roughness + 0.35, 0.95), mask * material.patina);
  }

  // --- wear: edges handled bright, creases left dull ---
  let wearOn = select(material.wear, 0.0, nacre);
  let edge = smoothstep(0.05, 0.8, in.wear) * wearOn;
  var crease = smoothstep(0.05, 0.8, -in.wear) * wearOn;
  // the grain only matters where there is a crease, and most of a surface has none
  if (crease > 0.0) { crease *= 0.7 + 0.6 * noise3(in.object * 1.7); }
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
  var reflected = prefiltered * specOcclusion;

  // Inter-reflection: a polished surface reflects its neighbours, not just the
  // room. One mirror ray per pixel, which is exact for a mirror and blurs to the
  // prefiltered environment as roughness rises, since a single ray cannot stand
  // in for a wide lobe. On a miss the environment is used unoccluded: the
  // visibility along that ray is now known, not estimated.
  if (trace.enabled != 0u) {
    let traceWeight = 1.0 - smoothstep(0.12, 0.45, roughness);
    if (traceWeight > 0.001) {
      let origin = in.world + n * trace.eps;
      let hit = traceRay(origin, r, trace.eps);
      var traced = prefiltered;
      if (hit.inst != NO_HIT) { traced = shadeHit(origin, hit, r); }
      reflected = mix(reflected, traced, traceWeight);
    }
  }

  var colour: vec3f;
  if (material.model == 1u) {
    // nacre: a lustre over a scattering body, with the sheen on the lustre
    let fresnel = f0 * ab.x + ab.y;
    let tint = orientTint(ndv, material.orient);
    let body = nacreBody(n, v, ndv, material.baseColour, ao);
    colour = (body * (1.0 - fresnel) * mix(vec3f(1.0), tint, 0.3) + reflected * fresnel * tint) * frame.exposure;
  } else {
    let specular = reflected * (f0 * ab.x + ab.y);
    // metal has no diffuse lobe, so this only shows where patina has taken hold
    let irradiance = textureSampleLevel(envSpecular, linearSampler, spin * n, frame.maxLod).rgb;
    let diffuse = irradiance * material.patinaColour * (1.0 - metallic) * ao;
    colour = (specular + diffuse) * frame.exposure;
  }

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

/**
 * Depth only, ahead of the scene pass. Tracing a reflected ray is the most
 * expensive thing a fragment does, and a rose is forty petals deep: without a
 * prepass most of that work is done for surfaces a nearer petal then covers.
 */
export const PREPASS_WGSL = `
${FRAME_STRUCT}
struct PrepassOut { @builtin(position) @invariant clip: vec4f };
@vertex fn vsMain(
  @location(0) position: vec3f,
  @location(4) im0: vec4f, @location(5) im1: vec4f, @location(6) im2: vec4f, @location(7) im3: vec4f,
) -> PrepassOut {
  // the same expression, in the same order, as the scene pass
  let inst = mat4x4f(im0, im1, im2, im3);
  let world = inst * vec4f(position, 1.0);
  var out: PrepassOut;
  out.clip = frame.viewProj * world;
  return out;
}
// the pass has a colour target, so the pipeline must name it; the write mask is zero
@fragment fn fsMain() -> @location(0) vec4f { return vec4f(0.0); }
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
