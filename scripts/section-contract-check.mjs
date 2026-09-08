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
async function variantProductId(site) {
  try {
    const res = await fetch(`${SITES_BASE}/sites/${site}/storefront-data`);
    if (!res.ok) return null;
    const data = await res.json();
    // именно НЕПУСТЫЕ данные вариаций: флаг hasVariants бывает выставлен и без них
    const hit = (data.products ?? []).find(
      (p) => p?.variantGroups?.length || p?.variantSwatches?.length || p?.variantCombinations?.length,
    );
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

// Картинка для прогона: настройки про медиа (аспект, размещение баннера)
// применяются только когда картинка есть.
const PROBE_IMAGE = "/placeholders/landscape-image.png";

// Настройки, которые НАМЕРЕННО не применяются в рендере. Прогон обязан их
// пропускать: иначе они годами висят в отчёте как «мертвы», отчёт перестают
// читать, и в шуме теряются настоящие поломки. Каждая строка — с причиной.
const INTENTIONALLY_INERT = {
  "MultiRows.size":
    "секционный размер намеренно перекрывается размером КОНКРЕТНОГО ряда (`r.size ?? p.size`): у рядов в дефолтах уже есть свой size, поэтому секционный на них не влияет",
  "AuthModal.siteTitle":
    "заголовок «Вход в {siteTitle}» рендерится только в режимах login/register, а поле «Режим» предлагает единственную опцию closed — проверить настройку прогоном нельзя (кандидат: добавить режимы в панель)",
  "CheckoutLayout.padding.top":
    "верхний отступ намеренно не применяется: шапка чекаута sticky, сохранённый padding-top из старых ревизий сдвигал контент под неё; учитывается только padding-bottom",
  "PromoBanner.padding":
    "высоту полосы задаёт только «Размер» (Figma 648:57318); старые ревизии с padding {12,12} выходили за макет — эталон rose",
};

/** Живость каждого поля: рендер с двумя значениями должен отличаться. */
async function fieldLiveness(t, site) {
  const blocks = await puckConfig(t);
  // Товар С ВАРИАНТАМИ нужен не только как признак «проверять ли поля вариаций»:
  // его надо ПОДСТАВИТЬ в блок. Иначе рендер берёт дефолтный (первый) товар
  // сайта, у которого вариантов нет, и живые «Вид»/«Форма» вариаций выглядят
  // мёртвыми — ложное срабатывание.
  const variantPid = await variantProductId(site);
  const variantsAvailable = Boolean(variantPid);
  const result = {};
  for (const [block, cfg] of Object.entries(blocks)) {
    const fields = flattenFields(cfg.fields);
    if (fields.length === 0) continue;
    const base = { ...(cfg.defaultProps ?? {}), id: "CONTRACT-1" };
    if (variantPid && block === "Product") base.productId = variantPid;
    // §12 прогона: заполняем тексты и включаем тумблеры, иначе «Размер текста»
    // меряется на секции без текста и живое поле выглядит мёртвым.
    //
    // Три ловушки, из-за которых живые настройки выглядели мёртвыми:
    //  • тумблеры вида hide*/«Скрыть» включать НЕЛЬЗЯ — включённый «Скрыть
    //    заголовок» прячет заголовок и текст, и правка текста ничего не меняет;
    //  • настройке про медиа нужна картинка (aspect у колонки применяется только
    //    в ветке медиа-бокса; баннер без src не рисуется вовсе);
    //  • вложенный `enabled` (баннер подтверждения заказа) должен быть включён —
    //    иначе весь узел не рендерится и его поля «мертвы».
    // Только по ИМЕНИ поля (hideTitle и т.п.). По подписи судить нельзя: у подвала
    // тумблер показа рассылки подписан «Скрыть/показать», и выключение прятало
    // весь блок — тогда мёртвыми выглядели уже все его поля.
    const isHideToggle = (path) => /(^|\.)hide[A-Z_]/.test(path);
    for (const [p, f] of fields) {
      if (f.type === "text" || f.type === "aiText" || f.type === "textarea") setPath(base, p, "Проверочный текст");
      // `boolean` — тот же тумблер под другим именем типа (так объявлен
      // banner.enabled): без него баннер не рендерится и все его поля «мертвы».
      // toggle / boolean / switch — один и тот же контрол под разными именами типа.
      else if (f.type === "toggle" || f.type === "boolean" || f.type === "switch")
        setPath(base, p, !isHideToggle(p));
      // image / mediaSlot — тоже синонимы (logoImage объявлен как mediaSlot).
      else if (f.type === "image" || f.type === "mediaSlot") setPath(base, p, PROBE_IMAGE);
    }
    // Элементы списков (колонки/ряды/слайды) — картинка нужна ВНУТРИ элемента:
    // «Соотношение изображения» применяется только в ветке медиа-бокса, а без
    // картинки колонка рисует иконку и настройка выглядит мёртвой.
    for (const [key, arrField] of Object.entries(cfg.fields ?? {})) {
      if (arrField?.type !== "array" || !arrField.arrayFields?.image) continue;
      const items = base[key];
      if (!Array.isArray(items)) continue;
      base[key] = items.map((it) =>
        it && typeof it === "object" && !it.image ? { ...it, image: PROBE_IMAGE } : it,
      );
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
      let alive = normalize(ha) !== normalize(hb);
      // Настройка может жить ВНУТРИ ветки, которую включает соседнее поле: ссылка
      // «Личный кабинет» рендерится только при rightIcon='account', заголовок
      // модалки — только при mode='login'. С дефолтными пропсами такая ветка
      // выключена, и живое поле выглядит мёртвым. Поэтому вторая попытка: по
      // очереди включаем каждое значение соседних radio/select.
      if (!alive) {
        for (const [np, nf] of fields) {
          if (alive || np === p) continue;
          if (nf.type !== "radio" && nf.type !== "select") continue;
          const opts = (nf.options ?? []).map((o) => o.value).filter((v) => v !== undefined);
          for (const val of opts.slice(0, 4)) {
            if (alive) break;
            const qa = structuredClone(base);
            const qb = structuredClone(base);
            setPath(qa, np, val);
            setPath(qb, np, val);
            setPath(qa, p, a);
            setPath(qb, p, b);
            const [xa, xb] = await Promise.all([renderBlock(site, block, qa), renderBlock(site, block, qb)]);
            if (xa && !xa.includes("render error") && normalize(xa) !== normalize(xb)) alive = true;
          }
        }
      }
      result[`${block}.${p}`] = { alive, label: f.label };
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
    let rendered = m ? m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
    // Блок может помечать заголовок под-секцией с ДРУГИМ именем: подвал помечает
    // заголовок рассылки как `newsletter`, и поиск строго по "heading" не находил
    // ничего — правило рапортовало «в панели текст, на превью пусто», хотя текст
    // на превью есть. Поэтому запасной путь: ищем текст панели в тексте блока.
    if (!rendered && panel) {
      const blockText = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (blockText.toLowerCase().includes(panel.toLowerCase())) rendered = panel;
    }
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

  const inert = [];
  for (const [key, v] of Object.entries(mine)) {
    if (v.alive) continue;
    if (INTENTIONALLY_INERT[key]) { inert.push([key, INTENTIONALLY_INERT[key]]); continue; }
    if (baseline && baseline[key] && !baseline[key].alive) continue; // мертво и в эталоне — не отставание темы
    const suffix = baseline ? ` (в теме-эталоне «${baselineTheme}» работает)` : "";
    add("настройка мертва", key, `${v.label ?? ""} — рендер не меняется${suffix}`);
  }

  if (inert.length) {
    console.log(`\n── намеренно не применяются (${inert.length}) — не нарушение`);
    for (const [key, why] of inert) console.log(`   ${key}\n      ${why}`);
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
