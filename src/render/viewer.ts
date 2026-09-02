import {
  Renderer, Camera, Transform, Geometry, Program, Mesh, Vec3, Texture,
} from 'ogl';
import { Orbit } from './orbit';
import type { Mesh as PartMesh } from '../mesh/types';
import type { Anchor } from '../parts/types';
import type { Box3 } from '../geom/types';
import { bakeEnvironment, type Environment, type EnvPreset } from './env';
import { finishes, metals, patinaColour, type Finish, type Metal } from './materials';
import { GROUND_FRAG, GROUND_VERT, PBR_FRAG, PBR_VERT } from './shaders';
import { bakeOcclusion, type Occlusion } from './occlusion';
import { computeWear } from '../mesh/wear';
import { PostChain, inverseTonemap } from './post';

const BACKGROUND: [number, number, number] = [0.043, 0.047, 0.055];

/** Wear belongs to the mesh, so it is computed once however often the mesh is placed. */
const wearCache = new WeakMap<PartMesh, Float32Array>();
function wearOf(mesh: PartMesh) {
  let w = wearCache.get(mesh);
  if (!w) {
    w = computeWear(mesh);
    wearCache.set(mesh, w);
  }
  return w;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);


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
  private anchorProgram: Program;
  private anchorMesh: Mesh | null = null;
  private raf = 0;


  private environment: Environment | null = null;
  private specularTexture: Texture;
  private brdfTexture: Texture;

  private occlusion: Occlusion | null = null;
  /** The last scene given, kept so the bake can be redone when the light moves. */
  private groups: InstanceGroup[] = [];
  private occlusionTexture: Texture;
  private shadowTexture: Texture;
  private groundProgram: Program;
  private groundMesh: Mesh | null = null;

  /** HDR output with bloom; null where the context cannot render to float. */
  private post: PostChain | null = null;
  private debugMode = 0;
  /** Bloom strength: a halo on the brightest reflections, not a glow on the piece. */
  bloom = 0.018;

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

    // Flat ground, matching the page. The environment is still baked and still
    // lights the metal — it is only no longer drawn behind it. A room painted
    // across the background competes with the piece instead of appearing in it,
    // which is what it is for.
    // With the post chain, the scene is linear HDR until the composite pass, so
    // the clear colour is whatever tonemaps to the page colour.
    this.post = PostChain.create(raw);
    const background = this.post ? inverseTonemap(BACKGROUND) : BACKGROUND;
    gl.clearColor(background[0], background[1], background[2], 1);

    // Raw GL textures from the bakes, wrapped so ogl still manages texture units.
    this.specularTexture = wrapTexture(gl, raw.TEXTURE_CUBE_MAP);
    this.brdfTexture = wrapTexture(gl, raw.TEXTURE_2D);
    this.occlusionTexture = wrapTexture(gl, raw.TEXTURE_2D);
    this.shadowTexture = wrapTexture(gl, raw.TEXTURE_2D);

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
        uWear: { value: 1 },
        uExposure: { value: 1 },
        uEnvSpin: { value: 0 },
        uDebug: { value: 0 },
        uOcclusion: { value: this.occlusionTexture },
        uOcclusionBase: { value: 0 },
        uVertexCount: { value: 1 },
        uOcclusionOn: { value: 0 },
        uLinearOut: { value: this.post ? 1 : 0 },
      },
      cullFace: null,
    });

    this.groundProgram = new Program(gl, {
      vertex: GROUND_VERT,
      fragment: GROUND_FRAG,
      uniforms: {
        uShadow: { value: this.shadowTexture },
        uSpecular: { value: this.specularTexture },
        uMaxLod: { value: 5 },
        uExposure: { value: 1 },
        uEnvSpin: { value: 0 },
        uBackground: { value: background },
        uLinearOut: { value: this.post ? 1 : 0 },
        // a dark matte table: enough to pool a little light, not enough to compete
        uAlbedo: { value: [0.04, 0.04, 0.043] },
        uCentre: { value: [0, 0, 0] },
        uRadius: { value: 1 },
        uDebug: { value: 0 },
      },
      // seen from underneath, the table should not hide the piece
      cullFace: raw.BACK,
    });


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
    adoptTexture(this.brdfTexture, env.brdf);
    this.program.uniforms.uMaxLod.value = env.mips - 1;
    this.groundProgram.uniforms.uMaxLod.value = env.mips - 1;

    this.environment = env;
    previous?.dispose();

    // shadows follow the light
    if (this.groups.length) this.bakeOcclusion(this.groups);
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

  setBloom(v: number) {
    this.bloom = v;
  }

  setExposure(v: number) {
    this.program.uniforms.uExposure.value = v;
    this.groundProgram.uniforms.uExposure.value = v;
  }

  setEnvSpin(radians: number) {
    this.program.uniforms.uEnvSpin.value = radians;
    this.groundProgram.uniforms.uEnvSpin.value = radians;
    if (this.groups.length) this.bakeOcclusion(this.groups);
  }

  /** 0 shaded, 1 normals, 2 uv, 3 roughness, 4 prefiltered, 5 brdf, 6 occlusion, 7 wear. */
  setDebug(mode: number) {
    this.debugMode = mode;
    this.program.uniforms.uDebug.value = mode;
    this.groundProgram.uniforms.uDebug.value = mode;
  }

  /** One draw call per distinct part mesh, however many times it is placed. */
  setInstanced(groups: InstanceGroup[]) {
    const gl = this.renderer.gl;
    for (const m of this.meshes) {
      m.setParent(null);
      m.geometry.remove();
    }
    this.meshes.length = 0;

    this.groups = groups;
    this.bakeOcclusion(groups);

    groups.forEach((g, k) => {
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
        wear: { size: 1, data: wearOf(g.mesh) },
        index: { data: g.mesh.indices },
        im0: { size: 4, data: col(0), instanced: 1 },
        im1: { size: 4, data: col(1), instanced: 1 },
        im2: { size: 4, data: col(2), instanced: 1 },
        im3: { size: 4, data: col(3), instanced: 1 },
      });
      const mesh = new Mesh(gl, { geometry, program: this.program });

      // Per-group material and occlusion slice without a program per group: ogl
      // applies uniforms during program.use(), which runs after this hook.
      const metal = metals[g.metal ?? ''] ?? null;
      const finish = finishes[g.finish ?? ''] ?? null;
      const base = this.occlusion?.bases[k] ?? 0;
      const vertexCount = g.mesh.positions.length / 3;
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
        u.uOcclusionBase.value = base;
        u.uVertexCount.value = vertexCount;
      });

      mesh.setParent(this.scene);
      this.meshes.push(mesh);
    });
  }

  /**
   * Visibility for every placed vertex, and a shadow for the table under them.
   * Runs on the GPU in a few tens of milliseconds, so it simply happens whenever
   * the scene does.
   */
  private bakeOcclusion(groups: InstanceGroup[]) {
    const gl = this.renderer.gl;
    const raw = gl as unknown as WebGL2RenderingContext;

    const previous = this.occlusion;
    const env = this.environment;
    let occ: Occlusion | null = null;
    try {
      // Directions are drawn from the background cube at a 64-pixel mip: the
      // distribution only has to know where the light is, not its exact edges.
      const lod = Math.max(0, Math.round(Math.log2(env ? env.size / 64 : 1)));
      occ = bakeOcclusion(raw, groups, {
        env: env && env.highDynamicRange
          ? { cube: env.background, size: env.size, lod, spin: this.program.uniforms.uEnvSpin.value as number }
          : undefined,
      });
    } catch (err) {
      console.error('occlusion bake failed; rendering unoccluded', err);
    }
    invalidateRendererState(this.renderer, raw);
    this.occlusion = occ;
    previous?.dispose();

    if (this.groundMesh) {
      this.groundMesh.setParent(null);
      this.groundMesh.geometry.remove();
      this.groundMesh = null;
    }

    if (!occ) {
      this.program.uniforms.uOcclusionOn.value = 0;
      return;
    }

    adoptTexture(this.occlusionTexture, occ.lookup);
    adoptTexture(this.shadowTexture, occ.ground);
    this.program.uniforms.uOcclusionOn.value = 1;

    this.groundProgram.uniforms.uCentre.value = occ.groundCentre;
    this.groundProgram.uniforms.uRadius.value = occ.groundRadius;
    this.groundMesh = new Mesh(gl, { geometry: unitDisc(gl, 96), program: this.groundProgram });
    this.groundMesh.renderOrder = -1;
    this.groundMesh.setParent(this.scene);
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
  }

  private resize = () => {
    const gl = this.renderer.gl;
    const host = (gl.canvas as HTMLCanvasElement).parentElement as HTMLElement;
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.camera.perspective({ aspect: host.clientWidth / host.clientHeight });
    this.post?.resize(host.clientWidth * this.renderer.dpr, host.clientHeight * this.renderer.dpr);
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();

    this.camera.updateMatrixWorld();
    if (this.post) {
      this.renderer.render({ scene: this.scene, camera: this.camera, target: this.post.target as never });
      this.post.finish({ bloom: this.bloom, raw: this.debugMode > 0 });
      // the chain drove raw GL; ogl's cache describes a state that no longer holds
      invalidateRendererState(this.renderer, this.renderer.gl as unknown as WebGL2RenderingContext);
    } else {
      this.renderer.render({ scene: this.scene, camera: this.camera });
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.controls.remove();
    this.environment?.dispose();
    this.occlusion?.dispose();
    this.post?.dispose();
  }
}

/** A unit disc in the XY plane, wound counter-clockwise seen from +Z. */
function unitDisc(gl: ConstructorParameters<typeof Geometry>[0], segments: number): Geometry {
  const position = new Float32Array((segments + 1) * 3);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    position[(i + 1) * 3] = Math.cos(a);
    position[(i + 1) * 3 + 1] = Math.sin(a);
  }
  const index = new Uint16Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    index[i * 3] = 0;
    index[i * 3 + 1] = i + 1;
    index[i * 3 + 2] = ((i + 1) % segments) + 1;
  }
  return new Geometry(gl, {
    position: { size: 3, data: position },
    index: { data: index },
  });
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
