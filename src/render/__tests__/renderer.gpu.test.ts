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
    let drew = false;
    for (let i = 0; i < 4 && !drew; i++) {
      // the tracer builds its scene on the first still frame and samples on the next
      const r = await frame(`traced${i}`);
      drew = r.drew && renderer.traceSamples > 0;
    }
    expect(renderer.traceSamples).toBeGreaterThan(0);
    renderer.setQuality('draft');
  });

  it('compiled every shader and raised no GPU error', async () => {
    // shader diagnostics arrive on a promise after creation: give them a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(errors.filter((e) => /shader|WebGPU/.test(e))).toEqual([]);
  });
});

