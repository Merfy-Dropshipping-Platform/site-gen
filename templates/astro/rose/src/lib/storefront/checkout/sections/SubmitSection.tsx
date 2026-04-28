import { useCheckoutContext, computeTotals, formatRub } from '../CheckoutContext';
import { useTokenizeCard } from '../hooks/useYooKassa';

export interface SubmitSectionProps {
  buttonText: string;
  buttonStyle: 'fill' | 'outline' | 'gradient';
  loadingText: string;
  successRedirectUrl: string;
  cardRef: React.MutableRefObject<{ number: string; expiry: string; cvc: string; nameOnCard: string }>;
}

export function SubmitSection(props: SubmitSectionProps) {
  const { state, dispatch, apiBase, preview } = useCheckoutContext();
  const { tokenize } = useTokenizeCard();
  const totals = computeTotals(state);

  const cls =
    props.buttonStyle === 'outline'
      ? 'w-full h-14 bg-transparent text-[rgb(var(--color-accent))] border-2 border-[rgb(var(--color-accent))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] disabled:opacity-50'
      : props.buttonStyle === 'gradient'
        ? 'w-full h-14 bg-gradient-to-r from-[rgb(var(--color-accent))] to-[rgb(var(--color-accent-2))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] disabled:opacity-50'
        : 'w-full h-14 bg-[rgb(var(--color-accent))] text-[rgb(var(--color-accent-fg))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] disabled:opacity-50';

  const text = state.submitting ? props.loadingText : props.buttonText.replace('{total}', formatRub(totals.totalCents));

  const canSubmit =
    !state.submitting &&
    !state.loading &&
    state.items.length > 0 &&
    state.contact.email &&
    state.contact.phone &&
    state.delivery.city &&
    state.delivery.address &&
    state.deliveryMethod &&
    state.paymentMethod;

  const onSubmit = async () => {
    if (preview) {
      window.parent?.postMessage({ type: 'merfy:checkout-preview-submit-blocked' }, '*');
      return;
    }
    if (!canSubmit) {
      dispatch({ type: 'SET_ERROR', error: 'Заполните все обязательные поля' });
      return;
    }
    dispatch({ type: 'SET_SUBMITTING', submitting: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      let paymentToken: string | undefined;
      if (state.paymentMethod === 'bank_card') {
        paymentToken = await tokenize(props.cardRef.current);
      }

      // Step 1 — convert cart → order (creates pending order with all checkout info)
      const checkoutRes = await fetch(`${apiBase}/orders/cart/${state.cartId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          metadata: {
            paymentMethod: state.paymentMethod,
            deliveryAddress: state.delivery,
            deliveryMethod: state.deliveryMethod,
            contactEmail: state.contact.email,
            contactPhone: state.contact.phone,
            customerName:
              state.delivery.fullName || `${state.delivery.firstName} ${state.delivery.lastName}`,
            promoCode: state.promoCode || undefined,
          },
        }),
      });
      const checkoutJson = await checkoutRes.json();
      const orderId: string | undefined = checkoutJson?.data?.orderId ?? checkoutJson?.data?.id;
      if (!checkoutRes.ok || !orderId) {
        throw new Error(checkoutJson?.error?.message ?? checkoutJson?.message ?? 'Не удалось создать заказ');
      }

      // Step 2 — create payment for the order (with optional Tokenization SDK token)
      const paymentRes = await fetch(`${apiBase}/orders/${orderId}/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          returnUrl: `${window.location.origin}${props.successRedirectUrl}?orderId=${orderId}`,
          ...(paymentToken ? { paymentToken } : {}),
        }),
      });
      const paymentJson = await paymentRes.json();
      const confirmationUrl: string | undefined = paymentJson?.data?.confirmationUrl;
      if (!paymentRes.ok || !confirmationUrl) {
        throw new Error(paymentJson?.error?.message ?? paymentJson?.message ?? 'Ошибка платежа');
      }

      // Save orderId for return-url page
      try {
        localStorage.setItem('merfy:lastOrderId', orderId);
        localStorage.removeItem('merfy:cartId');
      } catch {
        /* no-op */
      }
      window.location.href = confirmationUrl;
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e instanceof Error ? e.message : 'Ошибка оформления заказа' });
      dispatch({ type: 'SET_SUBMITTING', submitting: false });
    }
  };

  return (
    <div className="w-full flex flex-col gap-2">
      {state.error && (
        <p className="text-[length:var(--size-small)] text-[rgb(var(--color-error))]" role="alert">
          {state.error}
        </p>
      )}
      <button type="button" className={cls} disabled={!canSubmit} onClick={onSubmit}>
        {text}
      </button>
    </div>
  );
}
