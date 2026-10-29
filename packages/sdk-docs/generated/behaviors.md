# Поведения и анимации

> SDK 1 · документация 1.11.0 · 2026-10-29

Готовое поведение вешается на элемент атрибутом `data-behavior="<имя>"` — без скрипта. Части поведения отмечаются `data-part`, параметры — своими `data-…` на том же элементе.

## accordion

Части: `data-part="content"`.

Параметры: —.
## dialog

Части: `data-part="open"`, `data-part="content"`, `data-part="close"`.

Параметры: `data-transition` — одно из: fade, drawer, drawer-back, drop; по умолчанию `fade`; `data-side` — одно из: right, left; по умолчанию `right`; `data-modal` — да или нет; по умолчанию `true`; `data-open-on` — одно из: none, cart-open, cart-add, search-open; по умолчанию `none`; `data-anchor` — одно из: section, header; по умолчанию `section`.
## carousel

Части: `data-part="viewport"`, `data-part="container"`, `data-part="slide"`, `data-part="prev"`, `data-part="next"`, `data-part="dot"`, `data-part="thumb"`, `data-part="counter"`, `data-part="copy"`, `data-part="play"`.

Параметры: `data-effect` — одно из: slide, fade; по умолчанию `slide`; `data-change` — одно из: 500, 700; по умолчанию `700`; `data-autoplay` — целое от 0 до 60; по умолчанию `0`; `data-loop` — да или нет; по умолчанию `true`; `data-drag` — да или нет; по умолчанию `true`.
## tabs

Части: `data-part="list"`, `data-part="trigger"`, `data-part="content"`.

Параметры: `data-value` — строка; `data-orientation` — одно из: horizontal, vertical; по умолчанию `horizontal`.
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
## catalog

Части: `data-part="list"`, `data-part="next"`, `data-part="prev"`, `data-part="pages"`, `data-part="count"`, `data-part="filters"`, `data-part="empty"`, `data-part="status"`.

Параметры: `data-paging` — одно из: pages, more, scroll; по умолчанию `more`.
## search

Части: `data-part="input"`, `data-part="results"`, `data-part="item"`, `data-part="link"`, `data-part="image"`, `data-part="title"`, `data-part="price"`, `data-part="compare"`, `data-part="empty"`, `data-part="all"`.

Параметры: `data-limit` — целое от 1 до 20; по умолчанию `8`.
## zoom

Части: `data-part="image"`.

Параметры: `data-mode` — одно из: hover, click; по умолчанию `hover`; `data-photos` — список через пробел; по умолчанию ``.

## Пресеты data-animate

Пресет указывается в `data-animate="<имя>"`: `appear`, `appear-group`, `appear-side`, `fade-up`, `slide-down`, `load-1`, `load-2`, `load-3`, `letters`.

Параметры пресета: `data-delay` — целое от 0 до 5000; по умолчанию `0`.
