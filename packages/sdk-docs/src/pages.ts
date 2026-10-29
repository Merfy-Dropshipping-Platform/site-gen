// Страницы документации по порядку (блок 14, раздел 14.1): одна таблица для llms.txt, llms-full.txt и тестов.
export interface PageSpec {
  file: string; // 'start.md'
  title: string; // заголовок страницы и текст ссылки в llms.txt
  about: string; // строка после ссылки в llms.txt
  section: 'Гайд' | 'Начать' | 'Справочник' | 'Ошибки проверки';
}

export const PAGES: readonly PageSpec[] = [
  {
    file: 'anatomy.md',
    title: 'Из чего состоит секция',
    about:
      'section.json, template.astro и script.ts, как они связаны, откуда секция берёт данные и как общается со страницей',
    section: 'Гайд',
  },
  {
    file: 'path.md',
    title: 'Путь секции до витрины',
    about: 'написал, проверка, сохранение, публикация и сборка магазина, витрина: что происходит на каждом шаге',
    section: 'Гайд',
  },
  {
    file: 'start.md',
    title: 'Как сделать секцию',
    about: 'порядок работы, адреса проверки и сохранения, разобранный пример',
    section: 'Начать',
  },
  {
    file: 'template/AGENTS.md',
    title: 'Шаблон секции',
    about: 'правила для ИИ и файлы, с которых начинать',
    section: 'Начать',
  },
  {
    file: 'code.md',
    title: 'Как писать код секции',
    about: 'декларативный шаблон и скрипт: правила «плохо → хорошо», предупреждения taste-*',
    section: 'Начать',
  },
  { file: 'section-json.md', title: 'section.json', about: 'ключи, виды полей, блоки, группы', section: 'Справочник' },
  {
    file: 'names.md',
    title: 'Имена полей',
    about: 'словарь имён и что вместо имён не из словаря',
    section: 'Справочник',
  },
  { file: 'template.md', title: 'template.astro', about: 'frontmatter, выражения, что нельзя', section: 'Справочник' },
  { file: 'styles.md', title: 'Классы и токены', about: 'словарь классов, токены секции', section: 'Справочник' },
  { file: 'script.md', title: 'script.ts', about: 'defineSection, ctx, El', section: 'Справочник' },
  { file: 'modules.md', title: 'Модули SDK', about: 'uses и действия по модулям', section: 'Справочник' },
  { file: 'events.md', title: 'События', about: 'события витрины и их данные', section: 'Справочник' },
  { file: 'actions.md', title: 'Действия', about: 'data-action и ответы действий', section: 'Справочник' },
  {
    file: 'behaviors.md',
    title: 'Поведения и анимации',
    about: 'data-behavior, части, параметры, data-animate',
    section: 'Справочник',
  },
  {
    file: 'theme-settings.md',
    title: 'Настройки темы',
    about: 'сквозные настройки и как их читать',
    section: 'Справочник',
  },
  { file: 'pages.md', title: 'Страницы', about: 'группы, особые страницы, заголовки', section: 'Справочник' },
  { file: 'data.md', title: 'Данные магазина', about: 'uses, Astro.props.theme и shop', section: 'Справочник' },
  {
    file: 'errors.md',
    title: 'Коды ошибок',
    about: 'когда бывает код, как исправить, пример',
    section: 'Ошибки проверки',
  },
  { file: 'limits.md', title: 'Лимиты', about: 'пределы файлов, полей, скрипта, проверки', section: 'Справочник' },
  { file: 'changelog.md', title: 'Что нового', about: 'изменения по версиям', section: 'Справочник' },
];
