/**
 * Сторож источников событий сборщика витрин (design.md блока 6, Св-3 А).
 *
 * Каждое событие rebuild-events.json блока 3 с триггером в коде site-gen
 * должно доходить до сборщика: файл триггера зовёт
 * `notify(..., "<id>", ...)`, либо id — событие, в которое StorefrontHandoff
 * переводит trigger старой постановки в очередь (TRIGGER_EVENTS), либо id
 * доходит другим событием по причине из ARRIVES_AS. Новое событие без
 * отправки — этот тест красный.
 */
import { readFileSync } from "fs";
import * as path from "path";
import { TRIGGER_EVENTS } from "../storefront-handoff.service";

interface RebuildEvent {
  id: string;
  themes: string;
  trigger: { file?: string; name?: string } | null;
}

const ROOT = process.cwd();
const { events } = JSON.parse(
  readFileSync(
    path.join(ROOT, "packages/storefront-config/rebuild-events.json"),
    "utf8",
  ),
) as { events: RebuildEvent[] };

const codeTriggered = events.filter(
  (event) => typeof event.trigger?.file === "string",
);
const viaQueue = new Set(Object.values(TRIGGER_EVENTS));
// Смена темы опубликованного магазина — перепубликация (sites.service.ts,
// update → publish): до сборщика доходит публикацией. Область та же — весь
// магазин; отдельное событие дало бы вторую сборку того же.
const ARRIVES_AS: Readonly<Record<string, string>> = {
  "theme-change": "merchant-publish",
};
// Контроллер RPC сам не пишет: sites.update_site — это SitesDomainService.update.
const DELEGATES: Readonly<Record<string, string>> = {
  "src/sites.microservice.controller.ts": "src/sites.service.ts",
};
const sourceOf = (file: string): string =>
  readFileSync(path.join(ROOT, DELEGATES[file] ?? file), "utf8");

describe("источники событий сборщика", () => {
  it("события с триггером в коде site-gen — источники «Свежести» блока 6", () => {
    expect(codeTriggered.map((event) => event.id).sort()).toEqual([
      "branding-change",
      "contacts-change",
      "domain-change",
      "merchant-publish",
      "policy-change",
      "product-change",
      "publication-change",
      "shop-name-change",
      "theme-change",
    ]);
  });

  it.each(codeTriggered.map((event) => [event.id, event.trigger?.file ?? ""]))(
    "%s доходит до сборщика",
    (id, file) => {
      const notified = new RegExp(`notify\\(\\s*[^,]+,\\s*"${id}"`).test(
        sourceOf(file),
      );
      const delivered = viaQueue.has(id) || viaQueue.has(ARRIVES_AS[id] ?? "");
      expect(notified || delivered).toBe(true);
    },
  );
});
