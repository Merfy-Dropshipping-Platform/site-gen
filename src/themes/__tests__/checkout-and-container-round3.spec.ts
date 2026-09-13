/**
 * Третий круг тестировщика (2026-09-13). Четыре пункта, все — про то, что
 * мерчант видит НА ЭКРАНЕ, а не про то, что отдаёт рендер на выдуманных пропсах.
 *
 * Почему отдельный файл и почему пропсы сняты с прода: предыдущие правки
 * проверялись фикстурами вида `{ containerEnabled: "true" }` — таких пропсов
 * конструктор не шлёт НИКОГДА. Замер живого payload (POST /preview/block,
 * прод, QA-сайты, 2026-09-13) показал другое:
 *
 *   {"containerEnabled":"false","container":{"enabled":"true"}}
 *
 * то есть тоггл «Контейнер» у «Сворачиваемого раздела» пишет ЛЕГАСИ-ключ, а
 * канон-ключ остаётся дефолтным. Порт читает `containerEnabled ?? container
 * .enabled` — `??` не проваливается, контейнер выключен, класс схемы не
 * печатается. Тестировщик третий раз пишет «не применяется цветовая схема
 * контейнера», и он прав.
 *
 * Фикстуры ниже — дословные payload'ы с прода. Правило: проверять тем, что
 * реально уходит в сеть.
 *
 * Требует собранных секций: pnpm build:theme-sections <тема>.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "flux", "vanilla"] as const;

type Job = { block: string; props: Record<string, unknown>; live?: boolean };

function render(theme: string, jobs: Job[]): string[] {
  const raw = execFileSync("node", [RENDERER, theme, JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return (
    JSON.parse(raw) as {
      html?: string;
      error?: string;
      pipelineError?: string;
      missing?: boolean;
    }[]
  ).map((r) =>
    r.missing
      ? "MISSING"
      : r.error || r.pipelineError
        ? `ERROR:${r.error ?? r.pipelineError}`
        : (r.html ?? ""),
  );
}

const built = (theme: string) =>
  existsSync(
    resolve(SITES_ROOT, "dist", "theme-sections", theme, "manifest.json"),
  );

const FAQ_HEADING = "ВОПРОС-ПРУФ";

/**
 * Дословный payload конструктора при включённом тоггле «Контейнер»
 * (снят с прода 2026-09-13, POST /preview/block, тема flux).
 * `containerEnabled` остаётся "false" — его тоггл не трогает.
 */
function collapsibleAsConstructorSends(
  containerOn: boolean,
  containerScheme: string,
) {
  return {
    id: "Collapsible-1",
    colorScheme: "scheme-2",
    padding: { top: 40, bottom: 40 },
    heading: "Вопросы",
    headingSize: "medium",
    sections: [{ id: "s1", heading: FAQ_HEADING, content: "Ответ" }],
    containerEnabled: "false",
    container: { enabled: containerOn ? "true" : "false" },
    containerColorScheme: containerScheme,
  };
}

describe.each(THEMES)(
  "п.1 Сворачиваемый раздел: тоггл «Контейнер» из конструктора — %s",
  (theme) => {
    it("включённый тоггл доносит схему контейнера до разметки", () => {
      if (!built(theme)) return;
      const [html] = render(theme, [
        {
          block: "CollapsibleSection",
          props: collapsibleAsConstructorSends(true, "scheme-4"),
          live: true,
        },
      ]);
      expect(html).not.toMatch(/^ERROR:/);
      expect(html).toContain(FAQ_HEADING);
      expect(html).toContain("color-scheme-4");
    });

    it("САБОТАЖ: выключённый тоггл схему контейнера НЕ применяет", () => {
      if (!built(theme)) return;
      const [html] = render(theme, [
        {
          block: "CollapsibleSection",
          props: collapsibleAsConstructorSends(false, "scheme-4"),
          live: true,
        },
      ]);
      expect(html).not.toMatch(/^ERROR:/);
      expect(html).not.toContain("color-scheme-4");
    });

    it("схема контейнера числом (после нормализации ревизии) тоже доезжает", () => {
      if (!built(theme)) return;
      const props = collapsibleAsConstructorSends(true, "scheme-4");
      const [html] = render(theme, [
        {
          block: "CollapsibleSection",
          props: { ...props, containerColorScheme: 4 },
          live: true,
        },
      ]);
      expect(html).not.toMatch(/^ERROR:/);
      expect(html).toContain("color-scheme-4");
    });
  },
);
