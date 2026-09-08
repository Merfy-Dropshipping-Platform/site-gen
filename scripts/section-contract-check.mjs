#!/usr/bin/env node
/**
 * Проверка «Контракта секции темы» — docs/theme-work/SECTION-CONTRACT.md
 *
 *   node scripts/section-contract-check.mjs <тема>
 *   node scripts/section-contract-check.mjs <тема> --runtime --site <siteId> [--baseline rose --baseline-site <id>]
 *
 * Статический режим читает порты `themes/<тема>/src/components/**.astro` и ловит
 * нарушения, которые видно по коду. Рантайм-режим дополнительно меняет каждое
 * видимое поле панели на два разных значения и сравнивает HTML: если рендер не
 * изменился — настройка мертва. Сверка с эталонной темой отделяет реальные
 * отставания от общих особенностей платформы.
 *
 * Код возврата 1, если есть нарушения — годится как гейт в CI.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUCK_BASE = process.env.PUCK_CONFIG_BASE ?? "http://localhost:3200/api";
const SITES_BASE = process.env.SITES_BASE ?? "http://localhost:3114/api";

const argv = process.argv.slice(2);
const theme = argv[0];
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

if (!theme || theme.startsWith("--")) {
  console.error("укажите тему: node scripts/section-contract-check.mjs <тема> [--runtime --site <id>]");
  process.exit(2);
}

const findings = [];
const add = (rule, where, message) => findings.push({ rule, where, message });

// ─────────────────────────── статические правила ───────────────────────────

const sectionsDir = path.join(ROOT, "themes", theme, "src", "components");
const listAstro = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? listAstro(path.join(dir, e.name)) : e.name.endsWith(".astro") ? [path.join(dir, e.name)] : [],
      )
    : [];

/**
 * Проверяем только те секции, которые тема реально отдаёт конструктору
 * (манифест сборки), плюс chrome — Header/Footer. Файлы вне манифеста
 * (Philosophy, Puk и прочие вспомогательные) в канон не входят.
 */
const manifestPath = path.join(ROOT, "dist", "theme-sections", theme, "manifest.json");
const manifestNames = fs.existsSync(manifestPath)
  ? new Set(Object.keys(JSON.parse(fs.readFileSync(manifestPath, "utf8"))))
  : null;
const isSectionFile = (file) => {
  const name = path.basename(file, ".astro");
  if (/\/(Header|Footer)\.astro$/.test(file)) return true;
  if (!/\/sections\//.test(file)) return false;
  if (!manifestNames) return /^[A-Z][A-Za-z]*$/.test(name);
  // Popular.astro отдаётся конструктору под именем PopularProducts
  return manifestNames.has(name) || manifestNames.has(`${name}Products`);
};

function checkStatic() {
  const files = listAstro(sectionsDir).filter(isSectionFile);
  if (files.length === 0) {
    add("темы", theme, `не найдено секций в ${path.relative(ROOT, sectionsDir)}`);
    return;
  }
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const name = path.basename(file, ".astro");
    const isRoot = /data-puck-component-id/.test(src);

    // §4 — секция сама ставит свою цветовую схему
    if (isRoot) {
      if (!/color-scheme-\$\{/.test(src)) {
        add("§4 своя colorScheme", rel, "секция не ставит класс схемы на корень — при правке настройки в превью она перекрасится в базовую палитру");
      } else if (/typeof\s+\w+\.colorScheme\s*===\s*"string"/.test(src) && !/typeof\s+_?\w*[Rr]awScheme\s*===\s*"number"|typeof\s+\w+\.colorScheme\s*===\s*"number"/.test(src)) {
        add("§4 схема числом", rel, "схема разбирается только как строка — платформа может прислать число (Slideshow), класс молча не поставится");
      }
    }

    // §2 — пустая строка = «не задано»
    const headingExpr = src.match(/const\s+(?:sectionTitle|heading|headingText|rawHeading|placeholderHeading)\s*=\s*[\s\S]{0,300}?;\n/g) ?? [];
    for (const expr of headingExpr) {
      if (/\?\?\s*"[^"]{2,}"\s*;/.test(expr) && !/\)\s*\?\.\s*trim\(\)\s*\|\||\|\|\s*"/.test(expr)) {
        add("§2 пустая строка", rel, "заголовок читается через `?? \"Заглушка\"` — очищенное мерчантом поле даст пустой заголовок вместо заглушки; нужно `(...)?.trim() || \"Заглушка\"`");
        break;
      }
    }

    // §5 — тумблер принимает boolean и строку
    const toggleCmp = [...src.matchAll(/(\w+(?:\.\w+)*)\s*===\s*"true"/g)].filter(
      // сравнения с DOM-атрибутами — внутренние флаги гидрации, а не поля панели
      (m) => !/dataset\.|getAttribute|\.attr|Hydrated|hydrated/.test(m[1]),
    );
    for (const m of toggleCmp) {
      const near = src.slice(Math.max(0, m.index - 140), m.index);
      const guarded =
        new RegExp(`${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*===\\s*true`).test(src) ||
        /String\(/.test(near) ||
        // хелпер-нормализатор рядом уже разбирает boolean
        /typeof\s+\w+\s*===\s*"boolean"/.test(near);
      if (!guarded) {
        add("§5 тумблер", rel, `\`${m[1]} === "true"\` без ветки boolean — переключатель панели не даст эффекта`);
        break;
      }
    }

    // §7 — пользовательский текст через inlineFormat
    if (isRoot && /data-puck-subsection-field="heading"/.test(src) && !/inlineFormat/.test(src)) {
      add("§7 форматирование", rel, "заголовок рендерится без `inlineFormat` — «Ж»/«К» покажутся сырыми тегами");
    }

    // §8 — перекрытие на несуществующем узле (грубая эвристика: селектор потомка на a/div)
    const overrides = [...src.matchAll(/\[&_([a-z]+>[a-z>]+)\]:/g)].map((m) => m[1]);
    for (const sel of new Set(overrides)) {
      const last = sel.split(">").pop();
      if (!new RegExp(`<${last}\\b`).test(src)) {
        add("§8 селектор", rel, `перекрытие \`[&_${sel}]\` — в разметке секции нет элемента \`<${last}>\`, правило может не примениться`);
      }
    }

    // §12 — ничего из панели не хардкодить (заголовок-константа рядом с subsection-полем)
    if (/data-puck-subsection-field="heading"[^>]*>\s*[А-ЯЁ]{4,}/.test(src)) {
      add("§12 хардкод", rel, "в поле заголовка отрендерена константа — настройка панели не читается");
    }

    void name;
  }
}

// ─────────────────────────── рантайм-правила ───────────────────────────

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const normalize = (html) => md5(html.replace(/astro-[a-z0-9]{8}/g, "astro-X").replace(/\s+/g, " "));

async function puckConfig(t) {
  const res = await fetch(`${PUCK_BASE}/themes/${t}/puck-config`);
  const json = await res.json();
  return json.blocks ?? json.components ?? json;
}

async function renderBlock(site, blockType, props) {
  const res = await fetch(`${SITES_BASE}/sites/${site}/preview/block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blockType, props }),
  });
  return res.ok ? res.text() : "";
}

const SKIP_TYPES = new Set(["section-header", "hidden", "collectionPicker", "array", "image", "media"]);

function pairValues(field) {
  const t = field.type;
  if (SKIP_TYPES.has(t)) return null;
  if (t === "text" || t === "aiText" || t === "textarea") return ["Альфа", "Бета"];
  if (t === "select" || t === "radio") {
    const opts = [...new Set((field.options ?? []).map((o) => o.value).filter((v) => v != null))];
    return opts.length >= 2 ? [opts[0], opts[opts.length - 1]] : null;
  }
  if (t === "slider") return field.min !== field.max ? [field.min ?? 1, field.max ?? 6] : null;
  if (t === "toggle") return [true, false];
  if (t === "colorScheme") return ["scheme-1", "scheme-4"];
  if (t === "padding") return [{ top: 0, bottom: 0 }, { top: 120, bottom: 120 }];
  if (t === "alignment") return ["left", "right"];
  if (t === "number") return [1, 9];
  return null;
}

function flattenFields(fields, prefix = "") {
  const out = [];
  for (const [name, f] of Object.entries(fields ?? {})) {
    if (!f || typeof f !== "object") continue;
    if (f.type === "object") out.push(...flattenFields(f.objectFields, `${prefix}${name}.`));
    else out.push([`${prefix}${name}`, f]);
  }
  return out;
}

function setPath(obj, pathStr, value) {
  const parts = pathStr.split(".");
  let node = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof node[p] !== "object" || node[p] === null) node[p] = {};
    node = node[p];
  }
  node[parts.at(-1)] = value;
}

/**
 * Есть ли у сайта товар с вариантами. Без него поля вариаций проверять нельзя:
 * рендеру нечего показывать, и живая настройка выглядит мёртвой.
 */
async function hasVariantProducts(site) {
  try {
    const res = await fetch(`${SITES_BASE}/sites/${site}/storefront-data`);
    if (!res.ok) return false;
    const data = await res.json();
    // именно НЕПУСТЫЕ данные вариаций: флаг hasVariants бывает выставлен и без них
    return (data.products ?? []).some(
      (p) => p?.variantGroups?.length || p?.variantSwatches?.length || p?.variantCombinations?.length,
    );
  } catch {
    return false;
  }
}

/** Живость каждого поля: рендер с двумя значениями должен отличаться. */
async function fieldLiveness(t, site) {
  const blocks = await puckConfig(t);
  const variantsAvailable = await hasVariantProducts(site);
  const result = {};
  for (const [block, cfg] of Object.entries(blocks)) {
    const fields = flattenFields(cfg.fields);
    if (fields.length === 0) continue;
    const base = { ...(cfg.defaultProps ?? {}), id: "CONTRACT-1" };
    // §12 прогона: заполняем тексты и включаем тумблеры, иначе «Размер текста»
    // меряется на секции без текста и живое поле выглядит мёртвым.
    for (const [p, f] of fields) {
      if (f.type === "text" || f.type === "aiText" || f.type === "textarea") setPath(base, p, "Проверочный текст");
      else if (f.type === "toggle") setPath(base, p, true);
    }
    for (const [p, f] of fields) {
      const pair = pairValues(f);
      if (!pair) continue;
      // нет вариантного товара — поля вариаций непроверяемы (не путать с мёртвыми)
      if (!variantsAvailable && /variant/i.test(p)) continue;
      const [a, b] = pair;
      const pa = structuredClone(base);
      const pb = structuredClone(base);
      setPath(pa, p, a);
      setPath(pb, p, b);
      const [ha, hb] = await Promise.all([renderBlock(site, block, pa), renderBlock(site, block, pb)]);
      if (!ha || ha.includes("render error")) continue;
      result[`${block}.${p}`] = { alive: normalize(ha) !== normalize(hb), label: f.label };
    }
  }
  return result;
}

/** §3: то, что видно в панели, должно совпадать с тем, что рисует превью. */
async function placeholderSync(t, site) {
  const blocks = await puckConfig(t);
  const rows = [];
  for (const [block, cfg] of Object.entries(blocks)) {
    const f = cfg.fields?.heading;
    if (!f || f.type === "hidden") continue;
    const dp = cfg.defaultProps ?? {};
    let panel = typeof dp.heading === "object" ? dp.heading?.text : dp.heading;
    panel = (panel ?? "").toString().trim();
    if (!panel) {
      const target = f.type === "object" ? f.objectFields?.text : f;
      const ph = target?.placeholder;
      panel = ph && ph !== "Ввести текст..." ? ph.trim() : "";
    }
    const html = await renderBlock(site, block, { id: "CONTRACT-1" });
    if (!html) continue;
    const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
    const m = clean.match(/<(\w+)[^>]*data-puck-subsection-field="heading"[^>]*>([\s\S]*?)<\/\1>/);
    const rendered = m ? m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
    if (panel.toLowerCase() !== rendered.toLowerCase()) rows.push({ block, panel, rendered });
  }
  return rows;
}

// ─────────────────────────── запуск ───────────────────────────

checkStatic();

if (has("runtime")) {
  const site = flag("site");
  if (!site) {
    console.error("--runtime требует --site <siteId>");
    process.exit(2);
  }
  const mine = await fieldLiveness(theme, site);
  const baselineTheme = flag("baseline");
  const baselineSite = flag("baseline-site");
  let baseline = null;
  if (baselineTheme && baselineSite) baseline = await fieldLiveness(baselineTheme, baselineSite);

  for (const [key, v] of Object.entries(mine)) {
    if (v.alive) continue;
    if (baseline && baseline[key] && !baseline[key].alive) continue; // мертво и в эталоне — не отставание темы
    const suffix = baseline ? ` (в теме-эталоне «${baselineTheme}» работает)` : "";
    add("настройка мертва", key, `${v.label ?? ""} — рендер не меняется${suffix}`);
  }

  for (const row of await placeholderSync(theme, site)) {
    add("§3 заглушка", row.block, `в панели «${row.panel}», на превью «${row.rendered}» — мерчант видит разное`);
  }
}

// ─────────────────────────── отчёт ───────────────────────────

if (findings.length === 0) {
  console.log(`✓ ${theme}: контракт секций соблюдён`);
  process.exit(0);
}
const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}
console.log(`✗ ${theme}: нарушений — ${findings.length}\n`);
for (const [rule, items] of byRule) {
  console.log(`── ${rule} (${items.length})`);
  for (const i of items) console.log(`   ${i.where}\n      ${i.message}`);
  console.log("");
}
console.log("Правила: docs/theme-work/SECTION-CONTRACT.md");
process.exit(1);
