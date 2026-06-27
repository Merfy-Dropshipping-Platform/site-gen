# Паритет настроек секций по всем темам (vanilla/bloom/satin vs rose-канон)

> Аудит 2026-06-27 (3 параллельных scout-прохода, все секции, ✓ verified чтением файлов).
> Цель: каждая настройка секции РАБОТАЕТ (рендерится) одинаково во всех темах, как в rose.
> flux — отдельно в `FLUX_PARITY_PLAN.md`. Поля сайдбара общие (theme-base) — разрыв в РЕНДЕРЕ темы (мёртвые настройки).

## ✅ НЕ баг (verified): colorScheme работает во всех темах
Композитор (`v2-page-composer.ts:56-62`, `preview.service.ts:627-633`) оборачивает КАЖДЫЙ блок в `<div class="color-scheme-N">` (тема-агностично, `resolveBlockScheme`). Секции читают `var(--color-*)` → схема применяется. satin-аудит ошибочно записал 13 секций в «мёртвые» (искал class на `<section>`, а работает обёртка). НЕ трогать.

---

## P1 — Общие мёртвые настройки (несколько тем) — высокий приоритет

| # | Секция / настройка | Мёртв в | Эталон rose | Файлы |
|---|--------------------|---------|-------------|-------|
| 1.1 | **MultiColumns `imageAspectRatio`** (Адаптивный/Квадрат/Портрет/Ландшафт) | vanilla, bloom, satin | rose `MultiColumns.astro:126-133` aspect-класс по значению | `themes/{vanilla,bloom,satin}/src/components/sections/MultiColumns.astro` (картинка хардкод `h-11/h-14` иконкой) |
| 1.2 | **MultiColumns per-column `imageSize`** (Маленький/Средний/Большой) | vanilla, bloom | rose `:94,:174,:221` | те же файлы (map-фаза не хранит `imageSize`) |
| 1.3 | **Video `subheading`** (Подзаголовок) | vanilla, bloom | theme-base `Video.astro:162` рендерит `<p>` | `themes/{vanilla,bloom}/src/components/sections/Video.astro` (порт без subheading) |
| 1.4 | **MultiColumns `textPosition`** (left/center) | bloom | rose `items-center/text-center` vs `items-start` | `themes/bloom/src/components/sections/MultiColumns.astro` |

## P2 — Тематические мёртвые настройки

**vanilla:**
- Hero `container` toggle «Контейнер» — не применяет boxed-плашку (rose `Hero.astro:120`). `themes/vanilla/.../Hero.astro`
- Footer sub-panel `heading.{text,size,alignment}` / `text.{content,size}` — читает только скрытый `newsletter.heading` → правки «Заголовок/Текст» рассылки мертвы. `themes/vanilla/src/components/Footer.astro:169-176`

**bloom:**
- MultiRows `buttonStyle='black'` → падает в розовую (как primary); rose: black→тёмная. `themes/bloom/.../MultiRows.astro:137-147`
- Slideshow per-slide вертикальная позиция (top-/center-/bottom-) игнор → всегда низ. `themes/bloom/.../Slideshow.astro:94-109,203`
- Benefits (bloom-only блок): нет `data-puck-component-id` на `<section>` (ломает выбор в превью) + хардкод hex `bg-[#e38e9f]`/`bg-white` вместо токенов → не реагирует на схему. `packages/theme-bloom/blocks/Benefits/Benefits.astro`

**satin:**
- PopularProducts `buttonStyle`/`imageView`/`nextPhotoOnHover` — поля видны, рендер не применяет (puckConfig сам признаёт «декоративны»). `themes/satin/.../Popular.astro` + puckConfig:149
- MultiColumns `imageAspectRatio` (P1.1)
- **Сайдбар-дивергенции (поля, не рендер):** MultiRows нет `containerEnabled`; MultiColumns `buttonLink` скрыт vs pagePicker; Footer 7 полей (своя структура — возможно намеренно, решить).
- PopularProducts уже починен (2 контейнер-поля скрыты, как rose) — гард `src/__tests__/satin-sidebar-canon.spec.ts`.

## Паритет OK (verified)
vanilla/bloom: Hero, PopularProducts, Collections, Gallery, ImageWithText, MainText, CollapsibleSection, Newsletter, Publications, Header, (Footer кроме vanilla-newsletter). satin: Header, containerEnabled у MultiRows/MultiColumns/Collapsible.

## Порядок фиксов
P1 батчами по секции (MultiColumns — 3 темы за раз; Video subheading — 2). Потом P2 по темам. Каждый фикс: правка `.astro` → деплой sites → live-пруф в конструкторе (переключить тест-сайт на тему, выставить настройку, снять рендер). Сайдбар-дивергенции satin (поля) — после решения по Footer.
