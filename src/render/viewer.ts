import { Renderer, Camera, Transform, Geometry, Program, Mesh, Orbit, Vec3 } from 'ogl';
import type { MeshData } from '../mesh/dualContour';
import type { Anchor } from '../parts/types';
import type { Box3 } from '../sdf/types';

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  attribute float ao;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAO;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    vAO = ao;
    gl_Position = projectionMatrix * mv;
  }
`;

// Deliberately not PBR yet. This is a diagnostic surface: a hemispheric fill plus
// two rims, chosen so that facet boundaries are obvious rather than flattering.
const fragment = /* glsl */ `
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAO;

  uniform float uAOStrength;
  uniform float uShowNormals;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);

    vec3 keyDir = normalize(vec3(0.5, 0.8, 0.6));
    vec3 rimDir = normalize(vec3(-0.7, -0.2, -0.4));

    float key = max(dot(n, keyDir), 0.0);
    float rim = pow(max(dot(n, rimDir), 0.0), 2.0);
    float sky = 0.5 + 0.5 * n.y;

    vec3 col = vec3(0.06);
    col += vec3(1.00, 0.93, 0.82) * key * 0.75;
    col += vec3(0.35, 0.45, 0.62) * sky * 0.35;
    col += vec3(0.60, 0.68, 0.85) * rim * 0.45;

    float spec = pow(max(dot(reflect(-keyDir, n), v), 0.0), 48.0);
    col += vec3(1.0) * spec * 0.6;

    float ao = mix(1.0, vAO, uAOStrength);
    col *= ao;

    col = mix(col, n * 0.5 + 0.5, uShowNormals);

    col = pow(col, vec3(1.0 / 2.2));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const anchorVertex = /* glsl */ `
  attribute vec3 position;
  attribute vec3 colour;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec3 vColour;
  void main() {
    vColour = colour;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const anchorFragment = /* glsl */ `
  precision highp float;
  varying vec3 vColour;
  void main() { gl_FragColor = vec4(vColour, 1.0); }
`;

export class Viewer {
  readonly renderer: Renderer;
  readonly camera: Camera;
  readonly scene: Transform;
  private controls: Orbit;
  private mesh: Mesh | null = null;
  private anchorMesh: Mesh | null = null;
  private program: Program;
  private anchorProgram: Program;
  private raf = 0;

  constructor(canvasHost: HTMLElement) {
    this.renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), antialias: true });
    const gl = this.renderer.gl;
    gl.clearColor(0.045, 0.048, 0.055, 1);
    canvasHost.appendChild(gl.canvas);

    this.camera = new Camera(gl, { fov: 35, near: 0.5, far: 2000 });
    this.camera.position.set(40, 34, 62);

    this.controls = new Orbit(this.camera, {
      target: new Vec3(0, 0, 0),
      ease: 0.18,
      inertia: 0.72,
      minDistance: 12,
      maxDistance: 400,
    });

    this.scene = new Transform();

    this.program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uAOStrength: { value: 1 },
        uShowNormals: { value: 0 },
      },
      cullFace: null,
    });

    this.anchorProgram = new Program(gl, {
      vertex: anchorVertex,
      fragment: anchorFragment,
      depthTest: false,
      transparent: false,
    });

    window.addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  setMesh(data: MeshData) {
    const gl = this.renderer.gl;
    if (this.mesh) {
      this.mesh.setParent(null);
      this.mesh.geometry.remove();
    }
    const geometry = new Geometry(gl, {
      position: { size: 3, data: data.positions },
      normal: { size: 3, data: data.normals },
      ao: { size: 1, data: data.ao },
      index: { data: data.indices },
    });
    this.mesh = new Mesh(gl, { geometry, program: this.program });
    this.mesh.setParent(this.scene);
  }

  /**
   * Anchors are drawn as a two-armed cross: the long arm is the fastener axis, the
   * short one the tangent. A mis-oriented anchor is invisible in the surface but
   * obvious here, which is the only reason it is worth rendering them at all.
   */
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
      // axis arm, from just under the surface to out along the fastener direction
      position[o + 0] = a.position[0] - a.axis[0] * axisLen * 0.35;
      position[o + 1] = a.position[1] - a.axis[1] * axisLen * 0.35;
      position[o + 2] = a.position[2] - a.axis[2] * axisLen * 0.35;
      position[o + 3] = a.position[0] + a.axis[0] * axisLen;
      position[o + 4] = a.position[1] + a.axis[1] * axisLen;
      position[o + 5] = a.position[2] + a.axis[2] * axisLen;
      // tangent arm
      position[o + 6] = a.position[0] - a.tangent[0] * tanLen;
      position[o + 7] = a.position[1] - a.tangent[1] * tanLen;
      position[o + 8] = a.position[2] - a.tangent[2] * tanLen;
      position[o + 9] = a.position[0] + a.tangent[0] * tanLen;
      position[o + 10] = a.position[1] + a.tangent[1] * tanLen;
      position[o + 11] = a.position[2] + a.tangent[2] * tanLen;

      for (let k = 0; k < 2; k++) {
        colour[o + k * 3 + 0] = 1.0; colour[o + k * 3 + 1] = 0.72; colour[o + k * 3 + 2] = 0.15;
      }
      for (let k = 2; k < 4; k++) {
        colour[o + k * 3 + 0] = 0.25; colour[o + k * 3 + 1] = 0.7; colour[o + k * 3 + 2] = 1.0;
      }
    });

    const geometry = new Geometry(gl, {
      position: { size: 3, data: position },
      colour: { size: 3, data: colour },
    });
    this.anchorMesh = new Mesh(gl, { geometry, program: this.anchorProgram, mode: gl.LINES });
    this.anchorMesh.setParent(this.scene);
  }

  /** Frame the camera on a part's bounds so a 3 mm rivet and a 56 mm plate both fill the view. */
  frameBounds(b: Box3) {
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const radius = Math.max(
      Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
      0.001,
    );
    const dist = radius / Math.tan((this.camera.fov * Math.PI) / 360) * 1.35;
    this.controls.target.set(cx, cy, cz);
    const dir = new Vec3(0.42, 0.5, 0.76).normalize();
    this.camera.position.set(cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist);
    this.camera.near = Math.max(radius * 0.01, 0.01);
    this.camera.far = dist + radius * 8;
    this.camera.perspective({});
    this.controls.forcePosition();
  }

  setAOStrength(v: number) { this.program.uniforms.uAOStrength.value = v; }
  setShowNormals(v: boolean) { this.program.uniforms.uShowNormals.value = v ? 1 : 0; }

  private resize = () => {
    const gl = this.renderer.gl;
    const host = gl.canvas.parentElement as HTMLElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.perspective({ aspect: w / h });
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render({ scene: this.scene, camera: this.camera });
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }
}
