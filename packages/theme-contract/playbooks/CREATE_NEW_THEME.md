# Playbook: Создание новой темы Merfy

## Prerequisites
- Монорепо склонирован
- `pnpm install` успешен
- Figma file с дизайном темы готов

## Intent Check
Отвечай себе на вопросы:

1. Мне нужна ПОЛНОСТЬЮ НОВАЯ тема или достаточно новых tokens?
   - Новые только цвета/шрифты/радиусы → не создавай тему. Предложи пользователю.
   - Нужна новая ниша / новый визуальный язык → создавай.

2. Я буду переписывать 80%+ блоков?
   - Да → скорее всего неправильный подход, уточни требования.
   - Нет → нормальный кейс (chrome + 2-3 override'а).

## Steps

### 1. Инициализация через CLI
```bash
pnpm theme:create --name MyTheme --category fashion --from rose
```
Создаёт `packages/theme-mytheme/` scaffold. Наследует структуру от rose как базу.

### 2. Заполни `theme.json`
- `id`, `name`, `version: "0.1.0"`, `category`, `description`.
- `extends: "@merfy/theme-base@workspace:*"`.
- `features` — какие включаем (cart-drawer, otp-auth, newsletter...).

### 3. Заполни `tokens.json` из Figma
Через Tokens Studio plugin: Figma → Push tokens → `tokens.json`.
Проверь: значения RGB triplet для цветов, валидные `--font-*`, размеры в px.

### 4. Блоки — НЕ КОПИРУЙ
- Запусти `validateTheme('mytheme')` — покажет, что наследуется от base.
- Добавляй override ТОЛЬКО для блоков, где реально другая разметка (обычно chrome).
- Для каждого override'а — ОБЯЗАТЕЛЕН `reason` в manifest'е.

### 5. Custom blocks — только если реально уникально
- Создай в `customBlocks/MyBlock/` с 5 файлами.
- Зарегистрируй `theme.json → customBlocks` + `requiredFeatures`.

### 6. Валидация
```bash
pnpm theme:validate --theme mytheme
```
Смотри ошибки. Фиксируй.

### 7. Visual-diff
```bash
pnpm theme:test --theme mytheme
```
CI сам сравнит Figma ↔ constructor ↔ live.

### 8. PR — review checklist
- [ ] theme.json валиден (schema)
- [ ] tokens.json заполнен и совпадает с Figma
- [ ] Все override'ы имеют reason
- [ ] Custom blocks имеют requiredFeatures
- [ ] Visual-diff green
- [ ] README.md в packages/theme-mytheme/ описывает identity

## Common Mistakes

**«Начну с копирования rose и поменяю цвета»**
→ СТОП. Это создаёт дубль. Используй `extends: "@merfy/theme-base"` + `tokens.json`.

**Hex цвета в .astro файлах override'ов**
→ CI упадёт. Все цвета через `rgb(var(--color-*))`.

**Новый token "на лету" без registry**
→ CI упадёт. Сначала `ADD_NEW_TOKEN.md` playbook, потом используй.

**tsx файл рядом с .astro**
→ CI упадёт. Renderer ТОЛЬКО через Astro.

**Override без reason**
→ CI упадёт. Объясни зачем, одной строкой.
