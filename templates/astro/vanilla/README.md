# Rose Theme

Elegant fashion and lifestyle theme for Merfy storefronts. Uses Comfortaa (headings) + Manrope (body) fonts with a rose-pink accent palette.

## Features

- Variants, collections, color swatches, filter sidebar, newsletter
- 4 page templates: index, product, collection, cart
- 2 color schemes: Light + Dark accent
- Responsive (mobile-first with breakpoints up to 2xl)

## Components

### Layout
- `Header.astro` -- Sticky header with logo, navigation, search/cart/profile icons, mobile hamburger menu with submenus
- `Footer.astro` -- Newsletter form, 3-column footer (navigation, information, social), copyright bar

### Sections (Astro SSG)
- `Hero.astro` -- Full-width hero with background image, overlay, heading, CTA buttons, configurable position/size
- `PopularProducts.astro` -- Product grid with section header, pulls from data/products.json
- `Collections.astro` -- Collection card grid with section header
- `ImageWithText.astro` -- Two-column layout with image + text, configurable photo position
- `TextBlock.astro` -- Rich text section with heading, body, optional CTA button
- `Gallery.astro` -- Image gallery with collection grouping
- `Newsletter.astro` -- Email subscription form (via Footer)
- `Video.astro` -- Video embed with cover image
- `Publications.astro` -- Blog/article cards
- `MultiColumns.astro` / `MultiRows.astro` -- Flexible multi-column/row content
- `PromoBanner.astro` -- Promotional banner section
- `Slideshow.astro` -- Image carousel
- `ButtonRow.astro` -- Row of CTA buttons
- `CollapsibleSection.astro` -- Accordion/FAQ section
- `InteractiveSection.astro` -- Interactive content area
- `ContactForm.astro` -- Contact form

### Product (Astro SSG)
- `astro/ProductCard.astro` -- Product card with image, title, price
- `astro/ProductDetail.astro` -- Full product page with gallery, variants, add-to-cart
- `astro/ProductGrid.astro` -- Grid of product cards
- `astro/FeaturedCollection.astro` -- Highlighted collection with products
- `astro/CollectionList.astro` -- List of collections

### React Islands (Interactive)
- `react/CartWidget.tsx` -- Cart icon with count badge (`client:load`)
- `react/AddToCartButton.tsx` -- Add to cart with Nano Stores (`client:load`)
- `react/SearchBar.tsx` -- Debounced search overlay (`client:idle`)
- `react/ProductFilter.tsx` -- Price/size/color filters (`client:load`)
- `react/ProductGrid.tsx` -- Interactive product grid with filtering (`client:load`)
- `react/ProductDetail.tsx` -- Product page with variant selection (`client:load`)
- `react/ProductCard.tsx` -- Card with hover effects
- `react/CollectionList.tsx` -- Collection cards with images

### React (Puck Editor Preview)
- `react/Header.tsx`, `react/Footer.tsx`, `react/HeroBanner.tsx`, `react/ImageWithText.tsx`, `react/RichText.tsx`, `react/AnnouncementBar.tsx`

## Dual Rendering

Each visual component exists in two forms:
1. **Astro** (`src/components/*.astro`) -- SSG, zero JS, used in production build
2. **React** (`src/components/react/*.tsx`) -- used in Puck editor preview and for interactive islands

Interactive components use Astro's island architecture:
- `client:load` -- hydrates immediately (Cart, AddToCart, ProductGrid, ProductDetail, ProductFilter)
- `client:idle` -- hydrates when browser is idle (SearchBar)

## Customization

Merchants customize via `theme.json` settings_schema:

| Group | Settings |
|-------|----------|
| Colors | Primary (#e11d48), Background, Text, Border, Button text |
| Typography | Heading font (Comfortaa), Body font (Manrope) |
| Layout | Button radius (9999px), Card radius (1rem), Page width (1280px) |

Settings map to CSS custom properties in `tokens.css` and are consumed by Tailwind via the `@merfy/ui` preset.

## Page Templates

Puck JSON files in `pages/`:
- `index.json` -- HeroBanner + FeaturedCollection + ImageWithText
- `product.json` -- Product detail page layout
- `collection.json` -- Collection page with product grid
- `cart.json` -- Cart page layout

## Development

```bash
pnpm dev       # Start Astro dev server
pnpm build     # Build static site
pnpm preview   # Preview production build
```
