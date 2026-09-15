/**
 * Список гардов берётся из .github/workflows/ci.yml, а не из константы в коде.
 *
 * Почему так. Правило команды: «новый тест не введён, пока его имени нет в
 * ci.yml». Если продублировать список здесь, он разойдётся с CI в первый же
 * день — и локальный прогон станет зелёным там, где CI красный. Разошёлся
 * список — значит кто-то трогал ci.yml, и это надо увидеть, а не унаследовать.
 *
 * Разбор построчный: тащить YAML-парсер в сервис ради шести ключей нельзя
 * (новых зависимостей не вводим). Нужны ровно `run`, `name`,
 * `working-directory`, `continue-on-error` и имя джобы.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Шаги workflow: [{job, name, run, cwd, continueOnError}] */
export function parseWorkflowSteps(yamlText) {
  const lines = yamlText.split('\n');
  const steps = [];
  let job = null;
  let inJobs = false;
  let cur = null;
  let pending = null; // {key, indent, style:'|'|'>', buf:[]}

  const flushPending = () => {
    if (!pending || !cur) { pending = null; return; }
    const text = pending.style === '|'
      ? pending.buf.join('\n')
      : pending.buf.join(' ').replace(/\s+/g, ' ').trim();
    cur[pending.key] = text.trim();
    pending = null;
  };
  const flushStep = () => { flushPending(); if (cur) steps.push(cur); cur = null; };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { if (pending) pending.buf.push(''); continue; }
    const indent = line.length - line.trimStart().length;

    if (pending && indent > pending.indent) { pending.buf.push(line.slice(pending.indent + 2)); continue; }
    if (pending) flushPending();

    if (/^jobs:\s*$/.test(line)) { flushStep(); inJobs = true; job = null; continue; }
    const jobM = inJobs && indent === 2 ? line.match(/^ {2}([A-Za-z0-9_.-]+):\s*$/) : null;
    if (jobM) { flushStep(); job = jobM[1]; continue; }

    const stepM = line.match(/^(\s*)- ([A-Za-z0-9_-]+):\s?(.*)$/);
    if (stepM && job) {
      flushStep();
      cur = { job, indent: stepM[1].length, name: null, run: null, cwd: null, continueOnError: false };
      applyKey(cur, stepM[2], stepM[3], stepM[1].length + 2, (p) => { pending = p; });
      continue;
    }
    const keyM = cur ? line.match(/^(\s*)([A-Za-z0-9_-]+):\s?(.*)$/) : null;
    if (keyM && keyM[1].length === cur.indent + 2) {
      applyKey(cur, keyM[2], keyM[3], keyM[1].length, (p) => { pending = p; });
      continue;
    }
    if (cur && indent <= cur.indent) flushStep();
  }
  flushStep();
  return steps.filter((s) => s.run);
}

function applyKey(step, key, value, indent, setPending) {
  const v = value.trim();
  if (v === '|' || v === '|-' || v === '>-' || v === '>' || v === '>+' || v === '|+') {
    setPending({ key: mapKey(key), indent, style: v[0], buf: [] });
    return;
  }
  const k = mapKey(key);
  if (k === 'continueOnError') step.continueOnError = /true/i.test(v);
  else if (k) step[k] = stripQuotes(v);
}
const mapKey = (k) => ({ run: 'run', name: 'name', 'working-directory': 'cwd', 'continue-on-error': 'continueOnError' }[k] ?? null);
const stripQuotes = (v) => v.replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');

/** Шаги, которые НЕ проверка: инфраструктура, сборка, выкатка. */
const NOT_A_GUARD = [
  /^corepack\b/, /^pnpm install\b/, /^pnpm (run )?db:migrate\b/, /^pnpm (run )?build\b/,
  /^pnpm build:/, /^cat\b/, /^for i in/, /^echo\b/, /^curl\b/, /^nc\b/,
];
const LOOKS_LIKE_GUARD = /(jest|node --test|eslint|conformance|check:css-layers|validate:|test:)/;

/**
 * Гарды из workflow: имя (как в ci.yml) + команда.
 * Шаги с continue-on-error отброшены — CI на них не падает, значит и мы не должны
 * выдавать их за проверку.
 */
export function guardsFromWorkflow(yamlText, { skipJobs = ['deploy-to-coolify'], requireTestish = true } = {}) {
  return parseWorkflowSteps(yamlText)
    .filter((s) => !skipJobs.includes(s.job))
    .filter((s) => !s.continueOnError)
    .filter((s) => !NOT_A_GUARD.some((re) => re.test(s.run)))
    .filter((s) => !requireTestish || LOOKS_LIKE_GUARD.test(s.run))
    .map((s) => ({ label: s.name || s.run, cmd: s.run, cwd: s.cwd || null, job: s.job }));
}

/** Разворачивает `pnpm test:x` в тело скрипта из package.json (до 4 раз). */
export function resolveScript(cmd, scripts) {
  let out = cmd.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 4; i += 1) {
    const m = out.match(/^pnpm (?:run )?(?:exec )?([A-Za-z0-9:_-]+)(.*)$/);
    if (!m) break;
    const [, name, rest] = m;
    if (!Object.prototype.hasOwnProperty.call(scripts, name)) break;
    out = `${scripts[name]}${rest}`.trim();
  }
  return out;
}

const TEST_FILE = /\.(spec|test)\.(ts|mjs|js|tsx)$/;

/**
 * Классификация команды гарда:
 *   jest-batch  — голый `jest --runInBand <пути>`: такие ссыпаются в ОДИН
 *                 прогон jest (каждый старт jest+ts-jest стоит секунды,
 *                 шестьдесят стартов — это шестьдесят лишних минут в сумме);
 *   jest-solo   — jest со своим конфигом или своими фильтрами: отдельный прогон,
 *                 счётчик всё равно снимается из --json;
 *   node-test   — `node --test`: счётчик снимается из TAP-итогов;
 *   opaque      — не тест (конформанс, линтер, валидаторы): только код возврата.
 */
export function classify(guard, scripts) {
  const body = resolveScript(guard.cmd, scripts);
  const base = { ...guard, body, label: prettyLabel(guard, body) };
  if (/&&|\|\||^for\b|;/.test(body)) return { ...base, kind: 'opaque' };

  const jestM = body.match(/^(?:pnpm exec )?jest\b(.*)$/);
  if (jestM) {
    const args = splitArgs(jestM[1]);
    const paths = args.filter((a) => !a.startsWith('-'));
    const flags = args.filter((a) => a.startsWith('-'));
    const onlyRunInBand = flags.every((f) => f === '--runInBand' || f === '-i');
    if (onlyRunInBand && paths.length && paths.every((p) => TEST_FILE.test(p) || p.endsWith('/')))
      return { ...base, kind: 'jest-batch', paths };
    return { ...base, kind: 'jest-solo', args };
  }
  if (/^node --test\b/.test(body)) return { ...base, kind: 'node-test', paths: splitArgs(body.replace(/^node --test/, '')).filter((a) => !a.startsWith('-')) };
  return { ...base, kind: 'opaque' };
}

/**
 * В ci.yml половина шагов без `name:` — их «именем» становится вся команда, и
 * в таблице от неё видно только `pnpm exec jest --runInBand src/themes/__te…`.
 * Для таких шагов имя собирается из имён сюит: по нему видно, ЧТО упало.
 */
function prettyLabel(guard, body) {
  const label = guard.label ?? guard.cmd;
  // Короткое `pnpm test:section-snapshots` читается лучше любого пересказа —
  // переименовываем только развёрнутые команды с путями внутри.
  if (label !== guard.cmd || !/jest|node --test/.test(guard.cmd)) return label;
  const files = splitArgs(body)
    .filter((a) => /\.(spec|test)\.(ts|mjs|js|tsx)$/.test(a))
    .map((a) => a.split('/').pop().replace(/\.(spec|test)\.(ts|mjs|js|tsx)$/, ''));
  if (!files.length) return label;
  const shown = files.slice(0, 2).join(' + ');
  return `${/node --test/.test(body) ? 'node:test' : 'jest'}: ${shown}${files.length > 2 ? ` +${files.length - 2}` : ''}`;
}

function splitArgs(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Полный набор гардов репозитория: ci.yml + package.json. */
export function collectGuards(repoRoot) {
  const wf = resolve(repoRoot, '.github/workflows/ci.yml');
  if (!existsSync(wf)) throw new Error(`не найден ${wf} — без него список гардов взять неоткуда`);
  const scripts = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')).scripts ?? {};
  return guardsFromWorkflow(readFileSync(wf, 'utf-8')).flatMap((g) => expandChain(g, scripts));
}

/**
 * `pnpm a && pnpm b` — это ДВЕ проверки. Если оставить цепочку целой, она
 * попадёт в «без счётчика», и ноль проверок во второй половине пройдёт мимо.
 * Разбираем цепочку, только если каждое звено — тест.
 */
export function expandChain(guard, scripts) {
  const body = resolveScript(guard.cmd, scripts);
  if (!body.includes('&&')) return [classify(guard, scripts)];
  const parts = body.split('&&').map((s) => s.trim()).filter(Boolean);
  const sub = parts.map((cmd, i) => classify({ ...guard, cmd, label: `${guard.label} [${i + 1}/${parts.length}]` }, scripts));
  if (sub.every((s) => s.kind !== 'opaque')) return sub;
  return [classify(guard, scripts)];
}


/**
 * Кроме ci.yml в репозитории живут другие workflow (сейчас — theme-parity с
 * Playwright и отдельным репозиторием эталонов). Локально мы их не гоняем, но
 * и молчать про них нельзя: «зелено локально» не равно «зелено в CI», а тихая
 * слепота — ровно тот механизм, которым баги и живут. Возвращаем список, чтобы
 * инструмент назвал их вслух.
 */
export function otherWorkflows(repoRoot, { main = 'ci.yml' } = {}) {
  const dir = resolve(repoRoot, '.github/workflows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f) && f !== main)
    .map((f) => {
      const text = readFileSync(resolve(dir, f), 'utf-8');
      const name = (text.match(/^name:\s*(.+)$/m) ?? [])[1]?.trim() ?? f;
      // Здесь фильтр «похоже на тест» не применяется: в чужом workflow проверка
      // может называться как угодно (`pnpm visual-diff:themes`), и пропустить её
      // молча — хуже, чем назвать лишнее.
      // Здесь фильтр «похоже на тест» не применяется: в чужом workflow проверка
      // может называться как угодно (`pnpm visual-diff:themes`), и пропустить её
      // молча — хуже, чем назвать лишнее. Но подготовительные шаги отсеиваем, а
      // строки с токенами не печатаем вовсе — им не место в выводе.
      const cmds = guardsFromWorkflow(text, { skipJobs: [], requireTestish: false })
        .map((g) => g.cmd)
        .filter((c) => !c.includes('\n'))
        .filter((c) => !/token|auth|config set|git clone|playwright install|checkout/i.test(c));
      return { file: f, name, cmds };
    });
}
