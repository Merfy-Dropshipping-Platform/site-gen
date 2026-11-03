import { ACTIONS } from '@merfy/shell/actions';
import { ERROR_CODES } from '@merfy/shell/events';

// actions.md (блок 14): действия SDK из каталога ACTIONS — имя, модуль, параметры разметки.
const markupText = (markup: Readonly<Record<string, unknown>> | null): string => {
  if (markup === null) return 'только из script.ts';
  const params = Object.keys(markup).map((name) => `\`data-${name}\``);
  return params.length === 0 ? '—' : params.join(', ');
};

type ErrorCode = (typeof ERROR_CODES)[number];

// Новый код ошибки без строки здесь — ошибка типов; тест actions-page сверяет таблицу с ERROR_CODES.
const ERROR_ABOUT: Readonly<Record<ErrorCode, string>> = {
  'out-of-stock': 'товара нет в наличии — уведомление покупателю',
  limit: 'больше остатка или слишком много запросов (429) — уведомление покупателю',
  unauthorized:
    'нужен вход: покупатель не вошёл (запрос не уходит) или сервер ответил 401 — «Войдите, чтобы продолжить»',
  network: 'ответа нет: обрыв связи или 10 секунд без ответа — уведомление покупателю',
  server:
    'сбой на сервере или в расширении, незнакомый ответ — уведомление «Не получилось. Попробуйте ещё раз через минуту»',
  invalid:
    'ошибка в коде секции (неверные аргументы, нет такого товара или функции) — уведомления нет, строка для автора уходит в консоль',
  refused:
    'функция расширения отказала через `refuse(код, текст)`: `error.message` — её текст, покупатель видит его в уведомлении; у методов `ctx.ext.<id>`. Ещё у `ctx.behavior("dialog").open()` — на странице уже открыто другое модальное окно; у команд поведений — нет такого пункта, слайда или вкладки; без уведомления (script.md#поведения-из-скрипта-секции). Так же у устаревшего `ctx.overlay.open()` (script.md#окно-поверх-страницы)',
};

const errorRows = (): string[] => ERROR_CODES.map((code) => `| \`'${code}'\` | ${ERROR_ABOUT[code]} |`);

export function actionsPage(): string {
  const rows = Object.entries(ACTIONS).map(
    ([name, spec]) => `| \`${name}\` | ${spec.module} | ${spec.about} | ${markupText(spec.markup)} |`,
  );
  return [
    'Действия SDK вызывает ядро по `data-action="<имя>"` в разметке секции — без скрипта. Из `script.ts` то же действие вызывается как `ctx.<модуль>.<действие>(…)`. Ответ каждого действия — в его описании: это содержимое `data` ответа `Result`, а не весь ответ ([ответ действия](#ответ-действия)).',
    '',
    '| Действие | Модуль | Что делает и что отвечает | Параметры разметки |',
    '|---|---|---|---|',
    ...rows,
    '',
    'Свои действия секция описывает в `script.ts` ([script.md](script.md)).',
    '',
    '## Ответ действия',
    '',
    'Вызов из `script.ts` ничего не бросает и возвращает `Promise<Result>`: `{ ok: true, data }` или `{ ok: false, error: { code, message } }`. В `data` — ответ из таблицы выше. При неудаче платформа сама показывает покупателю уведомление (событие `merfy:notice:show`), если вторым аргументом не передано `{ quiet: true }`: тогда ошибку показывает секция. Тот же `Result` возвращает вызов функции расширения `ctx.ext.<id>.<метод>(…)` — [script.md](script.md#вызов-функции-расширения).',
    '',
    '| `error.code` | Когда приходит |',
    '|---|---|',
    ...errorRows(),
  ].join('\n');
}
