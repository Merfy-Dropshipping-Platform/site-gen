// designlang из кода: в его CLI нет подключения к своему браузеру, а extractDesignLanguage умеет `wsEndpoint` →
// chromium.connectOverCDP (их src/index.js:51, src/crawler.js:54-59). `--smart` (модель) не включаем. Аргументы: <адрес
// страницы> <адрес CDP (ws)>. Ответ — JSON в stdout без `_raw` (сырые стили всех элементов, мегабайты).
import { extractDesignLanguage } from 'designlang';

const [url, wsEndpoint] = process.argv.slice(2);
if (!url || !wsEndpoint) {
  process.stderr.write('нужны адрес страницы и адрес CDP\n');
  process.exit(2);
}
const { _raw, ...design } = await extractDesignLanguage(url, { wsEndpoint, width: 1366, height: 900 });
// Выход — только когда stdout дописан: в трубу запись асинхронная, ранний exit обрезал ответ на 64 КБ.
process.stdout.write(JSON.stringify(design), () => process.exit(0));
