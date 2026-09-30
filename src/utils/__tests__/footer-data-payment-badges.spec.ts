import { of, throwError, type Observable } from "rxjs";
import { applyFooterData } from "../footer-data";

/**
 * Значки оплаты в подвале (оплаты, этап 3, задача 3.6): подвал спрашивает у
 * billing ПУБЛИЧНЫЕ настройки оплаты магазина (`get_public`), а не ключи.
 *
 * Раньше здесь стоял `billing.shop_payment_settings.get_credentials` — ради
 * одного флажка «показывать значки» по очереди ехал расшифрованный секретный
 * ключ ЮKassa магазина. Задача 3.6 эту выдачу из billing убирает.
 *
 * Значки — когда активная платёжка магазина принимает оплату (`activeProvider`
 * не null). billing до этапа 3.4 поля не знает — тогда как раньше: ЮKassa
 * включена и её номер магазина есть (публичная дверь отдаёт номер только при
 * включённом приёме). Порядок выкатки site-gen и billing поэтому не важен.
 */
type Row = Record<string, unknown>;

function fakeDb(rowsByTable: Map<unknown, Row[]>) {
  return {
    select() {
      return {
        from(table: unknown) {
          const rows = rowsByTable.get(table) ?? [];
          return {
            where: () => Promise.resolve(rows),
            then: (r: (v: Row[]) => unknown) => Promise.resolve(rows).then(r),
          };
        },
      };
    },
  } as never;
}

const site = { id: "site", name: "name", settings: "settings" };
const sitePolicy = { siteId: "siteId", type: "type", content: "content", updatedAt: "u" };
const siteContacts = { siteId: "siteId", fields: "fields", updatedAt: "u" };
const schema = { site, sitePolicy, siteContacts } as never;

async function badges(answer: () => Observable<unknown>) {
  const send = jest.fn(answer);
  const revision = {
    pagesData: { home: { content: [{ type: "Footer", props: { id: "f" } }] } },
  } as Record<string, unknown>;
  const rows = new Map<unknown, Row[]>([
    [site, [{ name: "Магазин", settings: null }]],
    [sitePolicy, []],
    [siteContacts, []],
  ]);
  await applyFooterData(
    {
      db: fakeDb(rows),
      schema,
      billingClient: { send } as never,
    },
    "site-1",
    revision,
    { warn: () => undefined } as never,
  );
  const footer = (revision.pagesData as Record<string, { content: Row[] }>).home
    .content[0] as { props: Record<string, unknown> };
  return { paymentEnabled: footer.props.paymentEnabled, send };
}

describe("значки оплаты в подвале — по публичным настройкам", () => {
  it("спрашивает get_public, а не ключи", async () => {
    const { send } = await badges(() =>
      of({ success: true, yookassaEnabled: true, yookassaShopId: "1178882", activeProvider: "yookassa" }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("billing.shop_payment_settings.get_public", {
      shopId: "site-1",
    });
  });

  it.each<[string, Row, boolean]>([
    ["активная платёжка принимает оплату", { activeProvider: "yookassa" }, true],
    // Точка или другая платёжка — тоже оплата онлайн, значки нужны.
    ["активна не ЮKassa", { activeProvider: "tochka", yookassaEnabled: false }, true],
    ["онлайн-оплата не подключена", { activeProvider: null, yookassaEnabled: true, yookassaShopId: "1178882" }, false],
    ["billing до 3.4: ЮKassa включена", { yookassaEnabled: true, yookassaShopId: "1178882" }, true],
    ["billing до 3.4: ЮKassa выключена", { yookassaEnabled: false, yookassaShopId: null }, false],
    ["billing до 3.4: включена без номера", { yookassaEnabled: true, yookassaShopId: null }, false],
  ])("%s → значки %s", async (_name, fields, expected) => {
    const { paymentEnabled } = await badges(() => of({ success: true, ...fields }));
    expect(paymentEnabled).toBe(expected);
  });

  it.each<[string, () => Observable<unknown>]>([
    ["billing ответил отказом", () => of({ success: false, message: "internal_error", activeProvider: null })],
    ["billing недоступен", () => throwError(() => new Error("Connection closed"))],
  ])("%s → значков нет, подвал собирается", async (_name, answer) => {
    const { paymentEnabled } = await badges(answer);
    expect(paymentEnabled).toBe(false);
  });
});
