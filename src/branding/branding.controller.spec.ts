import { HttpException } from "@nestjs/common";
import { BrandingController, isAllowedFaviconFile } from "./branding.controller";

/**
 * Юнит-тесты BrandingController.favicon (upload + delete). Инстанцируем контроллер
 * напрямую с мок-S3 и мок-SitesDomainService (без Nest/Postgres/MinIO). Ключевое
 * покрытие Phase-2 — DELETE теперь чистит S3 (removePrefix) best-effort.
 */
function makeS3(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getBucketName: jest.fn(() => "merfy-sites"),
    ensureBucket: jest.fn().mockResolvedValue(undefined),
    uploadBuffer: jest.fn(async (bucket: string, key: string) => `https://s3.example/${bucket}/${key}`),
    removePrefix: jest.fn().mockResolvedValue({ removed: 2 }),
    removeObject: jest.fn().mockResolvedValue({ removed: 1 }),
    ...overrides,
  } as any;
}

function makeSites(branding: unknown) {
  return {
    getById: jest.fn().mockResolvedValue({ id: "s1", tenantId: "t1", branding }),
    update: jest.fn().mockResolvedValue(true),
  } as any;
}

const pngFile = (name = "icon.png", mimetype = "image/png", buf = "data") =>
  ({ originalname: name, mimetype, buffer: Buffer.from(buf) }) as any;

async function caught<T>(p: Promise<T>): Promise<any> {
  return p.then(() => undefined).catch((e) => e);
}

describe("BrandingController.deleteFavicon — S3 cleanup (Phase 2)", () => {
  it("удаляет объект(ы) типа из S3 (removePrefix), затем чистит jsonb-ключ и зовёт update", async () => {
    const s3 = makeS3();
    const sites = makeSites({
      favicons: { universal: "https://s3/merfy-sites/branding/t1/s1/favicon-universal-1.png", dark: "https://x/d.png" },
      logoUrl: "https://x/logo.png",
    });
    const ctrl = new BrandingController(s3, sites);

    const res = await ctrl.deleteFavicon("s1", "universal");

    expect(res).toEqual({ success: true });
    expect(s3.removePrefix).toHaveBeenCalledTimes(1);
    expect(s3.removePrefix).toHaveBeenCalledWith("merfy-sites", "branding/t1/s1/favicon-universal-");
    const patch = sites.update.mock.calls[0][0].patch;
    expect(patch.branding.favicons.universal).toBeUndefined(); // удалён
    expect(patch.branding.favicons.dark).toBe("https://x/d.png"); // соседний цел
    expect(patch.branding.logoUrl).toBe("https://x/logo.png"); // лого цел
  });

  it("падение S3-очистки не мешает снять <link>: jsonb всё равно чистится, update зовётся, success", async () => {
    const s3 = makeS3({ removePrefix: jest.fn().mockRejectedValue(new Error("s3 down")) });
    const sites = makeSites({ favicons: { dark: "https://x/d.png" } });
    const ctrl = new BrandingController(s3, sites);

    const res = await ctrl.deleteFavicon("s1", "dark");

    expect(res).toEqual({ success: true });
    expect(sites.update).toHaveBeenCalledTimes(1);
    expect(sites.update.mock.calls[0][0].patch.branding.favicons.dark).toBeUndefined();
  });

  it("если варианта нет — removePrefix не зовётся, но update всё равно идёт (идемпотентно)", async () => {
    const s3 = makeS3();
    const sites = makeSites({ favicons: {} });
    const ctrl = new BrandingController(s3, sites);

    const res = await ctrl.deleteFavicon("s1", "apple");

    expect(res).toEqual({ success: true });
    expect(s3.removePrefix).not.toHaveBeenCalled();
    expect(sites.update).toHaveBeenCalledTimes(1);
  });

  it("невалидный type → 400 ещё до чтения сайта", async () => {
    const s3 = makeS3();
    const sites = makeSites({ favicons: {} });
    const ctrl = new BrandingController(s3, sites);

    const err = await caught(ctrl.deleteFavicon("s1", "bogus"));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(400);
    expect(sites.getById).not.toHaveBeenCalled();
    expect(s3.removePrefix).not.toHaveBeenCalled();
  });

  it("сайт не найден → 404", async () => {
    const s3 = makeS3();
    const sites = { getById: jest.fn().mockResolvedValue(null), update: jest.fn() } as any;
    const ctrl = new BrandingController(s3, sites);

    const err = await caught(ctrl.deleteFavicon("s1", "dark"));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(404);
  });
});

describe("BrandingController.uploadFavicon", () => {
  it("грузит в merfy-sites под ключ favicon-{type}- и персистит favicons[type], сохраняя соседей", async () => {
    const s3 = makeS3();
    const sites = makeSites({ logoUrl: "https://x/logo.png", favicons: { light: "https://x/l.png" } });
    const ctrl = new BrandingController(s3, sites);

    const res = await ctrl.uploadFavicon("s1", "dark", pngFile());

    expect(s3.uploadBuffer).toHaveBeenCalledTimes(1);
    const key = s3.uploadBuffer.mock.calls[0][1] as string;
    expect(key).toMatch(/^branding\/t1\/s1\/favicon-dark-\d+\.png$/);
    const patch = sites.update.mock.calls[0][0].patch;
    expect(patch.branding.favicons.dark).toBe(res.faviconUrl);
    expect(patch.branding.favicons.light).toBe("https://x/l.png"); // сосед цел
    expect(patch.branding.logoUrl).toBe("https://x/logo.png"); // лого цел
    expect(res).toMatchObject({ success: true, type: "dark" });
  });

  it("невалидный type → 400", async () => {
    const ctrl = new BrandingController(makeS3(), makeSites({}));
    const err = await caught(ctrl.uploadFavicon("s1", "bogus", pngFile()));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(400);
  });

  it("нет файла → 400", async () => {
    const ctrl = new BrandingController(makeS3(), makeSites({}));
    const err = await caught(ctrl.uploadFavicon("s1", "universal", undefined as any));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(400);
  });

  it("SVG санитайзится перед загрузкой (<script> вырезается)", async () => {
    const s3 = makeS3();
    const sites = makeSites({});
    const ctrl = new BrandingController(s3, sites);

    await ctrl.uploadFavicon(
      "s1",
      "universal",
      pngFile("icon.svg", "image/svg+xml", '<svg><script>alert(1)</script><rect/></svg>'),
    );

    const uploaded = (s3.uploadBuffer.mock.calls[0][2] as Buffer).toString("utf-8");
    expect(uploaded).not.toContain("<script");
    expect(uploaded).toContain("<rect");
  });
});

describe("isAllowedFaviconFile", () => {
  it("принимает разрешённые MIME (png/webp/svg/x-icon/vnd.microsoft.icon)", () => {
    for (const m of ["image/png", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]) {
      expect(isAllowedFaviconFile(m, "f.bin")).toBe(true);
    }
  });

  it("принимает .ico как application/octet-stream или пустой type (по расширению)", () => {
    expect(isAllowedFaviconFile("application/octet-stream", "favicon.ico")).toBe(true);
    expect(isAllowedFaviconFile("", "favicon.ICO")).toBe(true);
    expect(isAllowedFaviconFile(undefined as any, "favicon.ico")).toBe(true);
  });

  it("НЕ принимает произвольный octet-stream без .ico и запрещённые форматы", () => {
    expect(isAllowedFaviconFile("application/octet-stream", "malware.bin")).toBe(false);
    expect(isAllowedFaviconFile("application/octet-stream", "photo.png")).toBe(false); // не .ico
    expect(isAllowedFaviconFile("image/gif", "a.gif")).toBe(false);
    expect(isAllowedFaviconFile("application/pdf", "a.pdf")).toBe(false);
  });
});
