import { z } from 'zod';
import { sectionIdSchema } from './format';

// Двери приёма (design.md блока 7, п. 21, 22, 24). Платформа и тема входят при выпуске, своя секция — из конструктора
// или MCP, расширение — при регистрации версии. Дверь ставит приставку имени — тема не назовёт секцию platform:… — и
// задаёт «кому видна»: автор и владелец — поля записи реестра; выпуск — подпись версии у всех, кроме своей секции
// (С7-20 Б: «номер — подпись выпуска автора»). Правило semver — как у версий тем (storefront-build, inputs.ts).
const SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
const RESERVED = ['platform', 'shop'];

const releaseSchema = z.string().regex(SEMVER, { error: 'нужна версия semver: 1.2.3' });
const ownId = sectionIdSchema.refine((id) => !RESERVED.includes(id), {
  error: 'platform и shop — приставки платформы и своих секций',
});

export const doorSchema = z.discriminatedUnion('author', [
  z.strictObject({ author: z.literal('platform'), release: releaseSchema }),
  z.strictObject({ author: z.literal('theme'), theme: ownId, release: releaseSchema }),
  z.strictObject({ author: z.literal('shop'), shopId: z.uuid() }),
  z.strictObject({ author: z.literal('extension'), extension: ownId, release: releaseSchema }),
]);
export type Door = z.infer<typeof doorSchema>;
export type SectionAuthor = Door['author'];

export interface DoorFields {
  author: SectionAuthor;
  // Приставка полного имени: platform:, <id темы>:, shop:, <id расширения>: (п. 22).
  prefix: string;
  // Чья секция: platform, id темы, id магазина, id расширения — по нему сборка выбирает видимые магазину (п. 24).
  owner: string;
  release: string | null;
}

export function doorFields(door: Door): DoorFields {
  switch (door.author) {
    case 'platform':
      return { author: 'platform', prefix: 'platform', owner: 'platform', release: door.release };
    case 'theme':
      return { author: 'theme', prefix: door.theme, owner: door.theme, release: door.release };
    case 'shop':
      return { author: 'shop', prefix: 'shop', owner: door.shopId, release: null };
    case 'extension':
      return { author: 'extension', prefix: door.extension, owner: door.extension, release: door.release };
  }
}
