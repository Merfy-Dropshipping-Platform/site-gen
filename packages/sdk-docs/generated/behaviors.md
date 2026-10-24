# Поведения и анимации

> SDK 1 · документация 1.0.0 · 2026-10-24

Готовое поведение вешается на элемент атрибутом `data-behavior="<имя>"` — без скрипта. Части поведения отмечаются `data-part`, параметры — своими `data-…` на том же элементе.

## accordion

Части: `data-part="content"`.

Параметры: —.
## dialog

Части: `data-part="open"`, `data-part="content"`, `data-part="close"`.

Параметры: `data-transition` — одно из: fade, drawer, drawer-back, drop; по умолчанию `fade`; `data-side` — одно из: right, left; по умолчанию `right`; `data-modal` — да или нет; по умолчанию `true`.
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

Параметры: `data-photos` — список через запятую; по умолчанию ``; `data-hover-next` — да или нет; по умолчанию `true`.
## sticky-header

Части: —.

Параметры: `data-mode` — одно из: scroll-up, always, none; по умолчанию `scroll-up`.
## video

Части: `data-part="video"`, `data-part="play"`.

Параметры: —.

## Пресеты data-animate

Пресет указывается в `data-animate="<имя>"`: `appear`, `appear-group`, `appear-side`, `fade-up`, `slide-down`, `load-1`, `load-2`, `load-3`, `letters`.

Параметры пресета: `data-delay` — целое от 0 до 5000; по умолчанию `0`.
