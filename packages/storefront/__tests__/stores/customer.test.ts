import { describe, it, expect, beforeEach } from 'vitest';
import { $customer } from '../../stores/customer';
import type { CustomerInfo } from '../../stores/customer';

describe('Customer store (Nano Stores)', () => {
  beforeEach(() => {
    $customer.set(null);
  });

  // T034: $customer atom: set/get/reset works
  it('T034: $customer atom supports set, get, and reset', () => {
    // Initially null
    expect($customer.get()).toBeNull();

    // Set customer data
    const customerData: CustomerInfo = {
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+79991234567',
      address: {
        line1: 'Main St 1',
        city: 'Moscow',
        postalCode: '101000',
        country: 'RU',
      },
    };

    $customer.set(customerData);
    expect($customer.get()).toEqual(customerData);
    expect($customer.get()?.email).toBe('test@example.com');
    expect($customer.get()?.firstName).toBe('John');
    expect($customer.get()?.address?.city).toBe('Moscow');

    // Update partially by setting a new object
    const updatedCustomer: CustomerInfo = {
      ...$customer.get()!,
      phone: '+79999999999',
    };
    $customer.set(updatedCustomer);
    expect($customer.get()?.phone).toBe('+79999999999');
    expect($customer.get()?.email).toBe('test@example.com'); // unchanged

    // Reset to null
    $customer.set(null);
    expect($customer.get()).toBeNull();
  });
});
