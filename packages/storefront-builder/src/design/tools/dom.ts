import { domOutline } from '../design-outline';
import type { OutlineTool } from './tool';

// Переходник `dom`: свой разбор полос по геометрии — контур DOM, снятый при захвате, и роли по таблице правил
// (`design-outline.ts`). Без Node и без модели; запасной путь контура.
export const DOM_VERSION = 'rules-1';

export const dom: OutlineTool = {
  name: 'dom',
  version: DOM_VERSION,
  raw: ({ captured }) => Promise.resolve({ blocks: captured.dom.length }),
  outline: (_raw, facts) => domOutline(facts.dom, facts.bands),
};
