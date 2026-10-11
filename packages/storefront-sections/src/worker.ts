import { text } from 'node:stream/consumers';
import { prepareInputSchema, prepareSection } from './prepare';

// Процесс сборки секции (sandbox.ts): вход — JSON на stdin, ответ — одна строка JSON на stdout.
const input = prepareInputSchema.parse(JSON.parse(await text(process.stdin)));
process.stdout.write(`${JSON.stringify(await prepareSection(input))}\n`);
