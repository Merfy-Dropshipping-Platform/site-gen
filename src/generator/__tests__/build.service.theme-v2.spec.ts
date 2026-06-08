import {
  MIGRATED_THEMES,
  bareThemeName,
  themeLiveDistFor,
  copyThemeV2Dist,
} from "../build.service";
import * as path from "path";
import * as fsp from "fs/promises";
import * as os from "os";

describe("bareThemeName", () => {
  it("strips a trailing version suffix", () => {
    expect(bareThemeName("rose-1.0")).toBe("rose");
    expect(bareThemeName("rose-1.0.2")).toBe("rose");
  });
  it("returns a bare name unchanged", () => {
    expect(bareThemeName("rose")).toBe("rose");
    expect(bareThemeName("vanilla")).toBe("vanilla");
  });
});

describe("MIGRATED_THEMES", () => {
  it("includes rose (pilot) and excludes luna", () => {
    expect(MIGRATED_THEMES.has("rose")).toBe(true);
    expect(MIGRATED_THEMES.has("luna")).toBe(false);
  });
});

describe("themeLiveDistFor", () => {
  it("anchors at dist/theme-live/<theme> under cwd", () => {
    expect(themeLiveDistFor("rose")).toBe(
      path.join(process.cwd(), "dist", "theme-live", "rose"),
    );
  });
});

describe("copyThemeV2Dist", () => {
  it("copies the theme-live dist into ctx.distDir", async () => {
    const sandbox = await fsp.realpath(
      await fsp.mkdtemp(path.join(os.tmpdir(), "themev2-")),
    );
    const prevCwd = process.cwd();
    process.chdir(sandbox);
    try {
      const live = path.join(sandbox, "dist", "theme-live", "rose");
      await fsp.mkdir(path.join(live, "_astro"), { recursive: true });
      await fsp.writeFile(path.join(live, "index.html"), "<h1>ROSE</h1>");
      await fsp.writeFile(path.join(live, "_astro", "a.css"), ".x{}");

      const distDir = path.join(sandbox, "work", "dist");
      const ctx = { distDir, siteId: "s1" } as never;

      await copyThemeV2Dist(ctx, "rose");

      expect(await fsp.readFile(path.join(distDir, "index.html"), "utf8")).toBe(
        "<h1>ROSE</h1>",
      );
      expect(
        await fsp.readFile(path.join(distDir, "_astro", "a.css"), "utf8"),
      ).toBe(".x{}");
    } finally {
      process.chdir(prevCwd);
      await fsp.rm(sandbox, { recursive: true, force: true });
    }
  });
});
