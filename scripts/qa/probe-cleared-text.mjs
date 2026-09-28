// Человекочитаемый вывод сторожа «стёртый текст остаётся пустым».
// node scripts/qa/probe-cleared-text.mjs rose,bloom  → строка на секцию: ok или что осталось.
import { resolve } from 'node:path';
const { probeTheme } = await import(resolve(process.cwd(), 'src/themes/__tests__/cleared-text-probe.mjs'));
for (const theme of (process.argv[2] ?? 'rose,vanilla,bloom,satin,flux').split(',')) {
  for (const r of await probeTheme(theme)) {
    const problems = [
      r.error && `ОШИБКА ${r.error}`,
      r.marks === 0 && 'метка не дошла до экрана',
      r.extra?.length && `ЗАГЛУШКА: ${r.extra.join(' ').slice(0, 100)}`,
      r.emptyLeft?.length && `ПУСТЫЕ ЭЛЕМЕНТЫ: ${r.emptyLeft.join(' ')}`,
    ].filter(Boolean);
    console.log(`${theme} ${r.block} [${r.fields.join(',')}] ${problems.length ? problems.join(' | ') : 'ok'}`);
  }
}
