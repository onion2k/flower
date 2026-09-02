/**
 * The WebGPU device and the handful of helpers everything else shares.
 *
 * Deliberately thin. The renderer owns its own bakes and passes and wants to
 * talk to the API directly; what it needs from a layer is a device, a canvas,
 * shader compilation that fails loudly, and buffers that come out the right
 * size. Anything more would be an engine, and an engine is what was just
 * removed.
 */

export interface GpuContext {
  device: GPUDevice;
  queue: GPUQueue;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

export async function createContext(canvas: HTMLCanvasElement, onLost?: (info: GPUDeviceLostInfo) => void): Promise<GpuContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not available in this browser');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('WebGPU: no adapter');
  const device = await adapter.requestDevice();
  device.addEventListener('uncapturederror', (e) => {
    console.error('WebGPU error:', (e as GPUUncapturedErrorEvent).error.message);
  });
  // A lost device is silent otherwise: the canvas goes magenta and every call
  // after it is a no-op. Say so, loudly, with the reason the browser gives.
  device.lost.then((info) => {
    if (info.reason === 'destroyed') return;
    console.error(`WebGPU device lost (${info.reason}): ${info.message}`);
    onLost?.(info);
  });
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU: no canvas context');
  const format = navigator.gpu.getPreferredCanvasFormat();
  // COPY_SRC so a frame can be read back for a capture; it costs nothing otherwise
  context.configure({ device, format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  return { device, queue: device.queue, canvas, context, format };
}

/** Compile a shader module and surface any diagnostics as an error, not a silent black frame. */
export function shader(device: GPUDevice, code: string, label: string): GPUShaderModule {
  const module = device.createShaderModule({ code, label });
  module.getCompilationInfo().then((info) => {
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length) {
      console.error(`shader "${label}" failed:\n` + errors.map((m) => `  ${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    }
  });
  return module;
}

export function bufferFrom(device: GPUDevice, data: ArrayBufferView, usage: GPUBufferUsageFlags, label?: string): GPUBuffer {
  // buffer sizes must be multiples of 4; pad a lone f32 wear array of odd length
  const size = Math.ceil(data.byteLength / 4) * 4;
  const buffer = device.createBuffer({ size, usage, mappedAtCreation: true, label });
  const dst = new Uint8Array(buffer.getMappedRange());
  dst.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  buffer.unmap();
  return buffer;
}

export function emptyBuffer(device: GPUDevice, size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer {
  return device.createBuffer({ size: Math.max(4, Math.ceil(size / 4) * 4), usage, label });
}

/**
 * The oversized triangle, as a vertex stage. `uv` is in texture space — (0, 0)
 * at the first row in memory — which is what every sampling pass wants, and
 * what keeps cube faces and lookup tables laid out exactly as they were.
 */
export const FULLSCREEN_VERT = `
struct FsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsFullscreen(@builtin(vertex_index) i: u32) -> FsOut {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var out: FsOut;
  out.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  out.uv = vec2f(p.x, 1.0 - p.y);
  return out;
}
`;

/** Read a whole 2D layer of a texture back to the CPU. `bytesPerTexel` must give rows aligned to 256 bytes. */
export async function readbackLayer(
  device: GPUDevice,
  texture: GPUTexture,
  layer: number,
  mip: number,
  size: number,
  bytesPerTexel: number,
): Promise<ArrayBuffer> {
  const bytesPerRow = Math.ceil((size * bytesPerTexel) / 256) * 256;
  const buffer = device.createBuffer({ size: bytesPerRow * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture, mipLevel: mip, origin: { x: 0, y: 0, z: layer } },
    { buffer, bytesPerRow, rowsPerImage: size },
    { width: size, height: size, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const packed = buffer.getMappedRange().slice(0);
  buffer.unmap();
  buffer.destroy();
  if (bytesPerRow === size * bytesPerTexel) return packed;
  // strip the row padding
  const out = new Uint8Array(size * size * bytesPerTexel);
  const src = new Uint8Array(packed);
  for (let y = 0; y < size; y++) out.set(src.subarray(y * bytesPerRow, y * bytesPerRow + size * bytesPerTexel), y * size * bytesPerTexel);
  return out.buffer;
}

/** IEEE half to float. */
export function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}
