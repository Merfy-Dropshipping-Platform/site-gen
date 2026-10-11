import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '../src/parts/auth';
import { createCart } from '../src/parts/cart';
import { createFavorites } from '../src/parts/favorites';
import { part, registerParts } from '../src/parts/registry';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('части ядра — шов в памяти', () => {
  it('корзина: подписчик получает текущее сразу, каждую правку — после текущего кода; отписка работает', async () => {
    const cart = createCart();
    const seen: number[] = [];
    const stop = cart.subscribe((state) => seen.push(state.lines.length));
    cart.add('scarf-1');
    cart.add('scarf-1', 2);
    cart.add('coat-7');
    expect(seen).toEqual([0]);
    await flush();
    expect(seen).toEqual([0, 1, 1, 2]);
    expect(cart.get().lines).toEqual([
      { productId: 'scarf-1', quantity: 3 },
      { productId: 'coat-7', quantity: 1 },
    ]);
    expect(cart.count()).toBe(4);
    stop();
    cart.remove('scarf-1');
    await flush();
    expect(seen).toEqual([0, 1, 1, 2]);
    expect(cart.get().lines).toEqual([{ productId: 'coat-7', quantity: 1 }]);
  });

  it('избранное: отметить и снять', () => {
    const favorites = createFavorites();
    favorites.toggle('scarf-1');
    expect(favorites.has('scarf-1')).toBe(true);
    favorites.toggle('scarf-1');
    expect(favorites.has('scarf-1')).toBe(false);
    expect(favorites.get()).toEqual({ productIds: [] });
  });

  it('вход: покупатель — гость', () => {
    const auth = createAuth();
    const seen: boolean[] = [];
    auth.subscribe((state) => seen.push(state.signedIn));
    expect(auth.get()).toEqual({ signedIn: false });
    expect(seen).toEqual([false]);
  });
});

describe('part()', () => {
  it('до регистрации частей и для незнакомого имени — part-unknown', async () => {
    await expect(part('cart')).rejects.toMatchObject({ code: 'part-unknown' });
    registerParts({
      auth: () => Promise.resolve({ part: createAuth() }),
      cart: () => Promise.resolve({ part: createCart() }),
      favorites: () => Promise.resolve({ part: createFavorites() }),
    });
    // Секция на JS может спросить любое имя.
    const unknownPart: unknown = Reflect.apply(part, undefined, ['wishlist']);
    await expect(unknownPart).rejects.toMatchObject({ code: 'part-unknown', message: 'части wishlist нет в ядре' });
  });

  it('часть ядра — сразу; часть вне ядра — загрузчик зовётся при первом обращении', async () => {
    const cart = createCart();
    const lazyFavorites = vi.fn(() => Promise.resolve({ part: createFavorites() }));
    registerParts({
      auth: () => Promise.resolve({ part: createAuth() }),
      cart: () => Promise.resolve({ part: cart }),
      favorites: lazyFavorites,
    });
    expect(await part('cart')).toBe(cart);
    expect(lazyFavorites).not.toHaveBeenCalled();
    const favorites = await part('favorites');
    favorites.toggle('scarf-1');
    expect(favorites.has('scarf-1')).toBe(true);
    expect(lazyFavorites).toHaveBeenCalledTimes(1);
  });
});
