import type { ProblemCode } from './problems';

// Справка по кодам проверки (блок 14 «Секций и SDK», 14.6, п. 8): когда бывает код и как исправить — для страницы
// errors.md документации SDK и ответа ИИ. Тип Record<ProblemCode, …>: новый код без справки не проходит typecheck —
// справку пишет тот, кто добавляет код, в той же правке.
export interface ProblemInfo {
  readonly when: string; // когда бывает — одно предложение
  readonly fix: string; // как исправить — одно предложение
  readonly example?: { readonly before: string; readonly after: string }; // было → стало, по строке
}

export const problemDoc = (code: ProblemCode): string => `errors.md#${code}`;

export const PROBLEM_INFO: Readonly<Record<ProblemCode, ProblemInfo>> = {
  'manifest-missing': {
    when: 'В папке секции нет файла section.json.',
    fix: 'Создай section.json с ключами sdk, name, kind, title — начни с шаблона секции.',
  },
  'manifest-invalid': {
    when: '`section.json` — не JSON, в нём лишний или пропущенный ключ, не тот вид значения или ключ старого формата.',
    fix: 'Исправь ключ, названный в ответе; ключи и их виды — на странице section-json.md.',
    example: { before: '"fields": [...]', after: '"settings": [...]' },
  },
  'sdk-unsupported': {
    when: 'В section.json версия SDK, которой проверка не знает.',
    fix: 'Поставь "sdk": 1.',
    example: { before: '"sdk": 2', after: '"sdk": 1' },
  },
  'setting-invalid': {
    when: 'Поле настройки собрано неверно: значение по умолчанию не своего вида, повторён id, у списка нет вариантов.',
    fix: 'Исправь поле, названное в ответе; формы полей по видам — на странице section-json.md.',
  },
  'file-unknown': {
    when: 'В секции файл, которого нет в формате: формат — section.json, template.astro и файлы скрипта .ts/.js.',
    fix: 'Убери файл; стили — классами словаря, разметка — только в template.astro.',
    example: { before: 'styles.css', after: 'классы в template.astro' },
  },
  'file-too-large': {
    when: 'Один файл секции больше предела на файл.',
    fix: 'Сократи файл или вынеси часть скрипта в свой файл .ts; пределы — на странице limits.md.',
  },
  'source-too-large': {
    when: 'Файлов в секции больше предела или все вместе больше предела по объёму.',
    fix: 'Убери лишние файлы и повторы; пределы — на странице limits.md.',
  },
  'kind-mismatch': {
    when: 'Файлы не подходят виду: у секции нет template.astro, у глобального скрипта он есть или нет скрипта.',
    fix: 'У "kind": "section" нужен template.astro; у "kind": "global" — только script.ts.',
  },
  'template-forbidden': {
    when: 'В template.astro запрещённое: тег, компонент, обработчик on…, директива, {...} в атрибутах или адрес javascript:.',
    fix: 'Убери запрещённое; события и поведение — в script.ts или data-behavior; что можно — на странице template.md.',
    example: { before: '<button onclick="open()">', after: '<button data-action="open">' },
  },
  'template-too-deep': {
    when: 'Шаблон вложен глубже предела: теги и скобки считаются вместе.',
    fix: 'Сделай разметку площе: меньше вложенных обёрток и выражений.',
  },
  'template-compile': {
    when: 'Компилятор Astro не разобрал template.astro: незакрытый тег, ошибка в выражении, импорт в модуле шаблона.',
    fix: 'Исправь место из ответа: строка и колонка — в template.astro.',
  },
  'class-unknown': {
    when: 'Класса нет в словаре классов магазина.',
    fix: 'Возьми класс из подсказки или из страницы styles.md.',
    example: { before: 'text-6xl', after: 'text-5xl' },
  },
  'class-arbitrary': {
    when: 'Класс с произвольным значением: […], (…) или !.',
    fix: 'Возьми класс словаря; нужен свой цвет или размер — токен секции в ключе tokens.',
    example: { before: 'bg-[#c9a227]', after: 'bg-primary' },
  },
  'class-dark': {
    when: 'Класс с вариантом dark:.',
    fix: 'Убери dark:: тёмный вид магазина задаёт схема цвета (поле color-scheme).',
    example: { before: 'dark:bg-black', after: 'поле color-scheme' },
  },
  'class-theme-token': {
    when: 'Класс токена, который есть только у одной темы.',
    fix: 'Возьми токен словаря платформы — он есть у всех тем.',
  },
  'class-dynamic': {
    when: 'Класс собирается из поля без конечного набора значений, например из строки.',
    fix: 'Выбирай класс полем select или toggle и пиши все классы целиком в class:list.',
    example: {
      before: 'class={`text-${settings.heading}`}',
      after: "class:list={{ 'text-3xl': settings['heading-size'] === 'medium' }}",
    },
  },
  'token-invalid': {
    when: 'Токен секции в ключе tokens записан неверно: имя без метки custom, чужой вид, больше предела.',
    fix: 'Исправь токен, названный в ответе; правила — на странице styles.md.',
  },
  'render-failed': {
    when: 'Шаблон упал при пробном рендере со значениями полей по умолчанию.',
    fix: 'Проверь выражения шаблона: поле, которого нет в settings, или метод у пустого значения.',
    example: { before: '{settings.missing.deep}', after: '{settings.heading}' },
  },
  'script-invalid': {
    when: 'Скрипт секции не собрался или у него нет export default — определения секции.',
    fix: 'Исправь место из ответа; в конце script.ts — export default defineSection({ … }).',
  },
  'import-forbidden': {
    when: 'Скрипт импортирует что-то кроме @merfy/shell и своих файлов .ts/.js.',
    fix: 'Убери импорт: корзина, избранное, вход и данные — модули SDK по uses (modules.md).',
    example: { before: "import axios from 'axios'", after: "import { defineSection } from '@merfy/shell'" },
  },
  // Проверка скрипта (блок 5, часть 5в): справки добавлены после вливания dev с новыми кодами (блок 14).
  'sdk-only': {
    when: 'В скрипте имя вне списка SDK, this, class, delete, import() или код вне defineSection.',
    fix: 'Весь код секции — внутри defineSection; имена и вызовы — только из SDK.',
  },
  'event-unknown': {
    when: '`ctx.listen` подписан на событие, которого нет в каталоге событий.',
    fix: 'Возьми имя события из каталога: events.md.',
  },
  'action-unknown': {
    when: '`data-action` в шаблоне называет действие, которого нет ни у секции, ни у SDK.',
    fix: 'Объяви действие в defineSection или возьми имя из каталога: actions.md.',
  },
  // ctx.theme['<имя>'] не из сквозных настроек темы (блок 9 «Секций и SDK», часть 9б).
  'theme-setting-unknown': {
    when: '`ctx.theme` читает настройку темы, которой нет в сквозных настройках панели.',
    fix: 'Возьми имя из сквозных настроек: logo-image, social-*, cart-type, cookie-banner-enabled.',
  },
  'script-heavy': {
    when: 'Скрипт после сжатия больше порога предупреждения; секция сохраняется.',
    fix: 'Сократи скрипт: готовое поведение data-behavior вместо своего кода, без повторов.',
  },
  'script-too-heavy': {
    when: 'Скрипт после сжатия больше предела.',
    fix: 'Сократи скрипт; предел — на странице limits.md.',
  },
  'build-timeout': {
    when: 'Проверка секции не уложилась в отведённое время.',
    fix: 'Упрости шаблон и скрипт и проверь снова; повторяется — покажи ответ мерчанту.',
  },
  'build-crashed': {
    when: 'Процесс проверки упал — ошибка платформы, а не секции.',
    fix: 'Проверь ещё раз; повторяется — покажи ответ мерчанту целиком.',
  },
  'release-changed': {
    when: 'Выпуск расширения с этой версией уже сохранён с другими файлами.',
    fix: 'Новая версия файлов — новый номер выпуска.',
  },
  'setting-name-unknown': {
    when: 'Имени поля нет в словаре имён.',
    fix: 'Возьми имя из подсказки «ближе всего» или из names.md; своё имя не придумывай.',
    example: { before: '"id": "title"', after: '"id": "heading"' },
  },
  'setting-name-kind': {
    when: 'Имя из словаря, но вид поля не из его столбца «Виды».',
    fix: 'Поставь вид из names.md или возьми другое имя.',
    example: { before: '"id": "heading", "kind": "text"', after: '"id": "heading", "kind": "string"' },
  },
  'settings-limit': {
    when: 'Полей, типов блоков, блоков или вариантов больше предела, или подпись длиннее предела.',
    fix: 'Сократи список или подпись; пределы — на странице limits.md.',
  },
  'visible-when-invalid': {
    when: 'Условие показа поля ссылается на поле, которого нет, или на значение не того вида.',
    fix: 'Сошлись на поле той же секции или блока и значение его вида.',
  },
  'render-empty-failed': {
    when: 'Шаблон упал при рендере с пустыми значениями полей: мерчант может стереть любое поле.',
    fix: 'Покажи элемент только при непустом значении: {settings.heading && <h2>…</h2>}.',
  },
  'block-select-unavailable': {
    when: 'У блока в blocks.map нет одного корневого элемента; секция сохраняется.',
    fix: 'Оберни разметку блока одним элементом — тогда блок выбирается кликом в превью.',
  },
  // Правка текста в превью (блок 1, часть 6): справка по текстам edit-marks.ts.
  'inline-edit-unavailable': {
    when: 'У настройки с "inlineEdit": true в template.astro нет места правки в превью.',
    fix: 'Выдели значение отдельным элементом; у richtext — set:html и без другого содержимого.',
    example: { before: '<h1>{settings.heading} — магазин шарфов</h1>', after: '<h1>{settings.heading}</h1>' },
  },
  // Поведения и появления в шаблоне (блок 6 «Секций и SDK», часть 6б): справку дописал блок 14 по текстам проверки.
  'behavior-unknown': {
    when: 'Имени в data-behavior нет в каталоге поведений SDK.',
    fix: 'Возьми поведение из подсказки ответа или со страницы behaviors.md.',
    example: { before: 'data-behavior="acordeon"', after: 'data-behavior="accordion"' },
  },
  'behavior-part-unknown': {
    when: 'У поведения нет части с именем из data-part.',
    fix: 'Возьми часть из подсказки ответа; части поведения — на странице behaviors.md.',
  },
  'behavior-part-orphan': {
    when: 'Атрибут data-part задан вне элемента с data-behavior: часть относится к поведению.',
    fix: 'Перенеси data-part внутрь элемента с data-behavior.',
    example: { before: '<span data-part="title">', after: '<div data-behavior="accordion" data-part="title">' },
  },
  'behavior-param-invalid': {
    when: 'Параметр data-… у поведения не того вида или вне своего диапазона.',
    fix: 'Поставь значение из подсказки ответа; параметры поведения — на странице behaviors.md.',
  },
  'animate-preset-unknown': {
    when: 'Пресета в data-animate нет в каталоге пресетов SDK.',
    fix: 'Возьми пресет из подсказки ответа или со страницы behaviors.md.',
  },
  'data-field-private': {
    when: 'В `data` секции поле записи не из публичных полей её вида.',
    fix: 'Оставь в `fields` только публичные поля из текста ошибки: у товара — `id`, `title`, `price` и другие.',
    example: { before: '"fields": ["id", "costPrice"]', after: '"fields": ["id", "price"]' },
  },
  'data-unknown': {
    when: 'Скрипт читает `ctx.data.<имя>`, которого нет в `data` section.json.',
    fix: 'Объяви имя в `data` section.json или исправь имя в скрипте.',
    example: { before: 'ctx.data.prodcut', after: 'ctx.data.product' },
  },
  'role-unknown': {
    when: 'В section.json роль не из списка платформы.',
    fix: 'Возьми роль из списка: cart, cart-drawer, cart-added, login, search, notices, cookie-banner — или убери ключ role.',
    example: { before: '"role": "minicart"', after: '"role": "cart-drawer"' },
  },
  'role-place': {
    when: 'У секции с ролью groups или limit не совпадают с местом роли, или группа overlay — у секции без роли.',
    fix: 'Убери groups и limit: место и один экземпляр задаёт роль; группа overlay — только у секции с ролью.',
    example: { before: '"role": "cart-drawer", "groups": ["footer"]', after: '"role": "cart-drawer"' },
  },
  'role-not-allowed': {
    when: 'Роль у секции расширения: роли бывают только у секций магазина.',
    fix: 'Убери ключ role: корзину, вход и поиск делает сам магазин, расширение показывает свои данные через ctx.ext.',
  },
  'role-taken': {
    when: 'В магазине уже есть секция с этой ролью — вторую сохранить нельзя.',
    fix: 'Измени секцию, которая названа в ответе: новая версия той же секции сохраняется.',
    example: { before: '"name": "my-cart-drawer"', after: '"name": "cart-drawer"' },
  },
  'ext-foreign': {
    when: 'Секция расширения подключает в uses чужое расширение.',
    fix: 'Оставь в uses только "ext:<id своего расширения>".',
    example: { before: '"uses": ["ext:foreign"]', after: '"uses": ["ext:own"]' },
  },
};
