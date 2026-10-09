import { REBUILD_EVENT_INPUTS } from '@merfy/storefront-build';
import { errorText } from './errors';
import type { Log } from './log';

// Сигнал превью (design.md блока 6, раздел 4, Св-2): на каждое принятое событие, не дожидаясь сборки, — «данные
// магазина изменились» { shopId, entities } в точку обмена storefront.preview. entities — входы сборки, которые меняет
// событие (REBUILD_EVENT_INPUTS блока 4). Кто и как его слушает — решает блок 8; сбой отправки — строка журнала,
// событие сборки всё равно принято.

export const PREVIEW_EXCHANGE = 'storefront.preview';

export interface PreviewSignal {
  shopId: string;
  entities: readonly string[];
}

export type Preview = (signal: PreviewSignal) => Promise<void>;

export const previewSignal = (type: string, shopId: string): PreviewSignal => ({
  shopId,
  entities: REBUILD_EVENT_INPUTS[type] ?? [],
});

export const previewVia =
  (publish: Preview, log: Log): Preview =>
  async (signal) => {
    try {
      await publish(signal);
    } catch (error) {
      log('preview-failed', { shopId: signal.shopId, error: errorText(error) });
    }
  };
