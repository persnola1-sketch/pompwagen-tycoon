/** axis-aligned collision box on the floor plane */
export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Point {
  x: number;
  z: number;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
