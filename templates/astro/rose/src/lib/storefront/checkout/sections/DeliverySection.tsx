import { useEffect, useRef, useState } from 'react';
import { useCheckoutContext } from '../CheckoutContext';
import { useDadata, type DadataSuggestion } from '../hooks/useDaData';

export interface DeliverySectionProps {
  country: { enabled: boolean; default: string; selectable: boolean };
  nameField: { enabled: boolean; splitFirstLast: boolean };
  cityDadata: boolean;
  addressDadata: boolean;
  indexAutoFill: boolean;
}

export function DeliverySection(props: DeliverySectionProps) {
  const { state, dispatch } = useCheckoutContext();

  // Init country default
  useEffect(() => {
    if (!state.delivery.country) {
      dispatch({ type: 'SET_DELIVERY_FIELD', field: 'country', value: props.country.default });
    }
  }, [props.country.default]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      {props.country.enabled && (
        <Field label="Страна/Регион">
          <input
            className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
            value={state.delivery.country}
            readOnly={!props.country.selectable}
            onChange={(e) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'country', value: e.target.value })}
          />
        </Field>
      )}
      {props.nameField.enabled &&
        (props.nameField.splitFirstLast ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Имя">
              <input
                className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
                value={state.delivery.firstName}
                onChange={(e) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'firstName', value: e.target.value })}
              />
            </Field>
            <Field label="Фамилия">
              <input
                className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
                value={state.delivery.lastName}
                onChange={(e) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'lastName', value: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <Field label="ФИО">
            <input
              className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
              value={state.delivery.fullName}
              onChange={(e) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'fullName', value: e.target.value })}
            />
          </Field>
        ))}
      <CityField enabled={props.cityDadata} />
      <AddressField enabled={props.addressDadata} cityFiasId={state.delivery.cityFiasId} />
      <Field label="Индекс">
        <input
          className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
          value={state.delivery.postalCode}
          onChange={(e) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'postalCode', value: e.target.value })}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 py-2">
      <label className="text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]">{label}</label>
      {children}
    </div>
  );
}

function CityField({ enabled }: { enabled: boolean }) {
  const { state, dispatch } = useCheckoutContext();
  const { suggestions, suggest, clear } = useDadata();
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (val: string) => {
    dispatch({ type: 'SET_DELIVERY_FIELD', field: 'city', value: val });
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void suggest('city', val);
      setOpen(true);
    }, 300);
  };

  const pick = (s: DadataSuggestion) => {
    dispatch({ type: 'SET_DELIVERY_FIELD', field: 'city', value: s.value });
    if (s.data.fias_id) dispatch({ type: 'SET_DELIVERY_FIELD', field: 'cityFiasId', value: s.data.fias_id });
    if (s.data.postal_code) dispatch({ type: 'SET_DELIVERY_FIELD', field: 'postalCode', value: s.data.postal_code });
    setOpen(false);
    clear();
  };

  return (
    <div className="relative">
      <Field label="Город">
        <input
          className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
          value={state.delivery.city}
          autoComplete="address-level2"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
      </Field>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] max-h-60 overflow-auto">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="px-3 py-2 cursor-pointer hover:bg-[rgb(var(--color-input-bg))] text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
              onMouseDown={() => pick(s)}
            >
              {s.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddressField({ enabled, cityFiasId }: { enabled: boolean; cityFiasId?: string }) {
  const { state, dispatch } = useCheckoutContext();
  const { suggestions, suggest, clear } = useDadata();
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (val: string) => {
    dispatch({ type: 'SET_DELIVERY_FIELD', field: 'address', value: val });
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void suggest('address', val, { city: state.delivery.city });
      setOpen(true);
    }, 300);
  };

  const pick = (s: DadataSuggestion) => {
    dispatch({ type: 'SET_DELIVERY_FIELD', field: 'address', value: s.value });
    if (s.data.postal_code) dispatch({ type: 'SET_DELIVERY_FIELD', field: 'postalCode', value: s.data.postal_code });
    setOpen(false);
    clear();
  };

  return (
    <div className="relative">
      <Field label="Полный адрес">
        <input
          className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
          value={state.delivery.address}
          autoComplete="street-address"
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
      </Field>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-[rgb(var(--color-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] max-h-60 overflow-auto">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="px-3 py-2 cursor-pointer hover:bg-[rgb(var(--color-input-bg))] text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
              onMouseDown={() => pick(s)}
            >
              {s.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
