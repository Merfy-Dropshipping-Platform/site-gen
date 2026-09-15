#!/usr/bin/env node
/**
 * Поезд в прод: одна команда вместо десяти шагов руками.
 *
 * Последовательность ниже выполнялась руками по 10–20 минут за заход и
 * восемь раз за один день. Она детерминированная, поэтому собрана сюда целиком
 * — вместе с местами, на которых мы уже спотыкались:
 *
 *   • кандидат инвентаря satin считается ПОСЛЕ настоящей сборки темы; без
 *     `run-theme-build` локально зелено, а CI краснеет «tracked inventory is
 *     stale» (поезд b13, 15.09 — потерянный прогон);
 *   • `Tests: 0 total` даёт код возврата 0 — гард, не давший ни одной
 *     ПРОШЕДШЕЙ проверки, здесь считается провалом, а не успехом;
 *   • статус CI спрашивается ПО СВОЕМУ SHA: `gh run list` отдаёт срез, в
 *     котором сверху лежат чужие и старые прогоны (две ложные тревоги 15.09);
 *   • витрина собрана заранее: пока стенд не переопубликован и его
 *     /build.json не показал новый sitesCommit, обсуждать поведение нечего.
 *
 * По умолчанию команда НИЧЕГО не отправляет: собирает, проверяет и печатает,
 * что получилось бы. Пуш — флаг --push, публикация стендов — флаг --publish.
 *
 *   node scripts/release/train.mjs --help
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, sh, git, gitOk, tail, dur } from './lib/proc.mjs';
import { collectGuards, classify } from './lib/ci-guards.mjs';
import { runGuards, formatGuardTable } from './lib/guard-runner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = resolve(homedir(), '.claude/projects/-Users-alexey-projects-merfy/tools');
// Только http: сертификат на этом имени выписан на прежний адрес сервера,
// https сюда не ходит. Это не недосмотр, а известное ограничение стенда.
const SITES = 'http://q40c8ww44ss4ckogo8w0csso.176.57.218.121.sslip.io';

class Stop extends Error {
  constructor(step, reason, todo, extra = '') { super(reason); this.step = step; this.reason = reason; this.todo = todo; this.extra = extra; }
}

/* ────────────────────────────── аргументы ────────────────────────────── */

const HELP = `
поезд в прод — сборка, проверка и (по флагу) заливка ветки или пачки веток

  node scripts/release/train.mjs [опции]

состав
  --branch <ветка>       ветка в поезд; можно повторять (--branch a --branch b)
  --branches a,b,c       то же одной строкой
  --train-branch <имя>   имя собираемой ветки (по умолчанию train/<дата>-<время>)
  --onto <ref>           база (по умолчанию origin/main)
  без --branch           поездом считается ТЕКУЩАЯ ветка

действия (по умолчанию не делается НИЧЕГО необратимого)
  --push                 запушить в main и дождаться CI
  --publish              после зелёного CI переопубликовать стенды (нужен --push)

объём проверок
  --guards ci            гарды из .github/workflows/ci.yml (по умолчанию)
  --guards none          без гардов; вместе с --push запрещено
  --guards <файл.json>   свой список: {"guards": ["pnpm test:x", …]}
  --guard <команда>      добавить гард к набору; можно повторять
  --skip-build           не пересобирать (только если собрано этим же деревом)
  --skip-gate            не гонять pre-push-гейт; вместе с --push запрещено

прочее
  --max-rounds <n>       сколько раз перезаходить, если main уехал (по умолч. 2)
  --ci-timeout <мин>     сколько ждать CI (по умолчанию 30)
  --publish-timeout <мин> сколько ждать витрины (по умолчанию 10)
  --stands <файл>        список стендов (по умолчанию ${TOOLS}/stands.json)
  --gate <файл>          гейт (по умолчанию ${TOOLS}/pre-push.sh)
  --json <файл>          выгрузить сводку машиночитаемо
  --verbose              печатать вывод команд целиком
`;

function parseArgs(argv) {
  const o = {
    branches: [], trainBranch: null, onto: 'origin/main', push: false, publish: false,
    guards: 'ci', extraGuards: [], skipBuild: false, skipGate: false, maxRounds: 2,
    ciTimeout: 30, publishTimeout: 10, stands: resolve(TOOLS, 'stands.json'),
    gate: resolve(TOOLS, 'pre-push.sh'), json: null, verbose: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    else if (a === '--branch') o.branches.push(next());
    else if (a === '--branches') o.branches.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--train-branch') o.trainBranch = next();
    else if (a === '--onto') o.onto = next();
    else if (a === '--push') o.push = true;
    else if (a === '--publish') o.publish = true;
    else if (a === '--guards') o.guards = next();
    else if (a === '--guard') o.extraGuards.push(next());
    else if (a === '--skip-build') o.skipBuild = true;
    else if (a === '--skip-gate') o.skipGate = true;
    else if (a === '--max-rounds') o.maxRounds = Number(next());
    else if (a === '--ci-timeout') o.ciTimeout = Number(next());
    else if (a === '--publish-timeout') o.publishTimeout = Number(next());
    else if (a === '--stands') o.stands = next();
    else if (a === '--gate') o.gate = next();
    else if (a === '--json') o.json = next();
    else if (a === '--verbose') o.verbose = true;
    else { console.error(`неизвестный аргумент: ${a}\n${HELP}`); process.exit(2); }
  }
  return o;
}

/* ────────────────────────────── печать ────────────────────────────── */

const t0 = Date.now();
const stamps = [];
let stepNo = 0;
const step = (title) => { stepNo += 1; console.log(`\n[${stepNo}/11] ${title}`); };
const say = (s = '') => console.log(s);
const mark = (name, ms) => stamps.push({ name, ms });

/* ────────────────────────────── шаги ────────────────────────────── */

function stepEnvironment(o) {
  step('окружение');
  let root;
  try { root = gitOk(process.cwd(), 'rev-parse', '--show-toplevel'); }
  catch { throw new Stop(1, 'запущено не из git-репозитория', 'перейдите в рабочее дерево sites и повторите'); }
  const dirty = git(root, 'status', '--porcelain').out.trim();
  if (dirty) {
    throw new Stop(1, `рабочее дерево грязное: ${dirty.split('\n').length} файл(ов)`,
      'закоммитьте или уберите правки — поезд мержит и коммитит, поверх грязного дерева это молча смешает чужое',
      tail(dirty, 12));
  }
  const branch = gitOk(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === 'main') {
    throw new Stop(1, 'вы на main', 'поезд собирается на своей ветке: git switch -c train/<имя> origin/main');
  }
  if (o.guards === 'none' && o.push) throw new Stop(1, '--guards none вместе с --push', 'заливка без гардов запрещена: уберите один из флагов');
  if (o.skipGate && o.push) throw new Stop(1, '--skip-gate вместе с --push', 'заливка без гейта запрещена: уберите один из флагов');
  if (o.publish && !o.push) say('   ⚠ --publish без --push: публиковать будет нечего, флаг игнорируется');
  const slug = repoSlug(root);
  // Разводящий скрипт уезжает вместе с checkout: поезд собирается на ветке от
  // origin/main, где scripts/release ещё нет, и python3 не нашёл бы файл ровно
  // в момент конфликта. Копия во временной папке от переключения веток не зависит.
  const resolver = join(mkdtempSync(join(tmpdir(), 'release-train-')), 'resolve-merge.py');
  copyFileSync(resolve(HERE, 'resolve-merge.py'), resolver);
  say(`   дерево: ${root}`);
  say(`   ветка:  ${branch}`);
  say(`   репо:   ${slug}`);
  say(`   режим:  ${o.push ? 'ЗАЛИВКА (--push)' : 'без пуша — только сборка и проверки'}${o.push && o.publish ? ' + публикация стендов' : ''}`);
  return { root, branch, slug, resolver };
}

function repoSlug(root) {
  const url = git(root, 'remote', 'get-url', 'origin').out.trim();
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(\.git)?$/);
  return m ? m[1] : url;
}

function stepCompose(o, ctx) {
  step('свежий main и состав поезда');
  const f = git(ctx.root, 'fetch', 'origin', 'main');
  if (f.code !== 0) throw new Stop(2, 'git fetch origin main не прошёл', 'проверьте сеть/доступ к origin', tail(f.all, 10));
  const base = gitOk(ctx.root, 'rev-parse', o.onto);
  say(`   ${o.onto} = ${base.slice(0, 8)} (${gitOk(ctx.root, 'log', '-1', '--format=%s', base).slice(0, 60)})`);

  if (!o.branches.length) {
    const head = gitOk(ctx.root, 'rev-parse', 'HEAD');
    const ahead = Number(gitOk(ctx.root, 'rev-list', '--count', `${base}..HEAD`));
    if (ahead === 0) {
      return { nothing: true, base, message: `ветка ${ctx.branch} не содержит ни одного коммита сверх ${o.onto}` };
    }
    say(`   поезд из одной ветки: ${ctx.branch}, ${ahead} коммит(ов) сверх базы`);
    return { base, head, train: ctx.branch, members: [{ name: ctx.branch, commits: ahead, alreadyIn: false }] };
  }

  const members = [];
  for (const b of o.branches) {
    const ref = resolveRef(ctx.root, b);
    if (!ref) throw new Stop(2, `ветка не найдена: ${b}`, 'проверьте имя: git branch -a | grep <имя>');
    const alreadyIn = git(ctx.root, 'merge-base', '--is-ancestor', ref, base).code === 0;
    const commits = Number(gitOk(ctx.root, 'rev-list', '--count', `${base}..${ref}`));
    members.push({ name: b, ref, commits, alreadyIn });
  }
  for (const m of members) {
    say(`   ${m.alreadyIn ? '— уже в main, пропущена:' : '+ в поезд:'} ${m.name}${m.alreadyIn ? '' : ` (${m.commits} коммит(ов))`}`);
  }
  const live = members.filter((m) => !m.alreadyIn);
  if (!live.length) return { nothing: true, base, members, message: 'все названные ветки уже в main' };

  const train = o.trainBranch ?? `train/${new Date().toISOString().slice(0, 10)}-${new Date().toTimeString().slice(0, 5).replace(':', '')}`;
  if (git(ctx.root, 'rev-parse', '--verify', train).code === 0) {
    throw new Stop(2, `ветка поезда уже существует: ${train}`, `задайте другую: --train-branch <имя> (или удалите старую)`);
  }
  const sw = git(ctx.root, 'switch', '-c', train, base);
  if (sw.code !== 0) throw new Stop(2, `не удалось создать ветку ${train}`, 'см. вывод git', tail(sw.all, 10));
  say(`   ветка поезда: ${train} (от ${base.slice(0, 8)})`);
  return { base, train, members };
}

function resolveRef(root, name) {
  for (const cand of [name, `origin/${name}`, `refs/heads/${name}`]) {
    if (git(root, 'rev-parse', '--verify', '--quiet', cand).code === 0) return cand;
  }
  return null;
}

function stepMerge(o, ctx, plan, round) {
  step(`мерж${round > 1 ? ` (круг ${round})` : ''}`);
  const resolver = ctx.resolver;
  const targets = [{ name: o.onto, ref: plan.base }, ...plan.members.filter((m) => !m.alreadyIn && m.name !== ctx.branch).map((m) => ({ name: m.name, ref: m.ref }))];
  let merged = 0; let resolved = 0;
  for (const t of targets) {
    if (git(ctx.root, 'merge-base', '--is-ancestor', t.ref, 'HEAD').code === 0) { say(`   ${t.name}: уже в ветке`); continue; }
    const before = gitOk(ctx.root, 'rev-parse', 'HEAD');
    const m = git(ctx.root, 'merge', '--no-edit', t.ref);
    if (m.code !== 0) {
      const conflicted = git(ctx.root, 'diff', '--name-only', '--diff-filter=U').out.trim().split('\n').filter(Boolean);
      if (!conflicted.length) {
        git(ctx.root, 'merge', '--abort');
        throw new Stop(3, `мерж ${t.name} не прошёл и это не конфликт файлов`, 'смотрите вывод git ниже и разбирайтесь руками', tail(m.all, 15));
      }
      say(`   ${t.name}: конфликт в ${conflicted.length} файл(ах) — разводящий скрипт…`);
      const rr = run('python3', [resolver], { cwd: ctx.root });
      say(rr.all.trimEnd().split('\n').map((l) => `     ${l}`).join('\n'));
      if (rr.code !== 0) {
        git(ctx.root, 'merge', '--abort');
        // Имена файлов берём из вывода самого разводящего скрипта: он знает,
        // какие файлы умеет сводить, а какие назвал кодом. Список ниже — только
        // запасной вариант, если формат вывода изменится.
        const named = (rr.all.match(/КОД В КОНФЛИКТЕ — руками:\n([\s\S]*)/) ?? [])[1];
        const inCode = named
          ? named.split('\n').map((l) => l.trim()).filter(Boolean)
          : conflicted.filter((f) => !KNOWN_CONFLICTS.includes(f));
        throw new Stop(3, `конфликт в КОДЕ: ${inCode.join(', ') || conflicted.join(', ')}`,
          [
            'мерж отменён, дерево вернулось в исходное состояние — ничего не потеряно.',
            'разведите руками в отдельном заходе:',
            `    git merge ${t.name}`,
            '    # развести конфликт, git add <файлы>, git merge --continue',
            'а потом снова запустите поезд — накопительные файлы он разведёт сам.',
            'угадывать за вас, чья версия кода верна, инструмент не будет.',
          ].join('\n'));
      }
      git(ctx.root, 'add', '--', ...conflicted);
      const cont = run('git', ['-c', 'core.editor=true', 'merge', '--continue'], { cwd: ctx.root });
      if (cont.code !== 0) {
        git(ctx.root, 'merge', '--abort');
        throw new Stop(3, `мерж ${t.name} не удалось завершить после сведения`, 'разведите руками', tail(cont.all, 15));
      }
      resolved += conflicted.length;
    }
    const files = git(ctx.root, 'diff', '--name-only', `${before}..HEAD`).out.trim().split('\n').filter(Boolean).length;
    say(`   ${t.name}: влит, файлов изменилось ${files}`);
    merged += 1;
  }
  const ahead = Number(gitOk(ctx.root, 'rev-list', '--count', `${plan.base}..HEAD`));
  say(`   итог: влито источников ${merged}, сведено конфликтных файлов ${resolved}, коммитов сверх базы ${ahead}`);
  return { merged, resolved, ahead };
}
const KNOWN_CONFLICTS = ['docs/theme-work/STATUS.md', 'docs/theme-work/WORKLOG.md', '.github/workflows/ci.yml', 'package.json', 'conformance/inventory/satin.generated.json'];

const BUILD_SEQUENCE = [
  ['pnpm build', 'сборка сервиса'],
  ['pnpm build:blocks', 'блоки Astro'],
  ['pnpm build:theme-sections satin', 'секции satin'],
  ['pnpm exec tsx scripts/run-theme-build.ts satin', 'НАСТОЯЩАЯ сборка темы satin — по ней считается кандидат инвентаря'],
  ['pnpm build:theme-sections:all', 'секции всех пяти тем — иначе снимкам не с чем сравнивать'],
  ['pnpm build:preview-tailwind', 'бандл превью — без него часть гардов даёт ноль проверок'],
];

function stepBuild(o, ctx) {
  step('полная пересборка в порядке CI');
  if (o.skipBuild) { say('   пропущено по флагу --skip-build (артефакты считаются актуальными)'); return { skipped: true }; }
  const done = [];
  for (const [cmd, why] of BUILD_SEQUENCE) {
    const r = sh(cmd, { cwd: ctx.root, stdio: o.verbose ? 'inherit' : 'pipe' });
    if (r.code !== 0) {
      throw new Stop(4, `упала сборка: ${cmd}`, `запустите её одну и почините: ${cmd}`, tail(r.all, 30));
    }
    say(`   ok  ${cmd.padEnd(46)} ${dur(r.ms).padStart(9)}   ${why}`);
    done.push({ cmd, ms: r.ms });
  }
  mark('сборка', done.reduce((a, d) => a + d.ms, 0));
  return { steps: done };
}

function stepInventory(o, ctx) {
  step('инвентарь конформанса satin');
  // Перегенерация отказывается работать при грязном дереве — и правильно
  // делает: иначе инвентарь снимется с незакоммиченной правки. Проверяем сами,
  // чтобы причина называлась нашими словами, а не хвостом чужого вывода.
  const dirty = git(ctx.root, 'status', '--porcelain').out.trim();
  if (dirty) {
    throw new Stop(5, `дерево испачкалось во время прогона: ${dirty.split('\n').length} файл(ов)`,
      'кто-то правил файлы, пока шли шаги 3–4. Закоммитьте или уберите правку и запустите поезд заново — инвентарь, снятый с незакоммиченного, обманет и вас, и CI.',
      tail(dirty, 12));
  }
  const r = sh('pnpm conformance:satin:refresh-inventory', { cwd: ctx.root });
  if (r.code !== 0) throw new Stop(5, 'перегенерация инвентаря упала', 'см. вывод: pnpm conformance:satin:refresh-inventory', tail(r.all, 25));
  const file = 'conformance/inventory/satin.generated.json';
  const changed = git(ctx.root, 'status', '--porcelain', '--', file).out.trim();
  if (!changed) { say('   инвентарь не изменился — коммит не нужен'); return { changed: false }; }
  const stat = git(ctx.root, 'diff', '--shortstat', '--', file).out.trim();
  const c = git(ctx.root, 'commit', '-m', 'chore(conformance): refresh satin inventory', '--', file);
  if (c.code !== 0) throw new Stop(5, 'не удалось закоммитить инвентарь', 'см. вывод git', tail(c.all, 10));
  say(`   инвентарь обновлён и закоммичен отдельно: ${stat}`);
  return { changed: true, stat };
}

function buildGuardSet(o, ctx) {
  const scripts = JSON.parse(readFileSync(resolve(ctx.root, 'package.json'), 'utf-8')).scripts ?? {};
  let list = [];
  if (o.guards === 'ci') list = collectGuards(ctx.root);
  else if (o.guards !== 'none') {
    if (!existsSync(o.guards)) throw new Stop(6, `файл со списком гардов не найден: ${o.guards}`, 'укажите существующий файл или --guards ci');
    const raw = JSON.parse(readFileSync(o.guards, 'utf-8'));
    list = (raw.guards ?? []).map((cmd) => classify({ label: cmd, cmd, cwd: null, job: 'файл' }, scripts));
  }
  // `--guards none --guard <команда>` — прогнать ровно названное и ничего больше.
  for (const cmd of o.extraGuards) list.push(classify({ label: cmd, cmd, cwd: null, job: '--guard' }, scripts));
  return list;
}

function stepGuards(o, ctx) {
  step('гарды');
  const guards = buildGuardSet(o, ctx);
  if (!guards.length) { say('   ⚠ гарды отключены (--guards none) — залив без них запрещён'); return { skipped: true }; }
  const src = o.guards === 'ci' ? '.github/workflows/ci.yml' : o.guards;
  say(`   набор: ${guards.length} шт. из ${src}${o.extraGuards.length ? ` + ${o.extraGuards.length} через --guard` : ''}`);
  const res = runGuards(guards, { repoRoot: ctx.root, log: say });
  say('');
  say(formatGuardTable(res.results).split('\n').map((l) => `   ${l}`).join('\n'));
  say(`   ИТОГО: прошло проверок ${res.totals.passed}, не прошло ${res.totals.failed}, пропущено ${res.totals.skipped}; время ${dur(res.ms)}`);
  mark('гарды', res.ms);

  if (res.empty.length || res.red.length) {
    const todo = [];
    if (res.red.length) {
      todo.push('КРАСНЫЕ — это регрессия поезда; чините её, а не отключайте гард:');
      todo.push(...res.red.map((r) => `    ${r.label}${r.failed ? ` (не прошло ${r.failed})` : ''}\n      ${r.cmd}`));
    }
    if (res.empty.length) {
      todo.push('НОЛЬ ПРОВЕРОК — это не «зелено», это проверка, которая ничего не сторожит.');
      todo.push('«Tests: 0 total» и «1 skipped» дают код возврата 0 и выглядят как успех.');
      todo.push(...res.empty.map((r) => `    ${r.label} → ${r.why}\n      ${r.cmd}`));
    }
    throw new Stop(6, [
      res.red.length ? `красных гардов: ${res.red.length}` : null,
      res.empty.length ? `гардов без единой прошедшей проверки: ${res.empty.length}` : null,
    ].filter(Boolean).join('; '), todo.join('\n'),
      tail([...res.red, ...res.empty].map((r) => r.log).filter(Boolean).join('\n'), 30));
  }
  return { count: guards.length, totals: res.totals, ms: res.ms };
}

function stepGate(o, ctx) {
  step('гейт перед пушем');
  if (o.skipGate) { say('   пропущено по флагу --skip-gate'); return { skipped: true }; }
  const gate = existsSync(o.gate) ? o.gate : resolve(ctx.root, '.githooks/pre-push');
  if (!existsSync(gate)) {
    throw new Stop(7, `гейт не найден: ${o.gate}`, 'укажите путь: --gate <файл> (или --skip-gate, но тогда и --push нельзя)');
  }
  say(`   ${gate}`);
  const r = sh(`sh ${JSON.stringify(gate)}`, { cwd: ctx.root });
  const ok = r.code === 0 && r.all.includes('✓ гейт пройден');
  say(r.all.trimEnd().split('\n').slice(-6).map((l) => `   ${l}`).join('\n'));
  if (!ok) {
    throw new Stop(7, 'гейт не пройден', 'почините то, на что он показывает; строка «✓ гейт пройден» обязана появиться', tail(r.all, 25));
  }
  mark('гейт', r.ms);
  return { ms: r.ms };
}

function stepFreshness(o, ctx, plan) {
  step('свежесть main');
  git(ctx.root, 'fetch', 'origin', 'main');
  const now = gitOk(ctx.root, 'rev-parse', o.onto);
  if (now === plan.base) { say(`   ${o.onto} на месте: ${now.slice(0, 8)} — можно заливать`); return { drifted: false, base: now }; }
  const newCommits = Number(gitOk(ctx.root, 'rev-list', '--count', `${plan.base}..${now}`));
  say(`   ⚠ main уехал, пока шли проверки: ${plan.base.slice(0, 8)} → ${now.slice(0, 8)} (+${newCommits} коммит(ов))`);
  return { drifted: true, base: now, newCommits };
}

function stepPush(o, ctx, plan) {
  step('пуш в main');
  const head = gitOk(ctx.root, 'rev-parse', 'HEAD');
  const commits = Number(gitOk(ctx.root, 'rev-list', '--count', `${plan.base}..HEAD`));
  if (!o.push) {
    say(`   НЕ ПУШУ — нет флага --push. Это режим по умолчанию.`);
    say(`   получилось бы: git push origin HEAD:main`);
    say(`   уехало бы: ${commits} коммит(ов), голова ${head.slice(0, 8)}`);
    say(`   состав: ${plan.members.filter((m) => !m.alreadyIn).map((m) => m.name).join(', ')}`);
    return { pushed: false, head, commits };
  }
  const r = git(ctx.root, 'push', 'origin', 'HEAD:main');
  if (r.code !== 0) {
    throw new Stop(9, 'пуш отклонён', 'скорее всего main уехал прямо сейчас — запустите поезд заново, он до мержит свежий main', tail(r.all, 15));
  }
  say(`   запушено: ${commits} коммит(ов), main = ${head.slice(0, 8)}`);
  return { pushed: true, head, commits };
}

async function stepCi(o, ctx, pushed) {
  step('прогон CI');
  if (!pushed.pushed) { say('   пропущено: без --push прогона не будет'); return { skipped: true }; }
  const sha8 = pushed.head.slice(0, 8);
  say(`   спрашиваю по СВОЕМУ SHA ${sha8} (gh run list отдаёт срез со старыми прогонами — уже дважды поднимало ложную тревогу)`);
  const deadline = Date.now() + o.ciTimeout * 60_000;
  let last = null;
  while (Date.now() < deadline) {
    const r = run('gh', ['api', `repos/${ctx.slug}/actions/runs?per_page=30`, '--jq',
      `[.workflow_runs[] | select(.head_sha[0:8]=="${sha8}") | {name,status,conclusion,started:.run_started_at,updated:.updated_at,url:.html_url}]`]);
    if (r.code !== 0) throw new Stop(10, 'gh api не ответил', 'проверьте gh auth status', tail(r.all, 10));
    let runs = [];
    try { runs = JSON.parse(r.out || '[]'); } catch { runs = []; }
    last = runs;
    if (runs.length && runs.every((x) => x.status === 'completed')) {
      const bad = runs.filter((x) => x.conclusion !== 'success' && x.conclusion !== 'skipped');
      for (const x of runs) say(`   ${x.name}: ${x.conclusion} (${ciDur(x)})`);
      if (bad.length) {
        throw new Stop(10, `CI красный: ${bad.map((b) => `${b.name}=${b.conclusion}`).join(', ')}`,
          ['не пушьте поверх красного — следующий коммит не уедет, а причина утонет.', 'логи:', ...bad.map((b) => `    ${b.url}`)].join('\n'));
      }
      const ms = Math.max(...runs.map((x) => new Date(x.updated) - new Date(x.started)));
      mark('CI', ms);
      return { ok: true, runs, ms };
    }
    const shown = runs.length ? runs.map((x) => `${x.name}=${x.status}`).join(', ') : 'прогонов по этому SHA ещё нет';
    process.stdout.write(`\r   ждём: ${shown} … ${dur(Date.now() - (deadline - o.ciTimeout * 60_000))}   `);
    await sleep(20_000);
  }
  throw new Stop(10, `CI не завершился за ${o.ciTimeout} мин`, `посмотрите руками: https://github.com/${ctx.slug}/actions`, JSON.stringify(last));
}
const ciDur = (x) => dur(new Date(x.updated) - new Date(x.started));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stepStands(o, ctx, pushed, ci) {
  step('стенды');
  if (!existsSync(o.stands)) { say(`   список стендов не найден: ${o.stands} — шаг пропущен`); return { skipped: true }; }
  const { stands } = JSON.parse(readFileSync(o.stands, 'utf-8'));
  const canPublish = o.publish && pushed.pushed && ci?.ok;
  if (!canPublish) {
    say(`   НЕ ПУБЛИКУЮ — ${!o.publish ? 'нет флага --publish' : !pushed.pushed ? 'не было пуша' : 'CI не зелёный'}.`);
    say(`   получилось бы: POST ${SITES}/admin-publish/<siteId> (только http — сертификат на этом имени старый)`);
    for (const s of stands) say(`     ${String(s.theme).padEnd(8)} ${s.name.padEnd(18)} ${s.siteId}  → https://${s.slug}.merfy.ru/build.json`);
    say(`   после публикации ждал бы, пока в /build.json появится sitesCommit ${pushed.head ? pushed.head.slice(0, 8) : '<новый>'} (обычно 1–3 мин)`);
    return { published: false, stands };
  }
  const results = [];
  for (const s of stands) {
    const res = await fetch(`${SITES}/admin-publish/${s.siteId}`, { method: 'POST' }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }));
    say(`   ${s.theme}: публикация ${res.status} ${res.ok ? 'принята' : 'НЕ принята'}`);
    results.push({ ...s, queued: res.ok, status: res.status });
  }
  const want = pushed.head.slice(0, 8);
  const deadline = Date.now() + o.publishTimeout * 60_000;
  const pending = new Map(results.filter((r) => r.queued).map((r) => [r.slug, r]));
  const started = Date.now();
  while (pending.size && Date.now() < deadline) {
    await sleep(15_000);
    for (const [slug, s] of [...pending]) {
      const stamp = await fetch(`https://${slug}.merfy.ru/build.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (stamp?.sitesCommit?.slice(0, 8) === want) {
        say(`   ${s.theme}: витрина собрана из ${want} (${dur(Date.now() - started)})`);
        s.fresh = true; pending.delete(slug);
      }
    }
  }
  for (const [, s] of pending) say(`   ⚠ ${s.theme}: за ${o.publishTimeout} мин витрина так и не показала ${want} — проверьте ${`https://${s.slug}.merfy.ru/build.json`}`);
  mark('публикация', Date.now() - started);
  return { published: true, stands: results, stale: [...pending.values()].map((s) => s.theme) };
}

/* ────────────────────────────── сводка ────────────────────────────── */

function summary(o, ctx, plan, res) {
  say('\n══════════════════ СВОДКА ══════════════════');
  const live = plan.members.filter((m) => !m.alreadyIn);
  say(`ветки в поезде: ${live.length ? live.map((m) => `${m.name} (${m.commits})`).join(', ') : '—'}`);
  if (plan.members.some((m) => m.alreadyIn)) say(`уже были в main: ${plan.members.filter((m) => m.alreadyIn).map((m) => m.name).join(', ')}`);
  say(`ветка поезда:   ${plan.train}`);
  say(`база:           ${plan.base.slice(0, 8)}`);
  say(`голова:         ${res.push?.head?.slice(0, 8) ?? '—'}${res.push?.pushed ? ' — ЗАЛИТА В MAIN' : ' (не залита: нет --push)'}`);
  if (res.guards?.totals) say(`гарды:          ${res.guards.count} шт., прошло проверок ${res.guards.totals.passed}, пропущено ${res.guards.totals.skipped}`);
  if (res.inventory) say(`инвентарь:      ${res.inventory.changed ? `обновлён (${res.inventory.stat})` : 'без изменений'}`);
  if (res.ci?.ok) say(`CI:             зелёный, ${dur(res.ci.ms)}`);
  if (res.stands?.published) say(`стенды:         ${res.stands.stands.filter((s) => s.fresh).length}/${res.stands.stands.length} на образе ${res.push.head.slice(0, 8)}${res.stands.stale?.length ? `, отстают: ${res.stands.stale.join(', ')}` : ''}`);
  else if (res.stands) say(`стенды:         не публиковались (${o.publish ? 'не было зелёного пуша' : 'нет --publish'})`);
  say('');
  for (const s of stamps) say(`  ${s.name.padEnd(14)} ${dur(s.ms)}`);
  say(`  ${'всего'.padEnd(14)} ${dur(Date.now() - t0)}`);
  if (!res.push?.pushed) {
    say('\nчтобы залить по-настоящему, повторите ту же команду с --push (и --publish для стендов).');
  }
}

/* ────────────────────────────── main ────────────────────────────── */

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const ctx = stepEnvironment(o);
  let plan = stepCompose(o, ctx);
  if (plan.nothing) {
    say(`\n✓ НЕЧЕГО ЗАЛИВАТЬ: ${plan.message}.`);
    say('  поезд не собирался, ничего не пересобиралось, ничего не пушилось.');
    say('  если ветка должна была что-то привезти — проверьте, что вы на ней и что коммиты на месте:');
    say(`      git log --oneline ${o.onto}..HEAD`);
    return 0;
  }
  const res = {};
  for (let round = 1; round <= o.maxRounds; round += 1) {
    if (round > 1) { stepNo = 2; }
    res.merge = stepMerge(o, ctx, plan, round);
    res.build = stepBuild(o, ctx);
    res.inventory = stepInventory(o, ctx);
    res.guards = stepGuards(o, ctx);
    res.gate = stepGate(o, ctx);
    const fresh = stepFreshness(o, ctx, plan);
    if (!fresh.drifted) break;
    if (round === o.maxRounds) {
      throw new Stop(8, `main уезжает быстрее, чем идут проверки (кругов: ${o.maxRounds})`,
        'дождитесь паузы в чужих заливках и запустите поезд заново — пушить поверх уехавшего main нельзя');
    }
    say(`   возвращаюсь к шагу 2: домержу свежий main и перепроверю всё заново (круг ${round + 1} из ${o.maxRounds})`);
    plan = { ...plan, base: fresh.base };
  }
  res.push = stepPush(o, ctx, plan);
  res.ci = await stepCi(o, ctx, res.push);
  res.stands = await stepStands(o, ctx, res.push, res.ci);
  summary(o, ctx, plan, res);
  if (o.json) {
    writeFileSync(o.json, JSON.stringify({ plan, res, stamps, ms: Date.now() - t0 }, null, 2));
    say(`сводка: ${o.json}`);
  }
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  if (e instanceof Stop) {
    console.error(`\n══════════════════ ОСТАНОВКА на шаге ${e.step} ══════════════════`);
    console.error(`ПРИЧИНА: ${e.reason}`);
    console.error(`\nЧТО ДЕЛАТЬ:\n${e.todo}`);
    if (e.extra) console.error(`\nВЫВОД (хвост):\n${e.extra}`);
    console.error('\nничего не запушено.');
    process.exit(1);
  }
  console.error('\nнеожиданная ошибка инструмента:');
  console.error(e?.stack ?? e);
  process.exit(3);
});
