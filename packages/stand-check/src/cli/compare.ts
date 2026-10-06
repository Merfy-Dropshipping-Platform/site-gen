import path from 'node:path';
import { comparePassports, verdictOf } from '../compare/compare';
import { verdictTitle } from '../report/report';
import { parseCompareArgs } from '../run/args';
import { exitCodeOf } from '../run/outcome';
import { checklistOf } from '../scenario/checklist';
import { loadPassport, loadRules, runMain, writeReport } from './common';
import { say } from './output';

// pnpm запускает команду из папки пакета; пути — от папки, где её набрали (INIT_CWD ставит pnpm).
const fromCaller = (file: string): string => path.resolve(process.env.INIT_CWD ?? process.cwd(), file);

// stand:compare <a.json> <b.json>: отчёт по двум паспортам; код выхода 1 при красном.
async function main(): Promise<number> {
  const args = parseCompareArgs(process.argv.slice(2));
  const rules = await loadRules();
  const before = await loadPassport(fromCaller(args.first));
  const after = await loadPassport(fromCaller(args.second));
  const differences = comparePassports(before, after, rules);
  const verdict = verdictOf(differences);
  const report = await writeReport({ verdict, differences, before, after, checklist: checklistOf([]) });
  say(verdictTitle(verdict, differences.length));
  say(`Отчёт: ${report}`);
  return exitCodeOf(verdict, []);
}

runMain(main);
