import { z } from 'zod';
import type { Entity } from './inputs';
import { POLICY_PAGES, recordPath } from './records';

// Данные магазина для секций (блок 1 «Секций и SDK», часть 4, design.md 3.22, Р1-4-6): Astro.props.shop у секции с
// "uses": ["shop"]. Только публичное — то, что магазин и так показывает покупателю: имя, контакты из админки, политики
// с текстом и признак «принимает оплату онлайн». Считается из данных сборки — тех же сущностей, что у подвала пяти тем
// (site-gen, src/utils/footer-data.ts): правила почты и телефона, адреса и названия политик — оттуда.
export interface ShopContactField {
  label: string;
  value: string;
}

export interface ShopPolicy {
  type: string;
  title: string;
  url: string;
}

export interface ShopProps {
  name: string;
  contacts: { phone: string; email: string; fields: ShopContactField[] };
  policies: ShopPolicy[];
  payments: { online: boolean };
  // Своя подпись под подвалом (site.settings.themeBrandName, как у пяти тем на проде): текст мерчанта без пробелов по
  // краям. Пусто — не вписана или вписан стандартный текст платформы: секция выводит «Разработано на Merfy» ссылкой.
  // Ключ необязательный по той же причине, что catalogUrl: данные магазина в тестах секций его не знают.
  signature?: string;
  // Адрес каталога (блок 11 «Секций и SDK», Р11а-2): /catalog, если страница каталога есть; нет — null. Ключ
  // необязательный: данные магазина в тестах секций и запросы рендера старой формы его не знают, процесс рендера даёт null.
  catalogUrl?: string | null;
}

export const EMPTY_SHOP: ShopProps = {
  name: '',
  contacts: { phone: '', email: '', fields: [] },
  policies: [],
  payments: { online: false },
  signature: '',
  catalogUrl: null,
};

// Стандартные тексты подписи платформы (footer-data.ts пяти тем): мерчантской правкой не считаются, регистр не важен.
const PLATFORM_SIGNATURES: ReadonlySet<string> = new Set(['powered by merfy', 'разработано на merfy']);

export function signatureOf(raw: string): string {
  const value = raw.trim();
  return PLATFORM_SIGNATURES.has(value.toLowerCase()) ? '' : value;
}

// Тип политики, адрес страницы и название — POLICY_PAGES (records.ts, блок 8 «Секций и SDK», часть 8а): тот же список,
// что у страниц политик.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s()-]{4,}$/;
const EMAIL_LABEL = /e-?mail|почт/i;
const PHONE_LABEL = /тел|phone|моб/i;
const fieldSchema = z.object({ label: z.string().catch(''), value: z.string(), order: z.number().catch(0) });

const isEmail = (value: string): boolean => EMAIL.test(value);
const isPhone = (value: string): boolean => !isEmail(value) && /\d/.test(value) && PHONE.test(value);

// Поля контактов из админки: со значением, по порядку; значение — без пробелов по краям.
function contactFieldsOf(entities: readonly Entity[]): ShopContactField[] {
  const raw = entities.find((entity) => entity.type === 'contacts')?.data.fields;
  return (Array.isArray(raw) ? raw : [])
    .flatMap((item) => {
      const parsed = fieldSchema.safeParse(item);
      return parsed.success && parsed.data.value.trim() !== '' ? [parsed.data] : [];
    })
    .sort((left, right) => left.order - right.order)
    .map((field) => ({ label: field.label, value: field.value.trim() }));
}

function policiesOf(entities: readonly Entity[]): ShopPolicy[] {
  return POLICY_PAGES.flatMap(({ type, slug, title }) => {
    const content = entities.find((entity) => entity.type === 'policy' && entity.id === type)?.data.content;
    return typeof content === 'string' && content.trim() !== '' ? [{ type, title, url: recordPath.policy(slug) }] : [];
  });
}

export function shopPropsOf(
  name: string,
  entities: readonly Entity[],
  catalogUrl: string | null = null,
  signature = '',
): ShopProps {
  const fields = contactFieldsOf(entities);
  const email = fields.find((field) => isEmail(field.value) || EMAIL_LABEL.test(field.label));
  const phone = fields.find((field) => field !== email && (isPhone(field.value) || PHONE_LABEL.test(field.label)));
  const online = entities.some((entity) => entity.type === 'billing' && entity.data.online === true);
  return {
    name,
    contacts: {
      phone: phone?.value ?? '',
      email: email?.value ?? '',
      fields: fields.filter((field) => field !== email && field !== phone),
    },
    policies: policiesOf(entities),
    payments: { online },
    signature: signatureOf(signature),
    catalogUrl,
  };
}
