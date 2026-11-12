# Действия

> SDK 1 · документация 1.38.0 · 2026-11-12

Действия SDK вызывает ядро по `data-action="<имя>"` в разметке секции — без скрипта. Из `script.ts` то же действие вызывается как `ctx.<модуль>.<действие>(…)`. Ответ каждого действия — в его описании: это содержимое `data` ответа `Result`, а не весь ответ ([ответ действия](#ответ-действия)).

| Действие | Модуль | Что делает и что отвечает | Параметры разметки |
|---|---|---|---|
| `cart.add` | cart | добавить товар в корзину; аргументы { productId, variantId?, quantity? = 1 }, ответ — CartState | `data-product-id`, `data-variant-id`, `data-quantity` |
| `cart.change` | cart | поменять количество строки корзины; аргументы { lineId, quantity }, 0 — убрать строку; ответ — CartState | `data-line-id`, `data-quantity` |
| `cart.remove` | cart | убрать строку из корзины; аргументы { lineId }, ответ — CartState | `data-line-id` |
| `cart.open` | cart | открыть корзину: при «Сайдбар» и выезжающей корзине на странице — merfy:cart:open, иначе переход на /cart; ответ — { drawer } | — |
| `cart.checkout` | cart | перейти в оформление заказа: номер корзины и копия строк для оформления, переход на /checkout | — |
| `checkout.set` | checkout | записать поле покупателя; аргументы { field, value }, field — email, phone, country, firstName, lastName, city, address, postalCode; город и адрес дают подсказки в $hints; ответ — CheckoutForm | только из script.ts |
| `checkout.leave` | checkout | покупатель ушёл с поля — в $form.errors появляется ошибка этого поля; аргументы { field }, ответ — CheckoutForm | только из script.ts |
| `checkout.pickHint` | checkout | выбрать подсказку адреса из $hints: город или адрес с домом и индексом; аргументы { id }, ответ — CheckoutForm | `data-hint-id` |
| `checkout.selectDelivery` | checkout | выбрать способ доставки из $delivery.options; аргументы { id }, ответ — CheckoutDelivery | `data-option-id` |
| `checkout.selectPoint` | checkout | выбрать пункт выдачи перевозчика из $delivery.points; аргументы { code }, ответ — CheckoutDelivery | `data-point-code` |
| `checkout.selectPayment` | checkout | выбрать способ оплаты: bank_card, sbp, sberbank, tinkoff_bank — из $payment.methods; аргументы { method }, ответ — CheckoutPayment | `data-method` |
| `checkout.applyPromo` | checkout | применить промокод к корзине; аргументы { code }, ответ — CheckoutPromo; отказ магазина — в $promo.error | только из script.ts |
| `checkout.removePromo` | checkout | убрать промокод; ответ — CheckoutPromo | — |
| `checkout.submit` | checkout | «Оплатить»: проверка полей, заказ и переход на страницу платёжки выбранным способом, потом merfy:checkout:order; ошибки полей — в $form.errors, остальное — в $status.error; повтор не создаёт второй заказ | — |
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
| `share.page` | share | поделиться страницей: окно «Поделиться» системы с названием и адресом страницы, нет окна — адрес в буфер обмена; ответ — { method: "share" | "copy" } | — |
| `share.copy` | share | скопировать текст в буфер обмена (промокод, ссылку); аргументы { text }, ответ — {}; нет буфера — запасной способ; успех — уведомление «Скопировано» | `data-text` |
| `overlay.close` | overlay | закрыть окно своей секции поверх страницы: фокус возвращается туда, где был до открытия, потом merfy:overlay:close с reason "button"; ответ — {} | — |

Свои действия секция описывает в `script.ts` ([script.md](script.md)).

## Ответ действия

Вызов из `script.ts` ничего не бросает и возвращает `Promise<Result>`: `{ ok: true, data }` или `{ ok: false, error: { code, message } }`. В `data` — ответ из таблицы выше. При неудаче платформа сама показывает покупателю уведомление (событие `merfy:notice:show`), если вторым аргументом не передано `{ quiet: true }`: тогда ошибку показывает секция. Тот же `Result` возвращает вызов функции расширения `ctx.ext.<id>.<метод>(…)` — [script.md](script.md#вызов-функции-расширения).

| `error.code` | Когда приходит |
|---|---|
| `'out-of-stock'` | товара нет в наличии — уведомление покупателю |
| `'limit'` | больше остатка или слишком много запросов (429) — уведомление покупателю |
| `'unauthorized'` | нужен вход: покупатель не вошёл (запрос не уходит) или сервер ответил 401 — «Войдите, чтобы продолжить» |
| `'network'` | ответа нет: обрыв связи или 10 секунд без ответа — уведомление покупателю |
| `'server'` | сбой на сервере или в расширении, незнакомый ответ — уведомление «Не получилось. Попробуйте ещё раз через минуту» |
| `'invalid'` | ошибка в коде секции (неверные аргументы, нет такого товара или функции) — уведомления нет, строка для автора уходит в консоль |
| `'refused'` | функция расширения отказала через `refuse(код, текст)`: `error.message` — её текст, покупатель видит его в уведомлении; у методов `ctx.ext.<id>`. Ещё у `ctx.behavior("dialog").open()` — на странице уже открыто другое модальное окно; у команд поведений — нет такого пункта, слайда или вкладки; без уведомления (script.md#поведения-из-скрипта-секции). Так же у устаревшего `ctx.overlay.open()` (script.md#окно-поверх-страницы) |
