import { useCheckoutContext } from '../CheckoutContext';

export interface ContactSectionProps {
  emailLabel: string;
  phoneLabel: string;
  phoneFormat: 'ru' | 'intl';
  showAuthLink: boolean;
  authLinkText: string;
  authLinkHref: string;
}

export function ContactSection(props: ContactSectionProps) {
  const { state, dispatch } = useCheckoutContext();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FloatingField
        id="email"
        label={props.emailLabel}
        type="email"
        autoComplete="email"
        value={state.contact.email}
        onChange={(v) => dispatch({ type: 'SET_CONTACT_FIELD', field: 'email', value: v })}
      />
      <FloatingField
        id="phone"
        label={props.phoneLabel}
        type="tel"
        autoComplete="tel"
        value={state.contact.phone}
        onChange={(v) => dispatch({ type: 'SET_CONTACT_FIELD', field: 'phone', value: v })}
      />
    </div>
  );
}

// Per Figma — when input is empty, label centered acts as placeholder; when focused or filled, label collapses to top-left at tiny size, value below at body size.
export function FloatingField({
  id,
  label,
  type = 'text',
  autoComplete,
  value,
  onChange,
  readOnly,
  trailingIcon,
  onFocus,
  onBlur,
}: {
  id?: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
  trailingIcon?: React.ReactNode;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="relative h-14 bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3">
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        readOnly={readOnly}
        placeholder=" "
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`peer absolute inset-0 w-full h-full bg-transparent outline-none px-3 pt-5 pb-1 text-[length:var(--size-small)] text-[rgb(var(--color-text))] placeholder-transparent ${trailingIcon ? 'pr-9' : ''}`}
      />
      <label
        htmlFor={id}
        className="absolute left-3 top-1.5 text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))] transition-all pointer-events-none
                   peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-[length:var(--size-body)]
                   peer-focus:top-1.5 peer-focus:-translate-y-0 peer-focus:text-[length:var(--size-tiny)]"
      >
        {label}
      </label>
      {trailingIcon && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--color-input-placeholder))] pointer-events-none">
          {trailingIcon}
        </span>
      )}
    </div>
  );
}
