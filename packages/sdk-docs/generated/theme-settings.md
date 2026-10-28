# Настройки темы

> SDK 1 · документация 1.5.0 · 2026-10-29

Сквозные настройки общие у всех секций: их задаёт мерчант в «Настройках темы», секция читает значения. Список — из общих настроек платформы.

## Логотип

| id | Подпись |
|---|---|
| `logo-image` | Картинка |
## Социальные сети

| id | Подпись |
|---|---|
| `social-telegram` | Telegram |
| `social-vk` | Вконтакте |
| `social-dzen` | Дзен |
| `social-youtube` | Youtube |
| `social-tiktok` | TikTok |
| `social-max` | MAX |
## Корзина

| id | Подпись |
|---|---|
| `cart-type` | Вид корзины |
## Баннер

| id | Подпись |
|---|---|
| `cookie-banner-enabled` | Баннер cookie |
## Избранное

| id | Подпись |
|---|---|
| `wishlist-enabled` | Избранное |

## Как читать

Объяви `"uses": ["theme"]` в `section.json` и читай значение в шаблоне:

```astro
---
const { settings, theme } = Astro.props;
---
<p class="m-0">{theme['logo-image']}</p>
```
