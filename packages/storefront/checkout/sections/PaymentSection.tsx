import { useEffect, useState } from 'react';
import { useCheckoutContext, type PaymentMethodKey } from '../CheckoutContext';
import { useYooKassaSdk } from '../hooks/useYooKassa';

interface MethodCfg {
  key: PaymentMethodKey;
  enabled: boolean;
  label: string;
}

export interface PaymentSectionProps {
  methods: MethodCfg[];
  cardForm: { cvvHelpEnabled: boolean; nameOnCardEnabled: boolean; warningText: string };
  onCardChange: (card: { number: string; expiry: string; cvc: string; nameOnCard: string }) => void;
}

export function PaymentSection(props: PaymentSectionProps) {
  const { state, dispatch } = useCheckoutContext();
  const { ready, failed } = useYooKassaSdk();
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', nameOnCard: '' });

  useEffect(() => {
    if (!state.paymentMethod) {
      const first = props.methods.find((m) => m.enabled);
      if (first) dispatch({ type: 'SET_PAYMENT_METHOD', method: first.key });
    }
  }, [props.methods, state.paymentMethod, dispatch]);

  useEffect(() => {
    props.onCardChange(card);
  }, [card]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-2">
      {props.methods
        .filter((m) => m.enabled)
        .map((m) => {
          const selected = state.paymentMethod === m.key;
          return (
            <div key={m.key} className="flex flex-col">
              <label
                className={`flex items-center gap-3 px-4 py-4 border rounded-[var(--radius-input)] cursor-pointer transition-colors ${
                  selected
                    ? 'border-[rgb(var(--color-accent))]'
                    : 'border-[rgb(var(--color-input-border))] hover:border-[rgb(var(--color-text)/.4)]'
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  checked={selected}
                  onChange={() => dispatch({ type: 'SET_PAYMENT_METHOD', method: m.key })}
                  className="sr-only"
                />
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-[rgb(var(--color-accent))]' : 'border-[rgb(var(--color-input-border))]'
                  }`}
                >
                  {selected && (
                    <span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--color-accent))]" />
                  )}
                </span>
                <span className="flex-1 text-[length:var(--size-body)] text-[rgb(var(--color-text))]">{m.label}</span>
                <PaymentBrand methodKey={m.key} />
              </label>
              {m.key === 'bank_card' && selected && (
                <CardForm
                  card={card}
                  setCard={setCard}
                  cardForm={props.cardForm}
                  sdkReady={ready}
                  sdkFailed={failed}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

function PaymentBrand({ methodKey }: { methodKey: PaymentMethodKey }) {
  switch (methodKey) {
    case 'sbp':
      return (
        <span aria-hidden className="flex items-center gap-0.5 leading-none">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="0" y="0" width="9" height="9" fill="#5B57A2" />
            <rect x="13" y="0" width="9" height="9" fill="#1F9F4B" />
            <rect x="0" y="13" width="9" height="9" fill="#E5202E" />
            <rect x="13" y="13" width="9" height="9" fill="#F89C1C" />
          </svg>
        </span>
      );
    case 'sberbank':
      return (
        <span
          aria-hidden
          className="inline-flex items-center gap-1 rounded-full bg-[#21A038] px-2.5 py-1 text-[11px] font-semibold text-white"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="1.6" />
            <path d="M11.5 5.5l-4 4-2-2" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Pay
        </span>
      );
    case 'tinkoff_bank':
      return (
        <span
          aria-hidden
          className="inline-flex items-center rounded-full bg-black px-2.5 py-1 text-[11px] font-semibold tracking-wider text-white"
        >
          <span className="mr-1 inline-flex h-3 w-3 items-center justify-center rounded-sm bg-[#FFDD2D] text-[8px] font-bold text-black">
            T
          </span>
          PAY
        </span>
      );
    default:
      return null;
  }
}

function CardForm({
  card,
  setCard,
  cardForm,
  sdkReady,
  sdkFailed,
}: {
  card: { number: string; expiry: string; cvc: string; nameOnCard: string };
  setCard: React.Dispatch<React.SetStateAction<{ number: string; expiry: string; cvc: string; nameOnCard: string }>>;
  cardForm: { cvvHelpEnabled: boolean; nameOnCardEnabled: boolean; warningText: string };
  sdkReady: boolean;
  sdkFailed: boolean;
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2">
      {sdkFailed && (
        <p className="text-[length:var(--size-small)] text-[rgb(var(--color-error))]">
          Не удалось загрузить платёжный модуль. Обновите страницу.
        </p>
      )}
      {!sdkReady && !sdkFailed && (
        <p className="text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">Загрузка платёжного модуля…</p>
      )}
      <CardField label="Номер карты">
        <input
          className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={card.number}
          onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
        />
      </CardField>
      <div className="grid grid-cols-2 gap-2">
        <CardField label="Срок действия">
          <input
            className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={card.expiry}
            onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))}
          />
        </CardField>
        <CardField label="CVV">
          <input
            className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="•••"
            value={card.cvc}
            onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value }))}
          />
        </CardField>
      </div>
      {cardForm.nameOnCardEnabled && (
        <CardField label="Имя на карте">
          <input
            className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
            autoComplete="cc-name"
            placeholder="IVAN IVANOV"
            value={card.nameOnCard}
            onChange={(e) => setCard((c) => ({ ...c, nameOnCard: e.target.value }))}
          />
        </CardField>
      )}
      {cardForm.warningText && (
        <p className="mt-1 flex items-center gap-2 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="flex-shrink-0">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 7v4M8 5v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>{cardForm.warningText}</span>
        </p>
      )}
    </div>
  );
}

function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col justify-center bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 h-14">
      <label className="text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]">{label}</label>
      {children}
    </div>
  );
}
