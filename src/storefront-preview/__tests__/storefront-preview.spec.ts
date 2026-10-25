/**
 * Развилка превью новой темы (design.md блока 8): настоящее приложение Nest с
 * модулем StorefrontPreviewModule, подставным сборщиком (HTTP на случайном
 * порту) и заглушками нынешних контроллеров по тем же адресам. Магазин и тема
 * новой архитектуры идут к сборщику, нынешние — дальше, как раньше.
 */
import {
  Controller,
  Get,
  Global,
  HttpCode,
  INestApplication,
  Module,
  Param,
  Post,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { createServer, type IncomingMessage, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { StorefrontHandoff } from "../../storefront-handoff/storefront-handoff.service";
import { BUILDER_URL_VARIABLE } from "../storefront-builder.client";
import { StorefrontPreviewModule } from "../storefront-preview.module";

const NEW_SITE = "00000000-0000-4000-8000-0000000000aa";
const OLD_SITE = "00000000-0000-4000-8000-0000000000bb";

@Controller("api/sites/:id/preview")
class OldPreviewController {
  @Get()
  page(@Param("id") id: string): string {
    return `старое превью ${id}`;
  }

  @Post("block")
  @HttpCode(200)
  block(@Param("id") id: string): string {
    return `старый блок ${id}`;
  }
}

@Controller("api/themes/:themeId/puck-config")
class OldPuckConfigController {
  @Get()
  config(@Param("themeId") themeId: string): object {
    return { components: { Hero: {} }, themeId };
  }
}

const handoff = { isNewTheme: async (siteId: string) => siteId === NEW_SITE };

@Global()
@Module({
  providers: [{ provide: StorefrontHandoff, useValue: handoff }],
  exports: [StorefrontHandoff],
})
class FakeHandoffModule {}

interface Seen {
  method: string;
  url: string;
  body: string;
}

async function startBuilder(seen: Seen[]): Promise<Server> {
  const server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", body });
      const json =
        req.url?.startsWith("/preview/tokens") ||
        req.url?.startsWith("/preview/section") ||
        req.url?.startsWith("/sections") ||
        req.url?.startsWith("/theme-panel");
      res.writeHead(200, {
        "content-type": json
          ? "application/json; charset=utf-8"
          : "text/html; charset=utf-8",
      });
      res.end(json ? '{"ok":true}' : "<h1>стенд</h1>");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function startApp(builderUrl: string): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        load: [() => ({ [BUILDER_URL_VARIABLE]: builderUrl })],
      }),
      FakeHandoffModule,
      StorefrontPreviewModule,
    ],
    controllers: [OldPreviewController, OldPuckConfigController],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe("превью новой темы — от сборщика, нынешние темы — как раньше", () => {
  const seen: Seen[] = [];
  let builder: Server;
  let app: INestApplication;

  beforeAll(async () => {
    builder = await startBuilder(seen);
    app = await startApp(
      `http://127.0.0.1:${(builder.address() as AddressInfo).port}/`,
    );
  });
  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => builder.close(resolve));
  });
  beforeEach(() => (seen.length = 0));

  it("стенд магазина новой темы — HTML сборщика, no-store; нынешний магазин — старое превью", async () => {
    const fresh = await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/preview?page=/&_t=1`,
    );
    expect(fresh.status).toBe(200);
    expect(fresh.text).toBe("<h1>стенд</h1>");
    expect(fresh.headers["cache-control"]).toBe("no-store");
    expect(seen).toEqual([
      { method: "GET", url: `/preview?shop=${NEW_SITE}&page=%2F`, body: "" },
    ]);
    const old = await request(app.getHttpServer()).get(
      `/api/sites/${OLD_SITE}/preview`,
    );
    expect(old.text).toBe(`старое превью ${OLD_SITE}`);
    expect(seen).toHaveLength(1);
  });

  it("puck-config новой темы — схема панели от сборщика; нынешняя тема — старый ответ", async () => {
    const fresh = await request(app.getHttpServer()).get(
      "/api/themes/nova/puck-config",
    );
    expect(fresh.body).toEqual({ ok: true });
    expect(seen.map((call) => call.url)).toEqual(["/theme-panel?theme=nova"]);
    const old = await request(app.getHttpServer()).get(
      "/api/themes/bloom/puck-config",
    );
    expect(old.body).toEqual({ components: { Hero: {} }, themeId: "bloom" });
  });

  it("правки токенов — POST к сборщику с телом; магазин нынешней темы — 404", async () => {
    const tokens = {
      tokens: { schemes: { "scheme-1": { primary: "#16a34a" } } },
    };
    const fresh = await request(app.getHttpServer())
      .post(`/api/sites/${NEW_SITE}/preview/tokens`)
      .send(tokens);
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({ ok: true });
    expect(seen).toEqual([
      {
        method: "POST",
        url: `/preview/tokens?shop=${NEW_SITE}`,
        body: JSON.stringify(tokens),
      },
    ]);
    const old = await request(app.getHttpServer())
      .post(`/api/sites/${OLD_SITE}/preview/tokens`)
      .send(tokens);
    expect(old.status).toBe(404);
  });

  it("превью без page и стенд — page уходит к сборщику как есть", async () => {
    await request(app.getHttpServer()).get(`/api/sites/${NEW_SITE}/preview`);
    await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/preview?page=stand`,
    );
    expect(seen.map((call) => call.url)).toEqual([
      `/preview?shop=${NEW_SITE}&page=`,
      `/preview?shop=${NEW_SITE}&page=stand`,
    ]);
  });

  it("превью шаблона записи — record уходит к сборщику; пустой record — без ключа", async () => {
    await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/preview?page=product&record=p-1`,
    );
    await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/preview?page=product&record=%2Fproduct%2Fsharf`,
    );
    await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/preview?page=product&record=`,
    );
    expect(seen.map((call) => call.url)).toEqual([
      `/preview?shop=${NEW_SITE}&page=product&record=p-1`,
      `/preview?shop=${NEW_SITE}&page=product&record=%2Fproduct%2Fsharf`,
      `/preview?shop=${NEW_SITE}&page=product`,
    ]);
  });

  it("один блок превью новой темы — POST к сборщику с телом; нынешний магазин — старый блок", async () => {
    const block = {
      instance: {
        id: "hero-1",
        section: "shop:hero",
        settings: { heading: "Шарфы к первым холодам" },
      },
    };
    const fresh = await request(app.getHttpServer())
      .post(`/api/sites/${NEW_SITE}/preview/block`)
      .send(block);
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({ ok: true });
    expect(fresh.headers["cache-control"]).toBe("no-store");
    expect(seen).toEqual([
      {
        method: "POST",
        url: `/preview/section?shop=${NEW_SITE}`,
        body: JSON.stringify(block),
      },
    ]);
    const old = await request(app.getHttpServer())
      .post(`/api/sites/${OLD_SITE}/preview/block`)
      .send({ blockType: "Hero", props: {}, themeId: "rose" });
    expect(old.text).toBe(`старый блок ${OLD_SITE}`);
    expect(seen).toHaveLength(1);
  });

  it("список секций новой темы — ответ сборщика как есть; нынешний магазин — 404", async () => {
    const fresh = await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/sections`,
    );
    expect(fresh.status).toBe(200);
    expect(fresh.body).toEqual({ ok: true });
    expect(seen).toEqual([
      { method: "GET", url: `/sections?shop=${NEW_SITE}`, body: "" },
    ]);
    const old = await request(app.getHttpServer()).get(
      `/api/sites/${OLD_SITE}/sections`,
    );
    expect(old.status).toBe(404);
    expect(old.body).toEqual({
      problems: ["магазин не на теме новой архитектуры"],
    });
    expect(seen).toHaveLength(1);
  });

  it("STOREFRONT_BUILDER_URL не задан — 503 с именем переменной; сборщик лежит — 502", async () => {
    const noBuilder = await startApp("");
    const missing = await request(noBuilder.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/preview`,
    );
    expect(missing.status).toBe(503);
    expect(missing.text).toContain("STOREFRONT_BUILDER_URL");
    await noBuilder.close();
    const down = await startApp("http://127.0.0.1:1");
    expect(
      (
        await request(down.getHttpServer()).get(
          `/api/sites/${NEW_SITE}/preview`,
        )
      ).status,
    ).toBe(502);
    await down.close();
  });
});
