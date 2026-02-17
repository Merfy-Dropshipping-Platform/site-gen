import { atom } from 'nanostores';

/**
 * Customer information for checkout.
 */
export interface CustomerInfo {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

/**
 * Customer atom. Holds current customer data during checkout flow.
 * Not persistent (resets on page reload) -- checkout is session-based.
 */
export const $customer = atom<CustomerInfo | null>(null);
