import layout from '../../config/layout.json';

const C = layout.city;

export interface Pose {
  x: number;
  z: number;
  heading: number;
}

/**
 * A closed driving line: a rectangle around the city inset (or outset) by a
 * lane offset. Traversed in the order below it always keeps the driver on the
 * right-hand side of the carriageway, Dutch style.
 */
export class Loop {
  readonly points: { x: number; z: number }[];
  readonly lengths: number[] = [];
  readonly total: number;

  constructor(halfX: number, halfZ: number, offset: number) {
    const x = halfX - offset;
    const z = halfZ - offset;
    // clockwise on screen: +x along the north edge, then +z, -x, -z
    this.points = offset >= 0
      ? [{ x: -x, z: -z }, { x, z: -z }, { x, z }, { x: -x, z }]
      : [{ x: -x, z }, { x, z }, { x, z: -z }, { x: -x, z: -z }];
    let total = 0;
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i];
      const b = this.points[(i + 1) % this.points.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.lengths.push(len);
      total += len;
    }
    this.total = total;
  }

  /** position and heading at a distance along the loop */
  poseAt(dist: number): Pose {
    let d = ((dist % this.total) + this.total) % this.total;
    for (let i = 0; i < this.points.length; i++) {
      if (d <= this.lengths[i]) {
        const a = this.points[i];
        const b = this.points[(i + 1) % this.points.length];
        const t = d / this.lengths[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = this.lengths[i];
        return { x: a.x + dx * t, z: a.z + dz * t, heading: Math.atan2(dx / len, dz / len) };
      }
      d -= this.lengths[i];
    }
    const p = this.points[0];
    return { x: p.x, z: p.z, heading: 0 };
  }
}

/** the lane loops used by cars, bikes and pedestrians */
export function buildLoops(): { cars: Loop[]; bikes: Loop[]; walks: Loop[] } {
  const bikeOff = C.roadWidth / 2 + C.bikeLane / 2;
  const walkOff = C.roadWidth / 2 + C.bikeLane + 0.25 + C.sidewalk / 2;
  return {
    cars: [
      new Loop(C.ringX, C.ringZ, C.laneOffset),
      new Loop(C.ringX, C.ringZ, -C.laneOffset),
      new Loop(C.outerX, C.outerZ, C.laneOffset),
      new Loop(C.outerX, C.outerZ, -C.laneOffset),
    ],
    bikes: [new Loop(C.ringX, C.ringZ, bikeOff), new Loop(C.outerX, C.outerZ, -bikeOff)],
    walks: [
      new Loop(C.ringX, C.ringZ, walkOff),
      new Loop(C.ringX, C.ringZ, -walkOff),
      new Loop(C.outerX, C.outerZ, walkOff),
    ],
  };
}
