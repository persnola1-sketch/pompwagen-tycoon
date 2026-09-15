import productsCfg from '../config/products.json';

export type ProductDef = (typeof productsCfg.products)[number];

export const PRODUCTS: readonly ProductDef[] = productsCfg.products;

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

export function product(id: string): ProductDef {
  return byId.get(id) ?? PRODUCTS[0];
}

export function isProduct(id: unknown): id is string {
  return typeof id === 'string' && byId.has(id);
}

/** products available once `shipped` pallets have left the warehouse */
export function unlockedProducts(shipped: number): ProductDef[] {
  return PRODUCTS.filter((p) => shipped >= p.unlockShipped);
}
