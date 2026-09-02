/**
 * HDR output: the scene renders into a multisampled float buffer, bloom is drawn
 * from what overshoots white, and one composite pass tonemaps to the canvas.
 *
 * Until now every fragment tonemapped itself, which is fine for a single surface
 * and wrong for a picture: a softbox reflected in polished gold is many times
 * brighter than white, and clipping it in place throws that information away.
 * Kept in a float target, the overshoot can spill into its neighbours the way it
 * does through a real lens — a glow, not a flat white patch — and the tonemap
 * then sees the whole frame at once.
 *
 * Written against raw WebGL2. ogl's RenderTarget is single-sampled, and losing
 * multisampling on thin wires costs more than the bloom gains, so the scene goes
 * to a multisampled renderbuffer that ogl is handed as if it were a target, and is
 * resolved with a blit.
 */

export interface PostOptions {
  /** How much of the bloom pyramid is added back. */
  bloom: number;
  /** Debug views want their raw values shown, not tonemapped and bloomed. */
  raw: boolean;
}

/** Just enough of ogl's RenderTarget for Renderer.render to bind it. */
export interface PostTarget {
  buffer: WebGLFramebuffer;
  width: number;
  height: number;
  depth: boolean;
  stencil: boolean;
  target: number;
}

const FULLSCREEN_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** What overshoots white, with a soft knee so the threshold is not a hard line. */
const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = texture(uSource, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contribution = max(soft, l - uThreshold) / max(l, 1e-4);
  fragColor = vec4(c * contribution, 1.0);
}`;

/** Kawase downsample: centre plus the four diagonals, half a texel out. */
const DOWN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uTexel;   // of the source
void main() {
  vec3 sum = texture(uSource, vUv).rgb * 4.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  sum += texture(uSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  sum += texture(uSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  fragColor = vec4(sum / 8.0, 1.0);
}`;

/** Kawase upsample: a tent over eight neighbours, added onto the level above. */
const UP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSource;
uniform vec2 uTexel;   // of the source
void main() {
  vec3 sum = vec3(0.0);
  sum += texture(uSource, vUv + uTexel * vec2(-1.0,  0.0)).rgb * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2( 1.0,  0.0)).rgb * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2( 0.0, -1.0)).rgb * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2( 0.0,  1.0)).rgb * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  sum += texture(uSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  sum += texture(uSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  fragColor = vec4(sum / 12.0, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloom_;
uniform float uRaw;

// Narkowicz's ACES fit, as before — only now it sees the finished frame.
vec3 tonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 colour = uRaw > 0.5 ? scene : tonemap(scene + bloom * uBloom_);
  fragColor = vec4(pow(colour, vec3(1.0 / 2.2)), 1.0);
}`;

const BLOOM_LEVELS = 5;

export class PostChain {
  readonly target: PostTarget;
  private width = 0;
  private height = 0;
  private samples: number;

  private colourRb: WebGLRenderbuffer | null = null;
  private depthRb: WebGLRenderbuffer | null = null;
  private resolveTex: WebGLTexture | null = null;
  private resolveFbo: WebGLFramebuffer;
  private bloomTex: WebGLTexture[] = [];
  private bloomFbo: WebGLFramebuffer[] = [];
  private bloomSize: Array<[number, number]> = [];

  private vao: WebGLVertexArrayObject;
  private bright: WebGLProgram;
  private down: WebGLProgram;
  private up: WebGLProgram;
  private composite: WebGLProgram;

  /** Null when the context cannot render to float, in which case there is no chain. */
  static create(gl: WebGL2RenderingContext): PostChain | null {
    if (!gl.getExtension('EXT_color_buffer_float')) return null;
    return new PostChain(gl);
  }

  private constructor(private gl: WebGL2RenderingContext) {
    this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
    this.target = {
      buffer: gl.createFramebuffer()!,
      width: 1,
      height: 1,
      depth: true,
      stencil: false,
      target: gl.FRAMEBUFFER,
    };
    this.resolveFbo = gl.createFramebuffer()!;
    for (let i = 0; i < BLOOM_LEVELS; i++) this.bloomFbo.push(gl.createFramebuffer()!);
    this.vao = gl.createVertexArray()!;
    this.bright = compile(gl, FULLSCREEN_VERT, BRIGHT_FRAG);
    this.down = compile(gl, FULLSCREEN_VERT, DOWN_FRAG);
    this.up = compile(gl, FULLSCREEN_VERT, UP_FRAG);
    this.composite = compile(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);
  }

  resize(width: number, height: number) {
    const gl = this.gl;
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.target.width = width;
    this.target.height = height;
    this.release();

    // R11F_G11F_B10F: float enough for highlights at half the memory of RGBA16F,
    // which matters at 4x multisampling on a retina canvas.
    const format = gl.R11F_G11F_B10F;

    this.colourRb = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.colourRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, format, width, height);
    this.depthRb = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.buffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.colourRb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb);

    this.resolveTex = makeTexture(gl, format, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.resolveTex, 0);

    this.bloomTex = [];
    this.bloomSize = [];
    let w = width, h = height;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      const tex = makeTexture(gl, format, w, h);
      this.bloomTex.push(tex);
      this.bloomSize.push([w, h]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  /** Resolve, bloom and tonemap the scene just rendered into `target`, onto the canvas. */
  finish(opts: PostOptions) {
    const gl = this.gl;
    const { width, height } = this;

    // --- resolve the multisampled scene ---
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.target.buffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolveFbo);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.activeTexture(gl.TEXTURE0);

    if (!opts.raw) {
      // --- bright pass into the first bloom level ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[0]);
      gl.viewport(0, 0, this.bloomSize[0][0], this.bloomSize[0][1]);
      gl.useProgram(this.bright);
      gl.bindTexture(gl.TEXTURE_2D, this.resolveTex);
      gl.uniform1i(gl.getUniformLocation(this.bright, 'uSource'), 0);
      gl.uniform1f(gl.getUniformLocation(this.bright, 'uThreshold'), 1.2);
      gl.uniform1f(gl.getUniformLocation(this.bright, 'uKnee'), 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // --- down the pyramid ---
      gl.useProgram(this.down);
      gl.uniform1i(gl.getUniformLocation(this.down, 'uSource'), 0);
      const downTexel = gl.getUniformLocation(this.down, 'uTexel');
      for (let i = 1; i < BLOOM_LEVELS; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[i]);
        gl.viewport(0, 0, this.bloomSize[i][0], this.bloomSize[i][1]);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[i - 1]);
        gl.uniform2f(downTexel, 1 / this.bloomSize[i - 1][0], 1 / this.bloomSize[i - 1][1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // --- and back up, accumulating, so each level's blur adds to the next ---
      gl.useProgram(this.up);
      gl.uniform1i(gl.getUniformLocation(this.up, 'uSource'), 0);
      const upTexel = gl.getUniformLocation(this.up, 'uTexel');
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[i]);
        gl.viewport(0, 0, this.bloomSize[i][0], this.bloomSize[i][1]);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[i + 1]);
        gl.uniform2f(upTexel, 1 / this.bloomSize[i + 1][0], 1 / this.bloomSize[i + 1][1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }

    // --- composite to the canvas ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.resolveTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
    gl.uniform1i(gl.getUniformLocation(this.composite, 'uScene'), 0);
    gl.uniform1i(gl.getUniformLocation(this.composite, 'uBloom'), 1);
    gl.uniform1f(gl.getUniformLocation(this.composite, 'uBloom_'), opts.raw ? 0 : opts.bloom);
    gl.uniform1f(gl.getUniformLocation(this.composite, 'uRaw'), opts.raw ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
  }

  private release() {
    const gl = this.gl;
    if (this.colourRb) gl.deleteRenderbuffer(this.colourRb);
    if (this.depthRb) gl.deleteRenderbuffer(this.depthRb);
    if (this.resolveTex) gl.deleteTexture(this.resolveTex);
    for (const t of this.bloomTex) gl.deleteTexture(t);
    this.colourRb = this.depthRb = null;
    this.resolveTex = null;
    this.bloomTex = [];
  }

  dispose() {
    const gl = this.gl;
    this.release();
    gl.deleteFramebuffer(this.target.buffer);
    gl.deleteFramebuffer(this.resolveFbo);
    for (const f of this.bloomFbo) gl.deleteFramebuffer(f);
    gl.deleteVertexArray(this.vao);
    for (const p of [this.bright, this.down, this.up, this.composite]) gl.deleteProgram(p);
  }
}

/**
 * The linear value that tonemaps to a given display value. The page background
 * has to come out of the composite as exactly the CSS colour beside it, so the
 * clear colour is found by inverting the curve rather than guessed.
 */
export function inverseTonemap(display: [number, number, number]): [number, number, number] {
  const aces = (x: number) => {
    const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return Math.min(1, Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e)));
  };
  return display.map((v) => {
    const targetLinear = Math.pow(v, 2.2);
    let lo = 0, hi = 20;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (aces(mid) < targetLinear) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }) as [number, number, number];
}

function makeTexture(gl: WebGL2RenderingContext, format: number, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function compile(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`post shader failed: ${gl.getShaderInfoLog(s)}`);
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
    throw new Error(`post program failed: ${gl.getProgramInfoLog(p)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}
