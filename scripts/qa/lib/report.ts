/**
 * Отчёт зонда: таблица и ЧИСЛО проверенных клеток.
 *
 * Зачем модуль. `Tests: 0 total` возвращает exit 0 — «ничего не проверено»
 * выглядит как «всё хорошо». Ровно так гард без сборки сторожил пустоту и
 * оставался зелёным. Поэтому любая обёртка над зондами обязана возвращать
 * число клеток, а ноль клеток — это ПРОВАЛ.
 */

export type Row = Record<string, unknown>;

const cellText = (v: unknown): string =>
  v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v);

/** Таблица с выравниванием по самому широкому значению столбца. */
export function renderTable(rows: Row[], columns?: string[]): string {
  if (rows.length === 0) return "(ни одной клетки)";
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const width = (c: string) =>
    Math.max(c.length, ...rows.map((r) => cellText(r[c]).length));
  const line = (vals: string[]) =>
    vals.map((v, i) => v.padEnd(width(cols[i]) + 2)).join("").trimEnd();
  return [
    line(cols),
    line(cols.map((c) => "-".repeat(width(c)))),
    ...rows.map((r) => line(cols.map((c) => cellText(r[c])))),
  ].join("\n");
}

export class ProbeReport {
  readonly rows: Row[] = [];

  constructor(
    readonly title: string,
    private readonly columns?: string[],
  ) {}

  /** Одна проверенная клетка. */
  cell(row: Row): this {
    this.rows.push(row);
    return this;
  }

  get cells(): number {
    return this.rows.length;
  }

  /** Клетки с плохим вердиктом (по умолчанию — всё, кроме «едет»/«ок»). */
  bad(isBad: (r: Row) => boolean): Row[] {
    return this.rows.filter(isBad);
  }

  table(): string {
    return renderTable(this.rows, this.columns);
  }

  /**
   * Напечатать и вернуть код возврата.
   * Ноль клеток (или меньше `min`) — ПРОВАЛ, а не успех.
   */
  finish(opts: { min?: number; bad?: (r: Row) => boolean } = {}): number {
    const min = opts.min ?? 1;
    process.stdout.write(`\n=== ${this.title} ===\n${this.table()}\n`);
    process.stdout.write(`\nпроверено клеток: ${this.cells}\n`);
    if (this.cells < min) {
      process.stdout.write(
        `ПРОВАЛ: клеток ${this.cells}, а требуется не меньше ${min}. ` +
          "Ноль проверенных клеток — это не «всё хорошо», это «ничего не проверено».\n",
      );
      return 1;
    }
    if (opts.bad) {
      const bad = this.bad(opts.bad);
      process.stdout.write(`из них с плохим вердиктом: ${bad.length}\n`);
      return bad.length > 0 ? 1 : 0;
    }
    return 0;
  }
}
