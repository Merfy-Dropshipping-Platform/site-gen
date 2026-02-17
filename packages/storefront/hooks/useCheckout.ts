import { useState, useCallback } from 'react';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useStoreConfig } from '../provider';
import type { CustomerInfo } from '../stores/customer';

export type CheckoutStep = 'customer' | 'shipping' | 'payment' | 'confirmation';

export interface ShippingInfo {
  method: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

export interface PaymentInfo {
  method: string;
  returnUrl?: string;
}

export interface CheckoutResult {
  orderId: string;
  paymentUrl?: string;
}

export interface UseCheckoutResult {
  step: CheckoutStep;
  setCustomer: UseMutationResult<unknown, Error, CustomerInfo>;
  setShipping: UseMutationResult<unknown, Error, ShippingInfo>;
  submitPayment: UseMutationResult<CheckoutResult, Error, PaymentInfo>;
  goToStep: (step: CheckoutStep) => void;
  isComplete: boolean;
}

/**
 * Step-based checkout flow.
 * Steps: customer -> shipping -> payment -> confirmation.
 * Each step is a mutation that advances to the next step on success.
 */
export const useCheckout = (cartId: string): UseCheckoutResult => {
  const { apiBase } = useStoreConfig();
  const [step, setStep] = useState<CheckoutStep>('customer');

  const setCustomer = useMutation({
    mutationFn: async (data: CustomerInfo) => {
      const res = await fetch(`${apiBase}/carts/${cartId}/customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to set customer info');
      return res.json();
    },
    onSuccess: () => setStep('shipping'),
  });

  const setShipping = useMutation({
    mutationFn: async (data: ShippingInfo) => {
      const res = await fetch(`${apiBase}/carts/${cartId}/shipping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to set shipping');
      return res.json();
    },
    onSuccess: () => setStep('payment'),
  });

  const submitPayment = useMutation({
    mutationFn: async (data: PaymentInfo): Promise<CheckoutResult> => {
      const res = await fetch(`${apiBase}/carts/${cartId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to submit payment');
      return res.json();
    },
    onSuccess: () => setStep('confirmation'),
  });

  const goToStep = useCallback((newStep: CheckoutStep) => {
    setStep(newStep);
  }, []);

  return {
    step,
    setCustomer,
    setShipping,
    submitPayment,
    goToStep,
    isComplete: step === 'confirmation',
  };
};
