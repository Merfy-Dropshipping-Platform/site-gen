# Модули SDK

> SDK 1 · документация 1.0.0 · 2026-10-24

Ключ `uses` в `section.json` открывает секции данные и модули SDK. Значения:

- `"theme"` — значения сквозных настроек темы в Astro.props.theme.
- `"shop"` — публичные данные магазина в Astro.props.shop.

## Действия по модулям

## cart

Действия: `cart.add`, `cart.change`, `cart.remove`, `cart.open`, `cart.checkout`.
## favorites

Действия: `favorites.toggle`.
## auth

Действия: `auth.requestCode`, `auth.verify`, `auth.signout`, `auth.updateProfile`.
## orders

Действия: `orders.list`, `orders.get`, `orders.cancel`.
## consent

Действия: `consent.accept`, `consent.decline`.
## newsletter

Действия: `newsletter.subscribe`.
## variants

Действия: `variants.pick`.
## search

Действия: `search.open`.
