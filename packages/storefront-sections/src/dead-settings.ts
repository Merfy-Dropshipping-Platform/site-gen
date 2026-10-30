import { MANIFEST_FILE, TEMPLATE_FILE, type SectionManifest } from './format';
import { ruleSectionOf, settingPlace } from './field-rules';
import { problem, type SectionProblem } from './problems';

// Параметры, которые шаблон не читает (Н-«Оценка владельца» после «Лавренти», 30.10): после переделки секции в
// section.json остаются поля, на которые ничто не ссылается, — мерчант крутит их в панели, а вид не меняется.
// Предупреждение, одно на секцию. Читаем текст шаблона и скрипта: обращение settings.<id> и settings['<id>'] (у блока —
// block.settings.<id>, ctx.settings['<id>'] в скрипте — оканчивается тем же). Если settings передан куда-то целиком
// (spread, функция, переменная) или ключ вычисляется — что читается, не видно, предупреждения нет.
const DESTRUCTURE = /\{[^}]*\}\s*=\s*Astro\.props/g; // const { settings, blocks } = Astro.props — не чтение
const ALIASED = /\{[^}]*\bsettings\s*:[^}]*\}\s*=\s*Astro\.props/;
const SETTINGS = /\bsettings\b/g;
const MEMBER = /^\s*\??\.\s*([A-Za-z_$][\w$]*)/;
const BRACKET = /^\s*(?:\?\.)?\[\s*(['"`])([^'"`]+)\1\s*\]/;
const FROM = /^settings\.(.+)$/;
const LISTED_MAX = 6;

interface Reads {
  ids: ReadonlySet<string>;
  opaque: boolean;
}

// Что код читает из settings: названные ключи; opaque — есть чтение, которое ключей не называет.
export function settingReads(code: string): Reads {
  const text = code.replace(DESTRUCTURE, '');
  const ids = new Set<string>();
  // { settings: s } = Astro.props — settings под другим именем: чтения по нему не видны.
  let opaque = ALIASED.test(code);
  for (const match of text.matchAll(SETTINGS)) {
    const tail = text.slice((match.index ?? 0) + match[0].length);
    const id = MEMBER.exec(tail)?.[1] ?? BRACKET.exec(tail)?.[2];
    if (id === undefined) opaque = true;
    else ids.add(id);
  }
  return { ids, opaque };
}

// Поле читает сама платформа, шаблон его не выводит: размер страницы списка (storefront-build, page-list.ts).
const PLATFORM_READ: ReadonlySet<string> = new Set(['per-page']);

// Поля из section.json, которых не читают ни шаблон, ни скрипт (`ctx.settings`): порядок — как в файле (поля секции,
// потом блоков). codes — тексты шаблона и файлов скрипта.
export function deadSettingProblems(
  manifest: SectionManifest,
  codes: readonly string[],
  manifestText: string,
): SectionProblem[] {
  const reads = codes.map(settingReads);
  if (reads.some((item) => item.opaque)) return [];
  const read = new Set(reads.flatMap((item) => [...item.ids]));
  for (const entry of Object.values(manifest.data ?? {})) {
    const id = FROM.exec(entry.from)?.[1];
    if (id !== undefined) read.add(id);
  }
  const dead = ruleSectionOf(manifest).lists.flatMap((list) =>
    list.fields.flatMap((field, index) =>
      field.setting.kind === 'hint' || read.has(field.id) || PLATFORM_READ.has(field.id)
        ? []
        : [{ id: field.id, path: [...list.path, index, 'id'] as const }],
    ),
  );
  const first = dead[0];
  if (first === undefined) return [];
  const message = messageOf([...new Set(dead.map((item) => item.id))]);
  return [problem('taste-dead-setting', MANIFEST_FILE, message, settingPlace(manifest, manifestText, first.path))];
}

function messageOf(ids: readonly string[]): string {
  const shown = ids
    .slice(0, LISTED_MAX)
    .map((id) => `\`${id}\``)
    .join(', ');
  const more = ids.length > LISTED_MAX ? ` и ещё ${ids.length - LISTED_MAX}` : '';
  return `параметры объявлены, а ${TEMPLATE_FILE} их не читает: ${shown}${more}. Выведи {settings.<имя>} или убери их из section.json: мерчант крутит поле, а вид не меняется`;
}
