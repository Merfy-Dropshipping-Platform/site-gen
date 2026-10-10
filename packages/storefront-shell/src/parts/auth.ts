import { createPartStore } from './store';
import type { AuthPart, AuthState } from './types';

// Вход — шов: покупатель всегда гость. Вход по коду из письма и токен — договор SDK (раздел 8 design.md, п. 3).
export function createAuth(): AuthPart {
  const store = createPartStore<AuthState>({ signedIn: false });
  return { get: store.get, subscribe: store.subscribe };
}

export const part = createAuth();
