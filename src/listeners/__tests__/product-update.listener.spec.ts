import { ProductUpdateListener } from "../product-update.listener";

// Слушатель пяти тем (блок 8 «Секций и SDK», часть 8а): события коллекций и наличия — только для витрин новой
// темы; магазины пяти тем по ним не пересобираются, сообщение подтверждается.
function listener() {
  const where = jest.fn().mockResolvedValue([]);
  const db: any = { select: jest.fn(() => ({ from: () => ({ where }) })) };
  const config: any = { get: () => undefined };
  const instance = new ProductUpdateListener(config, db, {} as any, {} as any);
  return { instance, db };
}

const message = (body: Record<string, unknown>): any => ({
  content: Buffer.from(JSON.stringify(body)),
});

describe("ProductUpdateListener: события только для новых тем", () => {
  it.each(["collection.updated", "product.availability_changed"])(
    "%s — без пересборки пяти тем, сообщение подтверждено",
    async (event) => {
      const { instance, db } = listener();
      const channel: any = { ack: jest.fn() };
      const msg = message({ event, tenantId: "t1", productIds: [] });
      await instance["handleMessage"](msg, channel);
      expect(db.select).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledWith(msg);
    },
  );

  it("product.updated — как раньше: слушатель ищет сайты магазина", async () => {
    const { instance, db } = listener();
    const channel: any = { ack: jest.fn() };
    await instance["handleMessage"](
      message({ event: "product.updated", tenantId: "t1", productIds: ["p1"] }),
      channel,
    );
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
