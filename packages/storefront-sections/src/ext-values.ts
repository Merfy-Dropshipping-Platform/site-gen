import { EXT_RECORD_KIND } from './ext-record-field';
import { settingFieldsOf } from './fields';
import { MANIFEST_FILE, type SectionManifest } from './format';
import { valuePosition } from './position';
import { problem, type SectionProblem } from './problems';

// Значения сторов расширений в шаблоне (prerender, 20.11): смысл ext секции — форма в ext-record-field.ts. from — параметр
// секции вида ext-record, из него берутся расширение и вид записи; store — стор расширения по записи (storefront.stores
// манифеста, by: "record"). Если у стора в манифесте prerender: true, сборка читает значение сама и отдаёт его шаблону
// свойством Astro.props.ext.<имя> (null, пока значения нет: стор без prerender, сбой чтения, запись не выбрана) и
// скрипту — начальным значением стора. Это то же объявление «поле → данные», что data у полей с записями магазина.

const SETTINGS_PREFIX = 'settings.';

// Объявление ext с разобранным полем: расширение и вид записи берутся у параметра ext-record.
export interface ExtDeclaration {
  name: string;
  field: string;
  store: string;
  ext: string;
  record: string;
}

const TEXT = {
  from: (name: string, id: string): string =>
    `ext.${name}.from: у секции нет параметра вида ${EXT_RECORD_KIND} «${id}» — from: settings.<id параметра вида ${EXT_RECORD_KIND}>`,
};

interface ExtField {
  ext: string;
  record: string;
}

function extFieldsOf(manifest: SectionManifest): Map<string, ExtField> {
  const fields = new Map<string, ExtField>();
  for (const { id, setting } of settingFieldsOf(manifest.settings)) {
    if (setting.kind === EXT_RECORD_KIND) fields.set(id, { ext: setting.ext, record: setting.record });
  }
  return fields;
}

const fieldIdOf = (from: string): string => from.slice(SETTINGS_PREFIX.length);

// Объявления ext секции, у которых from указывает на параметр ext-record; остальные ловит extProblems.
export function extDeclarationsOf(manifest: SectionManifest): ExtDeclaration[] {
  const fields = extFieldsOf(manifest);
  return Object.entries(manifest.ext ?? {}).flatMap(([name, entry]): ExtDeclaration[] => {
    const field = fields.get(fieldIdOf(entry.from));
    return field === undefined
      ? []
      : [{ name, field: fieldIdOf(entry.from), store: entry.store, ext: field.ext, record: field.record }];
  });
}

// Смысл ext: from — параметр этой секции вида ext-record, иначе manifest-invalid с местом в section.json.
export function extProblems(manifest: SectionManifest, text: string): SectionProblem[] {
  const fields = extFieldsOf(manifest);
  return Object.entries(manifest.ext ?? {})
    .filter(([, entry]) => !fields.has(fieldIdOf(entry.from)))
    .map(([name, entry]) =>
      problem(
        'manifest-invalid',
        MANIFEST_FILE,
        TEXT.from(name, fieldIdOf(entry.from)),
        valuePosition(text, ['ext', name, 'from']),
      ),
    );
}

// Имена свойства ext, которые шаблон получает от платформы: до значения — null.
export const extNamesOf = (manifest: Pick<SectionManifest, 'ext'>): string[] => Object.keys(manifest.ext ?? {});
