/** A signed distance field in 3D. Negative inside, positive outside. */
export type SDF = (x: number, y: number, z: number) => number;

/** A signed distance field in 2D, used for milled profiles before extrusion. */
export type SDF2 = (x: number, y: number) => number;

export type Vec3 = [number, number, number];
export type Box3 = { min: Vec3; max: Vec3 };
