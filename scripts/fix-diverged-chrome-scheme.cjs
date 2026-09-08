#!/usr/bin/env node
/**
 * Systemic cleanup for the "chrome inherits an accidental dark color scheme" bug.
 *
 * Root cause (fixed separately in the constructor): clicking a color-scheme
 * swatch in the Theme panel used to set it as the site-wide `defaultSchemeIndex`
 * — the `:root` base that header/footer/body inherit when they have no explicit
 * `.color-scheme-N` wrapper (see sites/src/themes/tokens-css.ts → `:root =
 * schemes[defaultSchemeIndex]`). Merely viewing/editing a dark swatch blacked out
 * the whole chrome. The constructor no longer writes defaultSchemeIndex on
 * swatch-click; this script repairs sites already corrupted by the old behavior.
 *
 * "Broken" = current revision's defaultSchemeIndex DIVERGED from the theme's
 * designed default AND the resulting chrome background is dark (luminance < 0.2),
 * status = published. Action: reset defaultSchemeIndex to the theme default and
 * republish. Idempotent — re-running after a successful pass finds nothing.
 *
 * Usage (dry-run lists affected sites, makes no changes):
 *   SITES_DATABASE_URL=postgres://... \
 *   node scripts/fix-diverged-chrome-scheme.cjs
 *
 * Usage (apply: reset + republish each affected site):
 *   SITES_DATABASE_URL=postgres://... SITES_SERVICE_URL=http://<sites-host> \
 *   node scripts/fix-diverged-chrome-scheme.cjs --apply
 */
const { Client } = require("pg");

// Designed base scheme index per theme (mirrors src/generator/templates/defaults/*.json).
// rose ships no explicit default → falls back to 0.
const THEME_DEFAULT = { rose: 0, bloom: 2, flux: 1, satin: 1, vanilla: 2 };
// near-black / unreadably-dark chrome. 0.15 keeps clearly-dark backgrounds
// (#000, #121212, #26311c) while leaving saturated brand colors like a red
// #EB1717 header (L≈0.18) for the merchant to decide — those aren't the bug.
const DARK_LUMINANCE_MAX = 0.15;

function luminance(hex) {
  if (typeof hex !== "string") return null;
  const m = hex
    .replace("#", "")
    .match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dbUrl = process.env.SITES_DATABASE_URL || process.env.DATABASE_URL;
  const svcUrl = (process.env.SITES_SERVICE_URL || "").replace(/\/$/, "");
  if (!dbUrl) {
    console.error("Set SITES_DATABASE_URL (or DATABASE_URL).");
    process.exit(1);
  }
  if (apply && !svcUrl) {
    console.error("Set SITES_SERVICE_URL to republish with --apply.");
    process.exit(1);
  }

  const c = new Client(dbUrl);
  await c.connect();
  const { rows } = await c.query(`
    SELECT s.id, s.theme_id, s.current_revision_id,
           sr.data->'themeSettings'->'colorSchemes' AS schemes,
           sr.data->'themeSettings'->>'defaultSchemeIndex' AS idx
    FROM site s
    JOIN site_revision sr ON sr.id = s.current_revision_id
    WHERE s.deleted_at IS NULL AND s.status = 'published'`);

  const broken = [];
  for (const r of rows) {
    const theme = r.theme_id;
    if (!(theme in THEME_DEFAULT)) continue; // unknown theme → leave alone
    const def = THEME_DEFAULT[theme];
    if (r.idx == null) continue; // absent → already at theme default
    const idx = parseInt(r.idx, 10);
    if (Number.isNaN(idx) || idx === def) continue; // not diverged
    const schemes = r.schemes;
    if (!Array.isArray(schemes) || !schemes.length) continue;
    const sc = schemes[idx] || schemes[0];
    const bg = sc && (sc.background || sc.surfaceBg);
    const L = luminance(bg);
    if (L == null || L >= DARK_LUMINANCE_MAX) continue; // not dark → intentional/harmless
    broken.push({
      id: r.id,
      theme,
      rev: r.current_revision_id,
      idx,
      def,
      bg,
      L: +L.toFixed(3),
    });
  }

  console.log(
    `Scanned ${rows.length} published sites. Broken (diverged + dark chrome): ${broken.length}`,
  );
  broken.sort((a, b) => a.theme.localeCompare(b.theme));
  for (const b of broken) {
    console.log(
      `  ${b.theme} | idx ${b.idx}→${b.def} | bg=${b.bg} L=${b.L} | ${b.id}`,
    );
  }

  if (!apply) {
    console.log("\nDRY-RUN — no changes. Re-run with --apply to reset + republish.");
    await c.end();
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const b of broken) {
    try {
      await c.query(
        `UPDATE site_revision
         SET data = jsonb_set(data, '{themeSettings,defaultSchemeIndex}', $1::jsonb, false)
         WHERE id = $2`,
        [String(b.def), b.rev],
      );
      const res = await fetch(`${svcUrl}/admin-publish/${b.id}`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      console.log(
        `  fixed ${b.theme} ${b.id}: idx→${b.def}, republish HTTP ${res.status} ${j.success ? "queued" : JSON.stringify(j)}`,
      );
      ok++;
    } catch (e) {
      console.error(`  FAIL ${b.id}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nApplied: ${ok} ok, ${fail} fail.`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
