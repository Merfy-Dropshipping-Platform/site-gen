import type { Json, ModuleName, SectionDef, StoreDef } from './types';

// Определение секции (design.md блока 5, раздел 3.1): тождество, как в каркасе. При сохранении (часть 5б) импорт и вызов
// снимаются — в модуле секции остаётся export default { mount, actions }; State — вид ctx.state, Uses — модули по uses.
export const defineSection = <State extends object = Record<string, unknown>, Uses extends ModuleName = ModuleName>(
  def: SectionDef<State, Uses>,
): SectionDef<State, Uses> => def;

// Определение своего стора (свои сторы): то же тождество, в модуле остаётся export default { value, start }. Value из
// value не выводится — у value: false иначе вышел бы тип false и set(true) не прошёл; вид задаёт defineStore<boolean>.
export const defineStore = <Value extends Json = Json, Uses extends ModuleName = ModuleName>(
  def: StoreDef<NoInfer<Value>, Uses>,
): StoreDef<Value, Uses> => def;
