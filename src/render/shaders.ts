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
  // 1 while something is selected: the rest of the piece steps back
  selecting: f32,
  // the key: one movable light over the baked environment, in world space
  keyDir: vec3f,
  keyStrength: f32,
  keyColour: vec3f,
  // how much of the baked environment reaches the piece: 1 as baked, 0 dark
  envStrength: f32,
  // the key's own view of the scene, for its shadow; and the offset a
  // sample steps along the normal before the lookup, in world units
  lightViewProj: mat4x4f,
  shadowOffset: f32,
  shadowBias: f32,
  shadowOn: f32,
  // the key's angular radius in radians: 0 a point, a softbox a good fraction of a radian
  keySize: f32,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var envSpecular: texture_cube<f32>;
@group(0) @binding(2) var envBrdf: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<storage, read> occlusion: array<u32>;
@group(0) @binding(5) var keyShadow: texture_depth_2d;
@group(0) @binding(6) var shadowSampler: sampler_comparison;
`;

const COMMON = `
// about Z, because that is the environment's up
fn spinZ(a: f32) -> mat3x3f {
  let c = cos(a); let s = sin(a);
  return mat3x3f(vec3f(c, -s, 0.0), vec3f(s, c, 0.0), vec3f(0.0, 0.0, 1.0));
}

// the baked environment, dimmed by the frame's own setting — every read of
// it goes through here, so turning the sky down turns all of it down
fn env(dir: vec3f, lod: f32) -> vec3f {
  return textureSampleLevel(envSpecular, linearSampler, dir, lod).rgb * frame.envStrength;
}

// One directional light, GGX over the environment's own split-sum: the
// baked sky gives the piece its shape, the key gives it a side. Returns the
// specular lobe scaled by n·l; the caller adds its own diffuse.
//
// The key has a size. A disc of light rather than a point, so its
// highlight is a shape on a mirror and a soft bloom on satin: the lobe is
// evaluated toward the point of the disc nearest the reflection ray, and
// widened by the disc's own radius with the energy that widening spreads
// divided back out (Karis's sphere-light approximation).
fn keySpecular(n: vec3f, v: vec3f, f0: vec3f, roughness: f32) -> vec3f {
  let l0 = normalize(frame.keyDir);
  if (dot(n, l0) <= -sin(frame.keySize) || frame.keyStrength <= 0.0) { return vec3f(0.0); }
  let size = frame.keySize;
  let r = reflect(-v, n);
  let rl = dot(r, l0);
  let cosCone = cos(size);
  var l = l0;
  if (rl < cosCone) {
    // the closest point on the disc's rim to the reflection ray
    let perp = r - l0 * rl;
    let pl = length(perp);
    if (pl > 1e-4) { l = normalize(l0 * cosCone + perp / pl * sin(size)); }
  } else {
    l = r;
  }
  let ndl = max(dot(n, l), 0.0);
  let h = normalize(l + v);
  let ndh = max(dot(n, h), 0.0);
  let ndv = max(dot(n, v), 1e-3);
  let vdh = max(dot(v, h), 0.0);
  let a = max(roughness * roughness, 0.002);
  let aw = clamp(a + 0.5 * tan(size), a, 1.0);
  let norm = (a / aw) * (a / aw);
  let a2 = aw * aw;
  let dd = ndh * ndh * (a2 - 1.0) + 1.0;
  let d = a2 / (3.14159265 * dd * dd);
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let g = (ndl / (ndl * (1.0 - k) + k)) * (ndv / (ndv * (1.0 - k) + k));
  let f = f0 + (1.0 - f0) * pow(1.0 - vdh, 5.0);
  return d * g * f * norm / (4.0 * ndv) * frame.keyColour * frame.keyStrength * 3.0;
}

// a point in a disc: Vogel's spiral, evenly spread at any count
fn vogel(i: i32, count: i32, phase: f32) -> vec2f {
  let r = sqrt((f32(i) + 0.5) / f32(count));
  let a = f32(i) * 2.3999632 + phase;
  return vec2f(cos(a), sin(a)) * r;
}

// how much of the key reaches a point: its shadow map, filtered over a
// disc the size of the penumbra there. The penumbra is the light's own
// size seen from the blocker: a search over the map finds how far above
// the point the nearest occluders sit, and the filter widens with that
// distance, so a leaf's shadow is crisp at its stem and soft at its tip.
// The map's ortho frame covers 2R across and 4R deep, so a depth gap of
// dz is 2·dz·tan(size) of uv, whatever R is. The lookup steps off the
// surface along the normal first, which is what keeps a lit face from
// shadowing itself where the map's texels are coarser than the mesh.
fn keyShadowAt(world: vec3f, n: vec3f) -> f32 {
  if (frame.shadowOn < 0.5 || frame.keyStrength <= 0.0) { return 1.0; }
  let p = world + n * frame.shadowOffset;
  let clip = frame.lightViewProj * vec4f(p, 1.0);
  let uv = vec2f(clip.x, -clip.y) * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || clip.z > 1.0) { return 1.0; }
  let depth = clip.z - frame.shadowBias;
  let dims = vec2f(textureDimensions(keyShadow));
  let texel = 1.0 / dims;
  // a fixed rotation per point, so the taps' pattern is a grain, not a print
  let phase = hash13(floor(world * 23.0)) * 6.2831853;
  let spread = 2.0 * tan(frame.keySize);
  var radius = texel * 1.5;
  if (spread > 0.0) {
    // blocker search: the mean depth of what is between here and the light,
    // over the widest penumbra this point could have
    let search = max(spread * depth, texel.x * 2.0);
    var blockers = 0.0;
    var blockerDepth = 0.0;
    for (var i = 0; i < 12; i++) {
      let at = uv + vogel(i, 12, phase) * search;
      let d = textureLoad(keyShadow, vec2i(clamp(at, vec2f(0.0), vec2f(1.0)) * (dims - 1.0)), 0);
      if (d < depth) { blockers += 1.0; blockerDepth += d; }
    }
    if (blockers == 0.0) { return 1.0; }
    let gap = depth - blockerDepth / blockers;
    radius = max(vec2f(spread * gap), texel * 1.5);
  }
  var lit = 0.0;
  for (var i = 0; i < 24; i++) {
    lit += textureSampleCompareLevel(keyShadow, shadowSampler, uv + vogel(i, 24, phase) * radius, depth);
  }
  return lit / 24.0;
}

// the key's diffuse: a disc lights a little past its own horizon, so the
// terminator softens with its size instead of cutting off at n·l = 0
fn keyDiffuse(n: vec3f) -> f32 {
  let w = sin(frame.keySize);
  let ndl = clamp((dot(n, normalize(frame.keyDir)) + w) / (1.0 + w), 0.0, 1.0);
  return ndl * frame.keyStrength * 3.0 / 3.14159265;
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
  model: u32,          // 0 metal, 1 nacre, 2 gem, 3 plastic, 4 wood
  _pad2: u32,
  baseColour: vec3f,
  orient: f32,
  enamelColour: vec3f,
  enamelOpacity: f32,   // 0: no enamel on this part
  // chased relief on a plate, evaluated per pixel on the caps
  relief: f32,          // ridge height; 0: none
  reliefVeins: f32,
  reliefLength: f32,
  reliefHalfWidth: f32,
  reliefSpan: vec4f,    // the cap uv box: minX, minY, width, height
  reliefDroop: f32,
  veinF0: vec3f,        // wires along the veins of an enamelled face
  veinOn: f32,
  // a cut stone
  gemIor: f32,
  gemDispersion: f32,
  gemSparkle: f32,
  gemPavilion: f32,   // facets round the pavilion; a step cut has fewer than a brilliant
  // an engraved pattern, evaluated per pixel in surface millimetres
  pattern: u32,        // 0 none; then hatch, crosshatch, guilloche, basketweave, rays, wave, stipple
  patternFaces: u32,   // 0 the caps of a plate only, 1 the whole surface
  _pad3: u32,
  _pad4: u32,
  patternParams: vec4f, // pitch mm, depth mm, angle, the surface's half extent
  // lettering: a run of placed glyphs in the glyph buffer, read from the atlas
  glyphBase: u32,
  glyphCount: u32,
  letterSpread: f32,   // how far the atlas field reaches either side of an edge, in mm
  _pad5: u32,
  letter: vec4f,       // depth mm, angle, centre x, centre y
};
@group(1) @binding(0) var<uniform> material: Material;

/** One placed glyph: its box in surface mm before the inscription's turn, and its atlas rectangle. */
struct Glyph { box: vec4f, rect: vec4f };
@group(1) @binding(1) var<storage, read> glyphs: array<Glyph>;
@group(1) @binding(2) var atlas: texture_2d<f32>;

struct VsIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) wear: f32,
  @location(4) im0: vec4f,
  @location(5) im1: vec4f,
  @location(6) im2: vec4f,
  @location(7) im3: vec4f,
  @location(8) face: vec2f,     // enamel, cap
  @location(9) selected: f32,
  @location(10) engrave: vec2f,  // surface millimetres, for engraving
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
  @location(6) enamel: f32,
  // which cap, and the flat plate's coordinates there; linear in uv, so exact
  @location(7) cap: f32,
  @location(8) plate: vec2f,
  // the part's own up and across, in world space: which way a stone is standing
  @location(9) axis: vec3f,
  @location(10) side: vec3f,
  @location(11) @interpolate(flat) selected: f32,
  @location(12) engrave: vec2f,
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
  out.selected = in.selected;
  // placements are rigid with uniform scale, so rotating the normal is exact
  out.normal = normalize(mat3x3f(inst[0].xyz, inst[1].xyz, inst[2].xyz) * in.normal);
  out.world = world.xyz;
  out.object = in.position;
  out.uv = in.uv;
  out.ao = mix(1.0, ao, frame.occlusionOn);
  out.wear = in.wear;
  out.enamel = in.face.x * select(0.0, 1.0, material.enamelOpacity > 0.0);
  out.cap = in.face.y;
  out.plate = material.reliefSpan.xy + in.uv * material.reliefSpan.zw;
  out.engrave = in.engrave;
  let frame3 = mat3x3f(inst[0].xyz, inst[1].xyz, inst[2].xyz);
  out.axis = normalize(frame3 * vec3f(0.0, 0.0, 1.0));
  out.side = normalize(frame3 * vec3f(1.0, 0.0, 0.0));
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

/**
 * The chased vein relief, the same field deform.ts displaced the plate by:
 * a midrib ridge tapering to the tip, lateral ridges angled forward from it.
 * Evaluated per pixel so a ridge narrower than the lattice still reads as a
 * ridge and not a row of facets.
 */
fn reliefSmooth(a: f32, b: f32, x: f32) -> f32 {
  let t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

struct Lateral { u: f32, r: f32, sweep: f32, cx: f32, cy: f32, phi0: f32, wave: f32, side: f32 };

/** Lateral vein i: where it leaves the midrib and the arc it follows. Mirrors deform.ts exactly. */
fn lateralVein(i: i32, veins: i32, halfWidth: f32, side: f32) -> Lateral {
  let k = f32(i) / f32(max(veins - 1, 1));
  var out: Lateral;
  out.u = 0.12 + 0.72 * k + side * 0.022;
  let a0 = 1.0 - 0.35 * k;
  out.r = halfWidth * (2.8 + 0.6 * k);
  out.sweep = a0 - 0.25;
  out.cx = out.r * sin(a0);
  out.cy = -out.r * cos(a0);
  out.phi0 = a0 + 1.57079633;
  out.wave = halfWidth * (0.8 + 0.3 * k);
  out.side = side;
  return out;
}

/** Sideways offset of a lateral's centreline at distance t along it: a gentle wave, zero at the midrib. Mirrors deform.ts. */
fn lateralWave(v: Lateral, t: f32) -> f32 {
  let amp = v.wave * 0.028;
  let envelope = min(t / (0.4 * v.wave), 1.0);
  return amp * sin(6.2831853 * t / v.wave + v.side * 0.7) * envelope;
}

/** Distance across a lateral (x) and along it (y), as a capsule: past an end, the distance is to that end. */
fn lateralCoords(v: Lateral, dx: f32, ay: f32) -> vec2f {
  let px = dx - v.cx; let py = ay - v.cy;
  var sweep = v.phi0 - atan2(py, px);
  if (sweep > 3.14159265) { sweep -= 6.2831853; }
  if (sweep < -3.14159265) { sweep += 6.2831853; }
  if (sweep < 0.0) { return vec2f(length(vec2f(dx, ay)), 0.0); }
  let tEnd = v.r * v.sweep;
  if (sweep > v.sweep) {
    let phiEnd = v.phi0 - v.sweep;
    let rho = v.r + lateralWave(v, tEnd);
    return vec2f(length(vec2f(dx - (v.cx + rho * cos(phiEnd)), ay - (v.cy + rho * sin(phiEnd)))), tEnd);
  }
  let t = v.r * sweep;
  return vec2f(abs(length(vec2f(px, py)) - v.r - lateralWave(v, t)), t);
}

/** The relief as a unit field, before the ridge height scales it. */
fn reliefField(x: f32, y: f32) -> f32 {
  let length = material.reliefLength;
  let halfWidth = material.reliefHalfWidth;
  let wm = halfWidth * 0.16;
  let wl = halfWidth * 0.11;
  let u = clamp(x / length, 0.0, 1.0);
  let spine = sin(3.14159265 * u) * material.reliefDroop * length;
  let yy = y - spine;
  let ay = abs(yy);
  let taper = pow(1.0 - u, 0.7) * reliefSmooth(0.0, 0.1, u);
  var h = exp(-(yy * yy) / (wm * wm)) * taper;
  let margin = 1.0 - reliefSmooth(0.7, 1.0, ay / halfWidth);
  let side = select(1.0, -1.0, yy < 0.0);
  var lateral = 0.0;
  let veins = i32(material.reliefVeins);
  for (var i = 0; i < veins; i++) {
    let v = lateralVein(i, veins, halfWidth, side);
    let c = lateralCoords(v, x - v.u * length, ay);
    let along = reliefSmooth(0.0, wl * 2.0, c.y) * exp(-(c.y * c.y) / (halfWidth * halfWidth * 1.4));
    lateral = max(lateral, exp(-(c.x * c.x) / (wl * wl)) * along);
  }
  h += 0.55 * lateral * margin * pow(1.0 - u, 0.4);
  return h;
}

fn reliefHeight(x: f32, y: f32) -> f32 { return material.relief * reliefField(x, y); }

/*
 * Engraved patterns.
 *
 * Each is a unit field of grooves — 1 at the bottom of a cut, 0 on untouched
 * metal — in surface millimetres, rotated by the pattern's angle. The depth
 * scales it and the normal is bent by its gradient, exactly as the vein relief
 * is, so a groove finer than the mesh still reads as a groove.
 */

/** A rounded groove of half-width w, centred where s is 0. */
fn groove(s: f32, w: f32) -> f32 {
  let t = clamp(abs(s) / w, 0.0, 1.0);
  return 1.0 - t * t * (3.0 - 2.0 * t);
}

/** Parallel grooves at a pitch, each of half-width w. */
fn stripes(x: f32, pitch: f32, w: f32) -> f32 {
  return groove((fract(x / pitch) - 0.5) * pitch, w);
}

fn patternField(xIn: f32, yIn: f32) -> f32 {
  let pitch = material.patternParams.x;
  let a = material.patternParams.z;
  let ca = cos(a); let sa = sin(a);
  let x = ca * xIn + sa * yIn;
  let y = -sa * xIn + ca * yIn;
  switch material.pattern {
    case 1u: {  // hatch
      return stripes(y, pitch, 0.22 * pitch);
    }
    case 2u: {  // crosshatch
      return max(stripes(y, pitch, 0.2 * pitch), stripes(x, pitch, 0.2 * pitch));
    }
    case 3u: {  // guilloche: two families of sinuous lines crossing, engine turned
      let wave = 0.32 * pitch * sin(6.2831853 * x / (3.0 * pitch));
      return max(stripes(y + wave, pitch, 0.16 * pitch), stripes(y - wave, pitch, 0.16 * pitch));
    }
    case 4u: {  // basketweave: cells of stripes, alternately across and along
      let cell = 3.0 * pitch;
      let parity = i32(floor(x / cell)) + i32(floor(y / cell));
      let across = stripes(y, pitch, 0.22 * pitch);
      let along = stripes(x, pitch, 0.22 * pitch);
      let fill = select(along, across, (parity & 1) == 0);
      let seams = max(stripes(x, cell, 0.12 * pitch), stripes(y, cell, 0.12 * pitch));
      return max(fill, seams);
    }
    case 5u: {  // rays: grooves radiating from the surface's origin, a deco sunray
      let r = length(vec2f(x, y));
      let extent = max(material.patternParams.w, pitch);
      let dth = pitch / extent;
      let theta = atan2(y, x);
      let s = (fract(theta / dth) - 0.5) * dth * r;
      // the rays would pile up at the centre; let them fade out there
      return groove(s, 0.2 * pitch) * smoothstep(pitch, 3.0 * pitch, r);
    }
    case 6u: {  // wave
      let wave = 0.35 * pitch * sin(6.2831853 * x / (3.0 * pitch));
      return stripes(y + wave, pitch, 0.22 * pitch);
    }
    case 7u: {  // stipple: a lattice of round pits, rows staggered
      let row = floor(y / pitch);
      let shift = select(0.0, 0.5 * pitch, (i32(row) & 1) == 1);
      let cx = (fract((x + shift) / pitch) - 0.5) * pitch;
      let cy = (fract(y / pitch) - 0.5) * pitch;
      let d2 = (cx * cx + cy * cy) / (0.32 * pitch * 0.32 * pitch);
      return max(0.0, 1.0 - d2);
    }
    default: { return 0.0; }
  }
}

/**
 * Signed distance in mm from the nearest letter's edge, negative inside a
 * letter, at a point in the inscription's own frame. Far from every glyph it
 * is simply "far", which the cut treats as untouched metal.
 */
fn letterDistance(p: vec2f) -> f32 {
  var best = 1e9;
  let spread = material.letterSpread;
  for (var i = 0u; i < material.glyphCount; i++) {
    let g = glyphs[material.glyphBase + i];
    if (p.x < g.box.x || p.x > g.box.z || p.y < g.box.y || p.y > g.box.w) { continue; }
    let f = (p - g.box.xy) / (g.box.zw - g.box.xy);
    // the atlas is drawn y-down
    let uv = mix(g.rect.xy, g.rect.zw, vec2f(f.x, 1.0 - f.y));
    let s = textureSampleLevel(atlas, linearSampler, uv, 0.0).r;
    best = min(best, (0.5 - s) * 2.0 * spread);
  }
  return best;
}

/**
 * The lettering's height at a point in surface mm: the letter's floor,
 * the depth down, reached over a short bevel at the edge so the wall catches
 * light rather than vanishing between two pixels.
 */
fn letterHeight(e: vec2f) -> f32 {
  let a = material.letter.y;
  let d = e - material.letter.zw;
  let local = vec2f(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y);
  let dist = letterDistance(local);
  // a narrow wall: wide enough to catch light, never so wide the letter reads as embossed
  let bevel = min(0.15, material.letterSpread * 0.3);
  return -material.letter.x * (1.0 - smoothstep(-bevel, bevel, dist));
}

/** Engraved height: grooves cut in by the depth, or raised by a negative one. */
fn engraveHeight(x: f32, y: f32, depth: f32) -> f32 { return -depth * patternField(x, y); }

/**
 * Signed distance to the edge of the cloisonné wire: negative inside it. The
 * wire has a width of its own — a third of a millimetre at the midrib,
 * thinning along each vein — and its own extent: it starts on the midrib,
 * runs out until the enamel cell's rim clips it, and where it ends short of
 * that it ends in a round cap. The ridge's fades do not apply to it.
 */
fn veinWire(x: f32, y: f32) -> f32 {
  let length = material.reliefLength;
  let halfWidth = material.reliefHalfWidth;
  let u = clamp(x / length, 0.0, 1.0);
  let spine = sin(3.14159265 * u) * material.reliefDroop * length;
  let yy = y - spine;
  let ay = abs(yy);
  let side = select(1.0, -1.0, yy < 0.0);
  let halfWire = 0.16;
  // the midrib draws down along its length, as it does in the leaf
  var sdf = ay - halfWire * (1.0 - 0.45 * u);
  let veins = i32(material.reliefVeins);
  for (var i = 0; i < veins; i++) {
    let v = lateralVein(i, veins, halfWidth, side);
    let c = lateralCoords(v, x - v.u * length, ay);
    // Two thinnings, and they compound. Along its own length a vein tapers
    // toward where it ends; and a vein set nearer the tip is a finer one to
    // begin with, because the whole system draws down as the leaf narrows.
    let station = 1.0 - 0.30 * v.u;
    let taper = station * (1.0 - 0.45 * c.y / (v.r * v.sweep));
    sdf = min(sdf, c.x - halfWire * 0.85 * taper);
  }
  return sdf;
}

/**
 * A single bounce cannot pick up the colour a real path does, so the spread
 * across the channels is exaggerated to stand in for a dozen of them.
 */
const FIRE_GAIN: f32 = 6.0;

/**
 * What a crown gives back. The rest leaks out of the pavilion and is lost,
 * which is the difference between a stone and a mirror, and the reason a
 * badly cut one looks like a window.
 */
const CROWN_RETURN: f32 = 0.7;

/**
 * What comes back out of a cut stone.
 *
 * Nothing is traced. What sells a gem is not what lies behind it but what it
 * does with the light in front: a ray bends on the way in, runs down to the
 * pavilion, bounces twice off it and leaves through the crown — so the room
 * arrives at the eye folded and multiplied, which is what a brilliant shows.
 * Bending each channel by a slightly different amount splits it into colour on
 * the way, which is the fire.
 */
fn gemInterior(v: vec3f, n: vec3f, axis: vec3f, lateral: vec3f, ior: f32, dispersion: f32) -> vec3f {
  let spin = spinZ(frame.envSpin);
  // A pavilion meets the girdle at about forty degrees, and it takes two of
  // those facets to turn the light round: the first sends the ray across the
  // stone, the second sends it back up and out. Both are built here from the
  // stone's own axis and the pavilion facet the light is given, so every part
  // of the crown ends up looking somewhere different — which is the whole
  // reason a cut stone is alive rather than a lump of glass.
  let slope = 0.755;   // cosine of the pavilion angle
  let reach = 0.656;   // and its sine
  var out = vec3f(0.0);
  for (var c = 0; c < 3; c++) {
    // red bends least, blue most
    let channel = max(ior + dispersion * FIRE_GAIN * (f32(c) - 1.0), 1.02);
    var ray = refract(-v, n, 1.0 / channel);
    // a facet steep enough to keep the light in gives nothing back but a mirror
    if (dot(ray, ray) < 1e-6) { ray = reflect(-v, n); }
    ray = reflect(ray, axis * slope + lateral * reach);
    ray = reflect(ray, axis * slope - lateral * reach);
    let sample = env(spin * ray, 0.0);
    out += sample * vec3f(f32(c == 0), f32(c == 1), f32(c == 2));
  }
  return out * CROWN_RETURN;
}

/**
 * The flash a stone throws as it turns.
 *
 * Each facet answers only when its reflection happens to point a particular
 * way — so the smallest movement of the head
 * puts a different set of them out and another set alight. How bright the
 * facet's own reflection is decides whether any of them answer at all, which
 * is why a stone sparkles under a lamp and lies quiet in a shadow.
 */
fn gemSparkle(n: vec3f, r: vec3f, lit: f32, amount: f32) -> f32 {
  if (amount <= 0.0 || lit <= 0.0) { return 0.0; }
  // The facet's own normal names it. It is constant across a facet, so the
  // whole facet answers at once — which is exactly what a facet does, and why
  // a stone flashes rather than glitters like sand.
  let which = floor(n * 24.0);
  let aim = floor(r * 7.0);
  return smoothstep(0.88, 0.99, hash13(which * 3.1 + aim * 1.9)) * lit * amount;
}

/** Planished dimpling: three crossed waves. */
fn planish(p: vec3f) -> f32 {
  return sin(p.x * 1.7 + p.y * 0.9) * sin(p.y * 1.9 - p.z * 1.1) * sin(p.z * 1.6 + p.x * 0.8);
}

/** Fired enamel is glass with a faint orange peel: glossy, never a mirror. */
const ENAMEL_ROUGHNESS: f32 = 0.09;

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
  let irrN = env(spin * n, frame.maxLod);
  let irrWrap = env(spin * normalize(n + v), frame.maxLod);
  let irrBack = env(spin * (-n), frame.maxLod);
  let scattered = irrN * 0.7 + irrWrap * 0.3;
  let rim = pow(1.0 - ndv, 2.5) * 0.35;
  // multiple scattering loses some light on every pass through the plates:
  // nacre returns about half of what falls on it, not all of it
  return base * (scattered + irrBack * rim) * ao * 0.55;
}

@fragment fn fsMain(in: VsOut, @builtin(front_facing) frontFacing: bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  let v = normalize(frame.cameraPos - in.world);
  if (!frontFacing) { n = -n; }

  var tbn = tangentFrame(n, in.world, in.uv);
  // how much of the flat plate one pixel covers, for antialiasing anything drawn on it
  let plateFootprint = max(0.75 * length(vec2f(dpdx(in.plate.x), dpdy(in.plate.x))), 0.005);
  // and of the engraving coordinates, taken here where every pixel takes them,
  // with the directions those coordinates run in on the surface
  let engraveFootprint = max(0.75 * length(vec2f(dpdx(in.engrave.x), dpdy(in.engrave.x))), 0.005);
  let engraveFrame = tangentFrame(n, in.world, in.engrave);

  // --- chased relief: bend the normal by the height field's gradient, per pixel ---
  // The relief was applied as a shear along the flat plate's normal; the cup and
  // curl that followed are bends, so the flat x and y directions are still unit
  // tangents of the surface. The vertex normal carries no relief, so this is
  // the whole of it.
  if (material.relief > 0.0 && abs(in.cap) > 0.5) {
    let eps = material.reliefHalfWidth * 1e-3;
    let fx = (reliefHeight(in.plate.x + eps, in.plate.y) - reliefHeight(in.plate.x - eps, in.plate.y)) / (2.0 * eps);
    let fy = (reliefHeight(in.plate.x, in.plate.y + eps) - reliefHeight(in.plate.x, in.plate.y - eps)) / (2.0 * eps);
    let t = normalize(tbn[0] - n * dot(tbn[0], n));
    let b = normalize(tbn[1] - n * dot(tbn[1], n));
    n = normalize(n - in.cap * (fx * t + fy * b) * select(1.0, -1.0, !frontFacing));
    // re-square the frame to the new normal without touching the derivatives,
    // which may not be taken inside a branch this pixel's neighbours may skip
    tbn = mat3x3f(normalize(t - n * dot(t, n)), normalize(b - n * dot(b, n)), n);
  }

  // --- engraving: the same bend, from a pattern field, on whatever face carries coordinates ---
  if (material.pattern > 0u && (material.patternFaces > 0u || abs(in.cap) > 0.5)) {
    let pitch = material.patternParams.x;
    // grooves finer than a pixel would only shimmer; let the pattern fade to
    // plain metal as it gets there
    let fade = 1.0 - smoothstep(0.12, 0.45, engraveFootprint / pitch);
    let depth = material.patternParams.y * fade;
    if (depth != 0.0) {
      let eps = pitch * 0.02;
      let e = in.engrave;
      let fx = (engraveHeight(e.x + eps, e.y, depth) - engraveHeight(e.x - eps, e.y, depth)) / (2.0 * eps);
      let fy = (engraveHeight(e.x, e.y + eps, depth) - engraveHeight(e.x, e.y - eps, depth)) / (2.0 * eps);
      // the field is cut along the outward normal of whichever face this is,
      // so the frame comes from the engraving coordinates themselves — a
      // sweep's uv is left-handed, and this never has to know
      let t = normalize(engraveFrame[0] - n * dot(engraveFrame[0], n));
      let b = normalize(engraveFrame[1] - n * dot(engraveFrame[1], n));
      let sign = select(1.0, -1.0, !frontFacing);
      n = normalize(n - sign * (fx * t + fy * b));
      tbn = mat3x3f(normalize(tbn[0] - n * dot(tbn[0], n)), normalize(tbn[1] - n * dot(tbn[1], n)), n);
    }
  }

  // --- lettering: the same bend again, from the letters' distance field ---
  var letterFloor = 0.0;
  if (material.glyphCount > 0u && (material.patternFaces > 0u || abs(in.cap) > 0.5)) {
    let eps = max(0.02, material.letterSpread * 0.08);
    let e = in.engrave;
    let h0 = letterHeight(e);
    let fx = (letterHeight(e + vec2f(eps, 0.0)) - letterHeight(e - vec2f(eps, 0.0))) / (2.0 * eps);
    let fy = (letterHeight(e + vec2f(0.0, eps)) - letterHeight(e - vec2f(0.0, eps))) / (2.0 * eps);
    let t = normalize(engraveFrame[0] - n * dot(engraveFrame[0], n));
    let b = normalize(engraveFrame[1] - n * dot(engraveFrame[1], n));
    let sign = select(1.0, -1.0, !frontFacing);
    n = normalize(n - sign * (fx * t + fy * b));
    tbn = mat3x3f(normalize(tbn[0] - n * dot(tbn[0], n)), normalize(tbn[1] - n * dot(tbn[1], n)), n);
    // how far into the cut this pixel is, 0..1: the floor of a cut is left matte by the graver
    letterFloor = select(0.0, clamp(-h0 / material.letter.x, 0.0, 1.0), material.letter.x != 0.0);
  }

  var roughness = material.roughness;
  var f0 = material.f0;
  var metallic = 1.0;
  if (letterFloor > 0.0) { roughness = mix(roughness, max(roughness, 0.42), letterFloor); }
  // nacre has a soft lustre whatever finish the sketch asked for, and no
  // planishing, patina or wear: those are things done to metal
  let nacre = material.model == 1u;
  if (nacre) { roughness = max(roughness, 0.18); }
  // a stone is polished by definition, whatever finish the sketch asked for,
  // and nothing is hammered, patinated or worn but metal
  let gemstone = material.model == 2u;
  if (gemstone) { roughness = min(roughness, 0.04); }
  // a display plastic is not worked metal either: no planishing, patina or wear
  let plastic = material.model == 3u;
  // wood is grain drawn through a dielectric; nothing about it is worked metal
  let wood = material.model == 4u;
  let worked = !nacre && !gemstone && !plastic && !wood;

  // --- planishing: perturb the normal by the gradient of a height field ---
  if (material.hammer > 0.0 && worked) {
    let p = in.object * 0.55;
    let eps = 0.35;
    let h0 = planish(p);
    let hx = planish(p + tbn[0] * eps);
    let hy = planish(p + tbn[1] * eps);
    let bump = (tbn[0] * (hx - h0) + tbn[1] * (hy - h0)) / eps;
    n = normalize(n - bump * material.hammer * 0.22);
  }

  // --- patina: an oxide fraction that is not metal any more ---
  if (material.patina > 0.0 && worked) {
    let blotch = noise3(in.object * 0.32) * 0.65 + noise3(in.object * 0.9) * 0.35;
    let mask = smoothstep(0.62 - material.patina * 0.55, 0.78 - material.patina * 0.3, blotch);
    metallic = mix(1.0, 0.0, mask * material.patina);
    f0 = mix(f0, vec3f(0.04), mask * material.patina);
    roughness = mix(roughness, min(roughness + 0.35, 0.95), mask * material.patina);
  }

  // --- micro-variation: no real surface is one roughness end to end ---
  // Broad smudges where the polishing cloth or a hand went over it, and a
  // finer mottle under them, each a small shift in roughness; and the
  // faintest drift in the metal's own tint, so a wide flat face reads as a
  // surface rather than a fill. Sized by the finish: a mirror polish moves
  // a little, a satin or brushed finish a good deal more, since its
  // roughness came from marks in the first place.
  if (worked) {
    let p = in.object;
    let smudge = noise3(p * 0.09 + vec3f(3.1, 7.7, 1.3)) - 0.5;
    let mottle = noise3(p * 0.7 + vec3f(11.0, 2.0, 5.0)) - 0.5;
    let fine = noise3(p * 3.0) - 0.5;
    let amount = 0.02 + 0.2 * roughness * (1.0 - roughness);
    roughness = roughness + amount * (smudge * 1.6 + mottle * 0.8 + fine * 0.5);
    let tint = 1.0 + 0.035 * (smudge * 1.2 + mottle * 0.6);
    f0 = f0 * tint;
  }

  // --- wear: edges handled bright, creases left dull ---
  let wearOn = select(material.wear, 0.0, !worked);
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
  let prefiltered = env(spin * r, lod);
  let ab = textureSampleLevel(envBrdf, linearSampler, vec2f(ndv, roughness), 0.0).rg;

  // Lagarde's specular occlusion: a mirror keeps more of its reflection than
  // its hemisphere visibility suggests
  // the floor of a cut letter sits in its own shadow
  let ao = in.ao * (1.0 - 0.45 * letterFloor);
  let specOcclusion = clamp(pow(ndv + ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + ao, 0.0, 1.0);
  var reflected = prefiltered * specOcclusion;

  let enamelled = in.enamel > 0.001;

  // what the key light lands on: a diffuse body (none for metal, which has
  // no diffuse lobe), a specular f0 and roughness. Each branch fills these
  // in; the key is added once, after, so no branch forgets it.
  var keyBody = vec3f(0.0);
  var keyF0 = f0;
  var keyRough = roughness;

  var colour: vec3f;
  if (material.model == 1u) {
    // nacre: a lustre over a scattering body, with the sheen on the lustre
    let fresnel = f0 * ab.x + ab.y;
    let tint = orientTint(ndv, material.orient);
    let body = nacreBody(n, v, ndv, material.baseColour, ao);
    colour = (body * (1.0 - fresnel) * mix(vec3f(1.0), tint, 0.3) + reflected * fresnel * tint) * frame.exposure;
    keyBody = material.baseColour * mix(1.0, ao, 0.5);
  } else if (gemstone) {
    // a hard dielectric mirror on the facet, the folded room underneath it,
    // and a flash where the facet catches something bright
    let axis = normalize(in.axis);
    let ior = max(material.gemIor, 1.05);
    let g0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
    let mirror = reflected * (g0 * ab.x + ab.y);
    let fresnel = g0 + (1.0 - g0) * pow(1.0 - ndv, 5.0);
    // Which pavilion facet the light meets depends on where it crossed the
    // crown, not only on where it was going. That is why the table of a stone
    // is a mosaic of directions rather than one flat colour, and it is the
    // difference between reading as a gem and reading as a bead of glass.
    let across = normalize(in.side - axis * dot(in.side, axis));
    let step = 6.2831853 / max(material.gemPavilion, 2.0);
    let az = (floor(atan2(in.object.y, in.object.x) / step) + 0.5) * step;
    let lateral = across * cos(az) + cross(axis, across) * sin(az);
    let interior = gemInterior(v, n, axis, lateral, ior, material.gemDispersion) * material.baseColour * ao;
    let lit = smoothstep(0.8, 4.0, dot(reflected, vec3f(0.2126, 0.7152, 0.0722)));
    let flash = gemSparkle(n, r, lit, material.gemSparkle);
    colour = (mirror + interior * (1.0 - fresnel) + reflected * flash) * frame.exposure;
    keyF0 = vec3f(g0);
  } else if (plastic || wood) {
    // an ordinary dielectric: a low, fixed highlight over a diffuse body in
    // the finish's own colour — no patina, hammer or enamel, only ever metal
    var body = material.baseColour;
    if (wood) {
      // Growth rings as a stack of warped planes through the part: a haft is
      // cut from a board, not turned round its own pith, so what shows on a
      // cylinder is long stripes and cathedrals where the surface cuts the
      // rings, not concentric circles. Each ring is a sharp dark latewood
      // band on a paler earlywood ground, and a fine fibre texture runs the
      // length of Z through both, so the figure reads at every distance.
      let p = in.object;
      let wobble = noise3(vec3f(p.x * 0.35, p.y * 0.35, p.z * 0.03)) * 2.6
        + noise3(vec3f(p.x * 1.3, p.y * 1.3, p.z * 0.11)) * 0.6;
      let ringCoord = (p.x * 0.94 + p.y * 0.34) * 1.9 + wobble;
      let ph = fract(ringCoord);
      // never sharper than the pixel: a ring narrower than the footprint is
      // averaged toward its mean rather than shimmering
      let foot = clamp(fwidth(ringCoord) * 1.5, 0.02, 0.5);
      let late = smoothstep(0.42 - foot, 0.62 + foot, ph) * (1.0 - smoothstep(0.78 - foot, 0.96 + foot, ph));
      let fibre = noise3(vec3f(p.x * 5.5, p.y * 5.5, p.z * 0.4)) - 0.5;
      let strength = material.orient;
      body = material.baseColour
        * (1.0 + 0.5 * strength * fibre)
        * mix(1.0 + 0.3 * strength, 1.0 - 1.3 * strength, late)
        * mix(vec3f(1.0), vec3f(0.92, 0.78, 0.66), late);
    }
    let specular = reflected * (f0 * ab.x + ab.y);
    let irradiance = env(spin * n, frame.maxLod);
    let diffuse = irradiance * body * ao;
    colour = (specular + diffuse) * frame.exposure;
    keyBody = body * mix(1.0, ao, 0.5);
  } else {
    let specular = reflected * (f0 * ab.x + ab.y);
    // metal has no diffuse lobe, so this only shows where patina has taken hold
    let irradiance = env(spin * n, frame.maxLod);
    let diffuse = irradiance * material.patinaColour * (1.0 - metallic) * ao;
    colour = (specular + diffuse) * frame.exposure;
    keyBody = material.patinaColour * (1.0 - metallic) * mix(1.0, ao, 0.5);

    // Enamel: a glass skin over the metal, on the vertices that carry it. The
    // surface is a smooth dielectric with its own narrow highlight; under it
    // the body scatters light in its colour, and a transparent enamel lets the
    // metal's reflection back out through the colour, which is the glow of a
    // translucent enamel over a bright foil.
    if (enamelled) {
      let eRough = ENAMEL_ROUGHNESS;
      let eLod = max(eRough * frame.maxLod, footLod);
      let ePrefiltered = env(spin * reflect(-v, n), eLod);
      let eOcclusion = clamp(pow(ndv + ao, exp2(-16.0 * eRough - 1.0)) - 1.0 + ao, 0.0, 1.0);
      let eReflected = ePrefiltered * eOcclusion;
      let eAb = textureSampleLevel(envBrdf, linearSampler, vec2f(ndv, eRough), 0.0).rg;
      let eFresnel = vec3f(0.04) * eAb.x + eAb.y;
      let eSpecular = eReflected * eFresnel;
      // the metal's own highlight, seen through the glass and dyed by it: the
      // colour is the round trip's transmittance, in and back out. A little
      // stays even in an opaque enamel, where the layer is thin at the rim.
      let through = specular * material.enamelColour * (1.0 - material.enamelOpacity);
      let body = irradiance * material.enamelColour * ao * material.enamelOpacity;
      var enamel = (eSpecular + (1.0 - eFresnel) * (body + through)) * frame.exposure;
      // Cloisonné: wires of a second metal set along the veins. The same field
      // that raises the relief says where a vein runs; its core is the wire.
      // The wire is polished, and reflects what the glass beside it reflects.
      if (material.veinOn > 0.0) {
        let wire = 1.0 - smoothstep(-plateFootprint, plateFootprint, veinWire(in.plate.x, in.plate.y));
        let wireColour = eReflected * (material.veinF0 * eAb.x + eAb.y) * frame.exposure;
        enamel = mix(enamel, wireColour, wire);
      }
      colour = mix(colour, enamel, in.enamel);
      // the key sees the glass, not the metal under it
      keyF0 = mix(keyF0, vec3f(0.04), in.enamel);
      keyRough = mix(keyRough, eRough, in.enamel);
      keyBody = mix(keyBody, material.enamelColour * material.enamelOpacity * mix(1.0, ao, 0.5), in.enamel);
    }
  }

  // the key light, over whatever the environment gave, where its shadow lets it
  let keyLit = keyShadowAt(in.world, n);
  colour += (keySpecular(n, v, keyF0, keyRough) + keyBody * keyDiffuse(n) * frame.keyColour) * keyLit * frame.exposure;

  // Selection: what the cursor is on keeps its light and takes a warm cast;
  // everything else drops back so the chosen instances read at a glance.
  if (frame.selecting > 0.5) {
    let glow = vec3f(0.95, 0.62, 0.18) * frame.exposure * 0.22;
    colour = mix(colour * 0.22, colour * 1.1 + glow, in.selected);
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

  // alpha carries the distance to the eye, for the depth of field pass
  return vec4f(colour, length(in.world - frame.cameraPos));
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
  table: f32,          // which surface: 0 matte, 1 oak, 2 walnut, 3 slate, 4 linen
  roughness: f32,
  scale: f32,          // pattern size, mm per feature
  _pad3: f32,
};
@group(1) @binding(0) var<uniform> ground: Ground;

struct Surface { albedo: vec3f, roughness: f32, normal: vec3f };

// Boards laid along X, each a little different in tone and in where its
// rings fall, with a dark seam between them. Rings as in the parts' own wood:
// a stack of warped planes, so a plank shows long stripes and cathedrals.
fn plankSurface(p: vec2f, base: vec3f, seamWidth: f32, contrast: f32) -> Surface {
  let boardWidth = ground.scale;
  let board = floor(p.y / boardWidth);
  let inBoard = fract(p.y / boardWidth);
  let seed = hash13(vec3f(board, 0.0, 0.0));
  let tone = mix(0.8, 1.2, seed);
  // each board is a different cut: its rings run at their own slant and phase
  let slant = mix(-0.25, 0.25, hash13(vec3f(board, 7.0, 0.0)));
  let along = p.x + seed * 3000.0;
  let across = (inBoard - 0.5) * boardWidth;
  // rings run the length of the board, drifting slowly and closing into
  // cathedrals where the wobble folds them back over themselves
  let wobble = noise3(vec3f(along * 0.008, across * 0.03, seed)) * 3.0
    + noise3(vec3f(along * 0.03, across * 0.12, seed * 3.0)) * 0.7;
  let ringCoord = across * (0.22 + slant * 0.3) + along * 0.004 * slant + wobble;
  let ph = fract(ringCoord);
  let foot = clamp(fwidth(ringCoord) * 1.5, 0.02, 0.5);
  let late = smoothstep(0.4 - foot, 0.6 + foot, ph) * (1.0 - smoothstep(0.78 - foot, 0.96 + foot, ph));
  let fibre = noise3(vec3f(p.x * 0.6, p.y * 5.0, seed)) - 0.5;
  var albedo = base * tone
    * (1.0 + 0.35 * contrast * fibre)
    * mix(1.0 + 0.2 * contrast, 1.0 - 0.9 * contrast, late)
    * mix(vec3f(1.0), vec3f(0.92, 0.8, 0.7), late);
  let edge = min(inBoard, 1.0 - inBoard) * boardWidth;
  let seam = 1.0 - smoothstep(0.0, seamWidth, edge);
  albedo = mix(albedo, base * 0.25, seam);
  // the seam is a shallow groove; latewood stands very slightly proud
  let dz = seam * 0.6 + late * 0.05;
  let n = normalize(vec3f(0.0, -dz * 4.0 * select(1.0, -1.0, inBoard > 0.5), 1.0));
  return Surface(albedo, ground.roughness + late * 0.08, n);
}

fn slateSurface(p: vec2f) -> Surface {
  let s = ground.scale;
  let mottle = noise3(vec3f(p.x / s, p.y / s, 1.0)) * 0.6 + noise3(vec3f(p.x / s * 4.0, p.y / s * 4.0, 2.0)) * 0.3;
  // cleaved bedding: fine parallel ridges, wandering
  let bed = noise3(vec3f(p.x * 0.015, p.y * 0.35 + noise3(vec3f(p.x * 0.03, p.y * 0.03, 5.0)) * 6.0, 3.0));
  let flake = noise3(vec3f(p.x * 0.5, p.y * 0.5, 7.0));
  let base = mix(vec3f(0.03, 0.034, 0.042), vec3f(0.085, 0.09, 0.1), mottle);
  let albedo = base * (0.94 + 0.12 * bed) * (0.9 + 0.2 * flake);
  let n = normalize(vec3f(0.0, (bed - 0.5) * 0.08, 1.0));
  return Surface(albedo, ground.roughness + (0.5 - flake) * 0.2, n);
}

fn linenSurface(p: vec2f) -> Surface {
  let s = ground.scale;
  // a plain weave: warp and weft alternately on top, each thread a soft ridge
  let u = p.x / s; let v = p.y / s;
  let warp = 0.5 + 0.5 * cos(u * 6.2831853);
  let weft = 0.5 + 0.5 * cos(v * 6.2831853);
  let check = fract(floor(u) * 0.5 + floor(v) * 0.5) * 2.0;   // 0 or 1
  let ridge = mix(warp, weft, check);
  let foot = clamp(fwidth(u) * 2.0, 0.0, 1.0);
  let thread = mix(ridge, 0.5, foot);      // averaged away when finer than a pixel
  let slub = noise3(vec3f(p.x * 0.15, p.y * 0.15, 9.0));
  let base = vec3f(0.62, 0.56, 0.46) * mix(0.9, 1.1, slub);
  let albedo = base * mix(0.82, 1.0, thread);
  return Surface(albedo, ground.roughness, vec3f(0.0, 0.0, 1.0));
}

fn tableSurface(p: vec2f) -> Surface {
  let t = ground.table;
  if (t < 0.5) {
    // a matte table in the page's colour, never darker than a dark cloth
    return Surface(max(ground.background, ground.albedo), ground.roughness, vec3f(0.0, 0.0, 1.0));
  } else if (t < 1.5) {
    return plankSurface(p, vec3f(0.42, 0.28, 0.15), 0.7, 0.4);
  } else if (t < 2.5) {
    return plankSurface(p, vec3f(0.16, 0.09, 0.055), 0.9, 0.5);
  } else if (t < 3.5) {
    return slateSurface(p);
  }
  return linenSurface(p);
}
@group(1) @binding(1) var shadow: texture_2d<f32>;

struct VsOut { @builtin(position) clip: vec4f, @location(0) local: vec2f, @location(1) world: vec3f };

@vertex fn vsMain(@location(0) position: vec3f) -> VsOut {
  var out: VsOut;
  out.local = position.xy;
  let world = ground.centre + vec3f(position.xy * ground.radius, 0.0);
  out.world = world;
  out.clip = frame.viewProj * vec4f(world, 1.0);
  return out;
}

@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let acc = textureSample(shadow, linearSampler, in.local * 0.5 + 0.5).rg;
  let ao = select(1.0, clamp(acc.r / acc.g, 0.0, 1.0), acc.g > 0.0);
  // the table takes the background's colour, but never darker than a dark
  // matte table, and is lit by the sky and the key like anything else —
  // so on a black page there is still a pool of light with a shadow in
  // it, and on a pale one the table is that colour with a shadow in it
  let surface = tableSurface(in.world.xy);
  let n = surface.normal;
  let v = normalize(frame.cameraPos - in.world);
  let ndv = max(dot(n, v), 1e-3);
  let spin = spinZ(frame.envSpin);
  let irradiance = env(spin * n, frame.maxLod);
  // each light carries its own shadow: the sky's the baked occlusion, the
  // key's its shadow map — the key doesn't darken where the sky can't reach
  let keyLit = keyShadowAt(in.world, vec3f(0.0, 0.0, 1.0));
  let key = keyDiffuse(n) * frame.keyColour * keyLit;
  let diffuse = surface.albedo * (irradiance * ao + key);
  // the table's own sheen: a dielectric's low highlight, dulled by roughness
  // and by the piece standing over it, so a waxed board holds a soft
  // reflection of the sky and the key while a cloth holds none
  let rough = clamp(surface.roughness, 0.05, 1.0);
  let ab = textureSampleLevel(envBrdf, linearSampler, vec2f(ndv, rough), 0.0).rg;
  let fresnel = vec3f(0.04) * ab.x + ab.y;
  let reflected = env(spin * reflect(-v, n), rough * frame.maxLod) * mix(ao, 1.0, 0.3);
  let specular = reflected * fresnel + keySpecular(n, v, vec3f(0.04), rough) * keyLit;
  let lit = (diffuse * (1.0 - fresnel) + specular) * frame.exposure;
  let fade = 1.0 - smoothstep(0.3, 1.0, length(in.local));
  var colour = mix(ground.background, lit, fade);
  if (frame.debug > 5.5 && frame.debug < 6.5) { colour = vec3f(ao); }
  else if (frame.debug > 0.5) { colour = ground.background; }
  // distance to the eye for the depth of field pass, negated: the table
  // marks itself so it can be kept no sharper than the piece on it
  return vec4f(colour, -length(in.world - frame.cameraPos));
}
`;

/**
 * Depth only, ahead of the scene pass. The scene's fragment shader is not
 * cheap — noise for patina and wear, a planished normal — and a rose is forty
 * petals deep: without a prepass most of that work is done for surfaces a
 * nearer petal then covers.
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
