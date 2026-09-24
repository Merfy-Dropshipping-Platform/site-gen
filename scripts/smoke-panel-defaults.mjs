#!/usr/bin/env node
/**
 * Дымовая проверка боевого источника значений по умолчанию панели
 * конструктора (этап 2 «Безопасная запись», src/content/panel-defaults.ts).
 *
 * Запись с базой отличает автозначения конструктора от правок мерчанта по
 * defaultProps секций из того же GET /api/themes/:id/puck-config, что получает
 * конструктор. В jest контроллер артефактов блоков не видит (он ищет их рядом
 * с dist), источник там мягко отдаёт пустой набор — поэтому настоящий путь
 * проверяется здесь, на собранном dist: `pnpm build` + `pnpm build:blocks`.
 *
 * Не загрузилось или у секции Hero нет ни одного значения по умолчанию —
 * красный (иначе слияние молча перестанет распознавать автозначения).
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { puckConfigPanelDefaults } = require("../dist/src/content/panel-defaults.js");

const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"];

const empty = [];
for (const theme of THEMES) {
  const defaults = await puckConfigPanelDefaults(theme);
  const heroKeys = Object.keys(defaults.Hero ?? {}).length;
  console.log(
    `${theme}: секций ${Object.keys(defaults).length}, у Hero значений по умолчанию ${heroKeys}`,
  );
  if (heroKeys === 0) empty.push(theme);
}

if (empty.length > 0) {
  console.error(
    `✗ нет значений по умолчанию панели для Hero: ${empty.join(", ")} — ` +
      "запись с базой не распознает автозначения конструктора",
  );
  process.exit(1);
}
console.log("✓ значения по умолчанию панели отдаются для всех тем");
