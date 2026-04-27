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
                className={`flex items-center gap-3 px-3 py-3 border rounded-[var(--radius-input)] cursor-pointer ${
                  selected
                    ? 'border-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent)/.04)]'
                    : 'border-[rgb(var(--color-input-border))]'
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  checked={selected}
                  onChange={() => dispatch({ type: 'SET_PAYMENT_METHOD', method: m.key })}
                />
                <span className="flex-1 text-[length:var(--size-body)] text-[rgb(var(--color-text))]">{m.label}</span>
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
        <p className="mt-2 flex items-start gap-2 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
          <span aria-hidden>⚠</span>
          <span>{cardForm.warningText}</span>
        </p>
      )}
    </div>
  );
}

function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 py-2">
      <label className="text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]">{label}</label>
      {children}
    </div>
  );
}
