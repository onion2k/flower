/**
 * What this machine can draw, measured rather than assumed.
 *
 * Every budget in the renderer is a constant chosen on one desktop; a laptop
 * with an integrated GPU draws the same frame ten times slower and, until it
 * was measured, drew it at the same size. The viewer times a few frames of the
 * real scene once it is on screen and writes the answer down here as a cost
 * per megapixel; from that comes the internal scale it opens at and a word
 * for the page to offer as a default. The verdict is kept in localStorage
 * against the adapter's name, so the next visit opens at the right size
 * before the first frame rather than after the first stall.
 *
 * Nothing here touches the GPU: the viewer does the drawing and the fencing,
 * and this file does the arithmetic, so the arithmetic can be tested.
 */

/** How the frame was measured, and what was made of it. */
export interface Verdict {
  /** The adapter it was measured on: `AdapterInfo.key`. */
  key: string;
  /** Milliseconds of GPU time per million pixels drawn, in draft, at rest. */
  msPerMpx: number;
  /** The internal scale the viewer settled on, saved so it opens there. */
  scale: number;
  /** When, epoch milliseconds. */
  at: number;
}

/**
 * A page's word for how much to ask of the machine. `fast` is for the laptop
 * that has just been measured slow: fewer triangles and fewer pixels, in
 * draft. `balanced` is draft at the catalogue's working detail. `fine` is
 * final quality at full detail, for looking rather than working, and is only
 * ever chosen, never suggested.
 */
export type Tier = 'fast' | 'balanced' | 'fine';

export const TIERS: Record<Tier, { quality: 'draft' | 'final'; detail: number; renderScale: number }> = {
  fast: { quality: 'draft', detail: 0.35, renderScale: 0.7 },
  balanced: { quality: 'draft', detail: 0.5, renderScale: 1 },
  fine: { quality: 'final', detail: 1, renderScale: 1 },
};

/**
 * Above this a draft frame at a laptop screen's pixels takes longer than a
 * tick even at the adaptive scale's floor, and it is time to draw fewer
 * triangles as well as fewer pixels. A desktop GPU measures under ten.
 */
export const SLOW_MS_PER_MPX = 40;

export function tierFor(msPerMpx: number): Tier {
  return msPerMpx > SLOW_MS_PER_MPX ? 'fast' : 'balanced';
}

/**
 * The internal scale to open at: the one that brings a frame of `mpx`
 * megapixels, at the measured cost, inside the same budget the frame pacer
 * holds a moving frame to — a tick and a half — and never below its floor.
 */
export function startingScale(msPerMpx: number, mpx: number, tickMs: number, floor = 0.5): number {
  if (!(msPerMpx > 0) || !(mpx > 0)) return 1;
  const budget = tickMs * 1.5 + 6;
  const scale = Math.sqrt(budget / (msPerMpx * mpx));
  return Math.min(1, Math.max(floor, scale));
}

/** The middle value: one frame carrying a bake does not decide the verdict. */
export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const KEY = 'artshape.gpu';
/** A verdict older than this is measured again from scratch rather than trusted. */
export const VERDICT_TTL = 30 * 24 * 3600 * 1000;

type Shelf = Record<string, Verdict>;

function read(): Shelf {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export const verdicts = {
  /** The verdict for an adapter, if one was written and is not stale. */
  load(key: string, now = Date.now()): Verdict | null {
    const v = read()[key];
    if (!v || typeof v.msPerMpx !== 'number' || typeof v.scale !== 'number') return null;
    if (!(now - v.at < VERDICT_TTL)) return null;
    return v;
  },
  save(v: Verdict) {
    try {
      const shelf = read();
      shelf[v.key] = v;
      localStorage.setItem(KEY, JSON.stringify(shelf));
    } catch { /* storage full or unavailable: measured again next visit */ }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* as above */ }
  },
};
