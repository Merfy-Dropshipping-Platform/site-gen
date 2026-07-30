# Фаза 0 — сверка исходников: порт против эталона верстальщиков

- Эталон: `/private/tmp/claude-501/-Users-alexey-projects-merfy/0bdd256d-c6fd-413c-a041-b249f6381a75/scratchpad/flux-theme-ref` (flux-theme @ e29b7092 = HEAD репо = то, что раздаёт flux.merfy.ru)
- Порт: `/Users/alexey/projects/merfy/backend/services/sites/.worktrees/flux-constructor-live-markup`
- Комментарии из обоих исходников вырезаны — цитаты в комментах не засчитываются.

## Header+PromoBanner

- эталон: `src/components/Header.astro` (284 строк)
- порт: `themes/flux/src/components/Header.astro` (624 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| начертание | — | `medium` |
| цвет литеральный | — | `rgb(var(--color-text,0_0_0))`, `rgb(var(--color-bg,255_255_255))` |
| сетка | — | `1fr_auto_1fr` |
| отступ x | — | `20`, `80`, `6` |

## Hero

- эталон: `src/components/sections/Hero.astro` (75 строк)
- порт: `themes/flux/src/components/sections/Hero.astro` (391 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| размер текста | — | `17px`, `11px` |
| высота | `380px`, `12` | `280px`, `360px`, `230px`, `300px`, `400px`, `180px`, `240px`, `320px`, `14` |
| цвет литеральный | `#000000`, `#999999`, `#1e2952` | `rgb(var(--color-heading,255_255_255))`, `rgb(var(--color-text,255_255_255))`, `rgb(var(--color-bg,255_255_255))`, `rgb(var(--color-heading,0_0_0))`, `rgb(var(--color-text,0_0_0))`, `rgb(var(--color-surface,245_245_245))`, `rgb(var(--color-bg,245_245_245))` |
| радиус | `4px` | `var(--radius-card,8px)`, `var(--radius-button,6px)` |
| gap | `8` | `6`, `3` |
| сетка | — | `2` |
| пропорция | `1920/810` | — |
| отступ x | — | `20`, `80` |
| отступ y | — | `8`, `10` |
| непрозрачность фона | — | `5`, `30` |

## Collections

- эталон: `src/components/sections/Collections.astro` (53 строк)
- порт: `themes/flux/src/components/sections/Collections.astro` (375 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| размер текста | — | `29px`, `14px` |
| цвет литеральный | `#000000`, `#F5F5F5` | `rgb(var(--color-muted,153_153_153))`, `rgb(var(--color-heading,0_0_0))`, `rgb(var(--color-text,0_0_0))`, `rgb(var(--color-bg,255_255_255))`, `rgb(var(--color-surface,245_245_245))`, `rgb(var(--color-surface,251_251_251))` |
| gap | — | `2` |
| сетка | `1`, `3` | `2`, `4` |
| пропорция | — | `16/9`, `430/500` |
| отступ x | — | `4`, `20`, `80` |

## Product (FeaturedProduct)

- эталон: `src/components/sections/FeaturedProduct.astro` (13 строк)
- порт: `themes/flux/src/components/sections/FeaturedProduct.astro` (813 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| шрифт | — | `roboto-flex` |
| начертание | — | `light`, `normal` |
| размер текста | — | `14px`, `16px`, `20px`, `24px`, `18px`, `15px`, `12px`, `19px` |
| высота | — | `14`, `11` |
| цвет литеральный | — | `#F5F5F5`, `#1e2952`, `#999999`, `#000000` |
| радиус | — | `8px`, `4px`, `2px` |
| gap | — | `3`, `8`, `10`, `4`, `2`, `6`, `1` |
| сетка | — | `3` |
| пропорция | — | `square` |
| отступ x | — | `6`, `1`, `4` |
| отступ y | — | `1` |
| uppercase | — | `uppercase` |

## PopularProducts

- эталон: `src/components/sections/Popular.astro` (40 строк)
- порт: `themes/flux/src/components/sections/Popular.astro` (491 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| размер текста | — | `29px`, `35px`, `14px` |
| цвет литеральный | `#1e2952` | `rgb(var(--color-heading,0_0_0))`, `rgb(var(--color-muted,153_153_153))`, `rgb(var(--color-button-2-bg,0_0_0))`, `rgb(var(--color-button-2-text,255_255_255))`, `rgb(var(--color-text,0_0_0))`, `rgb(var(--color-bg,255_255_255))`, `#FBFBFB` |
| радиус | `4px` | `var(--radius-button,6px)`, `12px` |
| gap | — | `2`, `1` |
| пропорция | — | `430/500`, `16/9`, `square` |
| отступ x | — | `0`, `20`, `80` |

## ImageWithText (Puk)

- эталон: `src/components/sections/Puk.astro` (32 строк)
- порт: `themes/flux/src/components/sections/Puk.astro` (272 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| размер текста | — | `29px`, `14px` |
| цвет литеральный | `#FBFBFB`, `#000000`, `#999999`, `#1e2952` | `rgb(var(--color-heading,0_0_0))`, `rgb(var(--color-muted,153_153_153))`, `rgb(var(--color-button-2-bg,0_0_0))`, `rgb(var(--color-button-2-text,255_255_255))`, `rgb(var(--color-bg,251_251_251))`, `rgb(var(--color-surface,245_245_245))` |
| радиус | `6px` | `var(--radius-button,6px)`, `var(--radius-media,8px)` |
| gap | — | `6`, `8` |
| сетка | — | `1`, `2` |
| пропорция | — | `429/314`, `430/500`, `square` |
| отступ x | `6` | `4`, `20`, `80` |

## Gallery

- эталон: `src/components/sections/Gallery.astro` (73 строк)
- порт: `themes/flux/src/components/sections/Gallery.astro` (367 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| начертание | — | `normal` |
| размер текста | — | `18px`, `20px`, `24px`, `14px`, `19px` |
| цвет литеральный | `#F5F5F5`, `#000000` | `rgb(var(--color-heading,0_0_0))`, `rgb(var(--color-muted,153_153_153))`, `rgb(var(--color-text,0_0_0))`, `rgb(var(--color-bg,255_255_255))`, `rgb(var(--color-surface,245_245_245))` |
| радиус | `8px` | `var(--radius-media,8px)` |
| gap | — | `2`, `8`, `1` |
| сетка | — | `429fr_875fr` |
| отступ x | — | `4`, `20`, `80` |

## Footer

- эталон: `src/components/Footer.astro` (178 строк)
- порт: `themes/flux/src/components/Footer.astro` (423 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| высота | `168px`, `64px` | `16`, `80px`, `100px` |
| мин-высота | `168px` | — |
| цвет литеральный | `#fbfbfb`, `#1e2952` | `rgb(var(--color-heading,0_0_0))`, `rgb(var(--color-muted,153_153_153))`, `rgb(var(--color-text,0_0_0))`, `rgb(var(--color-bg,255_255_255))`, `rgb(var(--color-surface,245_245_245))`, `#000000` |
| радиус | `4px` | `var(--radius-input,8px)` |
| gap | `80px` | — |
| отступ x | — | `20`, `80` |
| отступ y | `80px` | `16` |

## ProductCard

- эталон: `src/components/ProductCard.astro` (38 строк)
- порт: `themes/flux/src/components/products/FluxProductCard.astro` (172 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| шрифт | `manrope` | `roboto-flex` |
| начертание | `medium` | `light` |
| размер текста | `24px`, `32px`, `20px` | `12px`, `14px`, `16px` |
| высота | — | `1px`, `11` |
| цвет литеральный | — | `#FBFBFB`, `rgb(var(--color-muted,153_153_153))`, `#FA5109`, `#000000`, `#F5F5F5`, `#CCCCCC` |
| радиус | `lg`, `8px`, `10px` | `12px`, `4px`, `full`, `2px` |
| gap | `5`, `6`, `25px`, `3`, `10px`, `15px` | `1` |
| пропорция | `318/515` | `square` |
| отступ x | `2`, `4`, `15px` | `1` |
| отступ y | — | `1` |
| непрозрачность фона | — | `90` |
| uppercase | — | `uppercase` |

## CollectionCard

- эталон: `src/components/CollectionCard.astro` (39 строк)
- порт: `themes/flux/src/components/CollectionCard.astro` (39 строк)

✅ Литеральные дизайн-значения совпадают.

## SectionHeader

- эталон: `src/components/SectionHeader.astro` (20 строк)
- порт: `themes/flux/src/components/SectionHeader.astro` (20 строк)

| категория | есть в эталоне, НЕТ в порте | есть в порте, НЕТ в эталоне |
|---|---|---|
| шрифт | `manrope` | — |

## Сводка

| блок | статус | категорий с расхождением |
|---|---|---:|
| Header+PromoBanner | расходится | 4 |
| Hero | расходится | 10 |
| Collections | расходится | 6 |
| Product (FeaturedProduct) | расходится | 12 |
| PopularProducts | расходится | 6 |
| ImageWithText (Puk) | расходится | 7 |
| Gallery | расходится | 7 |
| Footer | расходится | 7 |
| ProductCard | расходится | 12 |
| CollectionCard | совпадает | — |
| SectionHeader | расходится | 1 |

