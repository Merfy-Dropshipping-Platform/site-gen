// Types
export type {
  Money,
  Image,
  SEO,
  Variant,
  Product,
  CartItem,
  Collection,
  FacetOption,
  Facet,
  PaginatedResponse,
  StoreConfig,
} from './types';

// Provider
export { StoreProvider, useStoreConfig } from './provider';

// Hooks
export {
  useProducts,
  useProduct,
  useSearch,
  useCart,
  useCheckout,
  useAvailability,
} from './hooks/index';

export type {
  UseProductsOptions,
  UseProductsResult,
  SortOption,
  UseSearchOptions,
  UseSearchResult,
  UseCartResult,
  CheckoutStep,
  UseCheckoutResult,
  ShippingInfo,
  PaymentInfo,
  CheckoutResult,
  AvailabilityResult,
} from './hooks/index';

// Stores
export {
  $cartItems,
  $cartCount,
  $cartTotal,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  $customer,
} from './stores/index';

export type { CustomerInfo } from './stores/index';

// Lib
export { storeFetch, StoreFetchError } from './lib/fetcher';
export { useDebouncedValue } from './lib/useDebouncedValue';
