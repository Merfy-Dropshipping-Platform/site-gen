/**
 * Большой прогон jest встаёт в очередь на машину (spec 115, часть 1).
 *
 * Весь набор, каталог или 4+ файлов ждут, пока соседний большой прогон
 * закончится: два разом идут медленнее, чем один за другим, и краснеют по
 * таймаутам (замер 25.09). Один-три файла — точечная отладка, без очереди.
 * В CI очереди нет. Замок отпускает jest.global-teardown.cjs, а если jest
 * упал — ядро, вместе с процессом (см. scripts/release/lib/machine-lock.mjs).
 */
const { statSync } = require('node:fs');
const { resolve } = require('node:path');

module.exports = async function globalSetup(globalConfig) {
  const { acquireMachineLockOrWarn, isHeavyJestRun, lockDisabled } = await import('./scripts/release/lib/machine-lock.mjs');
  if (lockDisabled()) return;
  const args = globalConfig.nonFlagArgs ?? [];
  const isDir = (a) => {
    try {
      return statSync(resolve(process.cwd(), a)).isDirectory();
    } catch {
      return false;
    }
  };
  if (!isHeavyJestRun(args, isDir)) return;
  const label = `jest, ${args.length ? `путей: ${args.length}` : 'весь набор'}`;
  globalThis.__merfyMachineLock = await acquireMachineLockOrWarn({ label });
};
