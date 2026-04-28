import { useEffect, useRef, useState } from 'react';
import { useCheckoutContext } from '../CheckoutContext';
import { FloatingField } from './ContactSection';
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
    <div className="flex flex-col gap-4">
      {props.country.enabled && (
        <FloatingField
          label="Страна/Регион"
          value={state.delivery.country}
          readOnly={!props.country.selectable}
          onChange={(v) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'country', value: v })}
          trailingIcon={SearchIcon}
        />
      )}
      {props.nameField.enabled &&
        (props.nameField.splitFirstLast ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingField
              label="Имя"
              autoComplete="given-name"
              value={state.delivery.firstName}
              onChange={(v) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'firstName', value: v })}
            />
            <FloatingField
              label="Фамилия"
              autoComplete="family-name"
              value={state.delivery.lastName}
              onChange={(v) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'lastName', value: v })}
            />
          </div>
        ) : (
          <FloatingField
            label="ФИО"
            autoComplete="name"
            value={state.delivery.fullName}
            onChange={(v) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'fullName', value: v })}
          />
        ))}
      <CityField enabled={props.cityDadata} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AddressField enabled={props.addressDadata} cityFiasId={state.delivery.cityFiasId} />
        <FloatingField
          label="Индекс"
          autoComplete="postal-code"
          value={state.delivery.postalCode}
          onChange={(v) => dispatch({ type: 'SET_DELIVERY_FIELD', field: 'postalCode', value: v })}
        />
      </div>
    </div>
  );
}

const SearchIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

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
      <FloatingField
        label="Город"
        autoComplete="address-level2"
        value={state.delivery.city}
        onChange={onChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        trailingIcon={enabled ? SearchIcon : undefined}
      />
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
      <FloatingField
        label="Полный адрес"
        autoComplete="street-address"
        value={state.delivery.address}
        onChange={onChange}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        trailingIcon={enabled ? SearchIcon : undefined}
      />
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
