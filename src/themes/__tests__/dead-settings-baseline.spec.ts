import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

/**
 * Список «настройка не влияет на витрину» не растёт молча.
 *
 * ЗАЧЕМ. Владелец 22.09: «кидаю эти задачи уже пятый раз». Класс «настройка
 * сохраняется, но ничего не делает» тестер находил по одному пункту — размер
 * заголовка, контейнер, положение видео, ссылка кнопки. Аудит
 * `scripts/qa/settings-audit.ts` гоняет КАЖДОЕ поле каждой секции в двух
 * значениях (имена и значения берутся из самой панели, не выдумываются) и
 * сравнивает разметку. Здесь результат сверяется с закреплённым списком.
 *
 * Появилась новая мёртвая настройка — проверка красная ДО тестера.
 * Починили старую — тоже красная: список обязан худеть, иначе протухнет и
 * начнёт прятать новые.
 *
 * ВАЖНО: секции рендерятся с живым наполнением. Без него рисуется плейсхолдер,
 * и половина настроек выглядит мёртвой (30 против 14 на замере 22.09).
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const БАЗА = resolve(SITES_ROOT, "conformance/baselines/dead-settings.json");

type Находка = { тема: string; секция: string; поле: string };

function прогон(): string[] {
  const файл = join(mkdtempSync(join(tmpdir(), "dead-settings-")), "отчёт.json");
  execFileSync("pnpm", ["exec", "tsx", "scripts/qa/settings-audit.ts", "--json", файл], {
    cwd: SITES_ROOT,
    stdio: "pipe",
  });
  const отчёт = JSON.parse(readFileSync(файл, "utf-8")) as {
    проверено: number;
    мёртвые: Находка[];
  };
  expect(отчёт.проверено).toBeGreaterThan(300);
  return отчёт.мёртвые.map((м) => `${м.тема}/${м.секция}/${м.поле}`).sort();
}

describe("мёртвые настройки против закреплённого списка", () => {
  const известные: string[] = JSON.parse(readFileSync(БАЗА, "utf-8")).известные;
  let сейчас: string[] = [];

  beforeAll(() => {
    сейчас = прогон();
  }, 600_000);

  it("новых мёртвых настроек не появилось", () => {
    expect(сейчас.filter((k) => !известные.includes(k))).toEqual([]);
  });

  it("починенные убраны из списка — иначе он протухнет", () => {
    expect(известные.filter((k) => !сейчас.includes(k))).toEqual([]);
  });
});
