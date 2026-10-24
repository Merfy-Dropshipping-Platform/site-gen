import { sectionManifestSchema, type SectionManifest } from './format';
import type { SectionRow } from './registry';
import { scriptMetaSchema, type ScriptMeta } from './script-meta';

// Строка реестра в формате SDK 1 (блок 1 «Секций и SDK»): манифест распознан и у секции есть модуль рендера. Строки
// до SDK 1 и секции без модуля сборка не использует — null. У глобального скрипта модуля рендера не бывает — годится.
export interface CurrentSection {
  name: string;
  manifest: SectionManifest;
  render: string | null;
  renderHash: string | null;
  // Что нужно скрипту (часть 5в блока 5, script_meta). Нет — строка до 5в или значение не той формы: сборка даёт
  // секции все части ядра, как в 5б.
  scriptMeta?: ScriptMeta;
  // Код секции (часть 5г блока 5): модуль без импортов и его хеш sha256:<hex> — для превью одного блока. Нет — у строки
  // нет скрипта.
  script?: { hash: string; code: string };
}

export function currentSection(row: SectionRow): CurrentSection | null {
  const manifest = sectionManifestSchema.safeParse(row.manifest);
  if (!manifest.success) return null;
  if (manifest.data.kind === 'section' && (row.render === null || row.renderHash === null)) return null;
  const meta = scriptMetaSchema.safeParse(row.scriptMeta);
  return {
    name: row.name,
    manifest: manifest.data,
    render: row.render,
    renderHash: row.renderHash,
    ...(meta.success ? { scriptMeta: meta.data } : {}),
    ...(row.script === null || row.scriptHash === null ? {} : { script: { hash: row.scriptHash, code: row.script } }),
  };
}
