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
  /** How many rungs of the ladder it had taken; absent in a verdict from before there was one. */
  rung?: number;
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

/**
 * What a frame can give up, in order, once the internal scale has reached
 * its floor and the frame is still too slow. Each rung is a saving the
 * measurements put a number on: the supersample is four times the pixels of
 * a final frame at rest; the soft shadows' taps are close to half of what a
 * pixel costs on a set of gold and enamel (14.9 ms/Mpx with the key, 8.5
 * without); the contact pass is one more pass over every triangle; and the
 * detail, last, is the triangles themselves, which a page has to rebuild
 * the scene to change.
 */
export const RUNGS = ['supersample', 'shadows', 'contact', 'detail'] as const;
export type Rung = (typeof RUNGS)[number];

/** What the renderer is asked to spend, given how many rungs have been taken. */
export interface Economy {
  /** Whether a final frame at rest may supersample. */
  supersample: boolean;
  /** The soft shadows' taps, as a fraction of the full count. */
  shadowTaps: number;
  /** Whether the contact occlusion is drawn. */
  contact: boolean;
  /** What a page should multiply its tessellation detail by. */
  detail: number;
}

export function economyAt(rung: number): Economy {
  return {
    supersample: rung < 1,
    shadowTaps: rung < 2 ? 1 : 0.25,
    contact: rung < 3,
    detail: rung < 4 ? 1 : 0.7,
  };
}

/**
 * The ladder: the internal scale first, down to a floor, and then the rungs;
 * back up the same way, rungs first and scale last, but slower.
 *
 * Going down is quick, since a slow frame is felt at once. Coming up is
 * guarded twice: a rung is only given back after the scale has stood at full
 * for a while, and after a hold that doubles every time a rung is taken, so
 * a machine on the edge between two rungs settles on the lower one rather
 * than flickering between them. Taking or giving back a rung sets the scale
 * to the middle and lets the frames say where it belongs after that.
 */
export class Ladder {
  static readonly FLOOR = 0.35;
  /** The scale set on a rung change, for the frames to correct from. */
  static readonly RESET = 0.7;
  /** How long the scale must have stood at full before a rung is given back. */
  static readonly FULL_FOR = 1500;

  scale = 1;
  rung = 0;
  private hold = 2000;
  private holdUntil = 0;
  /** When the scale reached full, or -1 while it is below. */
  private fullSince = -1;

  constructor(scale = 1, rung = 0) {
    this.scale = Math.min(1, Math.max(Ladder.FLOOR, scale));
    this.rung = Math.min(RUNGS.length, Math.max(0, Math.round(rung)));
  }

  get economy(): Economy { return economyAt(this.rung); }

  /**
   * A frame missed its budget by `over` (its time over the budget, > 1).
   * Returns what moved: the scale, a rung, or nothing when the bottom is
   * reached.
   */
  slower(now: number, over: number): 'scale' | 'rung' | null {
    this.fullSince = -1;
    if (this.scale > Ladder.FLOOR) {
      // by how far the frame is over, so a very slow frame drops straight down
      this.scale = Math.max(Ladder.FLOOR, this.scale * Math.max(0.5, Math.sqrt(1 / Math.max(over, 1))));
      return 'scale';
    }
    if (this.rung >= RUNGS.length) return null;
    this.rung++;
    this.scale = Ladder.RESET;
    this.holdUntil = now + this.hold;
    this.hold = Math.min(this.hold * 2, 64_000);
    return 'rung';
  }

  /** A frame had headroom. Returns what moved, or nothing when there is nothing to give back. */
  faster(now: number): 'scale' | 'rung' | null {
    if (this.scale < 1) {
      this.scale = Math.min(1, this.scale / 0.85);
      if (this.scale === 1) this.fullSince = now;
      return 'scale';
    }
    if (this.fullSince < 0) this.fullSince = now;
    if (this.rung === 0 || now < this.holdUntil || now - this.fullSince < Ladder.FULL_FOR) return null;
    this.rung--;
    this.scale = Ladder.RESET;
    this.fullSince = -1;
    return 'rung';
  }
}
