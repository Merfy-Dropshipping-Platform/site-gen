import { jsonText, writeTextFile } from '../json-files';
import { parseRunArgs } from '../run/args';
import { EXIT_CODE } from '../run/outcome';
import { baselineFile, collectStand, runMain } from './common';
import { say } from './output';

// stand:baseline --target local|dev: снять паспорт стенда и записать эталон baselines/<target>.json.
async function main(): Promise<number> {
  const args = parseRunArgs(process.argv.slice(2));
  const collected = await collectStand(args.target, args.sabotage);
  const file = baselineFile(args.target);
  await writeTextFile(file, jsonText(collected.passport));
  say(`Эталон записан: ${file}`);
  say('Прежде чем коммитить эталон, прогони stand:run и посмотри отчёт глазами.');
  return EXIT_CODE.pass;
}

runMain(main);
