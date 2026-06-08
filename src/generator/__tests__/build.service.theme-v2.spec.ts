import {
  MIGRATED_THEMES,
  bareThemeName,
  themeLiveDistFor,
} from "../build.service";
import * as path from "path";

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
