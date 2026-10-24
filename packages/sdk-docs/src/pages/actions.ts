import { ACTIONS } from '@merfy/shell/actions';

// actions.md (блок 14): действия SDK из каталога ACTIONS — имя, модуль, параметры разметки.
const markupText = (markup: Readonly<Record<string, unknown>> | null): string => {
  if (markup === null) return 'только из script.ts';
  const params = Object.keys(markup).map((name) => `\`data-${name}\``);
  return params.length === 0 ? '—' : params.join(', ');
};

export function actionsPage(): string {
  const rows = Object.entries(ACTIONS).map(
    ([name, spec]) => `| \`${name}\` | ${spec.module} | ${spec.about} | ${markupText(spec.markup)} |`,
  );
  return [
    'Действия SDK вызывает ядро по `data-action="<имя>"` в разметке секции — без скрипта. Ответ каждого действия — в его описании; при сбое секция получает ошибку, покупатель — уведомление.',
    '',
    '| Действие | Модуль | Что делает и что отвечает | Параметры разметки |',
    '|---|---|---|---|',
    ...rows,
    '',
    'Свои действия секция описывает в `script.ts` ([script.md](script.md)).',
  ].join('\n');
}
