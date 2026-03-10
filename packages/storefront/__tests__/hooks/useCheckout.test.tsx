import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from '../../provider';
import { useCheckout } from '../../hooks/useCheckout';
import type { StoreConfig } from '../../types';
import type { CustomerInfo } from '../../stores/customer';

const testConfig: StoreConfig = {
  apiBase: 'https://api.test.com',
  storeId: 'store-checkout-1',
  currency: 'RUB',
  locale: 'ru-RU',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <StoreProvider config={testConfig}>
          {children}
        </StoreProvider>
      </QueryClientProvider>
    );
  };
}

describe('useCheckout (US4)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // T045: initial step = "customer" with cartId = "cart-123"
  it('T045: initial step is "customer" and isComplete is false', () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCheckout('cart-123'), { wrapper });

    expect(result.current.step).toBe('customer');
    expect(result.current.isComplete).toBe(false);
    expect(result.current.setCustomer).toBeDefined();
    expect(result.current.setShipping).toBeDefined();
    expect(result.current.submitPayment).toBeDefined();
    expect(result.current.goToStep).toBeDefined();
  });

  // T046: setCustomer.mutate success -> step moves to "shipping"
  it('T046: setCustomer.mutate on success advances step to "shipping"', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCheckout('cart-123'), { wrapper });

    const customerData: CustomerInfo = {
      email: 'test@example.com',
      firstName: 'Ivan',
      lastName: 'Petrov',
      phone: '+79991234567',
    };

    await act(async () => {
      result.current.setCustomer.mutate(customerData);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('shipping');
    });

    // Verify the POST was made to correct URL
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.com/carts/cart-123/customer',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  // T047: setShipping.mutate success -> step moves to "payment"
  it('T047: setShipping.mutate on success advances step to "payment"', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCheckout('cart-123'), { wrapper });

    // First advance to shipping step
    await act(async () => {
      result.current.setCustomer.mutate({
        email: 'test@example.com',
        firstName: 'Ivan',
      });
    });

    await waitFor(() => {
      expect(result.current.step).toBe('shipping');
    });

    // Now set shipping
    await act(async () => {
      result.current.setShipping.mutate({
        method: 'courier',
        address: {
          line1: 'ul. Pushkina, 10',
          city: 'Moskva',
          postalCode: '101000',
          country: 'RU',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.step).toBe('payment');
    });

    // Verify POST to shipping endpoint
    const shippingCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(shippingCall[0]).toBe('https://api.test.com/carts/cart-123/shipping');
  });

  // T048: submitPayment.mutate success -> step "confirmation", isComplete=true, returns {orderId, paymentUrl?}
  it('T048: submitPayment.mutate on success sets step to "confirmation" with isComplete=true and returns orderId/paymentUrl', async () => {
    // Mock the checkout response specifically
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          orderId: 'order-abc-123',
          paymentUrl: 'https://yookassa.ru/checkout/test',
        }),
      });

    const wrapper = createWrapper();
    const { result } = renderHook(() => useCheckout('cart-123'), { wrapper });

    // Step 1: customer
    await act(async () => {
      result.current.setCustomer.mutate({ email: 'test@example.com' });
    });
    await waitFor(() => expect(result.current.step).toBe('shipping'));

    // Step 2: shipping
    await act(async () => {
      result.current.setShipping.mutate({
        method: 'pickup',
        address: { line1: 'Store', city: 'Moscow', postalCode: '101000', country: 'RU' },
      });
    });
    await waitFor(() => expect(result.current.step).toBe('payment'));

    // Step 3: payment
    await act(async () => {
      result.current.submitPayment.mutate({
        method: 'yookassa',
        returnUrl: 'https://myshop.ru/success',
      });
    });

    await waitFor(() => {
      expect(result.current.step).toBe('confirmation');
    });

    expect(result.current.isComplete).toBe(true);

    // Verify the checkout response data
    expect(result.current.submitPayment.data).toEqual({
      orderId: 'order-abc-123',
      paymentUrl: 'https://yookassa.ru/checkout/test',
    });

    // Verify POST to checkout endpoint
    const checkoutCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(checkoutCall[0]).toBe('https://api.test.com/carts/cart-123/checkout');
  });

  // T049: goToStep("customer") from "payment": navigate back
  it('T049: goToStep("customer") navigates back from any step', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useCheckout('cart-123'), { wrapper });

    // Advance to shipping
    await act(async () => {
      result.current.setCustomer.mutate({ email: 'test@example.com' });
    });
    await waitFor(() => expect(result.current.step).toBe('shipping'));

    // Advance to payment
    await act(async () => {
      result.current.setShipping.mutate({
        method: 'courier',
        address: { line1: 'Addr', city: 'City', postalCode: '000', country: 'RU' },
      });
    });
    await waitFor(() => expect(result.current.step).toBe('payment'));

    // Go back to customer
    act(() => {
      result.current.goToStep('customer');
    });

    expect(result.current.step).toBe('customer');
    expect(result.current.isComplete).toBe(false);
  });
});
