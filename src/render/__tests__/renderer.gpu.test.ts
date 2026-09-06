/**
 * The renderer without a page: a device with no canvas, a sketch from the
 * catalogue, frames into a texture, and the pixels read back. This is the
 * seam the library split made, exercised: everything here is what a program
 * without a DOM would do, and it runs in a headless Chrome (`npm run
 * test:gpu`), since node has no WebGPU.
 *
 * To look at what it drew, give it a directory: `VITE_FRAME_DIR=/tmp/frames
 * npm run test:gpu` writes each frame there as a PNG.
 */
/// <reference types="vite/client" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '@vitest/browser/context';
import { createDevice, type Gpu } from '../../gpu/context';
import { Renderer } from '../renderer';
import { compile } from '../../dsl/index';
import { examples } from '../../dsl/examples';
import { groupByMesh } from '../../assembly/groups';

const SIZE = 256;
const FRAME_DIR: string | undefined = import.meta.env.VITE_FRAME_DIR;

/** Every pixel of the render target, rows unpadded, as [r, g, b] whatever the byte order the format has. */
class Frame {
  constructor(private px: Uint8Array, private format: GPUTextureFormat) {}

  static async read(gpu: Gpu, texture: GPUTexture): Promise<Frame> {
    const bytesPerRow = Math.ceil((SIZE * 4) / 256) * 256;
    const buffer = gpu.device.createBuffer({ size: bytesPerRow * SIZE, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = gpu.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [SIZE, SIZE, 1]);
    gpu.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const packed = new Uint8Array(buffer.getMappedRange());
    const out = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) out.set(packed.subarray(y * bytesPerRow, y * bytesPerRow + SIZE * 4), y * SIZE * 4);
    buffer.unmap();
    buffer.destroy();
    return new Frame(out, gpu.format);
  }

  at(x: number, y: number): [number, number, number] {
    const i = (y * SIZE + x) * 4;
    const p = this.px;
    return this.format.startsWith('bgra') ? [p[i + 2], p[i + 1], p[i]] : [p[i], p[i + 1], p[i + 2]];
  }
  sum(x: number, y: number) { return this.at(x, y).reduce((a, b) => a + b); }
  get corner() { return this.at(2, 2); }
  get centre() { return this.at(SIZE / 2, SIZE / 2); }
  /** How many distinct colours the middle row holds: a flat fill has one. */
  get colours() {
    const seen = new Set<string>();
    for (let x = 0; x < SIZE; x++) seen.add(this.at(x, SIZE / 2).join(','));
    return seen.size;
  }

  async save(name: string) {
    if (!FRAME_DIR) return;
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const g = c.getContext('2d')!;
    const img = g.createImageData(SIZE, SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) img.data.set([...this.at(i % SIZE, Math.floor(i / SIZE)), 255], i * 4);
    g.putImageData(img, 0, 0);
    await server.commands.writeFile(`${FRAME_DIR}/${name}.png`, c.toDataURL('image/png').split(',')[1], 'base64');
  }
}

/** Mean absolute difference per channel between two frames, 0..255. */
function difference(a: Frame, b: Frame): number {
  let sum = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const pa = a.at(x, y), pb = b.at(x, y);
    sum += Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2]);
  }
  return sum / (SIZE * SIZE * 3);
}

/** The rosette as the page builds it: compiled, grouped for drawing, and its bounds. */
function rosette() {
  const result = compile(examples.rosette);
  expect(result.error).toBeUndefined();
  const assembly = result.sketch!.assembly;
  return { groups: groupByMesh(assembly), bounds: assembly.bounds() };
}

/** Light, material and camera as the first test sets them, on any renderer. */
function stage(renderer: Renderer, groups: ReturnType<typeof groupByMesh>, bounds: ReturnType<typeof rosette>['bounds']) {
  renderer.setSize(SIZE, SIZE);
  renderer.setEnvironment('studio');
  renderer.setKeyLight({ elevation: Math.PI / 4, azimuth: -Math.PI / 4, strength: 1, warmth: 0.3, size: 0.08 });
  renderer.setMaterial('gold', 'polished');
  renderer.setInstanced(groups);
  renderer.frameBounds(bounds);
  // what the viewer's orbit would tell it: the focus at the target
  const { position, target: at } = renderer.camera;
  const distance = Math.hypot(position[0] - at[0], position[1] - at[1], position[2] - at[2]);
  renderer.setFocus(distance, distance);
}

/** The frames the millimetre renderer drew, for the other units to be held against. */
const reference: { first?: Frame; baked?: Frame } = {};

describe('the renderer, headless', () => {
  let gpu: Gpu;
  let renderer: Renderer;
  let target: GPUTexture;
  const errors: string[] = [];
  const consoleError = console.error;
  const view = () => target.createView();

  /** Draw a frame if one is due, wait for it, and read it back. */
  async function frame(name: string): Promise<{ drew: boolean; frame: Frame }> {
    const drew = renderer.render(view);
    await gpu.queue.onSubmittedWorkDone();
    const f = await Frame.read(gpu, target);
    await f.save(name);
    return { drew, frame: f };
  }

  beforeAll(async () => {
    // the renderer reports shader diagnostics and uncaptured errors through console.error
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); consoleError(...args); };
    gpu = await createDevice();
    renderer = new Renderer(gpu);
    target = gpu.device.createTexture({ label: 'test target', size: [SIZE, SIZE], format: gpu.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  });

  afterAll(() => {
    console.error = consoleError;
    renderer?.dispose();
    target?.destroy();
    gpu?.device.destroy();
  });

  it('takes a sketch, a light and a view, and draws one frame when asked', async () => {
    const { groups, bounds } = rosette();
    expect(groups.length).toBeGreaterThan(0);
    stage(renderer, groups, bounds);

    // the piece is in front of the camera on the CPU before anything is drawn
    expect(renderer.pick(0, 0)).not.toBeNull();

    expect(renderer.pending).toBe(true);
    let views = 0;
    expect(renderer.render(() => { views++; return view(); })).toBe(true);
    expect(views).toBe(1);
    // nothing changed since: the next tick asks for no view and draws nothing
    expect(renderer.render(() => { views++; return view(); })).toBe(false);
    expect(views).toBe(1);
    expect(renderer.pending).toBe(false);
  });

  it('puts the piece in the middle of the frame and the background at the edges', async () => {
    const f = await Frame.read(gpu, target);
    await f.save('first');
    reference.first = f;
    // the page's own dark ground at the corner, never the magenta of a lost device
    for (const c of f.corner) expect(c).toBeLessThan(40);
    expect(f.sum(SIZE / 2, SIZE / 2)).toBeGreaterThan(f.sum(2, 2) + 60);
    // gold: warmer than it is blue, and shaded rather than flat
    expect(f.centre[0]).toBeGreaterThan(f.centre[2]);
    expect(f.colours).toBeGreaterThan(20);
  });

  it('draws again once the sky has been read back and the shadows baked', async () => {
    // the environment's samples arrive on a promise; shadows follow, and mark a frame due
    await renderer.setEnvironment('studio').samples;
    expect(renderer.pending).toBe(true);
    const { drew, frame: f } = await frame('baked');
    expect(drew).toBe(true);
    expect(f.sum(SIZE / 2, SIZE / 2)).toBeGreaterThan(f.sum(2, 2) + 60);
    reference.baked = f;
  });

  it('draws the debug views', async () => {
    for (const mode of [1, 2, 3]) {
      renderer.setDebug(mode);
      const { drew, frame: f } = await frame(`debug${mode}`);
      expect(drew).toBe(true);
      expect(f.colours).toBeGreaterThan(1);
    }
    renderer.setDebug(0);
  });

  it('traces a sample once the view is still', async () => {
    renderer.setQuality('traced');
    renderer.setMoving(false);
    // the scene is built off the thread: raster frames until it lands, then a sample a frame
    for (let i = 0; i < 500 && renderer.traceSamples === 0; i++) {
      renderer.requestRender();
      renderer.render(view);
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(renderer.traceSamples).toBeGreaterThan(0);
    await frame('traced');
    renderer.setQuality('draft');
  });

  it('compiled every shader and raised no GPU error', async () => {
    // shader diagnostics arrive on a promise after creation: give them a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(errors.filter((e) => /shader|WebGPU/.test(e))).toEqual([]);
  });
});

describe('the renderer in other units', () => {
  let gpu: Gpu;
  let renderer: Renderer;
  let target: GPUTexture;
  const errors: string[] = [];
  const consoleError = console.error;

  beforeAll(async () => {
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); consoleError(...args); };
    gpu = await createDevice();
    renderer = new Renderer(gpu, { mmPerUnit: 1000 });
    target = gpu.device.createTexture({ label: 'metre target', size: [SIZE, SIZE], format: gpu.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  });

  afterAll(() => {
    console.error = consoleError;
    renderer?.dispose();
    target?.destroy();
    gpu?.device.destroy();
  });

  it('draws the rosette modelled in metres as it drew it in millimetres', async () => {
    const { groups, bounds } = rosette();
    // the same piece a thousand times smaller in number: metres, told as such
    const k = 1 / 1000;
    const metres = groups.map((g) => {
      const matrices = new Float32Array(g.matrices);
      for (let i = 12; i < matrices.length; i += 16) { matrices[i] *= k; matrices[i + 1] *= k; matrices[i + 2] *= k; }
      return { ...g, mesh: { ...g.mesh, positions: g.mesh.positions.map((v) => v * k) }, matrices };
    });
    const scaled = { min: bounds.min.map((v) => v * k) as typeof bounds.min, max: bounds.max.map((v) => v * k) as typeof bounds.max };
    stage(renderer, metres, scaled);

    expect(renderer.render(() => target.createView())).toBe(true);
    await gpu.queue.onSubmittedWorkDone();
    const first = await Frame.read(gpu, target);
    await first.save('metres-first');
    expect(reference.first).toBeDefined();
    expect(difference(first, reference.first!)).toBeLessThan(2);

    await renderer.setEnvironment('studio').samples;
    expect(renderer.render(() => target.createView())).toBe(true);
    await gpu.queue.onSubmittedWorkDone();
    const baked = await Frame.read(gpu, target);
    await baked.save('metres-baked');
    expect(difference(baked, reference.baked!)).toBeLessThan(2);
  });

  it('raised no GPU error', async () => {
    await new Promise((r) => setTimeout(r, 50));
    expect(errors.filter((e) => /shader|WebGPU/.test(e))).toEqual([]);
  });
});
