import {
  Renderer, Camera, Transform, Geometry, Program, Mesh, Vec3, Texture, Mat4, RenderTarget,
} from 'ogl';
import { Orbit } from './orbit';
import type { Mesh as PartMesh } from '../mesh/types';
import type { Anchor } from '../parts/types';
import type { Box3 } from '../geom/types';
import { bakeEnvironment, type Environment, type EnvPreset } from './env';
import { finishes, metals, patinaColour, type Finish, type Metal } from './materials';
import { PBR_FRAG, PBR_VERT, SKYBOX_FRAG, SKYBOX_VERT } from './shaders';
import {
  AO_FRAG, AO_VERT, BLUR_FRAG, DEPTH_COPY_FRAG, DEPTH_DOWNSAMPLE_FRAG, DEPTH_LEVELS,
  PREPASS_FRAG, PREPASS_VERT,
} from './ssao';

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const FULLSCREEN_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compileRaw(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`depth chain shader failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, make(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, make(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`depth chain program failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

const anchorVertex = `#version 300 es
in vec3 position;
in vec3 colour;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec3 vColour;
void main() {
  vColour = colour;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const anchorFragment = `#version 300 es
precision highp float;
in vec3 vColour;
out vec4 fragColor;
void main() { fragColor = vec4(vColour, 1.0); }`;

export interface InstanceGroup {
  mesh: PartMesh;
  matrices: Float32Array;
  /** Per-group overrides, so a rosette can have silver leaves and gold studs. */
  metal?: string;
  finish?: string;
}

export class Viewer {
  readonly renderer: Renderer;
  readonly camera: Camera;
  readonly scene: Transform;
  readonly meshes: Mesh[] = [];

  private controls: Orbit;
  private program: Program;
  private skyProgram: Program;
  private skyMesh: Mesh;
  private anchorProgram: Program;
  private anchorMesh: Mesh | null = null;
  private raf = 0;

  private prepassProgram: Program;
  private aoProgram: Program;
  private blurProgram: Program;
  private aoMesh: Mesh;
  private blurMesh: Mesh;
  private normalDepthTarget: RenderTarget | null = null;
  private depthChain: WebGLTexture | null = null;
  private depthChainTexture: Texture;
  private depthFbo: WebGLFramebuffer | null = null;
  private depthCopyProgram: WebGLProgram | null = null;
  private depthDownProgram: WebGLProgram | null = null;
  private depthVao: WebGLVertexArrayObject | null = null;
  private depthLevels = DEPTH_LEVELS;
  private aoTarget: RenderTarget | null = null;
  private blurTarget: RenderTarget | null = null;
  private aoEnabled = true;
  /** Occlusion radius in world units; set from the framed bounds. */
  private aoRadius = 2;

  private environment: Environment | null = null;
  private specularTexture: Texture;
  private backgroundTexture: Texture;
  private brdfTexture: Texture;

  private metal: Metal = metals.gold;
  private finish: Finish = finishes.polished;

  constructor(canvasHost: HTMLElement) {
    this.renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), antialias: true, alpha: false });
    const gl = this.renderer.gl;
    const raw = gl as unknown as WebGL2RenderingContext;
    canvasHost.appendChild(gl.canvas as HTMLCanvasElement);

    this.camera = new Camera(gl, { fov: 32, near: 0.5, far: 4000 });
    // Z is up here, as it is everywhere else in the project: parts revolve about
    // Z, symmetries turn about Z, and the environment is lit from +Z.
    this.camera.position.set(90, 60, 50);

    this.controls = new Orbit(this.camera, {
      element: gl.canvas as unknown as HTMLElement,
      target: new Vec3(0, 0, 0),
      ease: 0.18,
      inertia: 0.72,
      minDistance: 6,
      maxDistance: 1200,
    });

    this.scene = new Transform();

    // Raw GL textures from the bake, wrapped so ogl still manages texture units.
    this.depthChainTexture = wrapTexture(gl, raw.TEXTURE_2D);
    this.specularTexture = wrapTexture(gl, raw.TEXTURE_CUBE_MAP);
    this.backgroundTexture = wrapTexture(gl, raw.TEXTURE_CUBE_MAP);
    this.brdfTexture = wrapTexture(gl, raw.TEXTURE_2D);

    this.program = new Program(gl, {
      vertex: PBR_VERT,
      fragment: PBR_FRAG,
      uniforms: {
        uSpecular: { value: this.specularTexture },
        uBrdf: { value: this.brdfTexture },
        uMaxLod: { value: 5 },
        uF0: { value: this.metal.f0 },
        uRoughness: { value: this.finish.roughness },
        uAnisotropy: { value: this.finish.anisotropy },
        uHammer: { value: this.finish.hammer },
        uPatina: { value: this.finish.patina },
        uPatinaColour: { value: patinaColour('gold') },
        uExposure: { value: 1 },
        uEnvSpin: { value: 0 },
        uDebug: { value: 0 },
        uAo: { value: null },
        uResolution: { value: [1, 1] },
        uAoStrength: { value: 1 },
      },
      cullFace: null,
    });

    this.skyProgram = new Program(gl, {
      vertex: SKYBOX_VERT,
      fragment: SKYBOX_FRAG,
      uniforms: {
        uBackground: { value: this.backgroundTexture },
        uInverseViewProjection: { value: new Mat4() },
        uExposure: { value: 1 },
        uBlur: { value: 1.5 },
        uEnvSpin: { value: 0 },
        uBackdrop: { value: 0.42 },
      },
      cullFace: null,
      depthTest: false,
      depthWrite: false,
    });
    this.skyMesh = new Mesh(gl, {
      geometry: new Geometry(gl, {
        position: { size: 3, data: new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]) },
      }),
      program: this.skyProgram,
    });
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -1;
    this.skyMesh.setParent(this.scene);

    // --- ambient occlusion: prepass, sample, blur ---
    this.prepassProgram = new Program(gl, {
      vertex: PREPASS_VERT,
      fragment: PREPASS_FRAG,
      cullFace: null,
    });

    const fullscreen = () =>
      new Geometry(gl, {
        position: { size: 3, data: new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]) },
      });

    this.aoProgram = new Program(gl, {
      vertex: AO_VERT,
      fragment: AO_FRAG,
      uniforms: {
        uNormalDepth: { value: null },
        uDepth: { value: this.depthChainTexture },
        uDepthLevels: { value: DEPTH_LEVELS },
        uProjection: { value: new Mat4() },
        uResolution: { value: [1, 1] },
        uFocal: { value: [1, 1] },
        uRadius: { value: this.aoRadius },
        uBias: { value: 0.1 },
        uIntensity: { value: 1.8 },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: null,
    });
    this.aoMesh = new Mesh(gl, { geometry: fullscreen(), program: this.aoProgram });
    this.aoMesh.frustumCulled = false;

    this.blurProgram = new Program(gl, {
      vertex: AO_VERT,
      fragment: BLUR_FRAG,
      uniforms: {
        uAo: { value: null },
        uNormalDepth: { value: null },
        uTexel: { value: [1, 1] },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: null,
    });
    this.blurMesh = new Mesh(gl, { geometry: fullscreen(), program: this.blurProgram });
    this.blurMesh.frustumCulled = false;

    this.anchorProgram = new Program(gl, {
      vertex: anchorVertex,
      fragment: anchorFragment,
      depthTest: false,
    });

    this.setEnvironment('studio');

    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  setEnvironment(preset: EnvPreset) {
    const gl = this.renderer.gl as unknown as WebGL2RenderingContext;

    // Bake first and release the old environment last. Freeing textures up front
    // returns their names to the driver, the new bake is handed the same names
    // straight back, and anything still holding the old handle then deletes the
    // new texture it now aliases.
    const previous = this.environment;
    const env = bakeEnvironment(gl, preset);
    invalidateRendererState(this.renderer, gl);

    adoptTexture(this.specularTexture, env.specular);
    adoptTexture(this.backgroundTexture, env.background);
    adoptTexture(this.brdfTexture, env.brdf);
    this.program.uniforms.uMaxLod.value = env.mips - 1;

    this.environment = env;
    previous?.dispose();
    return env;
  }

  setMaterial(metalName: string, finishName: string) {
    this.metal = metals[metalName] ?? this.metal;
    this.finish = finishes[finishName] ?? this.finish;
    this.program.uniforms.uF0.value = this.metal.f0;
    this.program.uniforms.uRoughness.value = this.finish.roughness;
    this.program.uniforms.uAnisotropy.value = this.finish.anisotropy;
    this.program.uniforms.uHammer.value = this.finish.hammer;
    this.program.uniforms.uPatina.value = this.finish.patina;
    this.program.uniforms.uPatinaColour.value = patinaColour(this.metal.name);
  }

  setAoEnabled(on: boolean) {
    this.aoEnabled = on;
    this.program.uniforms.uAoStrength.value = on ? 1 : 0;
  }

  setAoRadius(v: number) {
    this.aoRadius = v;
    this.aoProgram.uniforms.uRadius.value = v;
  }

  setAoIntensity(v: number) {
    this.aoProgram.uniforms.uIntensity.value = v;
  }

  setExposure(v: number) {
    this.program.uniforms.uExposure.value = v;
    this.skyProgram.uniforms.uExposure.value = v;
  }

  setEnvSpin(radians: number) {
    this.program.uniforms.uEnvSpin.value = radians;
    this.skyProgram.uniforms.uEnvSpin.value = radians;
  }

  setBackdrop(v: number) {
    this.skyProgram.uniforms.uBackdrop.value = v;
  }

  /** 0 shaded, 1 normals, 2 uv, 3 roughness. */
  setDebug(mode: number) {
    this.program.uniforms.uDebug.value = mode;
  }

  /** One draw call per distinct part mesh, however many times it is placed. */
  setInstanced(groups: InstanceGroup[]) {
    const gl = this.renderer.gl;
    for (const m of this.meshes) {
      m.setParent(null);
      m.geometry.remove();
    }
    this.meshes.length = 0;

    for (const g of groups) {
      const count = g.matrices.length / 16;
      const col = (k: number) => {
        const out = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          out[i * 4] = g.matrices[i * 16 + k * 4];
          out[i * 4 + 1] = g.matrices[i * 16 + k * 4 + 1];
          out[i * 4 + 2] = g.matrices[i * 16 + k * 4 + 2];
          out[i * 4 + 3] = g.matrices[i * 16 + k * 4 + 3];
        }
        return out;
      };
      const geometry = new Geometry(gl, {
        position: { size: 3, data: g.mesh.positions },
        normal: { size: 3, data: g.mesh.normals },
        uv: { size: 2, data: g.mesh.uvs },
        index: { data: g.mesh.indices },
        im0: { size: 4, data: col(0), instanced: 1 },
        im1: { size: 4, data: col(1), instanced: 1 },
        im2: { size: 4, data: col(2), instanced: 1 },
        im3: { size: 4, data: col(3), instanced: 1 },
      });
      const mesh = new Mesh(gl, { geometry, program: this.program });

      // Per-group material without a program per material: ogl applies uniforms
      // during program.use(), which runs after this hook.
      if (g.metal || g.finish) {
        const metal = metals[g.metal ?? ''] ?? null;
        const finish = finishes[g.finish ?? ''] ?? null;
        mesh.onBeforeRender(() => {
          const u = this.program.uniforms;
          const m = metal ?? this.metal;
          const f = finish ?? this.finish;
          u.uF0.value = m.f0;
          u.uRoughness.value = f.roughness;
          u.uAnisotropy.value = f.anisotropy;
          u.uHammer.value = f.hammer;
          u.uPatina.value = f.patina;
          u.uPatinaColour.value = patinaColour(m.name);
        });
      } else {
        mesh.onBeforeRender(() => this.setMaterial(this.metal.name, this.finish.name));
      }

      mesh.setParent(this.scene);
      this.meshes.push(mesh);
    }
  }

  setMesh(data: PartMesh) {
    this.setInstanced([{ mesh: data, matrices: IDENTITY }]);
  }

  setAnchors(anchors: Anchor[], scale: number) {
    const gl = this.renderer.gl;
    if (this.anchorMesh) {
      this.anchorMesh.setParent(null);
      this.anchorMesh.geometry.remove();
      this.anchorMesh = null;
    }
    if (!anchors.length) return;

    const position = new Float32Array(anchors.length * 12);
    const colour = new Float32Array(anchors.length * 12);
    anchors.forEach((a, i) => {
      const o = i * 12;
      const axisLen = scale;
      const tanLen = scale * 0.45;
      position[o + 0] = a.position[0] - a.axis[0] * axisLen * 0.35;
      position[o + 1] = a.position[1] - a.axis[1] * axisLen * 0.35;
      position[o + 2] = a.position[2] - a.axis[2] * axisLen * 0.35;
      position[o + 3] = a.position[0] + a.axis[0] * axisLen;
      position[o + 4] = a.position[1] + a.axis[1] * axisLen;
      position[o + 5] = a.position[2] + a.axis[2] * axisLen;
      position[o + 6] = a.position[0] - a.tangent[0] * tanLen;
      position[o + 7] = a.position[1] - a.tangent[1] * tanLen;
      position[o + 8] = a.position[2] - a.tangent[2] * tanLen;
      position[o + 9] = a.position[0] + a.tangent[0] * tanLen;
      position[o + 10] = a.position[1] + a.tangent[1] * tanLen;
      position[o + 11] = a.position[2] + a.tangent[2] * tanLen;
      for (let k = 0; k < 2; k++) {
        colour[o + k * 3] = 1.0; colour[o + k * 3 + 1] = 0.72; colour[o + k * 3 + 2] = 0.15;
      }
      for (let k = 2; k < 4; k++) {
        colour[o + k * 3] = 0.25; colour[o + k * 3 + 1] = 0.7; colour[o + k * 3 + 2] = 1.0;
      }
    });

    const geometry = new Geometry(gl, {
      position: { size: 3, data: position },
      colour: { size: 3, data: colour },
    });
    this.anchorMesh = new Mesh(gl, { geometry, program: this.anchorProgram, mode: gl.LINES });
    this.anchorMesh.renderOrder = 10;
    this.anchorMesh.setParent(this.scene);
  }

  frameBounds(b: Box3) {
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const radius = Math.max(
      Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
      0.001,
    );
    const dist = (radius / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.3;
    this.controls.target.set(cx, cy, cz);

    // Look down on a flat form and across a tall one. A fixed direction views a
    // mandala nicely and a flower stem end-on, and most plants are stems.
    const spanXY = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    const spanZ = b.max[2] - b.min[2];
    const upright = spanZ / (spanXY + spanZ + 1e-6);
    const dir = new Vec3(0.42 + 0.2 * upright, 0.5 + 0.28 * upright, 0.9 - 0.8 * upright).normalize();
    this.camera.position.set(cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist);
    this.camera.near = Math.max(radius * 0.01, 0.01);
    this.camera.far = dist + radius * 12;
    this.camera.perspective({});
    this.controls.forcePosition();

    // A fixed radius cannot serve both a 6 mm rivet and a 120 mm mandala; scale it
    // to the subject so contact shadows stay the size of the joints, not the piece.
    this.setAoRadius(Math.max(radius * 0.05, 0.4));
  }

  private resize = () => {
    const gl = this.renderer.gl;
    const raw = gl as unknown as WebGL2RenderingContext;
    const host = (gl.canvas as HTMLCanvasElement).parentElement as HTMLElement;
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.camera.perspective({ aspect: host.clientWidth / host.clientHeight });

    const width = Math.max(1, Math.floor(this.renderer.width * this.renderer.dpr));
    const height = Math.max(1, Math.floor(this.renderer.height * this.renderer.dpr));

    for (const target of [this.normalDepthTarget, this.aoTarget, this.blurTarget]) {
      if (!target) continue;
      gl.deleteFramebuffer(target.buffer);
      for (const texture of target.textures) gl.deleteTexture(texture.texture);
    }

    // Normals and linear depth in one target. Depth alone would need a separate
    // normal buffer or normals reconstructed from derivatives, which come out
    // faceted on exactly the thin curved parts this form language is made of.
    //
    // Full float, not half: half gives about eleven bits of mantissa, so at a
    // viewing distance of 265 mm consecutive depths quantise to steps of ~0.13 mm
    // — coarser than the occlusion bias, and the surface then occludes itself in
    // stripes that follow its own tessellation.
    this.normalDepthTarget = new RenderTarget(gl, {
      width, height, depth: true,
      type: raw.FLOAT,
      format: raw.RGBA,
      internalFormat: raw.RGBA32F,
      minFilter: raw.NEAREST,
      magFilter: raw.NEAREST,
    });
    // Half float, not RGBA8. Occlusion on metal spends most of its range between
    // 0.9 and 1.0, which is about 25 distinct values at 8 bits — and the contour
    // bands of a smooth field quantised that coarsely read as stripes. It survives
    // every change to the sampling because it is not a sampling error at all: the
    // field underneath was always smooth, the storage was not.
    const half = {
      type: raw.HALF_FLOAT,
      format: raw.RGBA,
      internalFormat: raw.RGBA16F,
      depth: false,
    };
    this.aoTarget = new RenderTarget(gl, { width, height, ...half });
    this.blurTarget = new RenderTarget(gl, { width, height, ...half });

    this.buildDepthChainTargets(raw, width, height);

    this.aoProgram.uniforms.uNormalDepth.value = this.normalDepthTarget.texture;
    this.aoProgram.uniforms.uResolution.value = [width, height];
    this.blurProgram.uniforms.uAo.value = this.aoTarget.texture;
    this.blurProgram.uniforms.uNormalDepth.value = this.normalDepthTarget.texture;
    this.blurProgram.uniforms.uTexel.value = [1 / width, 1 / height];
    this.program.uniforms.uAo.value = this.blurTarget.texture;
    this.program.uniforms.uResolution.value = [width, height];
  };

  /**
   * Allocate the filtered depth chain: a single-channel float texture with its
   * own mip levels, filtered rather than point-sampled.
   *
   * Full float, not half, for the same reason the prepass is: at 250 mm a half
   * float quantises depth to about 0.13 mm steps, which is coarser than the
   * plates this occlusion is meant to separate.
   */
  private buildDepthChainTargets(gl: WebGL2RenderingContext, width: number, height: number) {
    if (this.depthChain) gl.deleteTexture(this.depthChain);

    const levels = Math.max(1, Math.min(DEPTH_LEVELS, Math.floor(Math.log2(Math.max(width, height))) + 1));
    this.depthLevels = levels;

    const linear = gl.getExtension('OES_texture_float_linear');
    const filter = linear ? gl.LINEAR : gl.NEAREST;

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.R32F, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.depthChain = tex;
    adoptTexture(this.depthChainTexture, tex);

    if (!this.depthFbo) this.depthFbo = gl.createFramebuffer();
    if (!this.depthVao) this.depthVao = gl.createVertexArray();
    if (!this.depthCopyProgram) {
      this.depthCopyProgram = compileRaw(gl, FULLSCREEN_VERT, DEPTH_COPY_FRAG);
      this.depthDownProgram = compileRaw(gl, FULLSCREEN_VERT, DEPTH_DOWNSAMPLE_FRAG);
    }
    this.aoProgram.uniforms.uDepthLevels.value = levels;
  }

  /** Fill the chain: copy the prepass depth, then subsample level by level. */
  private buildDepthChain() {
    const gl = this.renderer.gl as unknown as WebGL2RenderingContext;
    if (!this.depthChain || !this.depthFbo || !this.normalDepthTarget) return;

    const width = this.normalDepthTarget.width;
    const height = this.normalDepthTarget.height;

    gl.bindVertexArray(this.depthVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFbo);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // level 0: the prepass depth, on its own so it can be filtered
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.depthChain, 0);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.depthCopyProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.normalDepthTarget.texture.texture as WebGLTexture);
    gl.uniform1i(gl.getUniformLocation(this.depthCopyProgram!, 'uNormalDepth'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.depthDownProgram);
    gl.bindTexture(gl.TEXTURE_2D, this.depthChain);
    gl.uniform1i(gl.getUniformLocation(this.depthDownProgram!, 'uSource'), 0);
    const levelLoc = gl.getUniformLocation(this.depthDownProgram!, 'uLevel');

    for (let level = 1; level < this.depthLevels; level++) {
      // Pin the readable range to the parent level. Sampling a texture while
      // rendering into another of its levels is only defined if the level being
      // written is outside the base..max range.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, level - 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, level - 1);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.depthChain, level);
      gl.viewport(0, 0, Math.max(1, width >> level), Math.max(1, height >> level));
      gl.uniform1i(levelLoc, level);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, this.depthLevels - 1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    invalidateRendererState(this.renderer, gl);
  }

  /** Depth and normals, then occlusion, then a depth-aware blur. */
  private renderAmbientOcclusion() {
    if (!this.aoEnabled || !this.normalDepthTarget || !this.aoTarget || !this.blurTarget) return;

    // geometry only: the backdrop has no depth and the gizmos are not surfaces
    this.skyMesh.visible = false;
    const anchorsWereVisible = this.anchorMesh?.visible ?? false;
    if (this.anchorMesh) this.anchorMesh.visible = false;

    const beauty = this.meshes.map((m) => m.program);
    for (const mesh of this.meshes) mesh.program = this.prepassProgram;
    this.renderer.render({ scene: this.scene, camera: this.camera, target: this.normalDepthTarget });
    for (let i = 0; i < this.meshes.length; i++) this.meshes[i].program = beauty[i];

    this.skyMesh.visible = true;
    if (this.anchorMesh) this.anchorMesh.visible = anchorsWereVisible;

    this.buildDepthChain();

    const projection = this.aoProgram.uniforms.uProjection.value as Mat4;
    projection.copy(this.camera.projectionMatrix);
    this.aoProgram.uniforms.uFocal.value = [
      this.camera.projectionMatrix[0],
      this.camera.projectionMatrix[5],
    ];

    this.renderer.render({ scene: this.aoMesh, target: this.aoTarget });
    this.renderer.render({ scene: this.blurMesh, target: this.blurTarget });
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();

    this.camera.updateMatrixWorld();
    const inv = this.skyProgram.uniforms.uInverseViewProjection.value as Mat4;
    inv.multiply(this.camera.projectionMatrix, this.camera.viewMatrix).inverse();

    this.renderAmbientOcclusion();
    this.renderer.render({ scene: this.scene, camera: this.camera });
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.controls.remove();
    this.environment?.dispose();
  }
}

/**
 * The bake drives raw WebGL, which leaves ogl's state cache describing a world
 * that no longer exists — it will happily skip re-binding a texture unit it
 * believes is already correct, and then every IBL lookup samples whatever the
 * baker left bound. Clearing the cache forces ogl to re-issue everything.
 */
function invalidateRendererState(renderer: Renderer, gl: WebGL2RenderingContext) {
  const state = renderer.state as unknown as Record<string | number, unknown>;
  state.textureUnits = [];
  state.activeTextureUnit = -1;
  state.framebuffer = undefined;
  state.currentProgram = null;
  state.boundBuffer = null;
  state.viewport = { x: 0, y: 0, width: null, height: null };
  state.depthMask = undefined;
  state.depthFunc = undefined;
  state.cullFace = undefined;
  state.frontFace = undefined;
  delete state[gl.DEPTH_TEST];
  delete state[gl.BLEND];
  delete state[gl.CULL_FACE];
  (renderer as unknown as { currentGeometry: string | null }).currentGeometry = null;
}

/**
 * An ogl Texture standing in for a texture created by raw GL.
 *
 * ogl's update() short-circuits when the image has not changed and simply binds
 * whatever handle the object holds, so swapping the handle in is enough to keep
 * its texture-unit bookkeeping working for textures it did not create.
 */
function wrapTexture(gl: ConstructorParameters<typeof Texture>[0], target: number): Texture {
  const t = new Texture(gl, { target, generateMipmaps: false });
  // the wrapper never owns a texture; drop the one ogl allocated for it
  if (t.texture) (gl as unknown as WebGL2RenderingContext).deleteTexture(t.texture);
  (t as unknown as { texture: WebGLTexture | null }).texture = null;
  t.needsUpdate = false;
  return t;
}

/** Point the wrapper at a baked texture. Ownership stays with the Environment. */
function adoptTexture(wrapper: Texture, handle: WebGLTexture) {
  wrapper.texture = handle;
  wrapper.needsUpdate = false;
  wrapper.store.image = wrapper.image;
}
