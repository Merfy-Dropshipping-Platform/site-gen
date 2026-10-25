import { SHOP_PREFIX } from './doors';
import { EXT_USE_PREFIX, MANIFEST_FILE, type SectionManifest } from './format';
import { problem, type SectionProblem } from './problems';

// Правила автора секции (блок 12 «Секций и SDK», 12.1, 12.8; «Решил сам» пп. 3, 30): роль бывает только у секции
// магазина — у секции расширения role-not-allowed; ctx.ext — только своего расширения: ext:<чужой id> в uses —
// ext-foreign. prefix — префикс имени от двери (PrepareInput.prefix): shop — секция магазина, иначе id расширения.
export function authorProblems(manifest: SectionManifest, prefix: string): SectionProblem[] {
  if (prefix === SHOP_PREFIX) return [];
  return [
    ...roleNotAllowedProblems(manifest, prefix),
    ...foreignExtProblems(manifest, prefix),
  ];
}

function roleNotAllowedProblems(manifest: SectionManifest, prefix: string): SectionProblem[] {
  if (manifest.role === undefined) return [];
  const text = `role: роль бывает только у секции магазина — у секции расширения ${prefix} её нет`;
  return [problem('role-not-allowed', MANIFEST_FILE, text)];
}

function foreignExtProblems(manifest: SectionManifest, prefix: string): SectionProblem[] {
  const ownUse = `${EXT_USE_PREFIX}${prefix}`;
  return (manifest.uses ?? [])
    .filter((use) => use.startsWith(EXT_USE_PREFIX) && use !== ownUse)
    .map((use) => problem('ext-foreign', MANIFEST_FILE, `uses: ${use} — секция расширения ${prefix} подключает только ${ownUse}`));
}
