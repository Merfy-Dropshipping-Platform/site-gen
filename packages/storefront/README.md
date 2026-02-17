# @merfy/storefront

React hooks SDK and Nano Stores for Merfy storefront themes. Provides data fetching (TanStack Query), cart state management (Nano Stores with localStorage persistence), and checkout flow.

## Installation

```bash
pnpm add @merfy/storefront
```

Peer dependencies: `react >=18`, `react-dom >=18`.

## Setup

Wrap your React Island root with `StoreProvider`:

```tsx
import { StoreProvider } from "@merfy/storefront";

<StoreProvider config={{
  apiBase: "https://api.merfy.ru/store",
  storeId: "shop_abc123",
  currency: "RUB",
  locale: "ru-RU",
}}>
  <App />
</StoreProvider>
```

## Hooks

| Hook | Params | Returns | Description |
|------|--------|---------|-------------|
| `useProducts` | `{ collectionId?, sort?, limit?, filters? }` | `UseProductsResult` | Paginated product list with filtering and sorting |
| `useProduct` | `handle: string` | TanStack Query result with `Product` | Single product by slug |
| `useSearch` | `{ debounce?, limit?, minLength? }` | `UseSearchResult` | Debounced product search (300ms default) |
| `useCart` | none | `UseCartResult` | Cart operations wrapping Nano Stores |
| `useCheckout` | `cartId: string` | `UseCheckoutResult` | Step-based checkout: customer -> shipping -> payment -> confirmation |
| `useAvailability` | `variantId: string` | TanStack Query result with `AvailabilityResult` | Near-realtime stock check (30s stale, 60s refetch) |

### useProducts

```tsx
const { data, total, isLoading, page, setPage, hasNextPage, setFilter, clearFilters } = useProducts({
  collectionId: "col_summer",
  sort: "price_asc",  // price_asc | price_desc | newest | popular
  limit: 24,
});
```

Filter changes automatically reset pagination to page 1.

### useSearch

```tsx
const { query, setQuery, results, isOpen, setIsOpen, isLoading, hasResults } = useSearch({
  debounce: 300,
  limit: 6,
  minLength: 2,
});
```

### useCart

```tsx
const { items, count, total, addItem, removeItem, updateQuantity, clear, syncToServer } = useCart();

addItem({ variantId: "var_1_m", title: "T-Shirt M", price: 299000, image: "/img.jpg" });
updateQuantity("var_1_m", 3);
const { cartId } = await syncToServer(); // creates server-side cart for checkout
```

### useCheckout

```tsx
const { step, setCustomer, setShipping, submitPayment, goToStep, isComplete } = useCheckout(cartId);

// Each step is a TanStack mutation that auto-advances on success
setCustomer.mutate({ email: "user@example.com", firstName: "Ivan" });
setShipping.mutate({ method: "courier", address: { line1: "...", city: "Moscow", postalCode: "101000", country: "RU" } });
submitPayment.mutate({ method: "yookassa", returnUrl: "/checkout/result" });
// -> { orderId, paymentUrl }
```

## Nano Stores

Shared state across React Islands via Nano Stores. Cart persists in localStorage under key `merfy-cart`.

| Store | Type | Description |
|-------|------|-------------|
| `$cartItems` | `persistentAtom<CartItem[]>` | Cart items array (survives page reloads) |
| `$cartCount` | `computed` | Total item count (sum of quantities) |
| `$cartTotal` | `computed` | Total price in minor units (price * quantity) |
| `$customer` | `atom<CustomerInfo \| null>` | Customer data during checkout (session-only) |

### Direct store manipulation

```ts
import { addToCart, removeFromCart, updateQuantity, clearCart } from "@merfy/storefront";

addToCart({ variantId: "v1", title: "Shirt", price: 299000, image: "/img.jpg" });
removeFromCart("v1");
updateQuantity("v1", 3);
clearCart();
```

## Types

Key interfaces exported from `@merfy/storefront/types`:

- `Product` -- id, handle, title, price, images, variants, tags
- `Variant` -- id, title, price, available, options
- `CartItem` -- variantId, title, price, quantity, image
- `Collection` -- id, handle, title, image, productCount
- `StoreConfig` -- apiBase, storeId, currency, locale
- `PaginatedResponse<T>` -- data, total, page, limit, hasMore

## Fetch Client

`storeFetch<T>(apiBase, storeId, path, options?)` -- adds `X-Store-Id` header, handles JSON parsing and errors. Throws `StoreFetchError` with status/body on non-OK responses.

## Testing

```tsx
import { MockStoreProvider, mockProducts, mockCollections } from "@merfy/storefront/testing";

<MockStoreProvider products={mockProducts} collections={mockCollections}>
  <ComponentUnderTest />
</MockStoreProvider>
```

Mock data includes 52 products with Russian names and RUB prices, and 5 collections. The MockStoreProvider intercepts fetch calls and returns mock data.
