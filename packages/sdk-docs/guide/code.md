Шаблон описывает вид секции, а не программу: значение настройки попадает в атрибут, вид по значению задают классы
словаря. Ветвление остаётся там, где меняется сама разметка: есть блок или нет, есть фото или нет. Переменных и функций
в шаблоне нет ([template.md](template.md)), поэтому то, что в программе посчитали бы один раз, здесь считают атрибутом
`data-*` или берут из данных.

Часть правил проверка ловит предупреждениями `taste-*` (таблица в конце): секция сохраняется, но исправь их до
сохранения — у предупреждения есть `doc` со ссылкой на нужный раздел.

## Значения настройки

Настройка-выбор (`select`, `radio`, `alignment`, `toggle`) — один атрибут `data-<имя>` и классы с вариантом
`data-[<имя>=<значение>]:`. Вложенным элементам — вариант `in-data-[<имя>=<значение>]:`: он срабатывает, если значение
стоит у любого предка внутри секции. Так вид по каждому значению записан строкой классов, без выражения.

Плохо — ветка на каждое значение, и та же таблица повторяется у каждого элемента:

```astro
<div class:list={['relative flex', {
  'min-h-64': settings.height === 'small',
  'min-h-96': settings.height === 'medium',
  'min-h-112 md:min-h-136': settings.height === 'large',
}]}>
  <h2 class:list={['m-0', {
    'text-2xl': settings['heading-size'] === 'small',
    'text-3xl md:text-4xl': settings['heading-size'] === 'medium',
    'text-4xl md:text-5xl': settings['heading-size'] === 'large',
  }]}>
```

Хорошо — значение в атрибуте, вид в классах:

```astro
<div
  class="relative flex data-[height=small]:min-h-64 data-[height=medium]:min-h-96 data-[height=large]:min-h-112 md:data-[height=large]:min-h-136"
  data-height={settings.height}
  data-heading-size={settings['heading-size']}
>
  <h2 class="m-0 in-data-[heading-size=small]:text-2xl in-data-[heading-size=medium]:text-3xl in-data-[heading-size=large]:text-4xl">
```

- Значение уже совпадает с частью класса — подставь его: `` class={`text-${settings.align}`} `` (`left`, `center`,
  `right`), `` class={`opacity-${settings.overlay}`} `` (`range` с шагом). Проверка перебирает все значения поля.
- Логическое значение Astro выводит строкой: `data-photo={settings.images.url1 !== ''}` даёт `data-photo="true"` или
  `data-photo="false"`. Вариант — `data-[photo=true]:`, а не `data-photo:`: атрибут есть всегда.
- Имя атрибута — как id поля (`data-heading-size`), чтобы по шаблону было видно, откуда значение.

## Вложенные условия

Условный оператор `?:` внутри другого `?:` не читается. Каждое значение — свой элемент со своим условием или вариант
класса.

Плохо — цепочка по виду блока и склонение в разметке:

```astro
{block.type === 'search' ? (<button>…</button>) : block.type === 'profile' ? (<a>…</a>) : (<a>…</a>)}

{n % 10 === 1 && n % 100 !== 11 ? 'товар' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'товара' : 'товаров'}
```

Хорошо:

```astro
{block.type === 'search' && <button>…</button>}
{block.type === 'profile' && <a>…</a>}
{block.type === 'cart' && <a>…</a>}

Товаров: {page.list.total}
```

Склонять по числу в шаблоне нечем: форма «Товаров: 12» читается при любом числе.

## Длинные условия

Условие из больше чем трёх частей через `&&` и `||` не охватить взглядом. Обычно оно значит, что одним условием закрыт
блок из нескольких независимых частей. Разбей блок: у каждой части — своё короткое условие.

Плохо — один блок на контакты и соцсети, условие из девяти частей:

```astro
{(shop.contacts.phone || shop.contacts.email || shop.contacts.fields.length > 0 || theme['social-telegram'] || theme['social-vk'] || …) && (
  <div>…контакты…соцсети…</div>
)}
```

Хорошо — два блока, у каждого своё условие:

```astro
{(shop.contacts.phone || shop.contacts.email) && <div>…контакты…</div>}
{(theme['social-telegram'] || theme['social-vk']) && <div>…соцсети…</div>}
```

## Повтор условия

Одно и то же сравнение в нескольких местах — признак того, что значение надо посчитать один раз. При правке одно место
забудется.

Плохо — условие «фильтры сбоку» посчитано у трёх элементов:

```astro
<div class:list={['grid gap-6', { 'md:grid-cols-4': blocks.some((block) => block.type === 'filters' && block.settings['filter-position'] === 'side') }]}>
  <form class:list={['flex', { 'md:col-span-1': blocks.some((block) => block.type === 'filters' && block.settings['filter-position'] === 'side') }]}>
  <div class:list={['flex', { 'md:col-span-3': blocks.some((block) => block.type === 'filters' && block.settings['filter-position'] === 'side') }]}>
```

Хорошо — один раз атрибутом на корне, ниже варианты:

```astro
<div
  class="grid gap-6 md:data-[filters-side=true]:grid-cols-4"
  data-filters-side={blocks.some((block) => block.type === 'filters' && block.settings['filter-position'] === 'side')}
>
  <form class="flex md:in-data-[filters-side=true]:col-span-1">
  <div class="flex md:in-data-[filters-side=true]:col-span-3">
```

Текущая ссылка меню — `aria-current` один раз, вид — вариант `aria-[current=page]:`.

Плохо:

```astro
<a aria-current={item.url === page.path ? 'page' : undefined} class:list={['no-underline', item.url === page.path ? 'text-heading' : 'text-muted-foreground']} href={item.url}>
```

Хорошо:

```astro
<a aria-current={item.url === page.path ? 'page' : undefined} class="text-muted-foreground no-underline aria-[current=page]:text-heading" href={item.url}>
```

## Повтор разметки

Одинаковые элементы, которые отличаются текстом и адресом, — массив данных и `map`. `filter` убирает пустые.

Плохо — шесть одинаковых строк:

```astro
{theme['social-telegram'] && <li><a class="inline-flex h-11 items-center px-4" href={theme['social-telegram']}>Telegram</a></li>}
{theme['social-vk'] && <li><a class="inline-flex h-11 items-center px-4" href={theme['social-vk']}>ВКонтакте</a></li>}
…
```

Хорошо:

```astro
{[
  { url: theme['social-telegram'], label: 'Telegram' },
  { url: theme['social-vk'], label: 'ВКонтакте' },
].filter((link) => link.url).map((link) => (
  <li><a class="inline-flex h-11 items-center px-4" href={link.url}>{link.label}</a></li>
))}
```

Одна и та же разметка в двух местах, которая отличается только расположением (фильтры сверху и сбоку, меню в шапке и
в боковой панели), — один экземпляр разметки и варианты классов: `md:`, `in-data-[…]:`.

## Скрипт

`script.ts` меняет состояние, а вид по состоянию задаёт шаблон.

- Скрипт ставит атрибут, тексты и классы — в шаблоне. Плохо: «В наличии» и «Нет в наличии» записаны и в шаблоне, и в
  скрипте (`stock.text(variant.available ? 'В наличии' : 'Нет в наличии')`). Хорошо: в шаблоне оба текста, скрипт
  ставит `data-available`:

  ```astro
  <span data-ref="stock" data-available={settings.product.available}>
    <span class="in-data-[available=false]:hidden">В наличии</span>
    <span class="in-data-[available=true]:hidden">Нет в наличии</span>
  </span>
  ```

  ```ts
  ctx.ref('stock')?.attr('data-available', String(variant.available));
  ```

- Логическое значение в атрибут — `String(flag)`, а не `flag ? 'true' : 'false'`.
- Одно действие — одна функция. Код показа фото, повторённый в `mount` и в действии, — вызов той же функции; два
  одинаковых `ctx.watch` для счётчиков корзины и избранного — одна функция `showCount(badges, count)`.
- Пределы и имена — константами вверху файла: `const QUANTITY_MAX = 99`, а не `99` в трёх местах.
- Тот же запрет на `?:` внутри `?:` и на длинные условия, что в шаблоне. Вместо вложенных `if` — ранний выход:
  `if (variant === null) return;`.

## Пример целиком

«Первый экран» по этим правилам: высота, выравнивание и размер заголовка — атрибутами `data-*` и вариантами, затемнение
— классом из значения поля, фото — одним условием. Проверка принимает его без предупреждений.

<!-- example: hero-clean -->

## Что ловит проверка

| Код | Когда | Раздел |
| --- | --- | --- |
| `taste-nested-ternary` | `?:` внутри `?:` | [Вложенные условия](#вложенные-условия) |
| `taste-long-condition` | условие из больше чем трёх частей через `&&` и `\|\|` | [Длинные условия](#длинные-условия) |
| `taste-class-branches` | в `class` или `class:list` одно поле сравнивается с тремя значениями и больше | [Значения настройки](#значения-настройки) |
| `taste-repeated-condition` | одно сравнение или вызов вроде `blocks.some(…)` в трёх местах и больше | [Повтор условия](#повтор-условия) |

Остальные `taste-*` — кнопки от 44 px, прокрутка вбок, «уменьшить движение» — в [errors.md](errors.md#taste-button-height).

Вёрстка секции — телефон первым: классы без префикса для телефона, `sm:`/`md:`/`lg:` добавляют; карточки в ряду одной
высоты, полоски и вкладки на ширину ряда. Этого проверка не ловит, правила и пример сетки — в
[styles.md](styles.md#телефон-первым).
