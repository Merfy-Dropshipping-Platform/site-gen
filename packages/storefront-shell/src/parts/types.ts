// Части ядра (design.md блока 7, С7-3 Б): вход, корзина, избранное. Что они умеют — договор SDK, следующая часть
// (С7-17 и С7-8 отложены 10.10; раздел 8 design.md). Здесь — шов: состояние в памяти страницы, без сети и без ключей
// браузера. Код секций берёт часть через part() и при настоящих частях не меняется.
export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartState {
  lines: readonly CartLine[];
}

export interface FavoritesState {
  productIds: readonly string[];
}

export interface AuthState {
  signedIn: boolean;
}

export type Listener<T> = (state: T) => void;
export type Unsubscribe = () => void;

export interface CartPart {
  get: () => CartState;
  subscribe: (listener: Listener<CartState>) => Unsubscribe;
  add: (productId: string, quantity?: number) => void;
  remove: (productId: string) => void;
  count: () => number;
}

export interface FavoritesPart {
  get: () => FavoritesState;
  subscribe: (listener: Listener<FavoritesState>) => Unsubscribe;
  toggle: (productId: string) => void;
  has: (productId: string) => boolean;
}

export interface AuthPart {
  get: () => AuthState;
  subscribe: (listener: Listener<AuthState>) => Unsubscribe;
}

export interface Parts {
  auth: AuthPart;
  cart: CartPart;
  favorites: FavoritesPart;
}

export type PartName = keyof Parts;
export const PART_NAMES = ['auth', 'cart', 'favorites'] as const satisfies readonly PartName[];
