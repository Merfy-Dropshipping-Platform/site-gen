import { useEffect } from 'react';
import { useCheckoutContext } from '../CheckoutContext';

/**
 * Bridge: Astro vanilla inputs ↔ React state.
 *
 * checkout.astro mounts vanilla Astro blocks for Contact/Delivery/DeliveryMethod
 * (без data-checkout-slot=contact/delivery/delivery-method). React Island
 * управляет только payment+submit slot'ами и имеет собственный state, который
 * **не sync** с Astro inputs. Без этого моста submit.canSubmit видит пустые
 * state.contact/state.delivery → кнопка disabled навсегда.
 *
 * Что делает мост:
 * 1. На mount читает текущие значения Astro inputs (`[data-checkout-field]`)
 *    и наполняет React state. Покрывает browser autofill.
 * 2. Слушает 'input'/'change' на каждом Astro поле → dispatch SET_CONTACT_FIELD
 *    / SET_DELIVERY_FIELD.
 * 3. Слушает 'checkout:delivery-changed' (диспатчится CheckoutDeliveryMethod
 *    при выборе тарифа СДЭК / самовывоза) → dispatch SET_DELIVERY_METHOD.
 * 4. Слушает 'checkout:address-changed' → SET_DELIVERY_FIELD city/postal/fiasId.
 */

const CONTACT_FIELDS = ['email', 'phone'] as const;
const DELIVERY_FIELDS = [
  'country',
  'firstName',
  'lastName',
  'fullName',
  'city',
  'postalCode',
  'address',
] as const;

type ContactField = (typeof CONTACT_FIELDS)[number];
type DeliveryField = (typeof DELIVERY_FIELDS)[number];

export function useAstroBridge(): void {
  const { dispatch, preview } = useCheckoutContext();

  useEffect(() => {
    if (preview) return;
    if (typeof document === 'undefined') return;

    const getInput = (field: string): HTMLInputElement | null =>
      document.querySelector<HTMLInputElement>(`[data-checkout-field="${field}"] input`);

    // 1. Initial values — после autofill / SSR-prefill / cart-store hydration
    for (const f of CONTACT_FIELDS) {
      const el = getInput(f);
      if (el && el.value) dispatch({ type: 'SET_CONTACT_FIELD', field: f as ContactField, value: el.value });
    }
    for (const f of DELIVERY_FIELDS) {
      const el = getInput(f);
      if (el && el.value)
        dispatch({ type: 'SET_DELIVERY_FIELD', field: f as DeliveryField, value: el.value });
    }
    // fiasId — из атрибута на CheckoutDeliveryForm секции (выставлен при выборе DaData city)
    const dform = document.querySelector('[data-checkout-delivery-form]');
    const initFias = dform?.getAttribute('data-selected-city-fias-id') || '';
    if (initFias)
      dispatch({ type: 'SET_DELIVERY_FIELD', field: 'cityFiasId' as DeliveryField, value: initFias });

    // 2. Live sync — input/change events
    const listeners: Array<() => void> = [];

    const bindContact = (field: ContactField) => {
      const el = getInput(field);
      if (!el) return;
      const handler = () => dispatch({ type: 'SET_CONTACT_FIELD', field, value: el.value });
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
      listeners.push(() => {
        el.removeEventListener('input', handler);
        el.removeEventListener('change', handler);
      });
    };

    const bindDelivery = (field: DeliveryField) => {
      const el = getInput(field);
      if (!el) return;
      const handler = () => dispatch({ type: 'SET_DELIVERY_FIELD', field, value: el.value });
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
      listeners.push(() => {
        el.removeEventListener('input', handler);
        el.removeEventListener('change', handler);
      });
    };

    CONTACT_FIELDS.forEach(bindContact);
    DELIVERY_FIELDS.forEach(bindDelivery);

    // 3. address-changed — sync cityFiasId + postalCode из event detail
    const onAddressChanged = (e: Event) => {
      const ce = e as CustomEvent<{ cityFiasId?: string; postalCode?: string }>;
      const fias = ce.detail?.cityFiasId || '';
      const postal = ce.detail?.postalCode || '';
      if (fias) dispatch({ type: 'SET_DELIVERY_FIELD', field: 'cityFiasId' as DeliveryField, value: fias });
      if (postal) dispatch({ type: 'SET_DELIVERY_FIELD', field: 'postalCode' as DeliveryField, value: postal });
    };
    document.addEventListener('checkout:address-changed', onAddressChanged);
    listeners.push(() => document.removeEventListener('checkout:address-changed', onAddressChanged));

    // 4. delivery-changed — выбран способ доставки в CheckoutDeliveryMethod.
    // Astro shape отличается от React DeliveryMethodChoice — мапим:
    //   astro 'cdek_pickup' → react 'cdek_pvz'
    //   astro 'self_pickup' → react 'pickup'
    //   astro costCents → react priceCents
    //   astro customTariffId → react customId
    const onDeliveryChanged = (e: Event) => {
      const ce = e as CustomEvent<{
        type: string;
        tariffCode: number | null;
        customTariffId: string | null;
        costCents: number;
        periodMin: number | null;
        periodMax: number | null;
        label: string;
      }>;
      const d = ce.detail;
      if (!d) return;
      const mappedType: 'cdek_door' | 'cdek_pvz' | 'pickup' | 'custom' =
        d.type === 'cdek_pickup'
          ? 'cdek_pvz'
          : d.type === 'self_pickup'
            ? 'pickup'
            : d.type === 'cdek_door'
              ? 'cdek_door'
              : 'custom';
      const etaText =
        d.periodMin != null && d.periodMax != null ? `${d.periodMin}–${d.periodMax} дн` : undefined;
      dispatch({
        type: 'SET_DELIVERY_METHOD',
        method: {
          type: mappedType,
          label: d.label,
          priceCents: d.costCents,
          etaText,
          customId: d.customTariffId || undefined,
        },
      });
    };
    document.addEventListener('checkout:delivery-changed', onDeliveryChanged);
    listeners.push(() => document.removeEventListener('checkout:delivery-changed', onDeliveryChanged));

    return () => {
      for (const off of listeners) off();
    };
  }, [dispatch, preview]);
}
