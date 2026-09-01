/**
 * Screen-space ambient occlusion.
 *
 * The occlusion this project actually needs is *between* parts — a rivet head
 * against the plate it fastens, a scale against the one beneath it. That is not
 * something a part can know about itself, so baking it per part would neither
 * capture it nor survive instancing. It has to be found after the parts are
 * placed, which means screen space.
 */

export const SAMPLE_COUNT = 24;
/** Turns of the sample spiral. Coprime with the tap count keeps taps spread. */
export const SPIRAL_TURNS = 7;

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
uniform mat4 uProjection;
uniform vec2 uResolution;
uniform vec2 uFocal;      // projectionMatrix[0][0], [1][1]
uniform float uRadius;
uniform float uBias;      // minimum elevation above the tangent plane
uniform float uIntensity;

const float TAU = 6.28318530718;
const int SAMPLES = ${SAMPLE_COUNT};
const float SPIRAL_TURNS = ${SPIRAL_TURNS}.0;

/** Rebuild the view-space point from linear depth, without a position buffer. */
vec3 viewPositionFrom(vec2 uv, float depth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x / uFocal.x, ndc.y / uFocal.y, -1.0) * depth;
}

/**
 * Integer hash of the pixel coordinate.
 *
 * Deliberately not a fract()-of-float hash: by the right-hand side of a 2780px
 * buffer, gl_FragCoord.x * 0.1031 is around 200, fract() keeps only the low bits
 * of the mantissa, and the "random" angle collapses onto a handful of values
 * correlated along diagonals. The rotation then fails to decorrelate neighbours
 * in exactly the way it exists to, and the sampling error reappears as diagonal
 * banding at the scale of the sampling radius.
 */
float hashPixel(vec2 fragCoord) {
  uvec2 p = uvec2(fragCoord);
  uint h = p.x * 73856093u ^ p.y * 19349663u;
  h ^= h >> 13u;
  h *= 1274126177u;
  h ^= h >> 16u;
  return float(h) * (1.0 / 4294967296.0);
}

void main() {
  vec4 sampled = texture(uNormalDepth, vUv);
  float depth = sampled.w;

  // nothing was drawn here: background stays unoccluded
  if (depth <= 0.0) { fragColor = vec4(1.0); return; }

  vec3 normal = normalize(sampled.xyz);
  vec3 origin = viewPositionFrom(vUv, depth);

  // How large the occlusion radius is on screen. Below a few pixels there is
  // nothing to resolve; above a cap it only costs bandwidth.
  float radiusPixels = clamp(
    uRadius * uFocal.y * uResolution.y * 0.5 / depth,
    3.0, 96.0
  );

  // A spiral of taps, rotated by a per-pixel angle.
  //
  // The previous version reused one fixed 24-point kernel with 16 rotations from
  // a 4x4 noise tile. That leaves the estimate correlated across the whole
  // sampling footprint, so the error is not pixel noise a small blur can remove —
  // it is banding whose period is the projected radius itself, tens of pixels
  // wide. Zooming in appeared to fix it only because the footprint grew past the
  // edge of the screen. Choosing a fresh angle per pixel makes neighbouring
  // estimates independent, which turns that banding back into high-frequency
  // noise the blur does clear.
  float phi = hashPixel(gl_FragCoord.xy) * TAU;

  // Spend no more taps than the footprint has pixels to put them in.
  //
  // With a fixed tap count the spacing collapses as the subject shrinks on
  // screen: at a wide framing 24 taps across a 12-pixel radius sit half a pixel
  // apart, so with NEAREST depth sampling they land on the same dozen texels and
  // simply re-read them. Which texels get hit then shifts with the sub-pixel
  // position of the fragment, and that is a deterministic pattern, not noise —
  // which is why raising the tap count to 256 changed nothing at all. Keeping the
  // spacing at a pixel or more makes every tap carry new information, and the
  // per-pixel rotation turns what is left into noise the blur can clear.
  int taps = int(clamp(radiusPixels, 6.0, float(SAMPLES)));

  float occlusion = 0.0;
  float radius2 = uRadius * uRadius;

  for (int i = 0; i < SAMPLES; i++) {
    if (i >= taps) break;
    float alpha = (float(i) + 0.5) / float(taps);
    float theta = alpha * SPIRAL_TURNS * TAU + phi;
    vec2 offset = vec2(cos(theta), sin(theta)) * (alpha * radiusPixels);

    vec2 sampleUv = vUv + offset / uResolution;
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

    float sceneDepth = texture(uNormalDepth, sampleUv).w;
    if (sceneDepth <= 0.0) continue;

    // Elevation of the occluder above this point's tangent plane. A coplanar
    // neighbour gives a vector perpendicular to the normal and contributes
    // nothing, however coarsely it happened to be sampled — which is what makes
    // this robust where a depth comparison against a bias is not.
    vec3 scenePos = viewPositionFrom(sampleUv, sceneDepth);
    vec3 v = scenePos - origin;
    float vv = dot(v, v);
    float elevation = dot(v, normal) * inversesqrt(max(vv, 1e-8));

    float falloff = clamp(1.0 - vv / radius2, 0.0, 1.0);
    occlusion += falloff * max(elevation - uBias, 0.0);
  }

  // Fade out once the footprint is too small to resolve.
  //
  // Below roughly a 26-pixel radius the occlusion signal contains detail finer
  // than a pixel — thin plates, piercings, the gap between two overlapping
  // petals — and sampling it on the pixel grid aliases into a fixed pattern that
  // no amount of extra taps or jitter removes, because it is not noise. Until the
  // depth input is properly filtered for the tap distance (a mip chain, as SAO
  // does), the honest behaviour is to stop claiming occlusion the buffer cannot
  // actually resolve, rather than to draw an artifact over the metal.
  float resolvable = smoothstep(10.0, 26.0, radiusPixels);

  float ao = 1.0 - (occlusion / float(taps)) * uIntensity * resolvable;
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
