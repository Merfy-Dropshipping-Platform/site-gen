import { sectionManifestSchema, type SectionManifest } from './format';
import type { SectionRow } from './registry';

// Строка реестра в формате SDK 1 (блок 1 «Секций и SDK»): манифест распознан и у секции есть модуль рендера. Строки
// до SDK 1 и секции без модуля сборка не использует — null. У глобального скрипта модуля рендера не бывает — годится.
export interface CurrentSection {
  name: string;
  manifest: SectionManifest;
  render: string | null;
  renderHash: string | null;
}

export function currentSection(row: SectionRow): CurrentSection | null {
  const manifest = sectionManifestSchema.safeParse(row.manifest);
  if (!manifest.success) return null;
  if (manifest.data.kind === 'section' && (row.render === null || row.renderHash === null)) return null;
  return { name: row.name, manifest: manifest.data, render: row.render, renderHash: row.renderHash };
}
