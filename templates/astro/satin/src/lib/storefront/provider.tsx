import React, { createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StoreConfig } from './types';

const StoreContext = createContext<StoreConfig>(null!);

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
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

interface StoreProviderProps {
  config: StoreConfig;
  children: React.ReactNode;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ config, children }) => (
  <StoreContext.Provider value={config}>
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  </StoreContext.Provider>
);
