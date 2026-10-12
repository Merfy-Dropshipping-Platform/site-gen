import type { Database } from '../shop-state';
import { testShopOf, themeStores } from './platform';
import { planReleaseShops, setRelease, type ReleaseRow } from './store';
import { planWaves } from './waves';

// Выпуск версии расширения (П10-5 А и С7-14 Б): заводит команда (planning), магазины собирает ведущий —
// extensions.enabledForShop по каждому опубликованному магазину новых тем, по одному: сервис extensions не перегружаем.

export interface EnabledExtension {
  id: string;
  version: string;
}

export interface ExtensionDeps {
  db: Database;
  themeIds: readonly string[];
  testShop: string | null;
  enabledExtensions: (siteId: string) => Promise<readonly EnabledExtension[]>;
}

interface Enabled {
  siteId: string;
  version: string;
}

async function enabledShops(deps: ExtensionDeps, extensionId: string): Promise<Enabled[]> {
  const found: Enabled[] = [];
  for (const siteId of await themeStores(deps.db, deps.themeIds)) {
    const extension = (await deps.enabledExtensions(siteId)).find((item) => item.id === extensionId);
    if (extension !== undefined) found.push({ siteId, version: extension.version });
  }
  return found;
}

// planning → testing с магазинами и волнами. Никого — finished. extensions отдаёт другую версию (её ещё не
// зарегистрировали) — stopped с причиной: магазины до версии не дойдут. Вернёт, сдвинулся ли выпуск.
export async function planExtensionRelease(deps: ExtensionDeps, release: ReleaseRow): Promise<boolean> {
  const shops = await enabledShops(deps, release.subject);
  const other = shops.find((shop) => shop.version !== release.toVersion);
  if (other !== undefined) {
    const stopReason = `${other.siteId}: extensions отдаёт версию ${other.version}, а выпуск — ${release.toVersion}`;
    return setRelease(deps.db, release.id, ['planning'], { status: 'stopped', stopReason });
  }
  if (shops.length === 0) return setRelease(deps.db, release.id, ['planning'], { status: 'finished' });
  const ids = shops.map((shop) => shop.siteId);
  return planReleaseShops(deps.db, release.id, planWaves(ids, testShopOf(ids, deps.testShop), release.id));
}
