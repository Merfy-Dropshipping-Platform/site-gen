import type { ModuleName, SectionDef } from './types';

// Определение секции (design.md блока 5, раздел 3.1): тождество, как в каркасе. При сохранении (часть 5б) импорт и вызов
// снимаются — в модуле секции остаётся export default { mount, actions }; State — вид ctx.state, Uses — модули по uses.
export const defineSection = <State extends object = Record<string, unknown>, Uses extends ModuleName = ModuleName>(
  def: SectionDef<State, Uses>,
): SectionDef<State, Uses> => def;
