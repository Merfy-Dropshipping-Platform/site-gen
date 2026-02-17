import React, { createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StoreConfig } from './types';

const StoreContext = createContext<StoreConfig>(null!);

/**
 * Access the store configuration from within StoreProvider.
 */
export const useStoreConfig = (): StoreConfig => {
  const config = useContext(StoreContext);
  if (!config) {
    throw new Error('useStoreConfig must be used within a StoreProvider');
  }
  return config;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 min
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

interface StoreProviderProps {
  config: StoreConfig;
  children: React.ReactNode;
}

/**
 * StoreProvider wraps TanStack QueryClient and provides StoreConfig context.
 * Must be mounted at the top level of any storefront React Islands.
 */
export const StoreProvider: React.FC<StoreProviderProps> = ({ config, children }) => (
  <StoreContext.Provider value={config}>
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  </StoreContext.Provider>
);
