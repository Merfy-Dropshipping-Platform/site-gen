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
    <div className="flex flex-col gap-3">
      <div className="relative flex flex-col bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 py-2">
        <label className="text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]" htmlFor="email">
          {props.emailLabel}
        </label>
        <input
          className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={state.contact.email}
          onChange={(e) => dispatch({ type: 'SET_CONTACT_FIELD', field: 'email', value: e.target.value })}
        />
      </div>
      <div className="relative flex flex-col bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-3 py-2">
        <label className="text-[length:var(--size-tiny)] text-[rgb(var(--color-input-label))]" htmlFor="phone">
          {props.phoneLabel}
        </label>
        <input
          className="bg-transparent outline-none text-[length:var(--size-body)] text-[rgb(var(--color-text))]"
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder={props.phoneFormat === 'ru' ? '+7 (___) ___-__-__' : '+__ ___ ___ ____'}
          value={state.contact.phone}
          onChange={(e) => dispatch({ type: 'SET_CONTACT_FIELD', field: 'phone', value: e.target.value })}
        />
      </div>
    </div>
  );
}
