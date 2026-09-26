/**
 * Значения по умолчанию панели конструктора для каждой секции темы — ровно те
 * `defaultProps`, что конструктор получает из GET /api/themes/:id/puck-config
 * (`defaultProps` блока + `blockDefaults` темы через `deepMergeBlockProps`).
 * Конструктор вписывает их в секцию при правке соседнего поля
 * (CustomFieldsPanel `updateProp`), поэтому для записи с базой такие значения
 * — не правка мерчанта (`change-kinds.ts`).
 */
import { Logger } from "@nestjs/common";
import type { PanelDefaults } from "./change-kinds";
import { isPlainObject } from "./operations/json";

/** Токен Nest для подмены источника (тесты, будущие адаптеры). */
export const PANEL_DEFAULTS = "PANEL_DEFAULTS";

export type PanelDefaultsSource = (themeId: string) => Promise<PanelDefaults>;

interface PuckConfigLike {
  components?: Record<string, { defaultProps?: unknown }>;
}

export function defaultsFromPuckConfig(config: PuckConfigLike): PanelDefaults {
  const components = Object.entries(config.components ?? {});
  return Object.fromEntries(
    components.map(([type, c]) => [
      type,
      isPlainObject(c.defaultProps) ? c.defaultProps : {},
    ]),
  );
}

const logger = new Logger("PanelDefaults");

/**
 * Источник с кэшем на тему. Не загрузилось — пусто и предупреждение: запись
 * работает, только без распознавания автозначений; сбой запоминается, чтобы
 * автосейвы не повторяли тяжёлую загрузку на каждой записи.
 */
export function cachedPanelDefaults(
  load: (themeId: string) => Promise<PuckConfigLike>,
): PanelDefaultsSource {
  const cache = new Map<string, Promise<PanelDefaults>>();
  return (themeId) => {
    const known = cache.get(themeId);
    if (known) return known;
    const pending = load(themeId)
      .then(defaultsFromPuckConfig)
      .catch((e: unknown) => {
        logger.warn(
          `panel defaults unavailable for theme ${themeId}: ${e instanceof Error ? e.message : e} — автозначения панели не распознаются`,
        );
        return {};
      });
    cache.set(themeId, pending);
    return pending;
  };
}

/**
 * Источник по умолчанию — тот же `ThemePuckConfigController.getPuckConfig`
 * (и его кэш на тему), что отдаёт конфиг конструктору. Импорт ленивый:
 * адаптеру, который только читает (сборка, превью), контроллер не нужен.
 */
export const puckConfigPanelDefaults: PanelDefaultsSource = cachedPanelDefaults(
  async (themeId) => {
    const { ThemePuckConfigController } =
      await import("../controllers/theme-puck-config.controller");
    return new ThemePuckConfigController().getPuckConfig(themeId);
  },
);
