/**
 * Metals and finishes.
 *
 * F0 is the reflectance at normal incidence, in linear RGB. Gold, silver, copper
 * and platinum come from measured spectral data reduced to sRGB primaries and are
 * as close to right as three channels allow. The alloys — brass, rose gold — and
 * the oxide finishes are plausible values chosen by eye, not measurements, and
 * are marked as such.
 */
export interface Metal {
  name: string;
  /** Linear-RGB reflectance at normal incidence. */
  f0: [number, number, number];
  /** True where the value comes from measured data rather than judgement. */
  measured: boolean;
}

export const metals: Record<string, Metal> = {
  gold: { name: 'gold', f0: [1.0, 0.766, 0.336], measured: true },
  silver: { name: 'silver', f0: [0.972, 0.96, 0.915], measured: true },
  platinum: { name: 'platinum', f0: [0.672, 0.637, 0.585], measured: true },
  copper: { name: 'copper', f0: [0.955, 0.638, 0.538], measured: true },
  'rose gold': { name: 'rose gold', f0: [0.98, 0.72, 0.56], measured: false },
  brass: { name: 'brass', f0: [0.91, 0.778, 0.423], measured: false },
  bronze: { name: 'bronze', f0: [0.76, 0.53, 0.36], measured: false },
  'blackened steel': { name: 'blackened steel', f0: [0.13, 0.125, 0.12], measured: false },
};

export interface Finish {
  name: string;
  roughness: number;
  /**
   * Directional stretch of the highlight, along the surface's u parameter — which
   * runs along a sweep and around a revolve, exactly the way a real part is
   * linished or spun.
   */
  anisotropy: number;
  /** Planished dimpling, as a normal perturbation in object space. */
  hammer: number;
  /** Fraction of the surface turned to oxide: less metallic, coloured, rougher. */
  patina: number;
}

export const finishes: Record<string, Finish> = {
  polished: { name: 'polished', roughness: 0.05, anisotropy: 0, hammer: 0, patina: 0 },
  satin: { name: 'satin', roughness: 0.22, anisotropy: 0, hammer: 0, patina: 0 },
  brushed: { name: 'brushed', roughness: 0.3, anisotropy: 0.88, hammer: 0, patina: 0 },
  spun: { name: 'spun', roughness: 0.2, anisotropy: 0.7, hammer: 0, patina: 0 },
  hammered: { name: 'hammered', roughness: 0.16, anisotropy: 0, hammer: 1, patina: 0 },
  sandblasted: { name: 'sandblasted', roughness: 0.52, anisotropy: 0, hammer: 0, patina: 0 },
  antiqued: { name: 'antiqued', roughness: 0.38, anisotropy: 0.2, hammer: 0.35, patina: 0.45 },
  verdigris: { name: 'verdigris', roughness: 0.62, anisotropy: 0, hammer: 0.2, patina: 0.9 },
};

export const metalNames = Object.keys(metals);
export const finishNames = Object.keys(finishes);

/** Oxide colour for the patinated fraction, per metal family. */
export function patinaColour(metal: string): [number, number, number] {
  switch (metal) {
    case 'copper':
    case 'bronze':
    case 'brass':
      return [0.24, 0.42, 0.35];
    case 'silver':
      return [0.16, 0.14, 0.13];
    default:
      return [0.2, 0.17, 0.14];
  }
}
