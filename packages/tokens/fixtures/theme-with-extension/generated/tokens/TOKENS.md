# Токены

Сгенерировано из словаря командой generate — руками не править.

| Токен | Вид | Для чего | Если не задан | Класс | Читается на |
|---|---|---|---|---|---|
| `background` | цвет | Фон страницы и секции | задаёт тема | `bg-background` `text-background` `border-background` | — |
| `foreground` | цвет | Основной текст | задаёт тема | `bg-foreground` `text-foreground` `border-foreground` | `background` |
| `card` | цвет | Карточка: товар, отзыв, блок | как `background` | `bg-card` `text-card` `border-card` | — |
| `card-foreground` | цвет | Текст на карточке | как `foreground` | `bg-card-foreground` `text-card-foreground` `border-card-foreground` | `card` |
| `popover` | цвет | Всплывающее: меню, подсказки поиска, шторка корзины | как `background` | `bg-popover` `text-popover` `border-popover` | — |
| `popover-foreground` | цвет | Текст во всплывающем | как `foreground` | `bg-popover-foreground` `text-popover-foreground` `border-popover-foreground` | `popover` |
| `primary` | цвет | Главная кнопка: «В корзину», «Оформить» | задаёт тема | `bg-primary` `text-primary` `border-primary` | — |
| `primary-foreground` | цвет | Текст на главной кнопке | белый или чёрный к `primary` | `bg-primary-foreground` `text-primary-foreground` `border-primary-foreground` | `primary` |
| `primary-hover` | цвет | Главная кнопка под курсором | наведение от `primary` | `bg-primary-hover` `text-primary-hover` `border-primary-hover` | — |
| `primary-hover-foreground` | цвет | Текст главной кнопки под курсором | как `primary-foreground` | `bg-primary-hover-foreground` `text-primary-hover-foreground` `border-primary-hover-foreground` | `primary-hover` |
| `primary-border` | цвет | Обводка главной кнопки | как `primary` | `bg-primary-border` `text-primary-border` `border-primary-border` | — |
| `secondary` | цвет | Второстепенная кнопка | смесь: 6 % `foreground` в `background` | `bg-secondary` `text-secondary` `border-secondary` | — |
| `secondary-foreground` | цвет | Текст на второстепенной кнопке | как `foreground` | `bg-secondary-foreground` `text-secondary-foreground` `border-secondary-foreground` | `secondary` |
| `secondary-hover` | цвет | Второстепенная кнопка под курсором | наведение от `secondary` | `bg-secondary-hover` `text-secondary-hover` `border-secondary-hover` | — |
| `secondary-hover-foreground` | цвет | Текст второстепенной кнопки под курсором | как `secondary-foreground` | `bg-secondary-hover-foreground` `text-secondary-hover-foreground` `border-secondary-hover-foreground` | `secondary-hover` |
| `secondary-border` | цвет | Обводка второстепенной кнопки | как `secondary` | `bg-secondary-border` `text-secondary-border` `border-secondary-border` | — |
| `muted` | цвет | Приглушённая подложка: полоса, место под фото | смесь: 4 % `foreground` в `background` | `bg-muted` `text-muted` `border-muted` | — |
| `muted-foreground` | цвет | Второстепенный текст: подписи, описание | смесь: 60 % `foreground` в `background` | `bg-muted-foreground` `text-muted-foreground` `border-muted-foreground` | `background`, `muted` |
| `accent` | цвет | Подсветка пункта меню и строки под курсором | смесь: 6 % `foreground` в `background` | `bg-accent` `text-accent` `border-accent` | — |
| `accent-foreground` | цвет | Текст на подсветке | как `foreground` | `bg-accent-foreground` `text-accent-foreground` `border-accent-foreground` | `accent` |
| `destructive` | цвет | Ошибка и удаление | задаёт тема | `bg-destructive` `text-destructive` `border-destructive` | — |
| `destructive-foreground` | цвет | Текст на цвете ошибки | белый или чёрный к `destructive` | `bg-destructive-foreground` `text-destructive-foreground` `border-destructive-foreground` | `destructive` |
| `border` | цвет | Рамки и разделители | смесь: 12 % `foreground` в `background` | `bg-border` `text-border` `border-border` | — |
| `input` | цвет | Рамка поля ввода | как `border` | `bg-input` `text-input` `border-input` | — |
| `ring` | цвет | Обводка фокуса с клавиатуры | как `primary` | `bg-ring` `text-ring` `border-ring` | — |
| `heading` | цвет | Заголовки | как `foreground` | `bg-heading` `text-heading` `border-heading` | `background` |
| `price` | цвет | Цена | как `foreground` | `bg-price` `text-price` `border-price` | `background` |
| `price-old` | цвет | Старая, зачёркнутая цена | как `muted-foreground` | `bg-price-old` `text-price-old` `border-price-old` | `background` |
| `sale` | цвет | Скидка: плашка «−20 %» и цена со скидкой | как `destructive` | `bg-sale` `text-sale` `border-sale` | `background` |
| `sale-foreground` | цвет | Текст на плашке скидки | белый или чёрный к `sale` | `bg-sale-foreground` `text-sale-foreground` `border-sale-foreground` | `sale` |
| `badge` | цвет | Бейдж «Новинка», «Хит» | как `primary` | `bg-badge` `text-badge` `border-badge` | — |
| `badge-foreground` | цвет | Текст на бейдже | белый или чёрный к `badge` | `bg-badge-foreground` `text-badge-foreground` `border-badge-foreground` | `badge` |
| `font-body` | шрифт | Шрифт текста | задаёт тема | `font-body` | — |
| `font-heading` | шрифт | Шрифт заголовков | как `font-body` | `font-heading` | — |
| `weight-body` | насыщенность | Насыщенность шрифта текста: толщина букв | задаёт тема | `weight-body` | — |
| `weight-heading` | насыщенность | Насыщенность шрифта заголовков: толщина букв | задаёт тема | `weight-heading` | — |
| `text-xs` | размер | Самый мелкий: сноски, счётчик на значке | задаёт тема | `text-xs` | — |
| `text-sm` | размер | Подписи, кнопки, поля | задаёт тема | `text-sm` | — |
| `text-base` | размер | Основной текст | задаёт тема | `text-base` | — |
| `text-lg` | размер | Вводный абзац | задаёт тема | `text-lg` | — |
| `text-xl` | размер | Название товара в карточке | задаёт тема | `text-xl` | — |
| `text-2xl` | размер | Заголовок блока | задаёт тема | `text-2xl` | — |
| `text-3xl` | размер | Заголовок секции | задаёт тема | `text-3xl` | — |
| `text-4xl` | размер | Заголовок страницы | задаёт тема | `text-4xl` | — |
| `text-5xl` | размер | Главный заголовок первого экрана | задаёт тема | `text-5xl` | — |
| `tracking-body` | межбуквенное | Межбуквенное расстояние текста, em | `0 em` | `tracking-body` | — |
| `tracking-heading` | межбуквенное | Межбуквенное расстояние заголовков, em | `0 em` | `tracking-heading` | — |
| `radius-button` | скругление | Скругление кнопок | задаёт тема | `rounded-button` | — |
| `radius-input` | скругление | Скругление полей ввода | как `radius-button` | `rounded-input` | — |
| `radius-card` | скругление | Скругление карточек | задаёт тема | `rounded-card` | — |
| `radius-media` | скругление | Скругление фото и видео | как `radius-card` | `rounded-media` | — |
| `radius-popover` | скругление | Скругление всплывающего и шторки | как `radius-card` | `rounded-popover` | — |
| `radius-badge` | скругление | Скругление бейджа и плашки скидки | как `radius-button` | `rounded-badge` | — |
| `border-width-button` | толщина рамки | Толщина обводки кнопок | `0 px` | `border-width-button` | — |
| `border-width-input` | толщина рамки | Толщина рамки поля ввода | `1 px` | `border-width-input` | — |
| `border-width-card` | толщина рамки | Толщина обводки карточки товара | `0 px` | `border-width-card` | — |
| `border-width-media` | толщина рамки | Толщина рамки фото и видео | `0 px` | `border-width-media` | — |
| `border-width-popover` | толщина рамки | Толщина рамки всплывающего | `1 px` | `border-width-popover` | — |
| `shadow-button` | тень | Тень кнопок | `без тени` | `shadow-button` | — |
| `shadow-input` | тень | Тень полей ввода | `без тени` | `shadow-input` | — |
| `shadow-card` | тень | Тень карточки товара | `без тени` | `shadow-card` | — |
| `shadow-media` | тень | Тень фото и видео | `без тени` | `shadow-media` | — |
| `shadow-popover` | тень | Тень всплывающего | `0 8 24 0, 12 %` | `shadow-popover` | — |
| `shadow-drawer` | тень | Тень шторки | `0 0 32 0, 16 %` | `shadow-drawer` | — |
| `spacing-section` | отступ | Отступ сверху и снизу секции | задаёт тема | `p-section` `gap-section` | — |
| `spacing-section-gap` | отступ | Отступ между секциями | `0 px` | `p-section-gap` `gap-section-gap` | — |
| `spacing-card` | отступ | Внутренний отступ карточки товара | `0 px` | `p-card` `gap-card` | — |
| `spacing-grid-column` | отступ | Расстояние между колонками сетки товаров | `16 px` | `p-grid-column` `gap-grid-column` | — |
| `spacing-grid-row` | отступ | Расстояние между рядами сетки товаров | `24 px` | `p-grid-row` `gap-grid-row` | — |
| `width-page` | ширина | Ширина содержимого страницы | задаёт тема | `max-w-page` `w-page` | — |
| `width-logo` | ширина | Ширина логотипа | `120 px` | `max-w-logo` `w-logo` | — |
| `choice-card-style` | выбор | Вид карточки товара: стандарт или карточка | `standard` | `card-style-standard:` `card-style-card:` | — |
| `choice-card-align` | выбор | Выравнивание в карточке товара | `left` | `card-align-left:` `card-align-center:` `card-align-right:` | — |
| `choice-motion-reveal` | выбор | Появление секций при прокрутке | `off` | `motion-reveal-off:` `motion-reveal-on:` | — |
| `choice-motion-hover` | выбор | Отклик карточки товара на курсор: нет или подъём | `none` | `motion-hover-none:` `motion-hover-lift:` | — |
| `scheme-card` | схема детали | Цветовая схема карточки товара | не задана — как у родителя | `scheme-card` | — |
| `scheme-cart-drawer` | схема детали | Цветовая схема шторки корзины | не задана — как у родителя | `scheme-cart-drawer` | — |
| `scheme-cookie-banner` | схема детали | Цветовая схема баннера cookie | не задана — как у родителя | `scheme-cookie-banner` | — |
| `theme-gold` | цвет | Золото для акций и бейджа «Хит» | задаёт тема | `bg-theme-gold` `text-theme-gold` `border-theme-gold` | — |
| `theme-gold-foreground` | цвет | Текст на золоте | белый или чёрный к `theme-gold` | `bg-theme-gold-foreground` `text-theme-gold-foreground` `border-theme-gold-foreground` | `theme-gold` |
| `radius-theme-pill` | скругление | Капсула для тегов | `999 px` | `rounded-theme-pill` | — |
| `shadow-theme-glow` | тень | Золотое свечение карточки акции | `0 0 24 0, 35 %, цвет theme-gold` | `shadow-theme-glow` | — |
| `choice-theme-ribbon` | выбор | Лента «Хит» на карточке | `off` | `theme-ribbon-off:` `theme-ribbon-on:` | — |
