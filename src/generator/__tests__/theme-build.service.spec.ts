/**
 * Tests for theme-build.service.ts (Constructor v2, Task A1).
 *
 * Validates the build-engine logic that is verifiable WITHOUT a full astro
 * build (which is too slow for a unit test — that path is covered by the real
 * `build('rose')` run documented in the task):
 *   - theme-dir / preview-dir path resolution (anchored at repo root = cwd)
 *   - the copy step: a theme dist/ lands verbatim in dist/theme-preview/<name>
 *   - a clear error when the theme directory is missing
 *   - copy recreates the destination (no stale files on rebuild)
 *
 * Strategy: the service anchors paths at process.cwd(). We point cwd at a temp
 * sandbox, drop a fixture theme under themes/<name> with a pre-made dist/ and a
 * stub node_modules (so install is skipped), then call build() and assert the
 * copy. This exercises the real build() control-flow except the astro spawn.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  ThemeBuildService,
  themeDirFor,
  themePreviewDirFor,
  themeLiveDirFor,
  copyDir,
} from "../theme-build.service";

let sandbox: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  // realpath: on macOS /tmp is a symlink to /private/tmp, but process.cwd()
  // returns the resolved path — normalise so path assertions are stable.
  sandbox = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "theme-build-test-")),
  );
  process.chdir(sandbox);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(sandbox, { recursive: true, force: true });
});

/**
 * Create a fixture theme under themes/<name> with a pre-built dist/ and a stub
 * node_modules so build() skips install and reaches the copy step.
 */
async function createFixtureTheme(
  name: string,
  distFiles: Record<string, string>,
): Promise<string> {
  const dir = path.join(sandbox, "themes", name);
  // stub node_modules → installIfNeeded() short-circuits (no pnpm spawn)
  await fs.mkdir(path.join(dir, "node_modules"), { recursive: true });
  for (const [rel, content] of Object.entries(distFiles)) {
    const full = path.join(dir, "dist", rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  return dir;
}

describe("path resolution", () => {
  it("themeDirFor anchors at themes/<name> under cwd", () => {
    expect(themeDirFor("rose")).toBe(path.join(sandbox, "themes", "rose"));
  });

  it("themePreviewDirFor anchors at dist/theme-preview/<name> under cwd", () => {
    expect(themePreviewDirFor("rose")).toBe(
      path.join(sandbox, "dist", "theme-preview", "rose"),
    );
  });

  it("themeLiveDirFor anchors at dist/theme-live/<name> under cwd", () => {
    expect(themeLiveDirFor("rose")).toBe(
      path.join(sandbox, "dist", "theme-live", "rose"),
    );
  });
});

describe("copyDir", () => {
  it("copies a directory tree verbatim", async () => {
    const src = path.join(sandbox, "src");
    const dest = path.join(sandbox, "dest");
    await fs.mkdir(path.join(src, "nested"), { recursive: true });
    await fs.writeFile(path.join(src, "index.html"), "<h1>hi</h1>");
    await fs.writeFile(path.join(src, "nested", "a.css"), "body{}");

    await copyDir(src, dest);

    expect(await fs.readFile(path.join(dest, "index.html"), "utf8")).toBe(
      "<h1>hi</h1>",
    );
    expect(await fs.readFile(path.join(dest, "nested", "a.css"), "utf8")).toBe(
      "body{}",
    );
  });

  it("recreates the destination so stale files are removed on rebuild", async () => {
    const src = path.join(sandbox, "src");
    const dest = path.join(sandbox, "dest");
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, "new.html"), "new");
    // pre-existing stale file in dest from a "previous build"
    await fs.mkdir(dest, { recursive: true });
    await fs.writeFile(path.join(dest, "stale.html"), "stale");

    await copyDir(src, dest);

    await expect(fs.access(path.join(dest, "stale.html"))).rejects.toThrow();
    expect(await fs.readFile(path.join(dest, "new.html"), "utf8")).toBe("new");
  });
});

describe("ThemeBuildService.build", () => {
  const service = new ThemeBuildService();

  it("throws a clear error when the theme directory is missing", async () => {
    await expect(service.build("does-not-exist")).rejects.toThrow(
      /Theme "does-not-exist" not found/,
    );
  });

  it("rejects unsafe theme names", async () => {
    await expect(service.build("../escape")).rejects.toThrow(
      /Invalid theme name/,
    );
    await expect(service.build("a/b")).rejects.toThrow(/Invalid theme name/);
  });

  it("copies the theme's dist/ into dist/theme-preview/<name> (build step mocked)", async () => {
    await createFixtureTheme("fixture", {
      "index.html": "<main class='hero-animate'>fixture body</main>",
      "assets/site.css": ".x{}",
    });

    // Stub the actual astro build (too slow / needs a real toolchain for a unit
    // test). build() still runs path resolution, install short-circuit, the
    // dist/ existence check, and the copy — i.e. everything except the spawn.
    const buildSpy = jest
      .spyOn(
        service as unknown as { runAstroBuild: () => Promise<void> },
        "runAstroBuild",
      )
      .mockResolvedValue();

    const result = await service.build("fixture");

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(result.themeName).toBe("fixture");
    expect(result.previewDir).toBe(themePreviewDirFor("fixture"));

    const out = await fs.readFile(
      path.join(result.previewDir, "index.html"),
      "utf8",
    );
    expect(out).toContain("hero-animate");
    expect(out).toContain("fixture body");
    expect(
      await fs.readFile(
        path.join(result.previewDir, "assets", "site.css"),
        "utf8",
      ),
    ).toBe(".x{}");

    buildSpy.mockRestore();
  });

  it("rewrites root-absolute asset/link URLs under /__theme/<name>/", async () => {
    await createFixtureTheme("rw", {
      "index.html":
        '<link href="/_astro/a.css"><img src="/images/x.png"><a href="/catalog">c</a><a href="https://ex.com/y">e</a><img srcset="/_astro/s1.webp 640w, /_astro/s2.webp 1280w">',
      "_astro/a.css": "@font-face{src:url(/fonts/f.woff)}.b{background:url(//cdn/z.png)}",
    });
    jest
      .spyOn(
        service as unknown as { runAstroBuild: () => Promise<void> },
        "runAstroBuild",
      )
      .mockResolvedValue();

    const result = await service.build("rw");

    const html = await fs.readFile(
      path.join(result.previewDir, "index.html"),
      "utf8",
    );
    expect(html).toContain('href="/__theme/rw/_astro/a.css"');
    expect(html).toContain('src="/__theme/rw/images/x.png"');
    expect(html).toContain('href="/__theme/rw/catalog"');
    // srcset (comma/space-led) entries both rewritten
    expect(html).toContain("/__theme/rw/_astro/s1.webp 640w");
    expect(html).toContain("/__theme/rw/_astro/s2.webp 1280w");
    // absolute external URL left untouched
    expect(html).toContain('href="https://ex.com/y"');

    const css = await fs.readFile(
      path.join(result.previewDir, "_astro", "a.css"),
      "utf8",
    );
    // CSS @font-face url() rewritten; protocol-relative // left untouched
    expect(css).toContain("url(/__theme/rw/fonts/f.woff)");
    expect(css).toContain("url(//cdn/z.png)");
  });

  it("throws if the build produced no dist/ directory", async () => {
    // fixture theme with node_modules but NO dist/
    const dir = path.join(sandbox, "themes", "nodist");
    await fs.mkdir(path.join(dir, "node_modules"), { recursive: true });

    jest
      .spyOn(
        service as unknown as { runAstroBuild: () => Promise<void> },
        "runAstroBuild",
      )
      .mockResolvedValue();

    await expect(service.build("nodist")).rejects.toThrow(
      /did not produce a dist\/ directory/,
    );
  });
});

describe("ThemeBuildService.build — live root-url copy", () => {
  const service = new ThemeBuildService();

  it("emits dist/theme-live/<name> verbatim with ROOT urls (no /__theme/ prefix)", async () => {
    await createFixtureTheme("livecopy", {
      "index.html": '<link href="/_astro/a.css"><img src="/images/x.png">',
      "_astro/a.css": "@font-face{src:url(/fonts/f.woff)}",
    });
    jest
      .spyOn(
        service as unknown as { runAstroBuild: () => Promise<void> },
        "runAstroBuild",
      )
      .mockResolvedValue();

    const result = await service.build("livecopy");

    const liveDir = themeLiveDirFor("livecopy");
    const liveHtml = await fs.readFile(path.join(liveDir, "index.html"), "utf8");
    expect(liveHtml).toContain('href="/_astro/a.css"');
    expect(liveHtml).toContain('src="/images/x.png"');
    expect(liveHtml).not.toContain("/__theme/");
    const liveCss = await fs.readFile(path.join(liveDir, "_astro", "a.css"), "utf8");
    expect(liveCss).toContain("url(/fonts/f.woff)");
    expect(liveCss).not.toContain("/__theme/");

    const prevHtml = await fs.readFile(
      path.join(result.previewDir, "index.html"),
      "utf8",
    );
    expect(prevHtml).toContain('href="/__theme/livecopy/_astro/a.css"');

    expect(result.liveDir).toBe(liveDir);
  });
});
