import { atom, readable } from '../stores';
import type { AuthModule, CustomerState, SdkPart } from '../types';

// Вход покупательницы (design.md блока 5, раздел 3.12; каталог блока 10): до блока 10 на странице всегда гостья.
export const auth: SdkPart<'auth', AuthModule> = {
  name: 'auth',
  create: (): AuthModule => ({
    $customer: readable(atom<CustomerState>({ ready: true, customer: null })),
  }),
};
