# sites service scripts

One-off and support scripts. Running them usually requires `DATABASE_URL` pointing at prod (or staging).

## `backfill-theme-colorschemes.ts` — spec 079 Phase 0b

Replaces `site_revision.data.themeSettings.colorSchemes` with the merchant-shape equivalent of the site's theme manifest, but ONLY when the existing value deep-equals the legacy Rose-generic seed. Sites whose merchants edited the schemes are left alone.

**Dry-run (default):**
```bash
DATABASE_URL=$PROD_URL pnpm backfill:theme-schemes
```

**Execute:**
```bash
DATABASE_URL=$PROD_URL DRY_RUN=false pnpm backfill:theme-schemes
```

Writes originals to `site_revision_prebackfill` before updating. Idempotent — re-running finds nothing to migrate.

Expected prod counts (measured 2026-04-21):
- rewrite: 17 (15 rose + 2 vanilla)
- skip-customised: 43
- skip-no-theme: 64
- skip-no-schemes: 51

## `rollback-theme-colorschemes.ts` — spec 079 Phase 0b

Restores `site_revision.data` from the `site_revision_prebackfill` snapshot table.

**Dry-run (default) — lists what would happen:**
```bash
DATABASE_URL=$PROD_URL pnpm rollback:theme-schemes
```

**Targeted rollback (single revision):**
```bash
DATABASE_URL=$PROD_URL DRY_RUN=false REVISION_ID=<revision-uuid> pnpm rollback:theme-schemes
```

**Full rollback:**
```bash
DATABASE_URL=$PROD_URL DRY_RUN=false pnpm rollback:theme-schemes
```

Idempotent; running multiple times keeps restoring from the same snapshot.

## `adopt-lifecycle.ts` — этап 3.8

Переводит магазины ОДНОГО аккаунта (`TENANT_ID`) в сагу рождения. Правило готовности — то же, что у доводчика
(`planAdoption` → `observeLifecycle(factsOf(row))`): переводим только готовые (`adopt`), у них перевод — только учёт,
доводчик готовые не трогает. Неготовые остаются старым cron.

**Запуск:**

```bash
DATABASE_URL=… TENANT_ID=… pnpm site:adopt-lifecycle                                       # план, без записи
DATABASE_URL=… TENANT_ID=… SITE_ID=… DRY_RUN=false pnpm site:adopt-lifecycle               # перевести один магазин
DATABASE_URL=… TENANT_ID=… SITE_ID=… ROLLBACK=true DRY_RUN=false pnpm site:adopt-lifecycle # вернуть его старым cron
```

Столбцы плана:

- `siteId` — id магазина;
- `name` — название магазина;
- `action` — `adopt` (переводим) или `skip` (оставляем);
- `reason` — причина пропуска: `already_in_saga` (магазин уже в саге) или `not_ready`;
- `missing` — при `not_ready`: какой шаг саги не выполнен (`seed`, `provision` или `route`).

Запускать только по сигналу владельца, по одному магазину, сначала dev. `SITES_USE_CENTRAL_PROXY=true` задавать так
же, как в окружении sites целевого контура.

Откат: вернуть магазин старым cron можно той же командой с `ROLLBACK=true` — строка снова станет `lifecycle IS NULL`.
Откат принимается только для переведённого (`ready`) магазина.

## `compile-astro-blocks.mjs` / `compile-preview-tailwind.mjs`

Build-time asset compilation. Run from the Dockerfile — no manual invocation needed.

## `verify-astro-runtime.mjs`

Smoke test for Astro container in CI.
