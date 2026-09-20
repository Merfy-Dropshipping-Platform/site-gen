import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Перепроверка тестера (20.09, Vanilla): «„Мультиколонны“ ▸ „Колонна“ →
 * „Заголовок“ и „Текст“» не доезжают до витрины.
 *
 * Панель пишет колонку в поля `title` / `description`, а порты читали сначала
 * легаси `heading` / `text` — их заполняет сид, поэтому ввод мерчанта не
 * побеждал никогда. Замер рендером с ОБЕИМИ формами сразу: у vanilla и bloom
 * выигрывало легаси, у rose — канон.
 *
 * Тот же класс, что у полей слайда (PR #55).
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const THEMES = ["rose", "flux", "bloom", "satin", "vanilla"] as const;

const PROPS = {
  id: "MultiColumns-1",
  colorScheme: "1",
  padding: { top: 40, bottom: 40 },
  columns: [
    {
      id: "c1",
      heading: "ЛЕГАСИ-ЗАГОЛОВОК",
      text: "ЛЕГАСИ-ТЕКСТ",
      title: "ВВЕДЁННЫЙ-ЗАГОЛОВОК",
      description: "ВВЕДЁННЫЙ-ТЕКСТ",
    },
  ],
};

function render(theme: string): string {
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "MultiColumns", props: PROPS }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error) throw new Error(`${theme}: ${res.error}`);
  return res.html ?? "";
}

describe("колонка показывает то, что ввёл мерчант", () => {
  it.each(THEMES)("%s: заголовок колонки", (theme) => {
    const html = render(theme);
    expect(html).toContain("ВВЕДЁННЫЙ-ЗАГОЛОВОК");
    expect(html).not.toContain("ЛЕГАСИ-ЗАГОЛОВОК");
  });

  it.each(THEMES)("%s: текст колонки", (theme) => {
    const html = render(theme);
    expect(html).toContain("ВВЕДЁННЫЙ-ТЕКСТ");
    expect(html).not.toContain("ЛЕГАСИ-ТЕКСТ");
  });
});
