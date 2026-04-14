# Codebase Report: Vanila Theme Homepage — Figma Pixel-Perfect Specs (1920px)
Generated: 2026-04-14

## Source
- File key: `QfF9NPZBoQX6vCRg560Qcb`
- Canvas: `590:11640` (Vanila)
- Homepage frame: `590:22546` ("Главная страница") inside section `590:22545` (1920)
- Total page size: **1920 × 6346 px**

## Color Palette (Global)

| Token | Hex | Usage |
|-------|-----|-------|
| Dark green (primary) | `#26311c` | Announcement bar bg, badge bg, dark accents |
| Medium green | `#3a4530` | Header bg, hero button bg, MainText bg, Newsletter bg |
| Light grey bg | `#eeeeee` | Collections bg, Popular Products bg |
| White | `#ffffff` | Text on dark, logo, button text |
| Body text dark | `#000000` | Product titles |
| Body text medium | `#444444` | Subtitles, old price text |
| Body text subtle | `#f0f0f0` | Body text on dark sections |
| Placeholder grey | `#999999` | Search placeholder |

## Typography System

All type is **no letter-spacing (0)** unless noted.

| Role | Font Family | Weight | Size | Line-height |
|------|-------------|--------|------|-------------|
| Section Heading | Bitter | 400 | 20px | 24px |
| Body / Nav / Button | Arsenal | 400 | 16px | 20.06px |
| Old price / badge text | Arsenal | 400 | 14px | 17.56px |
| Badge label | Arsenal | 400 | 12px | 15.05px |
| Cart badge counter | Exo 2 | 700 | 12px | 14.4px |

**Text-transform:**
- Buttons: `UPPER` (text-transform: uppercase)
- Product titles: `UPPER`
- Collection tile labels: `UPPER`
- Headings: none
- Nav links: none

---

## Section 1 — Announcement Bar

| Property | Value |
|----------|-------|
| Height | **48px** |
| Background | `#26311c` |
| Layout | HORIZONTAL, paddingLeft/Right 680px, paddingTop/Bottom 16px, itemSpacing 10px |
| Alignment | CENTER × CENTER |
| Text | "Бесплатная доставка на весь ассортимент" |
| Font | Arsenal 16px / 400 / 20.06px lh |
| Text color | `#ffffff` |
| Text-transform | `UPPER` (uppercase) |

---

## Section 2 — Header / Navigation

| Property | Value |
|----------|-------|
| Height | **80px** |
| Background | `#3a4530` |
| Layout | HORIZONTAL SPACE_BETWEEN, paddingLeft/Right **300px**, paddingTop/Bottom **32px**, itemSpacing 24px |

### Logo
- Element: SVG vector "Vanila"
- Size: **89 × 28px**
- Color: `#ffffff`
- Position: **horizontally centered** (x=916 from page left; center at x=960.5 ≈ 50% of 1920px)

### Navigation (left group)
- Position: x=300 from page left (flush to padding edge)
- Layout: HORIZONTAL, gap between nav items = **40px**
- Each nav item: text + 24×24 dropdown icon, itemSpacing=4px

| Item | Width |
|------|-------|
| Текстиль (+ icon) | 59+4+24=87px total |
| Декор (+ icon) | 41+4+24=69px total |
| История (+ icon) | 56+4+24=84px total |

- Nav link font: Arsenal 16px / 400 / `#ffffff`
- Active underline (Line): 59×0px, stroke `#ffffff` 1px width, positioned below nav items at y=102 in section

### Icon Group (right side)
- Position: right edge at x=1620 (= 1920 − 300), total group width **144×32px**, gap=24px
- Icons (left to right):
  - `icon_search_md` — 32×32px, inner vector 19.2×19.2px, stroke `#ffffff` 1.6px
  - `icon_cart_md` — 32×32px
    - Cart icon vector: 19.2×19.2px, fill `#ffffff`
    - Badge (Ellipse): **18×18px**, bg `#26311c`, centered at top-right of icon
    - Badge counter: "1", Exo 2 12px w700, `#ffffff`, center-aligned
    - Badge has cornerRadius: **8px**
  - `icon_user_md` — 32×32px, inner vector 16×20px, stroke `#ffffff` 1.2px

---

## Section 3 — Hero / Slideshow

| Property | Value |
|----------|-------|
| Total section height | **952px** (48 announcement + 80 header = 128px above, so hero is at y=128 in page) |
| Inner slide frame height | **880px** |
| Pagination strip height | **24px** (below slide frame, with 24px gap → 880+24+24=952 — waitactually paddingBottom=24 only: 880+48+24=952 per VERTICAL itemSpacing=24, paddingBottom=24) |
| Slide frame background | `IMAGE` (background image, full bleed) |
| Hero section layout | VERTICAL, CENTER × CENTER |

### Slide Frame (880px tall)
- Padding: left/right **300px**, top/bottom **120px**, itemSpacing 24px
- Layout: VERTICAL CENTER × None (left-aligned content)

### Content Block (bottom-left of slide)
- Size: 275×128px
- Position relative to page: x=300, y=504 (from hero section top)
- Layout: VERTICAL, itemSpacing=32px

**Heading:**
- Text: "Искусство жить уютно"
- Font: Bitter 20px / 400 / `#ffffff` / lh=24px
- Width: 238px

**Subtext:**
- Text: "Товары, которые делают дом особенным"
- Font: Arsenal 16px / 400 / `#f0f0f0` / lh=20.06px
- Width: 275px

**CTA Button (below text, gap=32px):**
- Size: **200×48px**
- Background: `#3a4530`
- Padding: left/right 16px (no explicit top/bottom → content-determined → 48h with 20h text = 14px each side)
- Layout: HORIZONTAL CENTER × CENTER
- Text: "Перейти к коллекции"
- Font: Arsenal 16px / 400 / `#ffffff` / UPPERCASE
- No border-radius specified (default = 0)

### Search Bar (top of slide content area)
- Position: x=300 (left padding), y=8 from top of slide frame (essentially flush top inside padding)
- Size: **1320×48px**
- Background: `#ffffff`
- Padding: left=12, right=4, top/bottom=12
- Layout: HORIZONTAL SPACE_BETWEEN × CENTER
- Placeholder: "Поиск...", Arsenal 16px, `#999999`

**Search button (inside right):**
- Size: **66×40px**
- Background: `#3a4530`
- Padding: left/right=12, top/bottom=10, itemSpacing=10
- Text: "Найти", Arsenal 14px / 400 / `#ffffff` / UPPERCASE

### Pagination Strip
- Total width of pagination bar: **142×24px**
- Centered horizontally at page center (x=889 from left)
- y=1032 from page top (= 128 + 880 + 24 spacing)
- Layout: HORIZONTAL, itemSpacing=20px

| Element | Size | Details |
|---------|------|---------|
| Left arrow icon | 24×24px | Vector 14×8px, stroke `#ffffff` 1px |
| Numbers container | 54×20px | itemSpacing=16px |
| "1", "2", "3" texts | 6, 8, 8px wide | Arsenal 16px / `#ffffff` |
| Right arrow icon | 24×24px | Vector 14×8px, stroke `#ffffff` 1px |

---

## Section 4 — Collections (2-tile)

| Property | Value |
|----------|-------|
| Height | **1024px** |
| Background | `#eeeeee` |
| Padding | left/right=300px, top/bottom=120px |
| Inner layout | VERTICAL, itemSpacing=40px |

### Section Header
- Container: 689×52px, VERTICAL layout, itemSpacing=8px

**Heading:**
- Text: "Коллекции, которые становятся любимыми"
- Font: Bitter 20px / 400 / `#26311c` / lh=24px
- Width: 438px

**Subtext:**
- Text: "Вдохновение для каждого дня — актуальные коллекции..."
- Font: Arsenal 16px / 400 / `#444444` / lh=20.06px
- Width: 689px

### Tiles Layout
- Container: **1320×692px**, HORIZONTAL, itemSpacing=**16px**, counterAxisAlignItems=CENTER
- 2 tiles × (652 + 16) = 1320px ✓

**Each Tile:**
- Size: **652×692px**, VERTICAL layout, itemSpacing=20px
- Image: **652×652px** (1:1 square ratio)
- Label: Arsenal 16px / 400 / `#26311c` / **UPPERCASE**
  - "Текстиль и постельные принадлежности" (322px wide)
  - "Декор и предметы интерьера" (223px wide)

---

## Section 5 — MainText / Brand Statement (First)

| Property | Value |
|----------|-------|
| Height | **428px** |
| Background | `#3a4530` |
| Padding | left/right=300px, top/bottom=120px |
| Layout | VERTICAL CENTER × CENTER, itemSpacing=64px |

**Heading:**
- Text: "Тепло вашего дома начинается здесь"
- Font: Bitter 20px / 400 / `#ffffff` / lh=24px
- Width: 360px
- Alignment: CENTER

**Body text:**
- Font: Arsenal 16px / 400 / `#f0f0f0` / lh=20.06px
- Width: 1320px (full content width)

**Button:**
- Size: **127×48px**
- Background: none (transparent)
- Stroke: `#ffffff` 1.3px (outlined button)
- Padding: left/right=16px
- Text: "К покупкам" / Arsenal 16px / `#ffffff` / UPPERCASE
- No border-radius

---

## Section 6 — Video

| Property | Value |
|----------|-------|
| Height | **982px** |
| Background | `#26311c` |
| Padding | left/right=300px, top/bottom=120px |
| Layout | VERTICAL, itemSpacing=10px |

**Video container:**
- Size: **1319×742px**
- Background: `#000000` (placeholder)

**Play button icon:**
- Size: **44×44px**
- Positioned centered over video (absolute in Figma)
- Inner vector: 25.4×26.9px, stroke `#ffffff` 3px (play triangle)

---

## Section 7 — ImageWithText

| Property | Value |
|----------|-------|
| Height | **606px** |
| Background | `#3a4530` |
| Padding | left/right=300px, top/bottom=120px |
| Layout | HORIZONTAL, itemSpacing=0 (gap computed: 40px) |

### Left Column — Text Block
- Size: **628×366px**
- Padding: top/bottom=16px
- Layout: VERTICAL SPACE_BETWEEN, itemSpacing=64px

**Heading:**
- Text: "Ваш дом — наша забота"
- Font: Bitter 20px / 400 / `#ffffff` / lh=24px
- Width: 241px

**Body text:**
- Font: Arsenal 16px / 400 / `#f0f0f0` / lh=20.06px
- Width: 628px, height=140px (7 lines)

**Button:**
- Size: **167×48px**
- Border: stroke `#ffffff` 1.3px (outlined)
- Padding: left/right=16px
- Text: "Смотреть больше" / Arsenal 16px / `#ffffff` / UPPERCASE

### Right Column — Image
- Size: **652×366px**
- Gap between text and image: **40px** (1320 − 628 − 652 = 40)

---

## Section 8 — Popular Products

| Property | Value |
|----------|-------|
| Height | **1358px** |
| Background | `#eeeeee` |
| Padding | left/right=300px, top/bottom=120px |
| Layout | VERTICAL, itemSpacing=40px |

### Section Header
- Same structure as Collections header (689×52px)

**Heading:**
- Text: "Популярные товары"
- Font: Bitter 20px / 400 / `#26311c` / lh=24px
- Width: 202px

**Subtext:**
- Font: Arsenal 16px / 400 / `#444444`

### Product Grid
- Container: **1320×1026px**, HORIZONTAL WRAP, itemSpacing=**16px** (col gap), counterAxisSpacing=**40px** (row gap)
- **3 columns × 2 rows**
- Each card: **429×493px**, VERTICAL layout, itemSpacing=20px

**Card Anatomy:**

| Element | Dimensions | Details |
|---------|------------|---------|
| Product image | **429×429px** (1:1) | RECTANGLE |
| Discount badge | **48×24px** | Positioned at top-left: x=8, y=8 from image corner |
| Gap (image→text) | 20px | itemSpacing |
| Title | varies × 20px | Arsenal 16px / w400 / `#000000` / UPPERCASE |
| Price row | 90×20px container | HORIZONTAL, itemSpacing=8px |
| Current price | varies × 20px | Arsenal 16px / w400 / `#000000` |
| Old/crossed price | 39×18px | Arsenal 14px / w400 / `#444444` |

**Discount Badge:**
- Size: **48×24px**
- Background: `#26311c`
- Padding: left/right=6px
- Layout: HORIZONTAL CENTER × CENTER
- Text: "Скидка" / Arsenal 12px / `#ffffff`
- Position from card top-left: **x=8, y=8**

**Image variant dots (carousel indicator on card):**
- Container: **32×12px**, bg `#ffffff`
- Padding: 2px all sides, itemSpacing=2px
- 3 dots: each **8×8px** (rounded)
  - Active: `#26311c`
  - Inactive: `#eeeeee`
- Positioned: bottom-right of image area, y=−20 from image bottom (overlapping image)

---

## Section 9 — Newsletter

| Property | Value |
|----------|-------|
| Height | **408px** |
| Background | `#3a4530` |
| Padding | left/right=300px, top/bottom=120px |
| Layout | HORIZONTAL, itemSpacing=40px |

### Left Content Block (1320×168px)
- Layout: VERTICAL, itemSpacing=40px

**Heading:**
- Text: "Будьте в курсе уютных новостей"
- Font: Bitter 20px / 400 / `#ffffff` / lh=24px
- Width: 328px

**Body text:**
- Font: Arsenal 16px / 400 / `#f0f0f0` / lh=20.06px
- Width: 1320px, height=40px (2 lines)

### Email Input
- Size: **652×56px**
- Border: stroke `#ffffff` 1px
- Background: transparent (none)
- Padding: left=16, right=12
- Layout: HORIZONTAL SPACE_BETWEEN × CENTER
- Placeholder: "E-mail" / Arsenal 16px / `#f0f0f0`

**Submit button (inside input):**
- Size: **76×32px**
- Background: `#ffffff`
- Padding: left/right=8, top/bottom=10
- Text: "Отправить" / Arsenal 12px / `#000000` / UPPERCASE

---

## Section 10 — Footer

| Property | Value |
|----------|-------|
| Total height | **460px** |
| Background | `#26311c` |
| Padding | paddingTop=80px, itemSpacing=80px (gap between content and powered-by) |
| Layout | VERTICAL CENTER × CENTER |

### Main Footer Content (1320×236px)
- Layout: VERTICAL, itemSpacing=32px

#### Top Row (1320×184px, HORIZONTAL SPACE_BETWEEN)

**Left: Logo + Nav Column (124×128px)**
- Logo: "Vanila" SVG, 89×28px, `#ffffff`
- Gap below logo: part of 24px itemSpacing
- Nav links (VERTICAL, itemSpacing=8px):
  - "Текстиль" / "Декор" / "Домашняя одежда"
  - Font: Arsenal 16px / 400 / `#ffffff`

**Right: Contact + Social Column (152×184px, VERTICAL, itemSpacing=64px)**

Contact info (VERTICAL, itemSpacing=8px):
- "+7 (000) 000-00-00" / Arsenal 16px / `#ffffff`
- "example@vanila.merfy" / Arsenal 16px / `#ffffff`

Social + Payment row (VERTICAL, itemSpacing=24px):
- Social icons row: **152×24px**, HORIZONTAL, itemSpacing=8px
  - 5 social icons, each **24×24px**, fill `#ffffff`
- Payment icons row (Платёжные системы): 139×24px, itemSpacing=8px
  - MasterCard: 31×24px, bg `#fafafa`, inner 23×14px (`#f79e1b`)
  - Visa: 44×24px, bg `#fafafa`, inner 36×12px (`#1434cb`)
  - MIR: 48×24px, bg `#fafafa`, inner 40×10px

#### Bottom Row — Copyright bar (1320×20px, HORIZONTAL SPACE_BETWEEN)

**Left:**
- "© 2025 Vanila Theme Все права защищены."
- Font: Arsenal 16px / 400 / `#ffffff`
- Width: 284px

**Right — footer links (696×20px, HORIZONTAL, gap=24px):**
- "Политика доставки" | "Политика возврата" | "Условия обслуживания" | "Политика конфиденциальности"
- Font: Arsenal 16px / 400 / `#ffffff`

### Powered-by Bar
- Height: **64px**
- Background: `#000000`
- Text: "© 2025 Vanila Theme Все права защищены. Powered by Merfy"
- Font: Inter 16px / 300 / `#ffffff` / lh=19.36px
- Centered (480px wide text, centered in 1920px)

---

## Summary: All Section Heights (verified sum = 6346px)

| # | Section | Height | Background |
|---|---------|--------|------------|
| 1 | Announcement Bar | 48px | `#26311c` |
| 2 | Header | 80px | `#3a4530` |
| 3 | Hero / Slideshow | 952px | IMAGE + `#000000` |
| 4 | Collections (2-tile) | 1024px | `#eeeeee` |
| 5 | MainText / Brand Statement | 428px | `#3a4530` |
| 6 | Video | 982px | `#26311c` |
| 7 | ImageWithText | 606px | `#3a4530` |
| 8 | Popular Products | 1358px | `#eeeeee` |
| 9 | Newsletter | 408px | `#3a4530` |
| 10 | Footer | 460px | `#26311c` + `#000000` bar |
| | **TOTAL** | **6346px** | |

## Content Width System
- Page width: **1920px**
- Horizontal padding (most sections): **300px left + 300px right**
- **Content width: 1320px**
- Content starts at: x=300px from left

## Key Figma Node IDs (for drilling deeper)
| Section | Node ID |
|---------|---------|
| Homepage frame | `590:22546` |
| Hero (full) | `590:22547` |
| Announcement bar | `590:22548` |
| Header | `590:22549` |
| Slideshow frame | `590:22550` |
| Slide inner (image bg) | `590:22551` |
| Collections section | `590:22564` |
| MainText 1 | `590:22575` |
| Video | `590:22580` |
| ImageWithText | `590:22583` |
| Popular Products | `590:22590` |
| Newsletter | `590:22601` |
| Footer component | `566:11767` |
