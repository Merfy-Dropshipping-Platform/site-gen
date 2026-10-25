import { escapeScriptJson } from '@merfy/storefront-config';
import type { SectionRecordValues } from './section-records';
import type { PlacedSection } from './sections-render';

// Тег входных данных экземпляра (design.md блока 5, раздел 3.5; Р5а-4) — договор с читателем ядра секций
// (@merfy/shell/core, src/core/input.ts): последний дочерний элемент <merfy-section>, только у секции со скриптом.
// В браузер идут только значения, которые уже получил шаблон: настройки и показанные блоки { id, type, settings };
// data — поля записей по объявлению data в section.json (блок 8 «Секций и SDK», часть 8г; section-records.ts). Хеши,
// имя экземпляра у мерчанта и скрытое из входов сборки сюда не попадают. JSON экранирует
// escapeScriptJson: «</script>» в настройке тег не закрывает.
// Больше 32 КБ — отказ рендера секции со стадией render-output и меткой [input-too-large]: на опубликованном сайте
// секции нет, в журнале и в таблице ошибок — запись, в превью — красная рамка (раздел 3.5, «Размер»).
export const SECTION_INPUT_MAX_BYTES = 32 * 1024; // то же число, что SECTION_INPUT_MAX_BYTES ядра секций
const INPUT_TOO_LARGE = 'input-too-large';

function tooLarge(bytes: number): Error {
  const text = `входные данные секции — ${bytes} Б, предел ${SECTION_INPUT_MAX_BYTES} Б [${INPUT_TOO_LARGE}]`;
  return Object.assign(new Error(text), { stage: 'render-output' });
}

export function sectionInputTag(placed: PlacedSection, data: SectionRecordValues = {}): string {
  const blocks = (placed.blocks ?? []).map((block) => ({ id: block.id, type: block.type, settings: block.settings }));
  const json = escapeScriptJson(JSON.stringify({ settings: placed.settings, blocks, data }));
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > SECTION_INPUT_MAX_BYTES) throw tooLarge(bytes);
  return `<script type="application/json" data-merfy-input>${json}</script>`;
}
