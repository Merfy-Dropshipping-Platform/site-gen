/**
 * Тесты рисуют секции так же, как прод.
 *
 * На проде у всех сайтов включён режим «как у верстальщиков»
 * (`PARITY_DESIGN='*'`): каждая секция получает `__designParity: true` —
 * page-blocks `prepareBlockProps` → `designParityFlag` и точечный
 * POST /preview/block. Рендеры спек эту точку обходят (пропсы идут прямо в
 * компонент или в `PreviewService.renderBlock`), поэтому старые проверки
 * рисовали ветку без режима — ту, которую на проде никто не видит. Разбор
 * 25.09: из 253 спек тем режим видели 10, и регрессы решений владельца
 * проходили зелёными (например, зазор в «Мультирядах» satin).
 *
 * Правило:
 *  - переменная PARITY_DESIGN не задана → считаем её '*', как на проде;
 *    явно заданное значение ('off', список сайтов) уважаем — так спеки
 *    проверяют сам выключатель;
 *  - если в пропсах уже есть ключ `__designParity` (true или false) — не
 *    трогаем: так спеки сравнивают режимы между собой;
 *  - иначе ставим признак тем же `parityOn`, что и сервис (скомпилированный
 *    `dist/src/themes/parity-switch.js`, как и остальные рендеры спек).
 *
 * Владелец 25.09: «секции менять не нужно было, и параметры не нужно было» —
 * проверки обязаны смотреть на то, что видит покупатель.
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');

/** Значение выключателя на проде. Меняется там — меняется здесь. */
export const PROD_PARITY_DESIGN = '*';

if (process.env.PARITY_DESIGN === undefined) {
  process.env.PARITY_DESIGN = PROD_PARITY_DESIGN;
}

let parityOn = null;
const loadParityOn = () => {
  parityOn ??= createRequire(import.meta.url)(
    resolve(SITES_ROOT, 'dist', 'src', 'themes', 'parity-switch.js'),
  ).parityOn;
  return parityOn;
};

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Пропсы секции с признаком режима — как их получит секция на проде. */
export function withDesignParity(props, fallbackSiteId = 'test-site') {
  const p = isPlainObject(props) ? props : {};
  if (Object.prototype.hasOwnProperty.call(p, '__designParity')) return props;
  const siteId = typeof p.siteId === 'string' && p.siteId ? p.siteId : fallbackSiteId;
  if (!loadParityOn()('DESIGN', siteId)) return props;
  return { ...p, __designParity: true };
}
