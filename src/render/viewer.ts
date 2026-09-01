import { Renderer, Camera, Transform, Geometry, Program, Mesh, Orbit, Vec3 } from 'ogl';
import type { MeshData } from '../mesh/dualContour';

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

export class Viewer {
  readonly renderer: Renderer;
  readonly camera: Camera;
  readonly scene: Transform;
  private controls: Orbit;
  private mesh: Mesh | null = null;
  private program: Program;
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
