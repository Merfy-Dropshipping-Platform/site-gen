# Фаза 2 — контракт компонента: Header и Hero

Дата: 2026-07-29. Изменений в коде тем не вносилось — только анализ.

Правило дока: **у каждого CSS-свойства должен быть ровно один владелец**
(design invariant / block prop / Theme Setting / color scheme / merchant content).
Если владелец не определён — свойство не трогаем.

---

## Общий инвариант, у которого сейчас НЕТ владельца

`.flux-container` — сетка полей всей темы. В эталоне (`src/styles/global.css:30`):

```css
.flux-container { width:100%; max-width:1480px; margin-inline:auto; padding-inline:1rem }
@media (min-width:768px)  { .flux-container { padding-inline:2.5rem } }  /* 40px */
@media (min-width:1024px) { .flux-container { padding-inline:5rem   } }  /* 80px */
```

Даёт ровно измеренные ширины контента: `375−32=343`, `768−80=688`,
`1280−160=1120`, `min(1920,1480)−160=1320`. Совпадает с эталоном на всех четырёх
viewport.

**В нашем порте класс используется минимум в 5 компонентах (Header, Collections,
Gallery, CartSection, CollapsibleSection) и НИГДЕ не определён** — это класс-пустышка.
Поля и максимальная ширина держатся на случайных локальных классах каждой секции.

Это первопричина «плавающей» геометрии и её надо чинить до пилота Hero, иначе
каждая секция будет чиниться отдельно и по-своему.

⚠️ Не путать с `--container-max-width` (Theme Setting, 1320px): это ВНУТРЕННЯЯ
ширина контента, а `flux-container` — внешняя рамка 1480 + поля. Два разных
механизма; сейчас у нас живёт только первый.

---

## Контракт: Hero

```
Component: Hero
Canonical markup: flux-theme@e29b7092 src/components/sections/Hero.astro (75 строк)
Порт:             themes/flux/src/components/sections/Hero.astro (391 строка)
```

**Content props:** `heading.text`, `text.content`, `backgroundImages`,
`primaryButton.{text,link}`, `secondaryButton.{text,link}`
**Layout props:** `size`, `position`, `alignment`, `container`, `padding`
**Appearance props:** `colorScheme`, `overlay`
**Скрытые (легаси):** `variant`, `contentPosition`, `backgroundImage(2)`, `title`,
`subtitle`, `image`, `images`, `cta`, `mode`, `slides`

### Таблица владельцев

| CSS-свойство | Владелец | Эталонное значение | Что в порте | Статус |
|---|---|---|---|---|
| высота полотна | design invariant | `h-[380px] sm:h-[480px] lg:aspect-[1920/810]` | `h-[280px] sm:h-[360px] lg:h-[480px]` | ✗ значения неверны (380→280), пропорция 1920/810 отсутствует |
| высота полотна (модификатор) | block prop `size` | — (у верстальщика нет) | лестница large/medium/small | ⚠️ Merfy-добавление; large обязан совпасть с эталоном |
| `font-size` заголовка | block prop `heading.size` **И** Theme Setting `--size-hero-heading` | 20px → md:24px | хардкод-лестница; токен `72px` **не потребляется (0 раз)** | ✗ **два владельца, один мёртв** |
| `font-weight` заголовка | design invariant (`.font-roboto-flex{font-weight:300}`) | 300 | утилита определена, 300 ✓ | ✓ |
| `color` заголовка | color scheme `--color-heading` | `#000000` | `var(--color-heading, 255_255_255)` — фолбэк **белый** | ✗ дефолт противоположен эталону |
| `font-size` подзаголовка | block prop `text.size` | 12px → md:14px | 14px → md:16px | ✗ на ступень крупнее |
| `text-transform` подзаголовка | design invariant | `uppercase` | отсутствует | ✗ |
| `color` подзаголовка | color scheme `--color-text` | `#999999` | фолбэк белый | ✗ |
| высота кнопки | Theme Setting `--size-hero-button-h` | `h-12` = 48px | хардкод `h-14` = 56px; токен **48px не потребляется** | ✗ **два владельца, один мёртв** — причём мёртвый уже содержит верное значение |
| `border-radius` кнопки | Theme Setting `--radius-button` | `4px` | `var(--radius-button, 6px)` | ⚠️ владелец верный, дефолт неверный |
| `background` кнопки | design invariant (акцент) | `#1e2952` | `bg-black` | ✗ |
| `font-weight` кнопки | design invariant | `font-light` | `font-normal` | ✗ |
| затемнение фона | block prop `overlay` (0–100) | у эталона затемнения нет; есть **градиент в белый** снизу от 85% | слайдер + чёрный слой | ⚠️ инвариант-градиент отсутствует; слайдер — Merfy-добавление |
| кадрирование фото | design invariant | `w-[200%] top-[-10.8%] sm:w-[160%] lg:w-full` | `object-cover object-center inset-0` | ✗ другой алгоритм |
| `gap` контента | design invariant | `gap-8 lg:gap-10` | `gap-6 lg:gap-10` | ✗ на мобиле/планшете |
| поля обёртки | design invariant (`px-4`) | `px-4` | `px-4 py-8 md:px-20 md:py-10 2xl:px-80` | ✗ лишние |
| размещение блока (сетка 3×3) | block prop `position` | — | `hItemsCls`/`vJustifyCls` на внешнем контейнере | ✓ Merfy-добавление, разведено |
| выравнивание внутри блока | block prop `alignment` | — | `alignItemsCls`/`textAlignCls` на блоке контента | ✓ разведено осознанно |
| подложка под текстом | block prop `container` | — | `boxedCls` | ✓ Merfy-добавление |

**`position` против `alignment` — НЕ конфликт.** Оба дают `items-*`, но на разных
элементах: `position` двигает блок по полотну, `alignment` выравнивает содержимое
внутри блока. Разведение сделано намеренно и описано в коде.

---

## Контракт: Header

```
Component: Header (+ PromoBanner внутри общей sticky-обёртки)
Canonical markup: flux-theme@e29b7092 src/components/Header.astro (284 строки)
Порт:             themes/flux/src/components/Header.astro (624 строки)
```

**Props:** `logo`, `logoPosition`, `stickiness`, `padding`, `menuType`,
`menuColorScheme`, `colorScheme`, `navigationLinks`, `actionButtons`, `siteTitle`

### Таблица владельцев

| CSS-свойство | Владелец | Эталон | Что в порте | Статус |
|---|---|---|---|---|
| вертикальные отступы десктопного ряда | block prop `padding` **И** design invariant `py-6` | `py-6` (24+24=48px) | сентинел: `{12,12}` → рисуем `py-6`; любое иное значение → inline-стиль | ⚠️ **два владельца, разрешены сентинелом** |
| двухрядность | block prop `logoPosition` | две строки (лого+действия, затем nav) | `top-left`/`top-center` → `isTwoRow` | ✓ работает |
| `gap` между рядами | design invariant | `gap-5` (20px) | `gap-5` | ✓ |
| высота мобильной строки | design invariant | `h-20` (80px) | `h-20` | ✓ |
| ширина/поля контейнера | design invariant `.flux-container` | 1480 + 16/40/80 | класс есть, **стилей нет** | ✗ владелец мёртв |
| `font-size` ссылок nav | Theme Setting `--size-nav-link` | — | **0 потреблений** | ✗ владелец мёртв |
| ширина логотипа | Theme Setting `--size-logo-width` | — | 2 потребления | ✓ |
| макс. ширина | Theme Setting `--container-max-width` | — | **0 потреблений в Header** | ✗ владелец мёртв |
| акцент | Theme Setting `--color-primary` | `#1e2952` | **0 потреблений** | ✗ владелец мёртв |
| фон/текст | color scheme | белый фон | `colorScheme` | ✓ |

### Про сентинел `{12,12}`

`isCanonPad = pad.top===12 && pad.bottom===12` → рендерится литерал `py-6` (24px
с каждой стороны). То есть **значение 12 означает 24px**. Это ловушка: мерчант,
выставивший в панели 12, получит 24; выставивший 0 — потеряет эталонный отступ.

Именно это и произошло: ревизия тестового сайта содержала `{top:0,bottom:0}`, и
шапка теряла ровно 48px (136 → 88). Сид `packages/theme-flux/pages/home.json`
при этом был **правильный** (`{12,12}`) — разошлась именно ревизия.

---

## Gate 2 — вердикт

Таблицы владельцев для Header и Hero построены. Требование «нет двух разных
параметров, управляющих одним и тем же CSS» **нарушено в трёх местах**:

| # | конфликт | как разрешать |
|---|---|---|
| 1 | `font-size` заголовка Hero: `heading.size` + `--size-hero-heading` | оставить владельцем block prop, ступени считать от токена (как предписывает комментарий в `theme-contract/tokens/registry.ts:55`), либо снять токен с Hero |
| 2 | высота кнопки Hero: `--size-hero-button-h` + хардкод `h-14` | оживить токен — он уже содержит эталонные `48px`, это чинит расхождение само |
| 3 | отступы Header: `padding` + `py-6` через сентинел `{12,12}` | оставить как есть (работает), но зафиксировать тестом, что `{12,12}` = 48px, иначе правка сида молча ломает шапку |

Плюс **четыре мёртвых владельца** (`--size-nav-link`, `--container-max-width`,
`--color-primary`, `.flux-container`): свойство заявлено управляемым, а
управления нет. По правилу дока такие свойства трогать нельзя, пока владелец не
оживлён или не снят.

**Вывод для Фазы 3:** пилот Hero нельзя начинать с правки классов. Сначала —
`.flux-container` (общий инвариант) и оживление двух токенов Hero. Иначе правки
лягут поверх неопределённого фундамента и разъедутся на следующей секции.
