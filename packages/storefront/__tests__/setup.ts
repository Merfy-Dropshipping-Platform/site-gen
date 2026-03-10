import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { $cartItems } from '../stores/cart';
import { $customer } from '../stores/customer';

afterEach(() => {
  // Clean up React testing library rendered components
  cleanup();

  // Reset nano stores between tests
  $cartItems.set([]);
  $customer.set(null);
});
