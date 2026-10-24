import {
  DEFAULT_SANDBOX,
  MAX_TEMPLATE_DEPTH,
  SCRIPT_LIMITS,
  SETTINGS_LIMITS,
  SOURCE_LIMITS,
} from '@merfy/storefront-sections';

// limits.md (блок 14): пределы проверки — числа с единицами из констант пакета секций.
const KB = 1024;

export function limitsPage(): string {
  return [
    'Пределы, которые проверка секции применяет при сохранении. Числа — из констант проверки.',
    '',
    '## Файлы',
    '',
    `- Файлов в секции — не больше ${SOURCE_LIMITS.files}.`,
    `- Один файл — не больше ${SOURCE_LIMITS.fileBytes / KB} КБ.`,
    `- Все файлы вместе — не больше ${SOURCE_LIMITS.totalBytes / KB} КБ.`,
    '',
    '## Поля и блоки',
    '',
    `- Полей секции — не больше ${SETTINGS_LIMITS.sectionFields}.`,
    `- Полей типа блока — не больше ${SETTINGS_LIMITS.blockFields}.`,
    `- Типов блоков — не больше ${SETTINGS_LIMITS.blockTypes}, блоков — не больше ${SETTINGS_LIMITS.blocksTotal}.`,
    `- Вариантов списка — от ${SETTINGS_LIMITS.optionsMin} до ${SETTINGS_LIMITS.optionsMax}.`,
    `- Подпись — не длиннее ${SETTINGS_LIMITS.labelMax} знаков, подпишись — ${SETTINGS_LIMITS.sublabelMax}.`,
    '',
    '## Шаблон и скрипт',
    '',
    `- Вложенность шаблона — не глубже ${MAX_TEMPLATE_DEPTH}.`,
    `- Скрипт после сжатия: предупреждение — от ${SCRIPT_LIMITS.warnBytes / KB} КБ, предел — ${SCRIPT_LIMITS.maxBytes / KB} КБ.`,
    '',
    '## Проверка',
    '',
    `- Время проверки секции — до ${DEFAULT_SANDBOX.timeoutMs / 1000} с.`,
    `- Память процесса проверки — до ${DEFAULT_SANDBOX.memoryMb} МБ.`,
  ].join('\n');
}
