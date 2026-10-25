/**
 * Инструменты секций и документация SDK в sites (блок 14 «Секций и SDK», часть 14б): настоящее приложение Nest с
 * StorefrontPreviewModule и подставным сборщиком. Магазин новой темы — к сборщику, тело — как есть; нынешние темы —
 * 404 shop-not-found; тело 400 КБ проходит (предел sites — 512 КБ).
 */
import { Global, INestApplication, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { createServer, type IncomingMessage, type Server } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { StorefrontHandoff } from "../../storefront-handoff/storefront-handoff.service";
import { useSitesBodyParser } from "../body-limit";
import { BUILDER_URL_VARIABLE } from "../storefront-builder.client";
import { StorefrontPreviewModule } from "../storefront-preview.module";

const NEW_SITE = "00000000-0000-4000-8000-0000000000aa";
const OLD_SITE = "00000000-0000-4000-8000-0000000000bb";
const FILES = { "section.json": '{"sdk":1}', "template.astro": "<div></div>" };

@Global()
@Module({
  providers: [
    {
      provide: StorefrontHandoff,
      useValue: { isNewTheme: async (id: string) => id === NEW_SITE },
    },
  ],
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
      const docs = req.url?.startsWith("/sdk-docs") ?? false;
      res.writeHead(req.url?.startsWith("/sections/save") ? 422 : 200, {
        "content-type": docs
          ? "text/plain; charset=utf-8"
          : "application/json; charset=utf-8",
      });
      res.end(
        docs
          ? "# Merfy · SDK секций витрины\n"
          : '{"ok":false,"name":"shop:reviews","problems":[],"warnings":[]}',
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

describe("sites: инструменты секций и документация SDK", () => {
  const seen: Seen[] = [];
  let builder: Server;
  let app: INestApplication;

  beforeAll(async () => {
    builder = await startBuilder(seen);
    const url = `http://127.0.0.1:${(builder.address() as AddressInfo).port}`;
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ [BUILDER_URL_VARIABLE]: url })],
        }),
        FakeHandoffModule,
        StorefrontPreviewModule,
      ],
    }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    useSitesBodyParser(nest);
    app = await nest.init();
  });
  afterAll(async () => {
    await app.close();
    await new Promise((resolve) => builder.close(resolve));
  });
  beforeEach(() => (seen.length = 0));

  it("проверить и сохранить — тело в сборщик как есть, статус и ответ сборщика как есть", async () => {
    const check = await request(app.getHttpServer())
      .post(`/api/sites/${NEW_SITE}/sections/check`)
      .send({ files: FILES });
    expect([
      check.status,
      check.body.name,
      check.headers["cache-control"],
    ]).toEqual([200, "shop:reviews", "no-store"]);
    const save = await request(app.getHttpServer())
      .post(`/api/sites/${NEW_SITE}/sections`)
      .send({ files: FILES });
    expect(save.status).toBe(422);
    expect(seen).toEqual([
      {
        method: "POST",
        url: `/sections/check?shop=${NEW_SITE}`,
        body: JSON.stringify({ files: FILES }),
      },
      {
        method: "POST",
        url: `/sections/save?shop=${NEW_SITE}`,
        body: JSON.stringify({ files: FILES }),
      },
    ]);
  });

  it("файлы, правки, откат — имя секции в ?name=", async () => {
    await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/sections/reviews/source`,
    );
    await request(app.getHttpServer()).get(
      `/api/sites/${NEW_SITE}/sections/reviews/history`,
    );
    await request(app.getHttpServer())
      .post(`/api/sites/${NEW_SITE}/sections/reviews/rollback`)
      .send({ id: "e0" });
    expect(seen.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `GET /sections/source?shop=${NEW_SITE}&name=reviews`,
      `GET /sections/history?shop=${NEW_SITE}&name=reviews`,
      `POST /sections/rollback?shop=${NEW_SITE}&name=reviews`,
    ]);
    expect(seen[2]?.body).toBe('{"id":"e0"}');
  });

  it("магазин нынешней темы — 404 shop-not-found, сборщик не зовём", async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/sites/${OLD_SITE}/sections/check`)
      .send({ files: FILES });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      ok: false,
      error: {
        code: "shop-not-found",
        message: "магазин не на теме новой архитектуры",
      },
    });
    expect(seen).toEqual([]);
  });

  it("тело 400 КБ проходит — предел sites 512 КБ", async () => {
    const big = { files: { ...FILES, "lib/data.ts": "x".repeat(400 * 1024) } };
    const response = await request(app.getHttpServer())
      .post(`/api/sites/${NEW_SITE}/sections/check`)
      .send(big);
    expect(response.status).toBe(200);
    expect(seen[0]?.body.length).toBeGreaterThan(400 * 1024);
  });

  it("документация — файл в ?file=, ответ сборщика как есть", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/storefront/sdk?file=template/AGENTS.md",
    );
    expect([response.status, response.text]).toEqual([
      200,
      "# Merfy · SDK секций витрины\n",
    ]);
    expect(seen.map(({ url }) => url)).toEqual([
      "/sdk-docs?file=template%2FAGENTS.md",
    ]);
  });
});
