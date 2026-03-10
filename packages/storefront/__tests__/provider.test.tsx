import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { StoreProvider, useStoreConfig } from '../provider';
import type { StoreConfig } from '../types';

const defaultConfig: StoreConfig = {
  apiBase: 'https://api.test.com',
  storeId: 'store-test-1',
  currency: 'RUB',
  locale: 'ru-RU',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <StoreProvider config={defaultConfig}>{children}</StoreProvider>;
}

describe('StoreProvider + useStoreConfig', () => {
  // T012: useStoreConfig returns config {apiBase, storeId, currency, locale}
  it('T012: useStoreConfig returns config with apiBase, storeId, currency, locale', () => {
    const { result } = renderHook(() => useStoreConfig(), { wrapper });

    expect(result.current).toEqual({
      apiBase: 'https://api.test.com',
      storeId: 'store-test-1',
      currency: 'RUB',
      locale: 'ru-RU',
    });
    expect(result.current.apiBase).toBe('https://api.test.com');
    expect(result.current.storeId).toBe('store-test-1');
    expect(result.current.currency).toBe('RUB');
    expect(result.current.locale).toBe('ru-RU');
  });

  // T013: useStoreConfig outside StoreProvider throws error
  it('T013: useStoreConfig outside StoreProvider throws error', () => {
    // renderHook without wrapper should throw because context is null
    expect(() => {
      const { result } = renderHook(() => useStoreConfig());
      // Access result to trigger the hook
      void result.current;
    }).toThrow('useStoreConfig must be used within a StoreProvider');
  });

  // T014: TanStack QueryClient defaults: staleTime=5min, retry=2, refetchOnWindowFocus=false
  it('T014: QueryClient defaults: staleTime=5min, retry=2, refetchOnWindowFocus=false', async () => {
    // We test this by importing the QueryClient from provider and checking its defaults.
    // Since the QueryClient is module-level in provider.tsx, we verify indirectly
    // by importing and checking the defaults on the QueryClient instance.

    // The provider exports are: StoreProvider, useStoreConfig
    // The QueryClient is internal, so we test via its effect on queries.
    // We import the module and introspect the queryClient's defaultOptions.
    const providerModule = await import('../provider');

    // The queryClient is not exported, so we test by rendering a query and checking defaults.
    // Alternative approach: We know the QueryClient is created at module scope.
    // Let's verify via QueryClientProvider being rendered with the correct defaults.

    // We use a test hook that accesses the QueryClient from context
    const { QueryClient } = await import('@tanstack/react-query');

    // Create a fresh wrapper to capture the queryClient
    let capturedClient: InstanceType<typeof QueryClient> | null = null;

    const { useQueryClient } = await import('@tanstack/react-query');

    const { result } = renderHook(
      () => {
        const client = useQueryClient();
        return client;
      },
      { wrapper },
    );

    capturedClient = result.current;
    expect(capturedClient).toBeDefined();

    const defaults = capturedClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(300000); // 5 * 60 * 1000
    expect(defaults.queries?.retry).toBe(2);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
  });
});
