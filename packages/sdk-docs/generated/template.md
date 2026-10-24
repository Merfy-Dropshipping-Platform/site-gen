# template.astro

> SDK 1 · документация 1.0.0 · 2026-10-24

`template.astro` — разметка секции на Astro. Сборка рендерит её на сервере со значениями полей мерчанта.

## Frontmatter

Одна строка или ни одной: `const { settings } = Astro.props;`. Имена в скобках — `settings`, `blocks` (если в
`section.json` есть `blocks`), `theme` и `shop` (только с `"uses": ["theme"]` и `"uses": ["shop"]`), каждое один раз.
Других операторов во frontmatter нет: `import`, функции и переменные — нельзя.

```astro
---
const { settings, blocks } = Astro.props;
---
<div class="mx-auto flex max-w-page flex-col gap-4 px-4 font-body">
  {settings.heading && <h2 class="m-0 font-heading weight-heading text-3xl text-heading">{settings.heading}</h2>}
  {blocks.map((block) => <p class="m-0">{block.settings.text}</p>)}
</div>
```

## Что можно

- Выражения `{…}`: поля (`settings.heading`, `settings['heading-size']`), сравнения, `&&`, `?:`, `blocks.map`.
- `class:list` — классы по условию: `class:list={['m-0', { 'text-5xl': settings['heading-size'] === 'large' }]}`.
- `set:html` — только у поля вида `richtext`: `<div set:html={block.settings.answer}></div>`.
- Атрибуты `data-*` — для скрипта (`data-ref`, `data-action`) и поведений (`data-behavior`, `data-part`,
  `data-animate`).
- Пустое значение: мерчант может стереть любое поле — `{settings.heading && <h2>…</h2>}`.

## Что нельзя

- Теги: `<script>`, `<style>`, `<link>`, `<meta>`, `<base>`, `<html>`, `<head>`, `<body>`, `<title>`, `<iframe>`, `<frame>`, `<object>`, `<embed>`, `<merfy-section>`.
- Компоненты (имя с большой буквы), кроме `<Fragment>`.
- Обработчики `on…`, адреса `javascript:`, `{...}` в атрибутах, директивы `set:text`, `is:inline`, `is:raw`,
  `define:vars`, `client:*`, `server:*`, `transition:*`; `set:html` у поля не вида `richtext`.
- Атрибут `style` и свой CSS: только [классы словаря](styles.md).
- Имена с префиксом `__merfy` — служебные.

Отступы сверху и снизу секции задаёт обёртка `<merfy-section>` — в шаблоне их нет.

