# @merfy/tokens

Словарь токенов новых тем: 78 базовых токенов, расширение темой, расчёт значений, CSS, классы Tailwind,
поиск словами мерчанта и инструмент для ИИ. Нынешние темы пакет не трогает — они остаются на `buildTokensCss`.

Пакет отдаёт исходники TypeScript без сборки, как `theme-contract`. Работает в браузере и на сервере, ничего про ИИ
не импортирует.

## Как подключить

```ts
import { parseTheme, parseTokenEdits, tokensCss, choiceAttributes, resolveTokens } from '@merfy/tokens';

const theme = parseTheme(themeJson.tokens); // словарь темы и значения; ошибки — TokenError с кодом
const edits = parseTokenEdits(theme, revisionEdits); // правки мерчанта
const css = tokensCss(theme.dictionary, theme.tokens, edits); // :root, схемы, схемы деталей, покраска
const attributes = choiceAttributes(theme.dictionary, resolveTokens(theme.dictionary, theme.tokens, edits));
```

Классы Tailwind: тема без расширения подключает `@import "tailwindcss"; @import "@merfy/tokens/tailwind.css";`,
тема с расширением — свой `generated/tokens/tailwind.css`.

## Команды

```bash
pnpm test            # тесты
pnpm test:coverage   # тесты с покрытием, порог 80 %
pnpm typecheck
pnpm lint
pnpm format:check
pnpm generate                      # generated/: tailwind.css, TOKENS.md, theme.schema.json, dictionary.schema.json
pnpm generate --theme <папка темы> # <папка темы>/generated/tokens/: tailwind.css, TOKENS.md, theme.schema.json
```

Файлы в `generated/` руками не правят. Тест расхождения сравнивает их с генерацией в памяти и подсказывает команду.

## Как добавить токен

1. Допишите запись в `dictionary.json`: вид, описание, раздел, правило или умолчание (`derive` или `default`),
   у цвета — `on`, у выбора — `values`. Имя — kebab-case латиницей с приставкой вида (`radius-`, `shadow-`, …),
   у цвета без приставки.
2. `pnpm generate`.
3. Если мерчант будет искать токен словами, которых нет в его описании, — допишите их в `search-words.json`
   (раздел ниже). Токен и его слова меняются одним коммитом.
4. `pnpm test` — тест словаря проверит запись, тест Tailwind — классы.

## Как теме дописать свой токен

Тема пишет записи в `theme.json` → `tokens.extend` — той же формой, что в словаре. Имя с меткой `theme`: цвет —
`theme-…`, остальные виды — `<вид>-theme-…` (`radius-theme-pill`). Свой токен может опираться на базовые, базовые на
свои — нет; переопределить базовый нельзя. Потом `pnpm generate --theme <папка темы>` — файлы появятся в
`<папка темы>/generated/tokens/`. Образец — `fixtures/theme-with-extension/`.

## Как добавить слово для поиска

`search-words.json`:

- `parts` — слово мерчанта → части имён токенов: `"рамка": ["border"]`. Часть должна быть в имени хотя бы одного
  токена — это проверяет тест;
- `kindWords` — слова вида («цвет», «тень»): без предмета они не ищут;
- `valueWords` — значения и оттенки словами («темнее», «красный»): не ищутся;
- `stopWords`, `actionWords` — стоп-слова и слова действий;
- `forms` — формы, на которых ошибается стеммер: `"кнопок": "кнопки"`.

Поля не про вид — картинка логотипа, соцсети, вид корзины, баннер cookie — это настройки секций, они в
`not-tokens.json`: поиск отвечает, где это меняется. После правки — `pnpm test`: 134 проверочных запроса в
`fixtures/search-queries.json` должны пройти.

Движок поиска — `src/search/engine.ts`, копия `merfy-mcp/src/search.ts` без изменений. Её не правят: тест сверяет
хэш тела с шапкой.

## Как подключить ИИ

Инструмент один: `tokens` с шестью действиями — `find`, `describe`, `check`, `set`, `groups`, `list`. Снять правку
нельзя: её меняют новой правкой через `set`.

```ts
import { createTokensTool } from '@merfy/tokens';

const tool = createTokensTool({
  load: async () => ({ dictionary, theme, edits }), // хозяин правок: черновик редактора или ревизия
  save: async (edits) => saveDraft(edits), // set отдаёт новые правки целиком
});
// Переходник (MCP, LangChain, чат в конструкторе) переносит tool.name, tool.description и tool.inputSchema в свой
// формат и зовёт tool.call(input) — вход от модели, ответ — короткий текст.
```

Нет поля или действия — инструмент отвечает адресно («find: нужно поле query.»), а не бросает исключение.
