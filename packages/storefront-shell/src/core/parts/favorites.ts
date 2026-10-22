import { atom, readable } from '../stores';
import type { FavoritesModule, FavoritesState, Result, SdkPart } from '../types';

// Избранное в новом виде (design.md блока 5, раздел 3.12; каталог блока 10): сторы { get } и toggle с Result. Данные —
// в памяти страницы до блока 10.

const invalid = (message: string): Result<never> => ({ ok: false, error: { code: 'invalid', message } });

export const favorites: SdkPart<'favorites', FavoritesModule> = {
  name: 'favorites',
  create: (): FavoritesModule => {
    const state = atom<FavoritesState>({ ready: true, ids: [] });
    const count = atom(0);
    const toggle = (productId: string): Result<{ readonly added: boolean }> => {
      if (productId === '') return invalid('favorites.toggle: productId — непустая строка');
      const ids = state.get().ids;
      const kept = ids.includes(productId);
      const next = kept ? ids.filter((id) => id !== productId) : [...ids, productId];
      state.set({ ready: true, ids: next });
      count.set(next.length);
      return { ok: true, data: { added: !kept } };
    };
    return {
      $favorites: readable(state),
      $count: readable(count),
      toggle: (args: { readonly productId: string }): Promise<Result<{ readonly added: boolean }>> =>
        Promise.resolve(toggle(args.productId)),
    };
  },
  markup: {
    toggle: {
      params: ['product-id'],
      call: (api: FavoritesModule, values): Promise<Result<unknown>> =>
        api.toggle({ productId: values['product-id'] ?? '' }),
    },
  },
};
