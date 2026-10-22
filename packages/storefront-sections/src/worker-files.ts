import { fileURLToPath } from 'node:url';

// Собранные процессы пакета (блок 2 «Секций и SDK»): по файлу JS на процесс в dist-render/, собирает
// scripts/build-workers.ts. Под моделью разрешений Node процесс не запустить через tsx (tsx пишет кэш на диск), поэтому
// файлы собраны заранее. В папке — только эти файлы: процесс рендера читает её целиком («Решил сам» п. 11).
const file = (name: string): string => fileURLToPath(new URL(`../dist-render/${name}.mjs`, import.meta.url));

export const WORKER_FILES = {
  render: file('render-worker'),
  check: file('check-worker'),
  probe: file('sandbox-probe'),
} as const;
