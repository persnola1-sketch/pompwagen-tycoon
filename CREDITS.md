# Credits & licenses

Every third-party asset in this project is free to use commercially. All art
assets below are **CC0 1.0 (public domain)**; credit is given as thanks, not
because it is required.

## Textures — Poly Haven (CC0)

Downloaded as 1K JPGs from <https://polyhaven.com>. They were resized and
converted to GPU-compressed KTX2 (Basis Universal ETC1S/UASTC) with `basisu`.

| File in `public/textures/` | Source asset | Author(s) | License |
|---|---|---|---|
| `concrete_diff.ktx2` (desaturated) | [Smooth Concrete Floor](https://polyhaven.com/a/smooth_concrete_floor) | Dimitrios Savva | [CC0](https://polyhaven.com/license) |
| `asphalt_diff.ktx2` | [Clean Asphalt](https://polyhaven.com/a/clean_asphalt) | Dimitrios Savva | [CC0](https://polyhaven.com/license) |
| `metal_wall_diff.ktx2`, `metal_wall_nor.ktx2` | [Corrugated Iron 02](https://polyhaven.com/a/corrugated_iron_02) | Jenelle van Heerden, Sergej Majboroda | [CC0](https://polyhaven.com/license) |

## 3D models — Kenney (CC0)

From <https://kenney.nl>, used unmodified as GLB (instanced in `src/world/Yard.ts`).

| Pack | Files in `public/models/` | License |
|---|---|---|
| [Nature Kit 2.1](https://kenney.nl/assets/nature-kit) | `tree_oak`, `tree_default`, `tree_detailed`, `tree_pineRoundA`, `tree_pineTallC`, `plant_bushDetailed` | [CC0](http://creativecommons.org/publicdomain/zero/1.0/) |
| [City Kit Commercial 2.1](https://kenney.nl/assets/city-kit-commercial) | `building-e`, `building-k`, `low-detail-building-a`, `-d`, `-h`, `-j`, `-wide-a`, `-wide-b`, `Textures/colormap.png` | [CC0](http://creativecommons.org/publicdomain/zero/1.0/) |

## Libraries

| Library | Use | License |
|---|---|---|
| [three.js](https://threejs.org) | 3D engine, GLTFLoader, KTX2Loader, BufferGeometryUtils | MIT |
| Basis Universal transcoder (`public/basis/`, shipped with three.js) | KTX2 texture decoding | Apache-2.0 |
| [Vite](https://vitejs.dev), [TypeScript](https://www.typescriptlang.org) | build tooling | MIT / Apache-2.0 |

## Made in code for this project

The following were built procedurally in code, with canvas-generated textures:
- trucks (tractor, trailer, liveries, licence plates)
- the worker and pompwagen
- pallet racks and pallets with product loads
- the warehouse structure, dock doors, safety signs, bollards and props
- the fence, gates, streetlights, parked cars and trailers
- floor markings

All company, supplier and store names are fictional (`src/config/names.json`).
