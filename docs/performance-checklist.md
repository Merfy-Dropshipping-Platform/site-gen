# Performance Checklist

Best practices for Merfy storefront themes, audited against the Rose template.

## Implemented Optimizations

### 1. Astro SSG (Zero JS by Default)

- **Status**: PASS
- `astro.config.mjs` uses `output: 'static'` -- all pages pre-rendered to HTML at build time
- No client-side JavaScript shipped unless explicitly opted in via island directives
- Static components (Hero, Header, Footer, TextBlock, Collections, etc.) are pure Astro -- zero JS

### 2. React Islands (Selective Hydration)

- **Status**: PASS
- Critical interactive components use `client:load`: CartWidget, AddToCartButton, ProductGrid, ProductDetail, ProductFilter
- Non-critical components use `client:idle`: SearchBar
- Island architecture means React + TanStack Query only loaded for interactive sections

### 3. Image Lazy Loading

- **Status**: MOSTLY PASS (2 exceptions)
- All product images, gallery images, collection images, and content images have `loading="lazy"`
- Confirmed in: ProductCard.astro, ProductGrid.astro, Gallery.astro, GalleryProductCard.astro, GalleryCollection.astro, ImageWithText.astro, MultiColumns.astro, MultiRows.astro, Publications.astro, Video.astro, Product.astro, ProductDetail.astro
- React components also include `loading="lazy"`: ProductCard.tsx, CollectionList.tsx, ImageWithText.tsx
- **Missing**: Header logo (`Header.astro:48`) -- acceptable as above-the-fold content
- **Missing**: Product hero image (`pages/product/[id].astro:210`) -- should add `loading="lazy"` since product images below fold should be lazily loaded

### 4. Image Alt Text

- **Status**: PASS
- All `<img>` tags have meaningful alt text derived from product/collection titles
- No empty `alt=""` attributes found (only decorative images would need them)

### 5. CSS Optimization

- **Status**: PASS
- Tailwind CSS v4 with Vite plugin -- unused classes are purged at build time
- `tokens.css` is minimal (~50 lines) -- only CSS custom properties
- `global.css` includes only theme utilities, CSS reset, and typography -- no bloat
- No inline `<style>` blocks beyond Astro scoped styles

### 6. Font Loading

- **Status**: PASS
- Google Fonts loaded with `display=swap` to prevent FOIT (flash of invisible text)
- Font `preconnect` hints for `fonts.googleapis.com` and `fonts.gstatic.com`
- Rose theme: Comfortaa (headings) + Manrope (body) loaded as a single combined request

### 7. JavaScript Bundle

- **Status**: PASS
- TanStack Query (`@tanstack/react-query`) is the heaviest dependency -- only loaded inside React Islands
- Nano Stores (`nanostores` + `@nanostores/react` + `@nanostores/persistent`) are tiny (<3KB total)
- No global scripts except small inline `<script>` for mobile menu toggle

### 8. No Inline Scripts in Static Components

- **Status**: PASS (with caveat)
- Static Astro components contain no inline scripts
- Header.astro has a small inline `<script>` for mobile menu toggle -- this is appropriate as it needs to run on page load and is < 20 lines
- No third-party scripts injected

## Recommendations

### Should Fix

1. **Product page hero image** (`templates/astro/rose/src/pages/product/[id].astro:210`):
   Add `loading="lazy"` to the product image:
   ```html
   <img src={product.images[0]} alt={product.name} loading="lazy" />
   ```

### Nice to Have

2. **Preload critical fonts**: Consider adding `<link rel="preload">` for the heading font to reduce LCP
3. **Image dimensions**: Add explicit `width` and `height` to `<img>` tags to prevent CLS (Cumulative Layout Shift)
4. **Astro Image component**: Consider migrating to Astro's `<Image>` component for automatic format conversion (WebP/AVIF) and responsive srcset
5. **Service Worker**: For repeat visits, a simple cache-first service worker could serve static assets from cache

## Audit Summary

| Category | Status | Notes |
|----------|--------|-------|
| SSG (zero JS default) | PASS | `output: 'static'` in astro.config |
| React Islands | PASS | `client:load` for critical, `client:idle` for non-critical |
| Lazy loading | 95% | 1 product image missing `loading="lazy"` |
| Alt text | PASS | All images have meaningful alt text |
| CSS purging | PASS | Tailwind v4 + Vite plugin |
| Font loading | PASS | `display=swap` + preconnect hints |
| JS bundle | PASS | Only TanStack Query in islands |
| No inline scripts | PASS | Only mobile menu toggle in Header |
