#!/usr/bin/env tsx
// Ад-хок реестра: build-all-themes, но только rose+flux (быстрый цикл гейта).
// Без top-level await — tsx компилит scripts/ в cjs (как build-all-themes.ts).
import { ThemeBuildService } from "../src/generator/theme-build.service";

async function main(): Promise<void> {
  const svc = new ThemeBuildService();
  for (const theme of ["flux"]) {
    console.log(`[build] ${theme}…`);
    await svc.build(theme);
    console.log(`[build] ${theme} done`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
