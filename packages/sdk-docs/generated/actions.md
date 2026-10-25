# Действия

> SDK 1 · документация 1.0.0 · 2026-10-24

Действия SDK вызывает ядро по `data-action="<имя>"` в разметке секции — без скрипта. Ответ каждого действия — в его описании; при сбое секция получает ошибку, покупатель — уведомление.

| Действие | Модуль | Что делает и что отвечает | Параметры разметки |
|---|---|---|---|
| `cart.add` | cart | добавить товар в корзину; аргументы { productId, variantId?, quantity? = 1 }, ответ — CartState | `data-product-id`, `data-variant-id`, `data-quantity` |
| `favorites.toggle` | favorites | отметить товар в избранном или снять отметку; аргументы { productId }, ответ — { added } | `data-product-id` |
| `consent.accept` | consent | покупатель принял cookie: счётчики мерчанта и «свой код» с ожиданием согласия запускаются; ответ — "accepted" | — |
| `consent.decline` | consent | покупатель отклонил cookie: аналитика ничего не отправляет, счётчиков нет; ответ — "declined" | — |
| `newsletter.subscribe` | newsletter | подписать на рассылку магазина; аргументы { email }, ответ — { alreadySubscribed }; e-mail — из поля формы | только из script.ts |
| `variants.pick` | variants | выбрать значение группы вариантов товара; аргументы { productId, group, value } — id из JSON вариантов страницы, ответ — Variant, потом merfy:variant:change | `data-product-id`, `data-group`, `data-value` |
| `search.open` | search | открыть панель поиска: есть на странице — merfy:search:open, нет — переход на /catalog; ответ — { panel } | — |

Свои действия секция описывает в `script.ts` ([script.md](script.md)).
