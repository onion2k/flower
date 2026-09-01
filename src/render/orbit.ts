import { Vec3, type Camera } from 'ogl';

export interface OrbitOptions {
  /**
   * Element the pointer is tracked on.
   *
   * The canvas, not the document: dragging over the sketch editor or the panel
   * should move a caret or a slider, not the camera.
   */
  element: HTMLElement;
  target?: Vec3;
  /** Fraction of the remaining distance covered per frame. */
  ease?: number;
  /** How much of the previous frame's drag carries over. */
  inertia?: number;
  minDistance?: number;
  maxDistance?: number;
  /** Polar limits measured from +Z, so 0 is straight down from overhead. */
  minPolar?: number;
  maxPolar?: number;
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * An orbit control whose up axis is +Z.
 *
 * ogl's own Orbit is fixed to +Y — its polar angle is measured from `offset.y`
 * and it azimuths around the XZ plane — and there is no way in from outside,
 * because the spherical state lives in a closure. That mattered more than it
 * looks: everything else in this project already agrees that Z is up. Parts are
 * modelled with Z as the axis of revolution, symmetries rotate about Z, and the
 * environment is lit from +Z — `studio` reads its height as `d.z`, and its key
 * light hangs at z = 2.6. Only the camera disagreed, so every sculpture was
 * being framed lying on its side, which is why a flower on a stem came out
 * running across the screen rather than standing on it.
 *
 * Small enough to own outright, and owning it removes the one place where the
 * renderer had two contradictory ideas of which way was up.
 */
export class Orbit {
  target: Vec3;
  enabled = true;
  minDistance: number;
  maxDistance: number;

  private camera: Camera;
  private element: HTMLElement;
  private ease: number;
  private inertia: number;
  private minPolar: number;
  private maxPolar: number;
  private rotateSpeed: number;
  private zoomSpeed: number;
  private panSpeed: number;

  /** Where the camera is now, and where it is easing to. */
  private radius = 1;
  private azimuth = 0;
  private polar = Math.PI / 3;
  private toRadius = 1;
  private toAzimuth = 0;
  private toPolar = Math.PI / 3;

  private spinDelta = { azimuth: 0, polar: 0 };
  private panDelta = new Vec3();
  private dolly = 1;

  private pointer: number | null = null;
  private panning = false;
  private lastX = 0;
  private lastY = 0;

  constructor(camera: Camera, opts: OrbitOptions) {
    this.camera = camera;
    this.element = opts.element;
    this.target = opts.target ?? new Vec3();
    this.ease = opts.ease ?? 0.18;
    this.inertia = opts.inertia ?? 0.72;
    this.minDistance = opts.minDistance ?? 0.1;
    this.maxDistance = opts.maxDistance ?? Infinity;
    // never quite reach a pole: the view matrix is degenerate where the forward
    // direction and the up axis are parallel, and the picture rolls as it passes
    this.minPolar = opts.minPolar ?? 0.05;
    this.maxPolar = opts.maxPolar ?? Math.PI - 0.05;
    this.rotateSpeed = opts.rotateSpeed ?? 1;
    this.zoomSpeed = opts.zoomSpeed ?? 1;
    this.panSpeed = opts.panSpeed ?? 1;

    // The camera's own up has to move too, or lookAt keeps rolling the picture
    // back onto a Y-up horizon however the orbit is parameterised.
    this.camera.up.set(0, 0, 1);
    this.readFromCamera();

    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    this.element.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Adopt whatever position the camera has been moved to, without easing. */
  forcePosition() {
    this.readFromCamera();
    this.spinDelta.azimuth = 0;
    this.spinDelta.polar = 0;
    this.panDelta.set(0, 0, 0);
    this.dolly = 1;
    this.apply();
  }

  update() {
    if (!this.enabled) return;

    this.toAzimuth += this.spinDelta.azimuth;
    this.toPolar = clamp(this.toPolar + this.spinDelta.polar, this.minPolar, this.maxPolar);
    this.toRadius = clamp(this.toRadius * this.dolly, this.minDistance, this.maxDistance);
    this.target.add(this.panDelta);

    this.azimuth += (this.toAzimuth - this.azimuth) * this.ease;
    this.polar += (this.toPolar - this.polar) * this.ease;
    this.radius += (this.toRadius - this.radius) * this.ease;
    this.apply();

    this.spinDelta.azimuth *= this.inertia;
    this.spinDelta.polar *= this.inertia;
    this.panDelta.multiply(this.inertia);
    this.dolly = 1;
  }

  remove() {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  /** Spherical about +Z: polar down from the zenith, azimuth round the XY plane. */
  private apply() {
    const sin = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.radius * sin * Math.cos(this.azimuth),
      this.target.y + this.radius * sin * Math.sin(this.azimuth),
      this.target.z + this.radius * Math.cos(this.polar),
    );
    this.camera.lookAt(this.target);
  }

  private readFromCamera() {
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    const r = Math.max(Math.hypot(dx, dy, dz), 1e-6);
    this.radius = this.toRadius = clamp(r, this.minDistance, this.maxDistance);
    this.azimuth = this.toAzimuth = Math.atan2(dy, dx);
    this.polar = this.toPolar = clamp(Math.acos(clamp(dz / r, -1, 1)), this.minPolar, this.maxPolar);
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled || this.pointer !== null) return;
    this.pointer = e.pointerId;
    this.panning = e.button === 1 || e.button === 2 || e.shiftKey;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.element.setPointerCapture?.(e.pointerId);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    const height = this.element.clientHeight || 1;

    if (this.panning) {
      // pan in the plane of the screen, using the camera's own right and up axes
      const m = this.camera.matrix;
      const reach = this.radius * Math.tan(((this.camera.fov ?? 45) / 2) * (Math.PI / 180));
      const across = (2 * dx * reach * this.panSpeed) / height;
      const along = (2 * dy * reach * this.panSpeed) / height;
      this.panDelta.set(
        -m[0] * across + m[4] * along,
        -m[1] * across + m[5] * along,
        -m[2] * across + m[6] * along,
      );
      return;
    }

    // Both negative, and both for the same reason: the drag moves the subject,
    // so the camera goes the other way. Drag right and the subject turns right
    // as the camera swings left; drag down and its top tips toward you as the
    // camera climbs. Same convention as every other orbit control.
    this.spinDelta.azimuth -= (2 * Math.PI * dx * this.rotateSpeed) / height;
    this.spinDelta.polar -= (2 * Math.PI * dy * this.rotateSpeed) / height;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.element.releasePointerCapture?.(e.pointerId);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const step = Math.pow(0.95, this.zoomSpeed);
    this.dolly *= e.deltaY < 0 ? step : e.deltaY > 0 ? 1 / step : 1;
  };
}
