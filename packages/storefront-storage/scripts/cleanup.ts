import { parseArgs } from 'node:util';
import { runCleanup } from '../src/cleanup';
import { createS3Store } from '../src/s3-store';
import { s3FromEnv } from './s3-env';

// pnpm cleanup [--apply] — уборка хранилища (design.md блока 5, раздел 4): без --apply только показывает, что удалила
// бы. Хранилище — из переменных окружения (s3-env.ts). Запуск раз в сутки — дело сборщика (блок 6).

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
const plan = await runCleanup(createS3Store(s3FromEnv()), new Date().toISOString(), values.apply);
const verb = values.apply ? 'удалено' : 'пробный прогон, удалила бы';
const lines = [
  `${verb}: сборок ${plan.removedBuilds.length}, файлов ${plan.removedBlobs.length}`,
  `хранится сборок: ${plan.keptBuilds.length}`,
  ...plan.removedBuilds.map((build) => `  сборка ${build.shop} ${build.build}`),
];
process.stdout.write(`${lines.join('\n')}\n`);
