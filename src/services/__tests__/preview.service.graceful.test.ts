import { PreviewService } from "../preview.service";

describe("PreviewService graceful stub (spec 092 Q3 C)", () => {
  function makeService(componentResolver: jest.Mock) {
    // Order: (containerFactory, componentResolver). We pass undefined containerFactory
    // because rejected componentResolver throws BEFORE getContainer is called.
    return new PreviewService(undefined, componentResolver as any);
  }

  it("returns visible stub HTML для missing block в preview mode", async () => {
    const componentResolver = jest.fn().mockRejectedValue(new Error("Cannot find module 'theme-base__Missing__Missing.mjs'"));
    const svc = makeService(componentResolver);
    const html = await svc.renderBlock({
      blockName: "MissingBlock",
      props: {},
      isPreview: true,
    });
    expect(html).toContain('data-missing-block="MissingBlock"');
    expect(html).toMatch(/не настроен/);
  });

  it("returns empty string для missing block в live mode", async () => {
    const componentResolver = jest.fn().mockRejectedValue(new Error("Cannot find module"));
    const svc = makeService(componentResolver);
    const html = await svc.renderBlock({
      blockName: "MissingBlock",
      props: {},
      isPreview: false,
    });
    expect(html).toBe("");
  });

  it("returns render-error stub для broken render в preview", async () => {
    const componentResolver = jest.fn().mockRejectedValue(new Error("Some random render error"));
    const svc = makeService(componentResolver);
    const html = await svc.renderBlock({
      blockName: "Hero",
      props: {},
      isPreview: true,
    });
    expect(html).toContain('data-render-error="Hero"');
    expect(html).toMatch(/Ошибка рендера/);
  });

  it("escapes HTML in block name (XSS защита)", async () => {
    const componentResolver = jest.fn().mockRejectedValue(new Error("Cannot find module"));
    const svc = makeService(componentResolver);
    const html = await svc.renderBlock({
      blockName: "<script>alert(1)</script>",
      props: {},
      isPreview: true,
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
