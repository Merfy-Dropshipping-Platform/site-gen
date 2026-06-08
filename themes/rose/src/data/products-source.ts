import type { Product } from "../types/product";
import { catalogProducts } from "./products";

// import.meta.glob does NOT throw when the file is absent — returns {} locally,
// and eagerly imports products.json on real builds where build.service.ts wrote it.
const realModules = import.meta.glob<{ default: Product[] }>("./products.json", { eager: true });

/** Real products (products.json written by build.service.ts) or demo fallback. */
export function getProducts(): Product[] {
	const mod = realModules["./products.json"];
	const real = mod?.default;
	if (Array.isArray(real) && real.length > 0) return real;
	return catalogProducts as Product[];
}
