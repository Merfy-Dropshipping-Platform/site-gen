import { useEffect } from 'react';
import { useCheckoutContext, type CheckoutCartItem } from '../CheckoutContext';

interface CartApiResponse {
  success: boolean;
  data?: {
    cart?: { id: string };
    items?: Array<{
      id: string;
      productId: string;
      name?: string;
      imageUrl?: string;
      unitPriceCents: number;
      compareAtPriceCents?: number;
      quantity: number;
      options?: Record<string, string>;
      isBonus?: boolean;
    }>;
  };
}

const FAKE_CART_ITEMS: CheckoutCartItem[] = [
  {
    id: 'preview-1',
    productId: 'preview-1',
    name: 'Сумка',
    imageUrl: undefined,
    unitPriceCents: 599000,
    compareAtPriceCents: 799000,
    quantity: 1,
    variants: { Цвет: 'Бежевый', Размер: 'One-size', Материал: 'Кожа' },
  },
];

export function useCheckoutCart(): void {
  const { state, dispatch, apiBase, preview } = useCheckoutContext();

  useEffect(() => {
    if (preview) {
      dispatch({ type: 'SET_CART', cartId: 'preview-cart', items: FAKE_CART_ITEMS });
      return;
    }

    if (!state.cartId) {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('merfy:cartId') : null;
      if (!stored) {
        dispatch({ type: 'SET_CART', cartId: null, items: [] });
        return;
      }
      void fetchCart(stored, apiBase, dispatch);
    } else if (state.items.length === 0) {
      void fetchCart(state.cartId, apiBase, dispatch);
    }
  }, [preview, state.cartId, apiBase, dispatch]);
}

async function fetchCart(
  cartId: string,
  apiBase: string,
  dispatch: ReturnType<typeof useCheckoutContext>['dispatch'],
): Promise<void> {
  dispatch({ type: 'SET_LOADING', loading: true });
  try {
    const res = await fetch(`${apiBase}/checkout/cart/${cartId}`, { credentials: 'include' });
    const json = (await res.json()) as CartApiResponse;
    const apiItems = json?.data?.items ?? [];
    const items: CheckoutCartItem[] = apiItems.map((it) => ({
      id: it.id,
      productId: it.productId,
      name: it.name ?? 'Товар',
      imageUrl: it.imageUrl,
      unitPriceCents: it.unitPriceCents,
      compareAtPriceCents: it.compareAtPriceCents,
      quantity: it.quantity,
      variants: it.options,
      isBonus: it.isBonus,
    }));
    dispatch({ type: 'SET_CART', cartId, items });
  } catch (e) {
    dispatch({ type: 'SET_ERROR', error: e instanceof Error ? e.message : 'Не удалось загрузить корзину' });
    dispatch({ type: 'SET_LOADING', loading: false });
  }
}
