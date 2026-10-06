import { collectWithTokens } from '../../src/browser/collect';
import { openPage } from '../../src/browser/session';

// Снимает паспорт страницы так, как его снимают команды: этот файл запускает tsx, а не Vitest.
// Адрес страницы — первый аргумент; паспорт печатается в stdout одной строкой JSON.
const [url = ''] = process.argv.slice(2);
const collected = await openPage(url, { sabotage: [] }, (page) => collectWithTokens(page, 'local', ['--background']));
process.stdout.write(JSON.stringify(collected.passport));
