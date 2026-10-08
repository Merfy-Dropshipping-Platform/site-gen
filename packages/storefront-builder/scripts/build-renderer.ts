import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildRendererBundle } from '@merfy/storefront-build';
import { rendererDir, themeIdsOf } from '../src/themes';

// pnpm renderer — серверная сборка рисовальщика каждой темы новой архитектуры (theme-versions.json блока 4) в
// themes/<тема>/dist-renderer. В образе её делает Dockerfile после `pnpm build:themes` (тот ставит зависимости тем), на
// своей машине — перед `pnpm start`.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

for (const themeId of await themeIdsOf(ROOT)) {
  const bundle = await buildRendererBundle(join(ROOT, 'themes', themeId), rendererDir(ROOT, themeId));
  process.stdout.write(`${themeId}: ${bundle.serverEntry}\n`);
}
