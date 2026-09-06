/**
 * The viewer: a renderer on a canvas in the page.
 *
 * What the page adds to the headless renderer, and nothing more: the canvas
 * and its WebGPU context, an orbit that follows the pointer, a resize
 * observer on the host, the frame loop, and the adaptive resolution that
 * times frames while the camera moves. Everything drawn lives in the
 * renderer; this file decides when and at what size. Its surface is what
 * main.ts drives — subject, material, light, view — and is the same as
 * before the split, so a panel is written against the viewer and a program
 * without a page against the renderer.
 */

import { createContext, type GpuContext } from '../gpu/context';
import { Camera, Orbit } from '../gpu/camera';
import type { Mesh as PartMesh } from '../mesh/types';
import type { Anchor } from '../parts/types';
import type { Box3, Vec3 } from '../geom/types';
import type { EnvPreset } from './env';
import type { Film } from './post';
import { Renderer, type InstanceGroup, type Quality, type RendererOptions, type RigLight, type TableName } from './renderer';

export { MAX_RIG_LIGHTS, emitterSamples, tableNames } from './renderer';
export type { InstanceGroup, Quality, RendererOptions, RigLight, TableName } from './renderer';

export class Viewer {
  /** The renderer under the canvas, for whatever the forwarding surface leaves out. */
  readonly renderer: Renderer;
  readonly camera: Camera;

  private ctx: GpuContext;
  private host: HTMLElement;
  private controls: Orbit;
  private observer: ResizeObserver;
  private raf = 0;
  private quality: Quality = 'draft';
  private renderScale = 1;
  /** Depth of field's focus, as a multiple of the orbit distance, so the target is what's sharp. */
  private focusScale = 1;

  /** Frames actually drawn, for measuring. */
  frameCount = 0;
  /** Called after every drawn frame, with the camera settled: for overlays laid over the canvas. */
  onFrame: (() => void) | null = null;

  /**
   * Adaptive resolution. While the camera moves, frames are timed; if they
   * cannot keep 30 a second the internal scale steps down, and steps back up
   * when there is headroom. The user's render-scale slider is the ceiling.
   */
  private autoScale = 1;
  private lastFrameAt = 0;
  private frameMs = 16;
  /** When the scale last stepped: each step reallocates the render targets, so steps are rationed. */
  private lastScaleStep = 0;
  /**
   * What the display itself can do, measured on the ticks we draw nothing on.
   * Everything about pacing is judged against this rather than a number picked
   * in advance.
   */
  private tickMs = 16.7;
  private lastTickAt = 0;

  static async create(host: HTMLElement, onLost?: (info: GPUDeviceLostInfo) => void, opts: RendererOptions = {}): Promise<Viewer> {
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    const ctx = await createContext(canvas, onLost);
    return new Viewer(ctx, host, opts);
  }

  private constructor(ctx: GpuContext, host: HTMLElement, opts: RendererOptions) {
    this.ctx = ctx;
    this.host = host;
    host.appendChild(ctx.canvas);
    this.renderer = new Renderer(ctx, opts);
    this.camera = this.renderer.camera;
    // the orbit's range starts as a jeweller's, six millimetres to just over a
    // metre, and opens out to whatever is framed
    const u = this.renderer.mmPerUnit;
    this.controls = new Orbit(this.camera, {
      element: ctx.canvas, ease: 0.18, inertia: 0.72, minDistance: 6 / u, maxDistance: 1200 / u,
    });
    // the host, not the window: a pane that is laid out after load, or shown
    // after being hidden, changes size without a window resize event
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.loop();
  }

  // --- the renderer's surface, forwarded ---
  setEnvironmentImage(img: { width: number; height: number; data: Float32Array }, meanRadiance: number) { this.renderer.setEnvironmentImage(img, meanRadiance); }
  setEnvironment(preset: EnvPreset | 'image') { return this.renderer.setEnvironment(preset); }
  setMaterial(metalName: string, finishName: string) { this.renderer.setMaterial(metalName, finishName); }
  setBloom(v: number) { this.renderer.setBloom(v); }
  setDetail(v: number) { this.renderer.setDetail(v); }
  setFilm(film: Partial<Film>) { this.renderer.setFilm(film); }
  setGlow(v: number) { this.renderer.setGlow(v); }
  setRig(lights: RigLight[]) { this.renderer.setRig(lights); }
  setKeyLight(opts: { elevation: number; azimuth: number; strength: number; warmth: number; size?: number }) { this.renderer.setKeyLight(opts); }
  setLens(mm: number) { this.renderer.setLens(mm); }
  setCameraRoll(radians: number) { this.renderer.setCameraRoll(radians); }
  setLensShift(x: number, y: number) { this.renderer.setLensShift(x, y); }
  setFocusHelper(on: boolean) { this.renderer.setFocusHelper(on); }
  setEnvStrength(v: number) { this.renderer.setEnvStrength(v); }
  setTable(name: TableName) { this.renderer.setTable(name); }
  setBackground(rgb: Vec3) { this.renderer.setBackground(rgb); }
  setExposure(v: number) { this.renderer.setExposure(v); }
  setEnvSpin(radians: number) { this.renderer.setEnvSpin(radians); }
  setDebug(mode: number) { this.renderer.setDebug(mode); }
  setContact(v: number) { this.renderer.setContact(v); }
  setInstanced(groups: InstanceGroup[]) { this.renderer.setInstanced(groups); }
  setMesh(data: PartMesh) { this.renderer.setMesh(data); }
  setSelection(selected: Array<Float32Array<ArrayBuffer>> | null) { this.renderer.setSelection(selected); }
  setAnchors(anchors: Anchor[], scale: number) { this.renderer.setAnchors(anchors, scale); }
  requestRender() { this.renderer.requestRender(); }
  get traceSamples() { return this.renderer.traceSamples; }
  get traceLimit() { return this.renderer.traceLimit; }

  /** Depth of field: 0 off, 1 a lens wide open; focus as a multiple of the distance to the orbit target, 1 being the target itself. */
  setDepthOfField(strength: number, focusScale: number) {
    this.focusScale = focusScale;
    this.renderer.setDepthOfField(strength);
    this.pushFocus();
  }
  /** Tell the renderer where the focus and the subject are, from the orbit's distance. */
  private pushFocus() {
    const d = this.controls.distance;
    this.renderer.setFocus(d * this.focusScale, d);
  }

  /**
   * Draft is for working: a lighter shadow bake and fewer pixels, so an edit
   * shows in a fraction of a second on a dense form. Final is for looking.
   */
  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.setQuality(q);
    this.resize();
  }

  /** Fraction of device resolution to render at, below the pixel budget. */
  setRenderScale(v: number) {
    this.renderScale = Math.min(Math.max(v, 0.25), 1);
    this.resize();
  }

  // --- the camera, as the orbit and the page see it ---
  /** Send the orbit to an elevation above the table, an azimuth round it, and a distance, easing there. */
  setView(to: { elevation?: number; azimuth?: number; distance?: number }) {
    this.controls.setSpherical({
      azimuth: to.azimuth,
      polar: to.elevation === undefined ? undefined : Math.PI / 2 - to.elevation,
      radius: to.distance,
    });
    this.renderer.requestRender();
  }

  /** Where the camera is, for a panel to show: angles in radians, distance in world units. */
  viewState() {
    return {
      elevation: Math.PI / 2 - this.controls.currentPolar,
      azimuth: this.controls.currentAzimuth,
      distance: this.controls.distance,
      lens: Camera.lensForFov(this.camera.fov),
      roll: this.camera.roll,
      shift: this.camera.shift,
    };
  }

  frameBounds(b: Box3) {
    this.renderer.frameBounds(b);
    // a piece larger than the jeweller's range needs room to stand back from, and a tiny one to come close to
    const radius = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;
    const u = this.renderer.mmPerUnit;
    this.controls.minDistance = Math.min(6 / u, radius * 0.1);
    this.controls.maxDistance = Math.max(1200 / u, radius * 40);
    this.controls.forcePosition();
    this.pushFocus();
  }

  /** A world point in CSS pixels over the canvas, or null when it is behind the camera. */
  project(p: Vec3): [number, number] | null {
    const m = this.camera.viewProjection;
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0) return null;
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
    const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    return [((x + 1) / 2) * this.host.clientWidth, ((1 - y) / 2) * this.host.clientHeight];
  }

  /** The instance under a page point, or null. */
  pick(x: number, y: number): { group: number; instance: number } | null {
    const rect = this.ctx.canvas.getBoundingClientRect();
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((y - rect.top) / rect.height) * 2;
    return this.renderer.pick(nx, ny);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.remove();
    this.renderer.dispose();
  }

  // ---- internals ----

  private resize = () => {
    // Render at device resolution up to a budget, then scale down. A retina
    // canvas the size of a laptop screen sits just inside it; a tall pane or a
    // large monitor comes down to the same cost rather than crawling.
    const cw = Math.max(1, this.host.clientWidth), ch = Math.max(1, this.host.clientHeight);
    const budget = this.quality !== 'draft' ? Renderer.PIXEL_BUDGET : Renderer.DRAFT_PIXEL_BUDGET;
    // never below one pixel per CSS pixel at rest: under that, edges stair-step
    // however well they were multisampled, because each rendered pixel is
    // stretched over more than one on screen
    const budgeted = Math.max(Math.min(window.devicePixelRatio, Math.sqrt(budget / (cw * ch))), 1);
    const dpr = Math.min(budgeted, 2) * this.renderScale * this.autoScale;
    const w = Math.max(1, Math.floor(cw * dpr));
    const h = Math.max(1, Math.floor(ch * dpr));
    this.ctx.canvas.width = w;
    this.ctx.canvas.height = h;
    this.renderer.setSize(w, h);
  };

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const tickNow = performance.now();
    const sinceTick = tickNow - this.lastTickAt;
    this.lastTickAt = tickNow;
    const moving = this.controls.moving;
    this.controls.update();
    this.renderer.setMoving(moving);
    // nothing to draw when nothing has changed: the GPU idles and the page stays responsive
    if (!this.renderer.pending) {
      // A tick we spend nothing on is the display's own cadence, and it costs
      // nothing to measure. It is the only honest yardstick for the pacing
      // below: a frame gap can never be shorter than the screen's own.
      if (sinceTick > 1 && sinceTick < 250) this.tickMs = this.tickMs * 0.9 + sinceTick * 0.1;
      return;
    }
    // the focus follows the orbit's distance, refreshed only on a frame that
    // is due anyway: the orbit goes on easing by hairs after it reports
    // settled, and those must not keep the renderer awake
    this.pushFocus();
    const drew = this.renderer.render(() => this.ctx.context.getCurrentTexture().createView());
    if (!drew) return;
    this.frameCount++;
    this.pace(moving);
    this.onFrame?.();
  };

  /**
   * Time consecutive frames during interaction and move the internal scale to
   * keep up with the display.
   *
   * What counts as fast enough has to be the display's own cadence, not a
   * number chosen in advance. A frame gap is floored by the screen: on a sixty
   * hertz panel nothing is ever quicker than sixteen milliseconds, so a scale
   * that waits for fourteen before stepping back up can only ever fall, and
   * one slow moment leaves the piece soft for the rest of the session. Both
   * thresholds are therefore multiples of what the idle ticks report.
   */
  private pace(moving: boolean) {
    const now = performance.now();
    const gap = now - this.lastFrameAt;
    this.lastFrameAt = now;
    // only consecutive frames say anything; a gap after an idle spell does not
    if (!moving || gap > 250) return;
    this.frameMs = this.frameMs * 0.8 + gap * 0.2;
    // a step swaps a few hundred megabytes of targets, so at most a few a second
    if (now - this.lastScaleStep < 300) return;
    const missing = this.tickMs * 1.5 + 6;
    const keepingUp = this.tickMs * 1.2;
    if (this.frameMs > missing && this.autoScale > 0.5) {
      // step by how far over budget the frame is, so a very slow frame drops straight to the floor
      this.autoScale = Math.max(0.5, this.autoScale * Math.max(0.5, Math.sqrt(missing / this.frameMs)));
      this.frameMs = this.tickMs;
      this.lastScaleStep = now;
      this.resize();
    } else if (this.frameMs < keepingUp && this.autoScale < 1) {
      this.autoScale = Math.min(1, this.autoScale / 0.85);
      this.frameMs = this.tickMs;
      this.lastScaleStep = now;
      this.resize();
    }
  }
}
