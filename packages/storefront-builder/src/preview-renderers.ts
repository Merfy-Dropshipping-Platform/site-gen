import { startSectionRenderer, type SectionRenderRequest, type SectionRenderer } from '@merfy/storefront-sections';

// Процессы рендера превью (блок 1 «Секций и SDK»): свой процесс на магазин — модули секций одного магазина не попадают
// в процесс другого. Таймера простоя нет (п. 8): процессов не больше limit (PREVIEW_RENDERERS); нужен ещё один — место
// освобождает магазин, к которому дольше всех не было запросов.
export interface PreviewRenderers {
  render: (shopId: string, request: SectionRenderRequest) => Promise<string>;
  close: () => Promise<void>;
}

export interface PreviewRenderersOptions {
  limit: number;
  // Другой запуск процесса — только для тестов.
  start?: () => SectionRenderer;
}

interface ShopRenderer {
  renderer: SectionRenderer;
  // Рендеры, на которые процесс ещё не ответил.
  busy: Set<Promise<string>>;
}

// Закрыть процесс магазина: сразу или после ответов, которые он ещё готовит, — close процесса рендера отклоняет
// незаконченные рендеры.
function retire(entry: ShopRenderer, closing: Set<Promise<void>>): void {
  const done =
    entry.busy.size === 0 ? entry.renderer.close() : Promise.allSettled([...entry.busy]).then(() => entry.renderer.close());
  closing.add(done);
  void done.finally(() => closing.delete(done)).catch(() => undefined);
}

function tracked(entry: ShopRenderer, request: SectionRenderRequest): Promise<string> {
  const answer = entry.renderer.render(request);
  entry.busy.add(answer);
  void answer.finally(() => entry.busy.delete(answer)).catch(() => undefined);
  return answer;
}

export function createPreviewRenderers(options: PreviewRenderersOptions): PreviewRenderers {
  const start = options.start ?? (() => startSectionRenderer());
  // Порядок ключей Map — порядок запросов: первый ключ — магазин, к которому дольше всех не было запросов.
  const shops = new Map<string, ShopRenderer>();
  const closing = new Set<Promise<void>>();

  function entryOf(shopId: string): ShopRenderer {
    const known = shops.get(shopId);
    shops.delete(shopId);
    const [oldest] = shops;
    if (known === undefined && oldest !== undefined && shops.size >= options.limit) {
      shops.delete(oldest[0]);
      retire(oldest[1], closing);
    }
    const entry = known ?? { renderer: start(), busy: new Set<Promise<string>>() };
    shops.set(shopId, entry);
    return entry;
  }

  return {
    render: (shopId, request) => tracked(entryOf(shopId), request),
    close: async () => {
      for (const entry of shops.values()) retire(entry, closing);
      shops.clear();
      await Promise.allSettled([...closing]);
    },
  };
}
