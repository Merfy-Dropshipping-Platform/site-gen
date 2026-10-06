import { z } from 'zod';
import type { TokenHost, TokenState, TokensAction, TokensTool, TokensToolResult, ToolSpec } from '../types';
import { checkAnswer, describeAnswer, findAnswer, groupsAnswer, listAnswer, setAnswer } from './answers';

// Инструмент для ИИ (design.md 8.8): одно описание и один вход для любого ИИ. Переходник — MCP, LangChain, чат в
// конструкторе — только переносит описание в свой формат и зовёт call. Действие — параметр: инструмент в списке
// модели один, ответы ссылаются на действия по имени. Шесть действий; снять правку нельзя (владелец 06.10: «нет»).

type FieldValues = { query: string; name: string; group: string; edits: Record<string, unknown> };
type FieldName = keyof FieldValues;
type FieldValue<F extends FieldName> = FieldValues[F];
// Таблица схем по полю: тип схемы следует за именем поля, поэтому switch не нужен.
const FIELD_SCHEMAS: { [F in FieldName]: z.ZodType<FieldValue<F>> } = {
  query: z.string().refine((value) => value.trim() !== ''),
  name: z.string().min(1),
  group: z.string().min(1),
  // Правки — объект; имена и значения проверяют check и set, ответ называет поле.
  edits: z.record(z.string(), z.unknown()),
};
type Fields = Readonly<Record<string, unknown>>;
type ActionSpec = {
  action: TokensAction;
  field?: FieldName;
  text: string;
  run: (state: TokenState, fields: Fields) => TokensToolResult;
};

// Действие с полем: нет поля или оно не того вида — адресный ответ, а не исключение.
function action<F extends FieldName>(
  name: TokensAction,
  field: F,
  text: string,
  run: (state: TokenState, value: FieldValue<F>) => TokensToolResult,
): ActionSpec {
  const schema: z.ZodType<FieldValue<F>> = FIELD_SCHEMAS[field];
  return {
    action: name,
    field,
    text,
    run: (state, fields) => {
      const parsed = schema.safeParse(fields[field]);
      return parsed.success ? run(state, parsed.data) : { text: `${name}: нужно поле ${field}.` };
    },
  };
}

const ACTIONS: readonly ActionSpec[] = [
  action(
    'find',
    'query',
    'найти токены словами мерчанта: «скругление кнопок», «цвет цены». ' +
      'До 5 строк: имя — о чём · значение. Не токен — скажет, где это меняется',
    (state, query) => ({ text: findAnswer(state, query) }),
  ),
  action('describe', 'name', 'карточка: откуда значение, что можно, что пересчитается вслед', (state, name) => ({
    text: describeAnswer(state, name),
  })),
  action('check', 'edits', 'примерить правки без записи: ошибки, пересчёт, читаемость', (state, edits) => ({
    text: checkAnswer(state, edits),
  })),
  action('set', 'edits', 'записать пачкой; перед этим check с теми же правками', setAnswer),
  { action: 'groups', text: 'разделы словаря, если поиск не помог', run: (state) => ({ text: groupsAnswer(state) }) },
  action('list', 'group', 'токены раздела строками', (state, group) => ({ text: listAnswer(state, group) })),
];

const actionLine = (spec: ActionSpec): string =>
  `- ${spec.action}${spec.field === undefined ? '' : ` (${spec.field})`}: ${spec.text}`;

// Имя, описание и входная схема — одни для любого ИИ. Схемы со всеми токенами во входе нет: она ехала бы в каждый
// запрос модели; имена и значения проверяют check и set.
export const tokensTool: ToolSpec = {
  name: 'tokens',
  description:
    'Вид витрины: цвета, шрифты, размеры, скругления, тени, отступы. Словарь целиком не читайте — ищите.\n' +
    ACTIONS.map(actionLine).join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      action: { enum: ACTIONS.map((spec) => spec.action) },
      query: { type: 'string' },
      name: { type: 'string' },
      group: { type: 'string' },
      edits: {
        type: 'object',
        description: '{ root?: { имя: значение }, schemes?: { "scheme-1": { имя: значение } } }',
      },
    },
    required: ['action'],
  },
};

const fieldsShape = z.record(z.string(), z.unknown());

// Один вход: действие и его поле → короткий ответ. set возвращает ещё новые правки, но сам их не хранит.
export function runTokensTool(state: TokenState, input: unknown): TokensToolResult {
  const parsed = fieldsShape.safeParse(input);
  const fields: Fields = parsed.success ? parsed.data : {};
  const spec = ACTIONS.find((entry) => entry.action === fields.action);
  if (spec === undefined) {
    const known = ACTIONS.map((entry) => entry.action).join(', ');
    return { text: `Действия ${String(fields.action)} нет. Есть: ${known}.` };
  }
  return spec.run(state, fields);
}

// Тот же вход с хозяином правок: состояние берёт у хозяина, новые правки отдаёт ему. Хозяин в конструкторе — черновик
// редактора, на сервере — ревизия. Переходник ИИ оборачивает call.
export function createTokensTool(host: TokenHost): TokensTool {
  return {
    ...tokensTool,
    call: async (input: unknown) => {
      const result = runTokensTool(await host.load(), input);
      if (result.edits !== undefined) await host.save(result.edits);
      return result.text;
    },
  };
}
