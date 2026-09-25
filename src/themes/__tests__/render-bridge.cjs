/**
 * setupFiles jest: ставит тёплый рендер секций (render-bridge-install.cjs).
 *
 * Песочница spec-файла подменяет require и process, поэтому модуль установки
 * грузится настоящим require процесса: так патч один на весь воркер jest и
 * не держит живой песочницу первого файла. Выключить — MERFY_RENDER_BRIDGE=off.
 */
const { runInThisContext } = require('node:vm');

const realProcess = runInThisContext('process');
realProcess.getBuiltinModule('node:module').createRequire(__filename)('./render-bridge-install.cjs');
