import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ClientProxy } from "@nestjs/microservices";
import { firstValueFrom } from "rxjs";
import { timeout } from "rxjs/operators";
import type * as schemaTypes from "../db/schema";

export interface FooterDataDeps {
  db: NodePgDatabase<typeof schemaTypes>;
  schema: typeof schemaTypes;
  /** Optional — used to gate footer payment badges on a connected acquirer. */
  billingClient?: ClientProxy;
}

interface MinimalLogger {
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

const POLICY_SLUG_MAP: Record<string, string> = {
  refund: "refund",
  privacy: "privacy",
  tos: "terms",
  shipping: "shipping-policy",
};
const POLICY_TITLE_MAP: Record<string, string> = {
  refund: "Политика возврата",
  privacy: "Политика конфиденциальности",
  tos: "Условия обслуживания",
  shipping: "Политика доставки",
};

/** Страницы, которые не попадают в колонку «Навигация» футера. */
const FOOTER_NAV_EXCLUDED_PAGE_IDS = new Set([
  "page-cart",
  "page-checkout",
  "page-checkout-result",
  "page-product",
  "page-collection",
]);

const FOOTER_NAV_EXCLUDED_SLUGS = new Set([
  "",
  "cart",
  "checkout",
  "checkout-result",
  "product",
  "collections/preview",
]);

const FOOTER_NAV_SYSTEM_ORDER: Record<string, number> = {
  home: 0,
  "page-catalog": 10,
  "page-about": 20,
  "page-delivery": 30,
  "page-contacts": 40,
};

const FOOTER_NAV_SYSTEM_IDS = new Set([
  "home",
  "page-catalog",
  "page-about",
  "page-delivery",
  "page-contacts",
]);

interface FooterNavPageMeta {
  id?: string;
  name?: string;
  slug?: string;
  role?: string;
  isCustom?: boolean;
  createdAt?: number;
}

export type FooterNavLink = { label: string; href: string };

/** Нормализует href для dedupe (trailing slash, root). */
export function normalizeFooterNavHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "");
}

/**
 * Ссылки навигации футера из `revision.pages`: системные content-страницы
 * (home, catalog, about, delivery, contacts) + кастомные страницы мерчанта.
 */
export function buildFooterNavigationLinks(pages: unknown): FooterNavLink[] {
  if (!Array.isArray(pages)) return [];
  const items: Array<FooterNavLink & { order: number }> = [];

  for (const raw of pages) {
    const p = raw as FooterNavPageMeta;
    if (!p || typeof p.id !== "string") continue;
    const id = p.id;
    if (FOOTER_NAV_EXCLUDED_PAGE_IDS.has(id)) continue;

    const slugRaw =
      typeof p.slug === "string" ? p.slug.replace(/^\/+|\/+$/g, "") : "";

    if (id === "home") {
      const label =
        typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Главная";
      items.push({ label, href: "/", order: FOOTER_NAV_SYSTEM_ORDER.home });
      continue;
    }

    if (FOOTER_NAV_EXCLUDED_SLUGS.has(slugRaw)) continue;
    if (
      slugRaw.startsWith("checkout") ||
      slugRaw.startsWith("product") ||
      slugRaw.startsWith("collections/")
    ) {
      continue;
    }

    const isCustom = p.isCustom === true || p.role === "custom";
    if (!isCustom && !FOOTER_NAV_SYSTEM_IDS.has(id)) continue;

    const href = slugRaw ? `/${slugRaw}` : "/";
    const label =
      typeof p.name === "string" && p.name.trim() ? p.name.trim() : id;
    const order =
      FOOTER_NAV_SYSTEM_ORDER[id] ??
      (isCustom ? 100 + (typeof p.createdAt === "number" ? p.createdAt : 0) : 50);

    items.push({ label, href, order });
  }

  items.sort((a, b) => a.order - b.order);
  return items.map(({ label, href }) => ({ label, href }));
}

/**
 * Дополняет navigationColumn.links недостающими страницами из `pages[]`.
 * Явные ссылки мерчанта сохраняются; новые страницы добавляются в конец.
 */
export function mergeFooterNavigationLinks(
  existingColumn: unknown,
  fromPages: FooterNavLink[],
): FooterNavLink[] {
  const rawLinks = (existingColumn as { links?: unknown } | null)?.links;
  const base: FooterNavLink[] = Array.isArray(rawLinks)
    ? rawLinks
        .filter(
          (l): l is { label?: unknown; href?: unknown } =>
            !!l && typeof (l as { href?: unknown }).href === "string",
        )
        .map((l) => ({
          label: String(l.label ?? "").trim() || String(l.href),
          href: String(l.href).trim(),
        }))
        .filter((l) => l.href && l.href !== "#")
    : [];

  if (base.length === 0) return fromPages;

  const seen = new Set(base.map((l) => normalizeFooterNavHref(l.href)));
  const merged = [...base];
  for (const link of fromPages) {
    const key = normalizeFooterNavHref(link.href);
    if (seen.has(key)) continue;
    merged.push(link);
    seen.add(key);
  }
  return merged;
}

/**
 * Мутирует Footer-блоки `revisionData.pagesData[*].content` (+ legacy `content`)
 * реальными данными магазина — элемент футера показывается ТОЛЬКО при настроенных
 * данных:
 *  • informationColumn.links — только заполненные политики (site_policy);
 *  • navigationColumn.links — дополняются ссылками из revision.pages[];
 *  • phone / socialColumn.email — телефон/почта из «Информация о компании» (site_contacts);
 *  • socialColumn.contactFields — ОСТАЛЬНЫЕ поля (адрес/часы/ИНН/любая инфа);
 *  • socialColumn.socialLinks — фильтр пустых/«#» + нормализация схемы (https://);
 *  • paymentEnabled — только при подключённой кассе (billing.shop_payment_settings).
 *
 * Общая логика build (runBuildPipeline после stageMerge) и preview-контроллера —
 * чтобы конструктор/превью показывали тот же футер, что live (parity).
 * Идемпотентно. Сетевые/БД-ошибки гасятся (футер просто без доп. данных).
 */
export async function applyFooterData(
  deps: FooterDataDeps,
  siteId: string,
  revisionData: Record<string, unknown> | null | undefined,
  logger?: MinimalLogger,
): Promise<string> {
  if (!revisionData || typeof revisionData !== "object") return "";
  try {
    // Ссылки политик — только с непустым контентом.
    const policies = await deps.db
      .select()
      .from(deps.schema.sitePolicy)
      .where(eq(deps.schema.sitePolicy.siteId, siteId));
    const policyLinks = policies
      .filter((p) => p.content && p.content.trim() !== "")
      .map((p) => ({
        label: POLICY_TITLE_MAP[p.type] ?? p.type,
        href: `/${POLICY_SLUG_MAP[p.type] ?? p.type}`,
      }));

    // Контакты компании.
    const contactsRows = await deps.db
      .select()
      .from(deps.schema.siteContacts)
      .where(eq(deps.schema.siteContacts.siteId, siteId));
    const contactFields = (
      (contactsRows[0]?.fields as
        | { id: string; label: string; value: string; order: number }[]
        | undefined) ?? []
    )
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((f) => f && typeof f.value === "string" && f.value.trim() !== "");
    const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
    const isPhone = (v: string) =>
      !isEmail(v) && /\d/.test(v) && /^[+\d][\d\s()\-]{4,}$/.test(v.trim());
    const labelHit = (label: string, re: RegExp) => re.test(label ?? "");
    const emailField = contactFields.find(
      (f) => isEmail(f.value) || labelHit(f.label, /e-?mail|почт/i),
    );
    const phoneField = contactFields.find(
      (f) => f !== emailField && (isPhone(f.value) || labelHit(f.label, /тел|phone|моб/i)),
    );
    const contactEmail = emailField?.value.trim();
    const contactPhone = phoneField?.value.trim();
    const extraContactFields = contactFields.filter(
      (f) => f !== emailField && f !== phoneField,
    );

    // Подключена ли касса (YooKassa) → платёжные бейджи. shopId == siteId.
    let paymentEnabled = false;
    if (deps.billingClient) {
      try {
        const cred = (await firstValueFrom(
          deps.billingClient
            .send("billing.shop_payment_settings.get_credentials", {
              shopId: siteId,
            })
            .pipe(timeout(4000)),
        )) as { success?: boolean; yookassaShopId?: string | null } | null;
        paymentEnabled = Boolean(cred?.success && cred?.yookassaShopId);
      } catch (e) {
        logger?.warn(
          `[footer-data] payment status check failed (badges hidden): ${e instanceof Error ? e.message : String(e)}`,
        );
        paymentEnabled = false;
      }
    }

    const rev = revisionData as {
      pages?: unknown;
      pagesData?: Record<string, { content?: unknown[] }>;
      content?: unknown[];
    };
    const pageNavLinks = buildFooterNavigationLinks(rev.pages);
    const contentArrays: any[][] = [];
    if (rev.pagesData && typeof rev.pagesData === "object") {
      for (const key of Object.keys(rev.pagesData)) {
        const c = rev.pagesData[key]?.content;
        if (Array.isArray(c)) contentArrays.push(c as any[]);
      }
    }
    if (Array.isArray(rev.content)) contentArrays.push(rev.content as any[]);

    const SOCIAL_PLACEHOLDER = new Set(["", "#"]);
    const normalizeHref = (h: string): string =>
      /^(?:https?:\/\/|mailto:|tel:|\/)/i.test(h) ? h : `https://${h}`;
    let footerCount = 0;
    for (const content of contentArrays) {
      for (const component of content) {
        if (component?.type !== "Footer" || !component?.props) continue;
        const props = component.props as Record<string, any>;

        const infoCol = (props.informationColumn ?? {}) as Record<string, unknown>;
        props.informationColumn = { ...infoCol, links: policyLinks };

        const navCol = (props.navigationColumn ?? {}) as Record<string, unknown>;
        props.navigationColumn = {
          ...navCol,
          links: mergeFooterNavigationLinks(navCol, pageNavLinks),
        };

        const social = (props.socialColumn ?? {}) as Record<string, any>;
        const filteredSocialLinks = Array.isArray(social.socialLinks)
          ? social.socialLinks
              .filter(
                (s: any) =>
                  s &&
                  typeof s.href === "string" &&
                  !SOCIAL_PLACEHOLDER.has(s.href.trim()),
              )
              .map((s: any) => ({ ...s, href: normalizeHref(String(s.href).trim()) }))
          : [];
        const newSocial: Record<string, any> = {
          ...social,
          socialLinks: filteredSocialLinks,
          contactFields: extraContactFields.map((f) => ({ label: f.label, value: f.value })),
        };
        if (contactEmail) newSocial.email = contactEmail;
        else delete newSocial.email;
        props.socialColumn = newSocial;
        if (contactPhone) props.phone = contactPhone;
        else delete props.phone;

        props.paymentEnabled = paymentEnabled;
        footerCount++;
      }
    }
    logger?.log(
      `[footer-data] site ${siteId}: ${footerCount} footer block(s), ${policyLinks.length} policy link(s), ` +
        `navPages=${pageNavLinks.length}, ` +
        `phone=${contactPhone ? "yes" : "no"}, email=${contactEmail ? "yes" : "no"}, ` +
        `extraFields=${extraContactFields.length}, payment=${paymentEnabled ? "on" : "off"}`,
    );

    // Fingerprint данных футера (меняется независимо от revisionId) — для cache-key
    // превью, чтобы смена контактов/политик/кассы инвалидировала закэшированный HTML
    // (синхронность превью ↔ live). Источники: updatedAt контактов и политик +
    // число policy-ссылок + статус кассы.
    const ts = (d: unknown): number =>
      d instanceof Date ? d.getTime() : typeof d === "string" ? Date.parse(d) || 0 : 0;
    const contactsTs = ts(contactsRows[0]?.updatedAt);
    const policyTs = policies.reduce((m, p) => Math.max(m, ts(p.updatedAt)), 0);
    return `${contactsTs}.${policyTs}.${policyLinks.length}.${paymentEnabled ? 1 : 0}`;
  } catch (err) {
    logger?.warn(
      `[footer-data] applyFooterData failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return "";
}
