import { BEHAVIORS } from '@merfy/shell/behaviors/catalog';
import { PRESETS, PRESET_PARAMS } from '@merfy/shell/behaviors/presets';

// behaviors.md (блок 14): поведения data-behavior и пресеты data-animate из каталога SDK.
interface ParamSpec {
  readonly kind: string;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly default: unknown;
}

const valuesOf = (value: object): readonly string[] | undefined => {
  const values: unknown = Reflect.get(value, 'values');
  return Array.isArray(values) ? values.map(String) : undefined;
};

const numberOrUndefined = (value: object, key: string): number | undefined => {
  const num: unknown = Reflect.get(value, key);
  return typeof num === 'number' ? num : undefined;
};

const specOf = (value: unknown): ParamSpec | null => {
  if (typeof value !== 'object' || value === null) return null;
  const kind: unknown = Reflect.get(value, 'kind');
  if (typeof kind !== 'string') return null;
  return {
    kind,
    values: valuesOf(value),
    min: numberOrUndefined(value, 'min'),
    max: numberOrUndefined(value, 'max'),
    default: Reflect.get(value, 'default'),
  };
};

const paramText = (spec: ParamSpec): string => {
  const def = Array.isArray(spec.default) ? spec.default.join(', ') : String(spec.default);
  if (spec.kind === 'enum') return `одно из: ${(spec.values ?? []).join(', ')}; по умолчанию \`${def}\``;
  if (spec.kind === 'int') return `целое от ${spec.min ?? 0} до ${spec.max ?? 0}; по умолчанию \`${def}\``;
  if (spec.kind === 'bool') return `да или нет; по умолчанию \`${def}\``;
  if (spec.kind === 'list') return `список через пробел; по умолчанию \`${def}\``;
  return `строка${spec.default === null ? '' : `; по умолчанию \`${def}\``}`;
};

const paramsOf = (params: Readonly<Record<string, unknown>>): string => {
  const entries = Object.entries(params).map(([name, spec]) => {
    const parsed = specOf(spec);
    return parsed === null ? `\`data-${name}\`` : `\`data-${name}\` — ${paramText(parsed)}`;
  });
  return entries.length === 0 ? '—' : entries.join('; ');
};

// Команды поведений для скрипта секции (ctx.behavior, 03.11): что делает команда. Список команд и вид аргумента — в
// каталоге (commands), текст — здесь: в бандл страницы он не идёт.
const COMMAND_TEXT: Readonly<Record<string, string>> = {
  'accordion.open': 'раскрыть пункт; у пунктов с общим `name` соседние сворачиваются',
  'accordion.close': 'свернуть пункт',
  'accordion.toggle': 'раскрыть свёрнутый пункт и свернуть раскрытый',
  'carousel.next': 'следующий слайд',
  'carousel.prev': 'предыдущий слайд',
  'carousel.goTo': 'слайд по номеру, с 0',
  'carousel.play': 'продолжить автопрокрутку (нужен `data-autoplay` больше 0)',
  'carousel.pause': 'остановить автопрокрутку',
  'tabs.select': 'открыть вкладку с этим `data-value`',
  'video.play': 'запустить воспроизведение; браузер без нажатия посетителя может отказать',
  'video.pause': 'поставить на паузу',
  'dialog.open': 'открыть окно; `{ position, side, backdrop }` меняет место на этот раз',
  'dialog.close': 'закрыть окно',
  'dialog.toggle': 'открыть закрытое окно и закрыть открытое',
};

const ARG_TEXT: Readonly<Record<string, string>> = {
  none: '',
  item: '(номер с 0 или id)',
  index: '(номер с 0)',
  value: '(строка)',
  options: '(параметры или ничего)',
};

const commandsOf = (behavior: string, commands: Readonly<Record<string, string>> | undefined): string => {
  if (commands === undefined) return '';
  const lines = Object.entries(commands).map(
    ([command, arg]) =>
      `- \`ctx.behavior('${behavior}').${command}${ARG_TEXT[arg] === '' ? '()' : ARG_TEXT[arg] ?? ''}\` — ${COMMAND_TEXT[`${behavior}.${command}`] ?? ''}`,
  );
  return `\n\nКоманды для скрипта секции ([script.md](script.md#поведения-из-скрипта-секции)):\n\n${lines.join('\n')}`;
};

// Дополнение к поведению, которого нет в каталоге: как ведёт себя на телефоне и мышью.
const BEHAVIOR_NOTES: Readonly<Record<string, string>> = {
  carousel:
    'Слайдов в окне может быть несколько: ширину слайду задаёт его класс (`basis-1/4` и подобные). `data-align` — ' +
    'какой край окна занимает текущий слайд: `start` (умолчание) — левый, `center` — середина. Если все слайды ' +
    'помещаются в окно, листать нечего: стрелки отключены, и `data-loop` этого не меняет. ' +
    'Слайды-заготовки и корень можно держать скрытыми (`hidden`) и показать позже, когда секция загрузила данные: ' +
    'в листании участвуют только слайды, которые стоят в вёрстке, а лента пересчитывается, когда их набор меняется. ' +
    'Скрытый слайд в листание не входит.\n\n' +
    '```html\n' +
    '<div data-behavior="carousel" data-align="start" data-loop="false" hidden>\n' +
    '  <div data-part="viewport" class="overflow-hidden">\n' +
    '    <div data-part="container" class="flex">\n' +
    '      <div data-part="slide" class="shrink-0 grow-0 basis-1/2 pr-3 lg:basis-1/4" hidden>…</div>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '  <button type="button" data-part="prev">Назад</button><button type="button" data-part="next">Вперёд</button>\n' +
    '</div>\n' +
    '```',
  dialog:
    'Окно поверх экрана в секции любого блока. `data-position` — `center`, `sheet` или `corner`: ядро ставит окно ' +
    '(`<dialog data-part="content">`), задаёт переход и модальность — `center` и `sheet` модальные (затемнение, фокус ' +
    'внутри окна, Esc, запрет прокрутки, на странице одно такое окно), `corner` — немодальное в углу, на телефоне ' +
    'шторкой снизу. С `data-position` параметры `data-transition`, `data-modal` и `data-anchor` не читаются; ' +
    '`data-backdrop="false"` убирает затемнение под модальным окном. Без `data-position` место окна задают его классы. ' +
    'Умолчания места лежат в слое `base`: классы окна главнее.\n\n' +
    '```html\n' +
    '<div data-behavior="dialog" data-position="corner" data-side="left">\n' +
    '  <dialog data-part="content" class="w-full max-w-sm"><button data-part="close">Закрыть</button></dialog>\n' +
    '</div>\n' +
    '```',
  'card-photos':
    'Свайп по фото (палец или мышь с зажатием) от 30 px по горизонтали листает фото: влево — следующее, вправо — ' +
    'предыдущее; горизонтальный сдвиг должен быть в 1,5 раза больше вертикального, с последнего фото на первое ' +
    'листание не переходит. После свайпа нажатие по карточке 400 мс гасится — переход в товар не срабатывает. ' +
    'Горизонтальный жест закреплён за фото (`touch-action: pan-y` на части `image`), вертикальная прокрутка ' +
    'остаётся браузеру; если прокрутка забрала жест (`pointercancel`), свайп отменяется.',
  countdown:
    'Таймер до даты. Идёт по времени сервера магазина (`$now` модуля `page`), а не по часам устройства, поэтому у ' +
    'посетителей с неверными часами показывает одно и то же; в `section.json` нужен `"uses": ["page"]`. Дата — ' +
    '`data-until` в формате ISO 8601 **с поясом**: `2026-12-31T23:59:59+03:00` или `2026-12-31T20:59:59Z`. Дата без ' +
    'пояса или неверная не принимается: в консоль уходит строка для автора, разметка не меняется. В части пишется ' +
    'остаток: сутки как есть, часы, минуты и секунды двумя знаками. Нужны не все части: нет `days` — часы считают и ' +
    'сутки, нет `hours` — минуты считают всё. Пока ответ сервера о времени не пришёл, части не трогаются. В ноль таймер ' +
    'останавливается и отправляет событие `merfy:countdown:end` (`section`, `id`). Цифры не анимируются: «уменьшить ' +
    'движение» таймер не меняет.\n\n' +
    '```html\n' +
    '<div data-behavior="countdown" data-until="2026-12-31T23:59:59+03:00">\n' +
    '  <span data-part="days"></span> д <span data-part="hours"></span>:<span data-part="minutes"></span>:<span data-part="seconds"></span>\n' +
    '</div>\n' +
    '```',
  scratch:
    'Слой поверх элемента, который посетитель стирает курсором с зажатой кнопкой или пальцем. Слой — `canvas`, его ' +
    'создаёт ядро: скрипту секции `canvas` недоступен, поэтому скрипт не нужен. Элемент с `data-behavior="scratch"` ' +
    'должен быть с позицией (`relative`): слой растягивается на него целиком. `data-color` — цвет слоя: любой цвет CSS, ' +
    'в том числе токен темы `var(--primary)`. Страница под пальцем не прокручивается (`touch-action: none`): свайп по ' +
    'слою стирает, а не листает; вне слоя прокрутка обычная. Когда стёрто больше половины, слой убирается и уходит ' +
    'событие `merfy:scratch:done` (`section`, `id`). Часть `reveal` — кнопка «Показать» для клавиатуры и экранных ' +
    'читалок: она убирает слой так же и скрывается; ставьте её над слоем (`relative z-10`). Без неё слой недоступен с ' +
    'клавиатуры, и в консоль уходит строка для автора. «Уменьшить движение»: слой исчезает сразу, без затухания.\n\n' +
    '```html\n' +
    '<div data-behavior="scratch" data-color="var(--muted-foreground)" class="relative">\n' +
    '  <p>Скрытый текст</p>\n' +
    '  <button type="button" data-part="reveal" class="relative z-10">Показать</button>\n' +
    '</div>\n' +
    '```',
};

export function behaviorsPage(): string {
  const behaviors = Object.entries(BEHAVIORS).map(([name, spec]) => {
    const parts = spec.parts.length === 0 ? '—' : spec.parts.map((part) => `\`data-part="${part}"\``).join(', ');
    const note = BEHAVIOR_NOTES[name] === undefined ? '' : `\n\n${BEHAVIOR_NOTES[name]}`;
    return `## ${name}\n\nЧасти: ${parts}.\n\nПараметры: ${paramsOf(spec.params)}.${note}${commandsOf(name, spec.commands)}`;
  });
  const presetNames = Object.keys(PRESETS)
    .map((name) => `\`${name}\``)
    .join(', ');
  return [
    'Готовое поведение вешается на элемент атрибутом `data-behavior="<имя>"` — без скрипта. Части поведения отмечаются `data-part`, параметры — своими `data-…` на том же элементе.',
    '',
    ...behaviors,
    '',
    '## Пресеты data-animate',
    '',
    `Пресет указывается в \`data-animate="<имя>"\`: ${presetNames}.`,
    '',
    `Параметры пресета: ${paramsOf(PRESET_PARAMS)}.`,
  ].join('\n');
}
