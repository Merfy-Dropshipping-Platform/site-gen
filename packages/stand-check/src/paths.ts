import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Корень пакета: правила, сценарии, моки и эталоны лежат рядом с package.json.
export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));

export const packagePath = (relative: string): string => path.join(PACKAGE_ROOT, relative);
