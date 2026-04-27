import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckoutProvider, type CheckoutCartItem } from './CheckoutContext';
import { useCheckoutCart } from './hooks/useCheckoutCart';
import { ContactSection, type ContactSectionProps } from './sections/ContactSection';
import { DeliverySection, type DeliverySectionProps } from './sections/DeliverySection';
import { DeliveryMethodSection, type DeliveryMethodSectionProps } from './sections/DeliveryMethodSection';
import { PaymentSection, type PaymentSectionProps } from './sections/PaymentSection';
import { OrderSummarySection, type OrderSummarySectionProps } from './sections/OrderSummarySection';
import { TotalsSection, type TotalsSectionProps } from './sections/TotalsSection';
import { SubmitSection, type SubmitSectionProps } from './sections/SubmitSection';
import { SummaryToggleSection, type SummaryToggleSectionProps } from './sections/SummaryToggleSection';

export interface CheckoutFlowProps {
  apiBase: string;
  shopId: string;
  preview?: boolean;
  initialCartId?: string | null;
  initialItems?: CheckoutCartItem[];
}

interface SlotMount {
  el: HTMLElement;
  slot: string;
  props: Record<string, unknown>;
}

const HYDRATABLE_SLOTS = new Set([
  'summary-toggle',
  'contact',
  'delivery',
  'delivery-method',
  'payment',
  'order-summary',
  'totals',
  'submit',
]);

function readSlots(): SlotMount[] {
  if (typeof document === 'undefined') return [];
  const nodes = document.querySelectorAll<HTMLElement>('[data-checkout-slot]');
  const slots: SlotMount[] = [];
  nodes.forEach((el) => {
    const slot = el.dataset.checkoutSlot ?? '';
    if (!HYDRATABLE_SLOTS.has(slot)) return; // skip header/layout/terms — pure SSR
    const propsRaw = el.dataset.checkoutProps;
    let props: Record<string, unknown> = {};
    if (propsRaw) {
      try {
        props = JSON.parse(propsRaw) as Record<string, unknown>;
      } catch {
        props = {};
      }
    }
    slots.push({ el, slot, props });
  });
  return slots;
}

export function CheckoutFlow(rootProps: CheckoutFlowProps) {
  return (
    <CheckoutProvider
      apiBase={rootProps.apiBase}
      shopId={rootProps.shopId}
      preview={rootProps.preview ?? false}
      initialCartId={rootProps.initialCartId ?? null}
      initialItems={rootProps.initialItems ?? []}
    >
      <CheckoutFlowInner />
    </CheckoutProvider>
  );
}

function CheckoutFlowInner() {
  useCheckoutCart();
  const slots = useMemo(() => readSlots(), []);
  const cardRef = useRef({ number: '', expiry: '', cvc: '', nameOnCard: '' });

  // Replace inner placeholders content with React via portals.
  // Each slot keeps its outer Astro wrapper (preserves Puck data-* attributes + CSS).
  return (
    <>
      {slots.map(({ el, slot, props }, i) => {
        const target = ensureMountTarget(el);
        switch (slot) {
          case 'summary-toggle':
            return createPortal(<SummaryToggleSection {...(props as unknown as SummaryToggleSectionProps)} />, target, `s-${i}`);
          case 'contact':
            return createPortal(<ContactSection {...(props as unknown as ContactSectionProps)} />, target, `s-${i}`);
          case 'delivery':
            return createPortal(<DeliverySection {...(props as unknown as DeliverySectionProps)} />, target, `s-${i}`);
          case 'delivery-method':
            return createPortal(<DeliveryMethodSection {...(props as unknown as DeliveryMethodSectionProps)} />, target, `s-${i}`);
          case 'payment': {
            const p = props as unknown as Omit<PaymentSectionProps, 'onCardChange'>;
            return createPortal(
              <PaymentSection
                {...p}
                onCardChange={(c) => {
                  cardRef.current = c;
                }}
              />,
              target,
              `s-${i}`,
            );
          }
          case 'order-summary':
            return createPortal(<OrderSummarySection {...(props as unknown as OrderSummarySectionProps)} />, target, `s-${i}`);
          case 'totals':
            return createPortal(<TotalsSection {...(props as unknown as TotalsSectionProps)} />, target, `s-${i}`);
          case 'submit': {
            const p = props as unknown as Omit<SubmitSectionProps, 'cardRef'>;
            return createPortal(<SubmitSection {...p} cardRef={cardRef} />, target, `s-${i}`);
          }
          default:
            return null;
        }
      })}
    </>
  );
}

/**
 * Each Astro block emits a placeholder DIV with data-checkout-slot. Inside the DIV
 * there's already SSR HTML (skeleton); we don't want to replace the whole content
 * abruptly. Instead, attach a sibling mount-point inside it and clear SSR children
 * before mount — preserves outer wrapper for Puck click-to-edit + Tailwind classes.
 */
function ensureMountTarget(el: HTMLElement): HTMLElement {
  const existing = el.querySelector<HTMLElement>(':scope > [data-checkout-mount]');
  if (existing) return existing;
  const mount = document.createElement('div');
  mount.setAttribute('data-checkout-mount', '');
  mount.style.display = 'contents';
  // Clear SSR placeholders inside before swap
  while (el.firstChild) el.removeChild(el.firstChild);
  el.appendChild(mount);
  return mount;
}

/** Convenience entry for inline-script mount on live pages. */
export function mountCheckoutFlow(target: HTMLElement, props: CheckoutFlowProps): void {
  if (typeof window === 'undefined') return;
  void import('react-dom/client').then(({ createRoot }) => {
    const root = createRoot(target);
    root.render(<CheckoutFlow {...props} />);
  });
}
