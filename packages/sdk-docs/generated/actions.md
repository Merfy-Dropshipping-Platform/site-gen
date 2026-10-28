# Действия

> SDK 1 · документация 1.4.0 · 2026-10-28

Действия SDK вызывает ядро по `data-action="<имя>"` в разметке секции — без скрипта. Ответ каждого действия — в его описании; при сбое секция получает ошибку, покупатель — уведомление.

| Действие | Модуль | Что делает и что отвечает | Параметры разметки |
|---|---|---|---|
| `cart.add` | cart | добавить товар в корзину; аргументы { productId, variantId?, quantity? = 1 }, ответ — CartState | `data-product-id`, `data-variant-id`, `data-quantity` |
| `cart.change` | cart | поменять количество строки корзины; аргументы { lineId, quantity }, 0 — убрать строку; ответ — CartState | `data-line-id`, `data-quantity` |
| `cart.remove` | cart | убрать строку из корзины; аргументы { lineId }, ответ — CartState | `data-line-id` |
| `cart.open` | cart | открыть корзину: при «Сайдбар» и выезжающей корзине на странице — merfy:cart:open, иначе переход на /cart; ответ — { drawer } | — |
| `cart.checkout` | cart | перейти в оформление заказа: номер корзины и копия строк для оформления, переход на /checkout | — |
| `favorites.toggle` | favorites | отметить товар в избранном или снять отметку; аргументы { productId }, ответ — { added } | `data-product-id` |
| `auth.requestCode` | auth | отправить письмо с кодом и ссылкой для входа; аргументы { email }, ответ — {} | только из script.ts |
| `auth.verify` | auth | войти по коду { email, code } или ссылке { token }; ответ — { customer }, потом merfy:auth:signin; на «Входе» — переход по ?redirect или в кабинет | только из script.ts |
| `auth.signout` | auth | выйти: токен и избранное браузера стёрты, merfy:auth:signout; в кабинете — переход на «Вход» | — |
| `auth.updateProfile` | auth | сохранить имя и телефон; аргументы { name?, phone? }, ответ — { customer } | только из script.ts |
| `orders.list` | orders | заказы покупательницы, новые сверху; ответ — { orders } | только из script.ts |
| `orders.get` | orders | заказ по номеру; аргументы { number }, ответ — { order } | только из script.ts |
| `orders.cancel` | orders | отменить заказ; аргументы { number, reason }, ответ — { order } | только из script.ts |
| `consent.accept` | consent | покупатель принял cookie: счётчики мерчанта и «свой код» с ожиданием согласия запускаются; ответ — "accepted" | — |
| `consent.decline` | consent | покупатель отклонил cookie: аналитика ничего не отправляет, счётчиков нет; ответ — "declined" | — |
| `newsletter.subscribe` | newsletter | подписать на рассылку магазина; аргументы { email }, ответ — { alreadySubscribed }; e-mail — из поля формы | только из script.ts |
| `variants.pick` | variants | выбрать значение группы вариантов товара; аргументы { productId, group, value } — id из JSON вариантов страницы, ответ — Variant, потом merfy:variant:change | `data-product-id`, `data-group`, `data-value` |
| `search.open` | search | открыть панель поиска: есть на странице — merfy:search:open, нет — переход на /catalog; ответ — { panel } | — |

Свои действия секция описывает в `script.ts` ([script.md](script.md)).
