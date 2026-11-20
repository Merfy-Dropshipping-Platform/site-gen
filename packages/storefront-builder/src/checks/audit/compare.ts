// Сравнение аудита страницы с прошлым аудитом той же страницы (место `audit`). Каждое правило таблицы — одна находка
// «стало хуже: …». Находка того же вида, что у остальных мест (`finding.ts`); `fix` — по месту: `FIX_BY_PLACE` (audit —
// `silent`), а находку в платформенной секции переводит в `platform` вызывающий (`onPlatformSections`): секцию
// платформы определяет реестр, которого здесь нет.
import { VITALS_LIMITS } from '../browser/vitals';
import { grouped, type CheckFinding, type FindingDraft } from '../finding';
import type { AuditLcp, AuditMetrics, AuditOpportunity } from './report';

// Пороги «стало хуже» откалиброваны замером 20.11 на стенде (магазин 25669e80, проверяющий процесс dev, тот же код, что у
// аудита): неизменённые страницы — главная 7 прогонов, каталог 8, товар 8. Решающая величина — медиана трёх прогонов
// против базы (медиана трёх), разброс считался перебором 20 000 пар из снятых прогонов; 90-й перцентиль «хуже»:
//   LCP   до 152 мс и 7,6 % (товар: 1955 ↔ 2106 мс);
//   perf  0,13 на главной (TBT там 16 ↔ 1211 мс от загрузки процессора), 0 на лёгких страницах;
//   TBT   498 мс на главной, до 19 мс на каталоге и товаре (95-й перцентиль главной — 667 мс);
//   CLS   до 0,0007.
// Пороги стоят выше этих чисел: до калибровки (LCP +20 %/300 мс, perf −0,05, TBT «выше нормы и выше прошлого») perf и TBT
// срабатывали на шуме главной в трёх прогонах из семи.
//
// LCP вырос на 20 % и больше, но не меньше чем на 300 мс (вдвое выше шума по мс и в 2,6 раза по процентам).
export const LCP_GROWTH = 0.2;
export const LCP_MIN_GROWTH_MS = 300;
// Оценка упала на 15 пунктов (0,15) и больше.
export const PERF_DROP = 0.15;
// TBT выше нормы телефона и вырос не меньше чем на 700 мс (выше 95-го перцентиля шума главной).
export const TBT_MIN_GROWTH_MS = 700;
// Аудит идёт на телефоне — пороги телефона.
const LIMITS = VITALS_LIMITS.mobile;
// Пороги «хорошо» для показа: LCP — Web Vitals у Google (2,5 с), CLS и TBT — телефона (`VITALS_LIMITS`). Платформа
// присылает их вместе с аудитом, чтобы агент не хранил цифры у себя.
export const AUDIT_LIMITS = { lcpMs: 2_500, cls: LIMITS.cls, tbtMs: LIMITS.tbt };
// Оценки — вещественные числа: 0,91 − 0,86 не ровно 0,05.
const EPSILON = 1e-9;

export interface AuditChange {
  path: string;
  was: AuditMetrics;
  now: AuditMetrics;
  lcp: AuditLcp | null;
  opportunities: readonly AuditOpportunity[];
}

interface Rule {
  rule: string;
  // Стало ли хуже по этому правилу.
  worse: (was: AuditMetrics, now: AuditMetrics) => boolean;
  // «Метрика было → стало» для первой части текста.
  change: (was: AuditMetrics, now: AuditMetrics) => string;
  // «как починить»: общий совет правила.
  fix: string;
  // Находка привязана к секции главного элемента первого экрана.
  atLcp: boolean;
}

const seconds = (ms: number): string => String(Math.round(ms / 100) / 10).replace('.', ',');
const decimal = (value: number, digits: number): string =>
  String(Math.round(value * 10 ** digits) / 10 ** digits).replace('.', ',');

export const RULES: readonly Rule[] = [
  {
    rule: 'lcp-regressed',
    worse: (was, now) => now.lcpMs - was.lcpMs >= LCP_MIN_GROWTH_MS && now.lcpMs >= was.lcpMs * (1 + LCP_GROWTH),
    change: (was, now) => `LCP ${seconds(was.lcpMs)} → ${seconds(now.lcpMs)} с`,
    fix: 'проверь главный элемент первого экрана: вес файла, width и height, не ставит ли адрес скрипт',
    atLcp: true,
  },
  {
    rule: 'cls-over-limit',
    worse: (was, now) => was.cls <= LIMITS.cls && now.cls > LIMITS.cls,
    change: (was, now) => `CLS ${decimal(was.cls, 3)} → ${decimal(now.cls, 3)} (норма ${decimal(LIMITS.cls, 1)})`,
    fix: 'задай размеры картинкам и блокам, которые догружаются, чтобы страница не прыгала',
    atLcp: false,
  },
  {
    rule: 'tbt-over-limit',
    worse: (was, now) => now.tbtMs > LIMITS.tbt && now.tbtMs - was.tbtMs >= TBT_MIN_GROWTH_MS,
    change: (was, now) => `TBT ${Math.round(was.tbtMs)} → ${Math.round(now.tbtMs)} мс (норма ${LIMITS.tbt})`,
    fix: 'найди секцию с тяжёлым скриптом запуска и отложи работу, которая не нужна на первом экране',
    atLcp: false,
  },
  {
    rule: 'perf-dropped',
    worse: (was, now) => was.perf - now.perf >= PERF_DROP - EPSILON,
    change: (was, now) => `оценка ${decimal(was.perf, 2)} → ${decimal(now.perf, 2)}`,
    fix: 'начни с главной возможности отчёта Lighthouse',
    atLcp: false,
  },
];

const sizeText = (bytes: number): string => (bytes >= 1024 ? `${Math.round(bytes / 1024)} КБ` : `${bytes} Б`);

// «Главная возможность отчёта»: название Lighthouse, выигрыш по времени и весу.
function opportunityText(item: AuditOpportunity): string {
  const parts = [
    item.savingsMs > 0 ? `−${item.savingsMs} мс` : '',
    item.savingsBytes > 0 ? sizeText(item.savingsBytes) : '',
  ];
  const gain = parts.filter((part) => part !== '').join(', ');
  return gain === '' ? item.title : `${item.title} (${gain})`;
}

function textOf(rule: Rule, change: AuditChange): string {
  const top = change.opportunities[0];
  const tail = top === undefined ? '' : `; в отчёте Lighthouse: ${opportunityText(top)}`;
  return `Стало хуже: ${rule.change(change.was, change.now)} · ${rule.fix}${tail}`;
}

function draftOf(rule: Rule, change: AuditChange): FindingDraft {
  const atLcp = rule.atLcp ? change.lcp : null;
  return {
    place: 'audit',
    check: 'lighthouse',
    rule: rule.rule,
    level: 'warning',
    section: atLcp?.section ?? null,
    where: atLcp?.where ?? change.path,
    text: textOf(rule, change),
  };
}

// Находки «стало хуже» по таблице правил (прошлый аудит — `was`, новый — `now`).
export function auditFindings(change: AuditChange): CheckFinding[] {
  return grouped(RULES.filter((rule) => rule.worse(change.was, change.now)).map((rule) => draftOf(rule, change)));
}
