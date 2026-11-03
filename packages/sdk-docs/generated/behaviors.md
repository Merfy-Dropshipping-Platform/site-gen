# Поведения и анимации

> SDK 1 · документация 1.34.0 · 2026-11-03

Готовое поведение вешается на элемент атрибутом `data-behavior="<имя>"` — без скрипта. Части поведения отмечаются `data-part`, параметры — своими `data-…` на том же элементе.

## accordion

Части: `data-part="content"`.

Параметры: —.

Команды для скрипта секции ([script.md](script.md#поведения-из-скрипта-секции)):

- `ctx.behavior('accordion').open(номер с 0 или id)` — раскрыть пункт; у пунктов с общим `name` соседние сворачиваются
- `ctx.behavior('accordion').close(номер с 0 или id)` — свернуть пункт
- `ctx.behavior('accordion').toggle(номер с 0 или id)` — раскрыть свёрнутый пункт и свернуть раскрытый
## dialog

Части: `data-part="open"`, `data-part="content"`, `data-part="close"`.

Параметры: `data-transition` — одно из: fade, drawer, drawer-back, drop; по умолчанию `fade`; `data-side` — одно из: right, left; по умолчанию `right`; `data-modal` — да или нет; по умолчанию `true`; `data-lock-scroll` — да или нет; по умолчанию `true`; `data-open-on` — одно из: none, cart-open, cart-add, search-open; по умолчанию `none`; `data-anchor` — одно из: section, header, cart; по умолчанию `section`; `data-position` — одно из: none, center, corner, sheet; по умолчанию `none`; `data-backdrop` — да или нет; по умолчанию `true`.

Окно поверх экрана в секции любого блока. `data-position` — `center`, `sheet` или `corner`: ядро ставит окно (`<dialog data-part="content">`), задаёт переход и модальность — `center` и `sheet` модальные (затемнение, фокус внутри окна, Esc, запрет прокрутки, на странице одно такое окно), `corner` — немодальное в углу, на телефоне шторкой снизу. С `data-position` параметры `data-transition`, `data-modal` и `data-anchor` не читаются; `data-backdrop="false"` убирает затемнение под модальным окном. Без `data-position` место окна задают его классы. Умолчания места лежат в слое `base`: классы окна главнее.

```html
<div data-behavior="dialog" data-position="corner" data-side="left">
  <dialog data-part="content" class="w-full max-w-sm"><button data-part="close">Закрыть</button></dialog>
</div>
```

Команды для скрипта секции ([script.md](script.md#поведения-из-скрипта-секции)):

- `ctx.behavior('dialog').open(параметры или ничего)` — открыть окно; `{ position, side, backdrop }` меняет место на этот раз
- `ctx.behavior('dialog').close()` — закрыть окно
- `ctx.behavior('dialog').toggle()` — открыть закрытое окно и закрыть открытое
## carousel

Части: `data-part="viewport"`, `data-part="container"`, `data-part="slide"`, `data-part="prev"`, `data-part="next"`, `data-part="dot"`, `data-part="thumb"`, `data-part="counter"`, `data-part="copy"`, `data-part="play"`.

Параметры: `data-effect` — одно из: slide, fade; по умолчанию `slide`; `data-change` — одно из: 500, 700; по умолчанию `700`; `data-autoplay` — целое от 0 до 60; по умолчанию `0`; `data-loop` — да или нет; по умолчанию `true`; `data-drag` — да или нет; по умолчанию `true`.

Команды для скрипта секции ([script.md](script.md#поведения-из-скрипта-секции)):

- `ctx.behavior('carousel').next()` — следующий слайд
- `ctx.behavior('carousel').prev()` — предыдущий слайд
- `ctx.behavior('carousel').goTo(номер с 0)` — слайд по номеру, с 0
- `ctx.behavior('carousel').play()` — продолжить автопрокрутку (нужен `data-autoplay` больше 0)
- `ctx.behavior('carousel').pause()` — остановить автопрокрутку
## tabs

Части: `data-part="list"`, `data-part="trigger"`, `data-part="content"`.

Параметры: `data-value` — строка; `data-orientation` — одно из: horizontal, vertical; по умолчанию `horizontal`.

Команды для скрипта секции ([script.md](script.md#поведения-из-скрипта-секции)):

- `ctx.behavior('tabs').select(строка)` — открыть вкладку с этим `data-value`
## nav-menu

Части: `data-part="list"`, `data-part="item"`, `data-part="trigger"`, `data-part="content"`, `data-part="link"`.

Параметры: `data-open-on` — одно из: click, hover; по умолчанию `click`.
## quantity

Части: `data-part="input"`, `data-part="minus"`, `data-part="plus"`.

Параметры: —.
## card-photos

Части: `data-part="image"`.

Параметры: `data-photos` — список через пробел; по умолчанию ``; `data-hover-next` — да или нет; по умолчанию `true`.

Свайп по фото (палец или мышь с зажатием) от 30 px по горизонтали листает фото: влево — следующее, вправо — предыдущее; горизонтальный сдвиг должен быть в 1,5 раза больше вертикального, с последнего фото на первое листание не переходит. После свайпа нажатие по карточке 400 мс гасится — переход в товар не срабатывает. Горизонтальный жест закреплён за фото (`touch-action: pan-y` на части `image`), вертикальная прокрутка остаётся браузеру; если прокрутка забрала жест (`pointercancel`), свайп отменяется.
## sticky-header

Части: —.

Параметры: `data-mode` — одно из: scroll-up, always, none; по умолчанию `scroll-up`.
## video

Части: `data-part="video"`, `data-part="play"`.

Параметры: —.

Команды для скрипта секции ([script.md](script.md#поведения-из-скрипта-секции)):

- `ctx.behavior('video').play()` — запустить воспроизведение; браузер без нажатия посетителя может отказать
- `ctx.behavior('video').pause()` — поставить на паузу
## catalog

Части: `data-part="list"`, `data-part="next"`, `data-part="prev"`, `data-part="pages"`, `data-part="count"`, `data-part="filters"`, `data-part="empty"`, `data-part="status"`.

Параметры: `data-paging` — одно из: pages, more, scroll; по умолчанию `more`.
## search

Части: `data-part="input"`, `data-part="results"`, `data-part="item"`, `data-part="link"`, `data-part="image"`, `data-part="title"`, `data-part="price"`, `data-part="compare"`, `data-part="empty"`, `data-part="all"`.

Параметры: `data-limit` — целое от 1 до 20; по умолчанию `8`.
## zoom

Части: `data-part="image"`.

Параметры: `data-mode` — одно из: hover, click; по умолчанию `hover`; `data-photos` — список через пробел; по умолчанию ``.
## countdown

Части: `data-part="days"`, `data-part="hours"`, `data-part="minutes"`, `data-part="seconds"`.

Параметры: `data-until` — строка.

Таймер до даты. Идёт по времени сервера магазина (`$now` модуля `page`), а не по часам устройства, поэтому у посетителей с неверными часами показывает одно и то же; в `section.json` нужен `"uses": ["page"]`. Дата — `data-until` в формате ISO 8601 **с поясом**: `2026-12-31T23:59:59+03:00` или `2026-12-31T20:59:59Z`. Дата без пояса или неверная не принимается: в консоль уходит строка для автора, разметка не меняется. В части пишется остаток: сутки как есть, часы, минуты и секунды двумя знаками. Нужны не все части: нет `days` — часы считают и сутки, нет `hours` — минуты считают всё. Пока ответ сервера о времени не пришёл, части не трогаются. В ноль таймер останавливается и отправляет событие `merfy:countdown:end` (`section`, `id`). Цифры не анимируются: «уменьшить движение» таймер не меняет.

```html
<div data-behavior="countdown" data-until="2026-12-31T23:59:59+03:00">
  <span data-part="days"></span> д <span data-part="hours"></span>:<span data-part="minutes"></span>:<span data-part="seconds"></span>
</div>
```
## scratch

Части: `data-part="reveal"`.

Параметры: `data-color` — строка; по умолчанию `var(--muted-foreground)`.

Слой поверх элемента, который посетитель стирает курсором с зажатой кнопкой или пальцем. Слой — `canvas`, его создаёт ядро: скрипту секции `canvas` недоступен, поэтому скрипт не нужен. Элемент с `data-behavior="scratch"` должен быть с позицией (`relative`): слой растягивается на него целиком. `data-color` — цвет слоя: любой цвет CSS, в том числе токен темы `var(--primary)`. Страница под пальцем не прокручивается (`touch-action: none`): свайп по слою стирает, а не листает; вне слоя прокрутка обычная. Когда стёрто больше половины, слой убирается и уходит событие `merfy:scratch:done` (`section`, `id`). Часть `reveal` — кнопка «Показать» для клавиатуры и экранных читалок: она убирает слой так же и скрывается; ставьте её над слоем (`relative z-10`). Без неё слой недоступен с клавиатуры, и в консоль уходит строка для автора. «Уменьшить движение»: слой исчезает сразу, без затухания.

```html
<div data-behavior="scratch" data-color="var(--muted-foreground)" class="relative">
  <p>Скрытый текст</p>
  <button type="button" data-part="reveal" class="relative z-10">Показать</button>
</div>
```

## Пресеты data-animate

Пресет указывается в `data-animate="<имя>"`: `appear`, `appear-group`, `appear-side`, `fade-up`, `slide-down`, `load-1`, `load-2`, `load-3`, `letters`.

Параметры пресета: `data-delay` — целое от 0 до 5000; по умолчанию `0`.
