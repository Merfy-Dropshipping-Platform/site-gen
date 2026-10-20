import { z } from 'zod';
import { sectionIdSchema } from './format';

// Способы сохранения секций (блок 1 «Секций и SDK», пп. 1, 2; design.md блока 7, п. 21, 22, 24): своя секция магазина
// — из конструктора, MCP или нами тем же способом (как мерчант), расширение — при регистрации версии. Секций
// платформы и тем нет. Дверь ставит приставку имени — расширение не назовётся shop:… — и задаёт «кому видна»: автор
// и владелец — поля записи реестра; выпуск — подпись версии у расширения (С7-20 Б: «номер — подпись выпуска
// автора»). Правило semver — как у версий тем (storefront-build, inputs.ts).
const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
const RESERVED = ['merfy', 'platform', 'shop'];

export const SHOP_PREFIX = 'shop';
const releaseSchema = z.string().regex(SEMVER, { error: 'нужна версия semver: 1.2.3' });
const extensionId = sectionIdSchema.refine((id) => !RESERVED.includes(id), {
  error: 'merfy, platform и shop — занятые приставки',
});

export const doorSchema = z.discriminatedUnion('author', [
  z.strictObject({ author: z.literal('shop'), shopId: z.uuid() }),
  z.strictObject({ author: z.literal('extension'), extension: extensionId, release: releaseSchema }),
]);
export type Door = z.infer<typeof doorSchema>;
export type SectionAuthor = 'platform' | 'theme' | 'shop' | 'extension';

export interface DoorFields {
  author: 'shop' | 'extension';
  // Приставка полного имени: shop:, <id расширения>: (п. 22).
  prefix: string;
  // Чья секция: id магазина или id расширения — по нему сборка выбирает видимые магазину (п. 24).
  owner: string;
  release: string | null;
}

export function doorFields(door: Door): DoorFields {
  switch (door.author) {
    case 'shop':
      return { author: 'shop', prefix: SHOP_PREFIX, owner: door.shopId, release: null };
    case 'extension':
      return { author: 'extension', prefix: door.extension, owner: door.extension, release: door.release };
  }
}
