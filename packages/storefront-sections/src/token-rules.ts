import { platformDictionary, readSectionTokens, type SectionTokenDefs } from '@merfy/tokens';
import { MANIFEST_FILE, type SectionManifest } from './format';
import { valuePosition } from './position';
import { problem, type SectionProblem } from './problems';

// Свои токены секции (блок 4 «Секций и SDK», Р4-9): readSectionTokens словаря платформы. Ключа tokens нет — {}.

export function sectionTokensOf(manifest: SectionManifest): SectionTokenDefs {
  if (manifest.tokens === undefined) return {};
  return readSectionTokens(platformDictionary, manifest.tokens).tokens;
}

// Путь проблемы в тексте: «tokens.<имя>: …» — значение токена, «tokens: …» — весь ключ. Имя остаётся в тексте.
function splitPath(item: string): { path: readonly string[]; message: string } {
  if (item.startsWith('tokens:')) return { path: ['tokens'], message: item.slice('tokens: '.length) };
  const rest = item.slice('tokens.'.length);
  const name = rest.slice(0, rest.indexOf(':'));
  return { path: ['tokens', name], message: rest };
}

// Верный пример своего токена каждого вида, который сейчас можно записать (1 ноября, повтор «ювелирного»: агент трижды
// ошибался — значение text-токена лежало рядом с видом, а не в default, у цвета не было custom-, вид «size» не бывает).
// Те же строки — в quick.md SDK (тест sdk-docs сверяет), в тексте отказа token-invalid подставляется строка вида,
// который назвал автор. Значение — в default; имя — приставка вида + custom-. Тень — только alias от тени словаря
// (шаг 6, 01.11: общая тень shadow-raised).
export const SECTION_TOKEN_EXAMPLES: Readonly<Record<string, string>> = {
  color: '"custom-plate": { "kind": "color", "about": "Подложка под фото", "default": "#f1ece4" }',
  weight: '"weight-custom-display": { "kind": "weight", "about": "Насыщенность витринного заголовка", "default": 300 }',
  text: '"text-custom-display": { "kind": "text", "about": "Витринный заголовок", "default": { "min": 40, "max": 72, "leading": 1.05 } }',
  tracking: '"tracking-custom-caps": { "kind": "tracking", "about": "Разрядка капса, em", "default": 0.12 }',
  radius: '"radius-custom-pill": { "kind": "radius", "about": "Скругление плашки", "default": 999 }',
  'border-width': '"border-width-custom-line": { "kind": "border-width", "about": "Толщина линии", "default": 1 }',
  spacing: '"spacing-custom-row": { "kind": "spacing", "about": "Отступ между рядами", "default": { "min": 24, "max": 64 } }',
  width: '"width-custom-narrow": { "kind": "width", "about": "Узкая колонка", "default": 640 }',
  shadow: '"shadow-custom-plate": { "kind": "shadow", "about": "Тень плашки", "derive": { "rule": "alias", "from": "shadow-raised" } }',
};

const KIND_PREFIX: Readonly<Record<string, string>> = {
  shadow: 'shadow-',
  color: '',
  weight: 'weight-',
  text: 'text-',
  tracking: 'tracking-',
  radius: 'radius-',
  'border-width': 'border-width-',
  spacing: 'spacing-',
  width: 'width-',
};

const ownedKind = (kind: unknown): kind is string => typeof kind === 'string' && kind in SECTION_TOKEN_EXAMPLES;

// Имя токена с приставкой вида и меткой custom: plate → custom-plate, text-size → text-custom-size.
function ownName(kind: string, name: string): string {
  const prefix = KIND_PREFIX[kind] ?? '';
  const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  return `${prefix}${rest.startsWith('custom-') ? rest : `custom-${rest}`}`;
}

// Хвост отказа: готовая строка токена. Вид известен — пример этого вида с именем автора, поправленным под правило;
// вид не бывает у токена секции или не назван — перечень видов и пример цвета.
function exampleTail(raw: unknown, name: string | undefined, message: string): string {
  const kind = typeof raw === 'object' && raw !== null && 'kind' in raw ? raw.kind : undefined;
  if (ownedKind(kind)) {
    const example = SECTION_TOKEN_EXAMPLES[kind];
    const own = name === undefined ? undefined : ownName(kind, name);
    const shown = own === undefined ? example : example.replace(/^"[^"]+"/, `"${own}"`);
    // Напоминание про default — только когда значение и правда лежит рядом с kind («Нераспознанные ключи: min, max, leading»).
    const loose = message.includes('Нераспознанные ключи') ? ' (значение — в default, не рядом с kind)' : '';
    return ` · Верно: ${shown}${loose}`;
  }
  return ` · Виды токена секции: ${Object.keys(SECTION_TOKEN_EXAMPLES).join(', ')}. Верно: ${SECTION_TOKEN_EXAMPLES.color}`;
}

// Проблемы записи токенов — код token-invalid, файл section.json, место — valuePosition(text, ['tokens', <имя>])
// или ['tokens'] для проблемы всего ключа. text — текст section.json. К отказу по токену дописана готовая строка
// верного токена того же вида (exampleTail).
export function tokenProblems(manifest: SectionManifest, text: string): SectionProblem[] {
  if (manifest.tokens === undefined) return [];
  const reading = readSectionTokens(platformDictionary, manifest.tokens);
  return reading.problems.map((item) => {
    const { path, message } = splitPath(item);
    const name = path[1];
    const tail = name === undefined ? '' : exampleTail(manifest.tokens?.[name], name, message);
    return problem('token-invalid', MANIFEST_FILE, `${message}${tail}`, valuePosition(text, path));
  });
}
