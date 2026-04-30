import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';

export type PaymentMethodKey = 'bank_card' | 'sbp' | 'sberbank' | 'tinkoff_bank';

export interface CheckoutCartItem {
  id: string;
  productId: string;
  name: string;
  imageUrl?: string;
  unitPriceCents: number;
  compareAtPriceCents?: number;
  quantity: number;
  variants?: Record<string, string>;
  isBonus?: boolean;
}

export interface DeliveryAddress {
  country: string;
  firstName: string;
  lastName: string;
  fullName: string;
  city: string;
  cityFiasId?: string;
  address: string;
  postalCode: string;
}

export interface DeliveryMethodChoice {
  type: 'cdek_door' | 'cdek_pvz' | 'pickup' | 'custom';
  label: string;
  priceCents: number;
  etaText?: string;
  pvzCode?: string;
  customId?: string;
}

export interface CheckoutContact {
  email: string;
  phone: string;
}

export interface CheckoutState {
  cartId: string | null;
  items: CheckoutCartItem[];
  contact: CheckoutContact;
  delivery: DeliveryAddress;
  deliveryMethod: DeliveryMethodChoice | null;
  paymentMethod: PaymentMethodKey | null;
  promoCode: string;
  appliedDiscountCents: number;
  /** YooKassa numeric shop ID — нужен Tokenization SDK на стороне клиента.
   * Достаётся через public endpoint /api/billing/shops/:shopId/payment-config/public.
   * NULL значит виджет недоступен (платёжки не настроены / shop disabled). */
  yookassaShopId: string | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
}

export type CheckoutAction =
  | { type: 'SET_CART'; cartId: string | null; items: CheckoutCartItem[] }
  | { type: 'SET_CONTACT_FIELD'; field: keyof CheckoutContact; value: string }
  | { type: 'SET_DELIVERY_FIELD'; field: keyof DeliveryAddress; value: string }
  | { type: 'SET_DELIVERY_METHOD'; method: DeliveryMethodChoice | null }
  | { type: 'SET_PAYMENT_METHOD'; method: PaymentMethodKey | null }
  | { type: 'SET_PROMO_CODE'; code: string }
  | { type: 'SET_DISCOUNT'; discountCents: number }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_SUBMITTING'; submitting: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_YOOKASSA_SHOP_ID'; yookassaShopId: string | null };

const initialState: CheckoutState = {
  cartId: null,
  items: [],
  contact: { email: '', phone: '' },
  delivery: {
    country: 'Российская Федерация',
    firstName: '',
    lastName: '',
    fullName: '',
    city: '',
    address: '',
    postalCode: '',
  },
  deliveryMethod: null,
  paymentMethod: null,
  promoCode: '',
  appliedDiscountCents: 0,
  yookassaShopId: null,
  loading: true,
  submitting: false,
  error: null,
};

function reducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    case 'SET_CART':
      return { ...state, cartId: action.cartId, items: action.items, loading: false };
    case 'SET_CONTACT_FIELD':
      return { ...state, contact: { ...state.contact, [action.field]: action.value } };
    case 'SET_DELIVERY_FIELD':
      return { ...state, delivery: { ...state.delivery, [action.field]: action.value } };
    case 'SET_DELIVERY_METHOD':
      return { ...state, deliveryMethod: action.method };
    case 'SET_PAYMENT_METHOD':
      return { ...state, paymentMethod: action.method };
    case 'SET_PROMO_CODE':
      return { ...state, promoCode: action.code };
    case 'SET_DISCOUNT':
      return { ...state, appliedDiscountCents: action.discountCents };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.submitting };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SET_YOOKASSA_SHOP_ID':
      return { ...state, yookassaShopId: action.yookassaShopId };
    default:
      return state;
  }
}

export interface CheckoutContextValue {
  state: CheckoutState;
  dispatch: React.Dispatch<CheckoutAction>;
  apiBase: string;
  shopId: string;
  preview: boolean;
}

const Ctx = createContext<CheckoutContextValue | null>(null);

export interface CheckoutProviderProps {
  apiBase: string;
  shopId: string;
  preview?: boolean;
  initialCartId?: string | null;
  initialItems?: CheckoutCartItem[];
  children: ReactNode;
}

export function CheckoutProvider({
  apiBase,
  shopId,
  preview = false,
  initialCartId = null,
  initialItems = [],
  children,
}: CheckoutProviderProps) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    cartId: initialCartId,
    items: initialItems,
    loading: !preview && initialItems.length === 0,
  });

  // Один раз при mount достаём публичный YooKassa shopId для этого магазина —
  // он нужен Tokenization SDK для inline-виджета карты. Без него бэк всё равно
  // сможет провести платёж через redirect-flow, но клиентский виджет не
  // инициализируется.
  useEffect(() => {
    if (preview || !shopId) return;
    const ctrl = new AbortController();
    fetch(`${apiBase}/billing/shops/${shopId}/payment-config/public`, {
      signal: ctrl.signal,
      credentials: 'omit',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const yk = j?.data?.yookassaShopId;
        if (typeof yk === 'string' && yk) {
          dispatch({ type: 'SET_YOOKASSA_SHOP_ID', yookassaShopId: yk });
        }
      })
      .catch(() => {
        /* fail silent — widget просто не появится, redirect-flow остаётся */
      });
    return () => ctrl.abort();
  }, [apiBase, shopId, preview]);

  return <Ctx.Provider value={{ state, dispatch, apiBase, shopId, preview }}>{children}</Ctx.Provider>;
}

export function useCheckoutContext(): CheckoutContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCheckoutContext must be used within CheckoutProvider');
  return ctx;
}

export function computeTotals(state: CheckoutState): {
  subtotalCents: number;
  deliveryCents: number;
  discountCents: number;
  totalCents: number;
} {
  const subtotalCents = state.items
    .filter((item) => !item.isBonus)
    .reduce((acc, item) => acc + item.unitPriceCents * item.quantity, 0);
  const deliveryCents = state.deliveryMethod?.priceCents ?? 0;
  const discountCents = state.appliedDiscountCents;
  const totalCents = Math.max(0, subtotalCents + deliveryCents - discountCents);
  return { subtotalCents, deliveryCents, discountCents, totalCents };
}

export function formatRub(cents: number): string {
  const rub = Math.round(cents / 100);
  return rub.toLocaleString('ru-RU') + '₽';
}
