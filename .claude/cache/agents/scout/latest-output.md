# Codebase Report: Rose vs Satin live ports — addable constructor sections
Generated: 2026-08-31T21:41:17Z
Worktree: `/Users/alexey/projects/merfy/backend/services/sites/.worktrees/flux-constructor-live-markup`
Do not edit — research only.

## Summary

Constructor **sidebar fields are shared** (`packages/theme-base/blocks/*/X.puckConfig.ts`). Rose Catalog and Satin Catalog **re-export** that same puckConfig. Slideshow / Gallery / Video / Newsletter / ContactForm / Product have **no theme puckConfig override**.

Live apply is **not** shared:

| Block | Rose live renderer | Satin live renderer |
|-------|--------------------|---------------------|
| Slideshow | v2 port `themes/rose/.../Slideshow.astro` | v2 port `themes/satin/.../Slideshow.astro` |
| Gallery | v2 port `themes/rose/.../Gallery.astro` | v2 port `themes/satin/.../Gallery.astro` |
| Newsletter | v2 port `themes/rose/.../Newsletter.astro` | v2 port `themes/satin/.../Newsletter.astro` |
| ContactForm | v2 port `themes/rose/.../Contacts.astro` | v2 port `themes/satin/.../ContactForm.astro` |
| Video | **no v2 port** → cascade `theme-base/blocks/Video/Video.astro` | v2 port `themes/satin/.../Video.astro` |
| Catalog | package override `theme-rose/blocks/Catalog/Catalog.astro` | package override `theme-satin/blocks/Catalog/Catalog.astro` |
| Product | **no v2 port / no package override** → `theme-base/blocks/Product/Product.astro` (PDP compose, `PRODUCT_UNIFIED_THEMES` includes satin) | same theme-base Product.astro |

Resolver (`preview.service.ts:199-243`): `dist/theme-sections/<theme>/manifest.json` (from `sections.map.json`) → else `theme-<id>` astro-blocks → else `theme-base`.

**Satin gaps vs Rose apply (P1):** Slideshow 9-grid `position`; Video `size` (heading), `subheading`, YouTube/Vimeo; Catalog `cardStyle`, `buttonStyle`, `nextPhoto`, `quickAdd` standard-vs-cart.

---

## Project Structure

```
packages/theme-base/blocks/{Slideshow,Gallery,Video,Newsletter,ContactForm,Catalog,Product}/
  *.puckConfig.ts          # shared constructor sidebar (visible fields)
  *.astro                  # fallback renderer (Rose Video + both Product)

packages/theme-rose/blocks/Catalog/   # puckConfig re-export + native Catalog.astro
packages/theme-satin/blocks/Catalog/  # puckConfig re-export + native Catalog.astro

themes/rose/sections.map.json   # no Video, Catalog, Product
themes/satin/sections.map.json  # Video yes; no Catalog, Product

themes/rose/src/components/sections/{Slideshow,Gallery,Newsletter,Contacts}.astro
themes/satin/src/components/sections/{Slideshow,Gallery,Newsletter,ContactForm,Video}.astro
```

---

## PuckConfig ownership (✓ VERIFIED)

| Block | Rose puckConfig | Satin puckConfig | Sidebar source |
|-------|-----------------|------------------|----------------|
| Slideshow | none | none | theme-base `Slideshow.puckConfig.ts` |
| Gallery | none | none | theme-base `Gallery.puckConfig.ts` |
| Video | none | none | theme-base `Video.puckConfig.ts` |
| Newsletter | none | none | theme-base `Newsletter.puckConfig.ts` |
| ContactForm | none | none | theme-base `ContactForm.puckConfig.ts` |
| Catalog | **re-export** `theme-rose/blocks/Catalog/Catalog.puckConfig.ts:10-14` | **re-export** `theme-satin/blocks/Catalog/Catalog.puckConfig.ts:5-9` | theme-base `Catalog.puckConfig.ts` |
| Product | none | none | theme-base `Product.puckConfig.ts` |

Satin Catalog comment explicitly: schema shared so sidebar is identical; only Astro renderer is overridden.

Hidden / `hiddenInMainPanel` fields are listed separately. Gap list = **visible** fields Rose applies and Satin does not (or applies as the wrong knob).

---

## Questions Answered

### Q1: Where are addable live ports?

**Rose `sections.map.json`:** Slideshow, Gallery, Newsletter, ContactForm→`Contacts.astro`. Video / Catalog / Product **MISSING**.

**Satin `sections.map.json`:** Slideshow, Gallery, Newsletter, ContactForm, **Video**. Catalog / Product **MISSING**.

**Catalog** live = package override (both themes). **Product** live = theme-base (both); satin is in `PRODUCT_UNIFIED_THEMES` (`src/themes/page-registry.ts:108`). Rose `pages/product.astro` is a shell; compose injects `Product.astro`. Satin `pages/product.astro` still embeds `SatinProductDetail`, but live/preview compose **replaces the body** with theme-base Product — native PDP is not the constructor apply path.

### Q2: Do settings apply like Rose?

Field-by-field below. Markers: **APPLY** / **DEAD** / **WRONG** / **PARTIAL**.

---

## 1. Slideshow

**puckConfig (visible):** `slides[]` (image, heading{text,size}, text{content,size}, button{text,link}, container, position 9-grid, alignment, colorScheme) · `imagePosition` fullscreen/contained · `size` s/m/l · `interval` · `pagination` numbers/dots/counter · `colorScheme` · `padding`

**Hidden:** overlay, autoplay, contentAlign, buttonStyle, imageFullBleed

| Visible field | Rose apply | Satin apply | Gap? |
|---------------|------------|-------------|------|
| slides[].image / imageUrl | APPLY `Slideshow.astro:100-103` | APPLY `Slideshow.astro:71-74` | no |
| slides[].heading text | APPLY `:104` | APPLY `:75` | no |
| slides[].heading.size | APPLY `slideHeadingCls` `:39-44,105` (unset→medium) | APPLY `slideHeadingCls` `:44-49,76` (unset→**large**) | default mapping only |
| slides[].text.content / subtitle | APPLY `:107-109` | APPLY `:77-79` | no |
| slides[].text.size | APPLY `slideTextCls` `:48-53,106` | APPLY `:52-57,80` | no |
| slides[].button text/link | APPLY `:96-98,110-115` | APPLY `:67-69,81-86` | no |
| slides[].container boxed | APPLY `:116` | APPLY `:87` | no |
| slides[].**position** (9-grid) | APPLY full 3×3 `slideLayoutCls` `:67-94` (top/middle/bottom × left/center/right; legacy left/right → center-*) | **DEAD / WRONG** `:95-100`: only exact `'left'`/`'right'`. Visible values `top-left`…`bottom-right` never match → always `justify-center`. Vertical ignored. Flex is `items-center` row, not rose `flex-col` + vJustify. | **YES P1** |
| slides[].alignment | APPLY independent items+text `:88-92` | APPLY `:103-108` | no |
| slides[].colorScheme | APPLY `schemeCls` `:117-120` | APPLY `:88-91` | no |
| imagePosition fullscreen/contained | APPLY `:147-151` | APPLY `:129-142` (+ hidden imageFullBleed can force full-bleed) | apply OK |
| size (полотно) | APPLY `:135-140` 50/75/100svh | APPLY `:122-123` 560/680/760px | both apply; different mapping (manner) |
| interval | APPLY `:127-129` | APPLY `:115-117` | no |
| pagination numbers/dots/counter (+lines/none) | APPLY `:157-164` default **numbers** | APPLY `:151-158` default **numbers** (comment `:148` says dots — stale) | no |
| padding | APPLY `:173-176` | APPLY `:173-176` | no |
| colorScheme (section) | compositor wrap (theme-agnostic) | same | no |

Hidden that both still apply: `autoplay` (rose `:130`, satin `:118`); `overlay` (rose section-level `:154`; satin per-slide `:65,214`); `buttonStyle` (rose default solid `:169`; satin default outlined `:160-168` — satin manner).

---

## 2. Gallery

**puckConfig (visible):** heading · headingSize · text · textSize · imagePosition left/right · colorScheme · padding · items[] sub-panel (type, url, productId, collectionId)

| Visible field | Rose apply | Satin apply | Gap? |
|---------------|------------|-------------|------|
| heading | APPLY `Gallery.astro:14` | APPLY `Gallery.astro:16-17` | no |
| headingSize | APPLY top-level first `:28-38` `p.headingSize ?? p.heading?.size` | APPLY nested first `:28` `p.heading?.size ?? p.headingSize` | latent only (aiText heading is string → headingSize still wins) |
| text / textSize | APPLY `:15-18,42-48` | APPLY `:19-23,37-43` | no |
| imagePosition | APPLY mirror grid `:54-59` | APPLY `lg:order` `:47-49` | no |
| items type/url/productId/collectionId | APPLY `:76-113,136` + hydrate | APPLY `:69-106,124` + hydrate | no |
| padding | APPLY `:141-143` | APPLY `:139-141` | no |
| colorScheme | compositor | compositor | no |

Hidden `layout` / `headingAlignment` unused as layout knobs on both (rose heading wrap is always `justify-center` `:49`).

---

## 3. Video

**Rose live port does not exist.** Apply = theme-base `Video.astro` (cascade).

**puckConfig (visible):** videoUrl · position fullscreen/contained · heading · subheading · **size = «Размер заголовка»** · colorScheme · padding

| Visible field | Rose (theme-base) | Satin live port | Gap? |
|---------------|-------------------|-----------------|------|
| videoUrl file | APPLY parse + `<video>` `:62-67,186-195` | APPLY `<video src>` `:12-14,134-141` | file OK |
| videoUrl **YouTube/Vimeo** | APPLY iframe embed `parseVideo` `:121-142,168-185` | **DEAD** — no youtube/vimeo/iframe in file (ends `:183`) | **YES P1** |
| position contained/fullscreen | APPLY `:78,113-116` | APPLY `:70-85` | no |
| heading | APPLY `:27-35,161` | APPLY `:36-47,117-128` (empty → «Видео») | no |
| **subheading** | APPLY `:41-52,162` `<p>` | **DEAD** — `subheading` never referenced | **YES P1** |
| **size «Размер заголовка»** | APPLY as heading size `:90-103` (`raw.size` → `--video-heading-size` 12/14/17) | **WRONG** `:48-55` heading reads `headingSize` (not in puck fields). Visible `p.size` is media aspect `:101-104` (small 21:9, large 4:3). Merchant «Размер заголовка» changes tile ratio, not type. | **YES P1** |
| padding | APPLY `:70-72` | APPLY `:106-109` | no |
| colorScheme | compositor + optional class `:73-74` | compositor | no |

Satin `blockDefaults.Video` `{padded:true, align:container}` — hidden variants, both apply.

---

## 4. Newsletter

**puckConfig (visible):** text{content,size} · agreement toggle · colorScheme · padding · sub-panel heading{text,size} · placeholder · buttonText

**Hidden:** formLayout, description, position, alignment

| Visible field | Rose apply | Satin apply | Gap? |
|---------------|------------|-------------|------|
| heading text | APPLY `Newsletter.astro:19-20` | APPLY `:19-20` | no |
| heading.size | APPLY `:22-28` | APPLY `:22-24` | no |
| text.content | APPLY `:36-39` | APPLY `:33-36` | no |
| text.size | APPLY `:40-42` | APPLY `:37-39` | no |
| placeholder | APPLY `:48-49` | APPLY `:44-47` | no |
| buttonText | APPLY `:50-51` | APPLY `:54-55` | no |
| agreement | APPLY `:59` | APPLY `:73` | no |
| padding | APPLY `:78-80` | APPLY `:100-102` | no |
| colorScheme | compositor | compositor | no |

Hidden `formLayout`: Rose stacked unless `inline-submit` (`:55`). Satin **inline unless stacked** (`:68`) + `theme.json` `blockDefaults.Newsletter.formLayout: "inline-submit"`. Manner default, not a visible-field gap.

Hidden `position`: both apply as section alignment (rose `:67-74`, satin `:85-95`). Field is `type: hidden` in puckConfig.

---

## 5. ContactForm

**puckConfig (visible):** heading · headingSize · colorScheme · padding  
**Hidden:** headingAlignment, description, fields, buttonText

| Visible field | Rose `Contacts.astro` | Satin `ContactForm.astro` | Gap? |
|---------------|----------------------|---------------------------|------|
| heading | APPLY `:16-19,75` | APPLY `:17-18,128-137` | no |
| headingSize | **DEAD** — NtSectionHeading only, no `headingSize` in file | APPLY `:20-22` 17/20/24 | Satin **ahead** of Rose (not a satin-to-match-rose gap) |
| padding | APPLY `:60-62` | APPLY `:110-112` | no |
| colorScheme | compositor | compositor | no |

Hidden `fields` / `buttonText`: both apply if present (rose `:35-57,56-57`; satin `:65-90`).

---

## 6. Catalog

**puckConfig:** both re-export theme-base. Visible: collectionSlug · subtitle toggle · cards · columns · categoryTitle · categorySubtitle · productCard{buttonStyle, cardStyle, cardBackground, nextPhoto, nextPhotoMode, quickAdd} · showFilter · filterPosition · showSort · colorScheme · containerColorScheme · padding

| Visible field | Rose `theme-rose/.../Catalog.astro` | Satin `theme-satin/.../Catalog.astro` | Gap? |
|---------------|-------------------------------------|---------------------------------------|------|
| collectionSlug | APPLY `:218` `data-collection-slug` | APPLY `:176` | no |
| subtitle toggle | APPLY `:110` | APPLY `:104` | no |
| cards | APPLY pageSize `:97` | APPLY `:91` | no |
| columns | APPLY `--rose-cols` `:131-135,442` | APPLY `--satin-cols` `:121-125,380` | no |
| categoryTitle / categorySubtitle | APPLY `:108-109` | APPLY `:102-103` | no |
| productCard.**cardStyle** | APPLY aspect square/wide/318:444 `:141-145` → RoseProductCard + hydrate | **DEAD** — only in interface `:41`. Card/skeleton/hydrate **hardcode** `aspect-[430/564]` (`SatinProductCard.astro:42`, Catalog `:300,677`) | **YES P1** |
| productCard.**buttonStyle** | APPLY primary/secondary/link tokens `:149-161` | **DEAD** — interface `:40` only. Hydrate button always `bg-[#000000]` `:668-674` | **YES P1** |
| productCard.cardBackground | APPLY `:179-180,243` | APPLY `:138-139,191,621` | no |
| productCard.**nextPhoto** | APPLY `:170,220` + hover in script | **DEAD** — interface `:43` only; no `data-next-photo`, no hover swap | **YES P1** |
| productCard.nextPhotoMode | **DEAD** on Rose too (no `nextPhotoMode` in rose Catalog) | **DEAD** | neither (theme-base Catalog does apply) |
| productCard.**quickAdd** | APPLY none / standard «БЫСТРЫЙ ПРОСМОТР» / cart «В КОРЗИНУ» `:165-167` | **PARTIAL** `:130-131,669`: none hides; standard **and** cart both «В корзину». Default `'cart'` vs Rose `'none'` | **YES** (standard vs cart) |
| showFilter / filterPosition / showSort | APPLY `:111-117,175` | APPLY `:105-111,175` | no |
| colorScheme / containerColorScheme | APPLY `:120-122,184-186` | APPLY `:114-116,142-144` | no |
| padding | APPLY `:132-135` | APPLY `:122-125` | no |

Satin Catalog comment `:127-129` admits native always showed «В корзину»; quickAdd only hides.

---

## 7. Product

**No theme live port.** Both constructor/live PDP use `packages/theme-base/blocks/Product/Product.astro` (`PRODUCT_UNIFIED_THEMES` includes `satin`).

Visible fields all APPLY in that one file:

| Field | Apply (theme-base Product.astro) |
|-------|----------------------------------|
| productId | `:42,174,225` |
| layout stacked/two-columns/carousel/split | `:67-71,248-256` |
| size (layout image/thumb) | `:88,92-97` |
| photoPosition | `:56,118,239` |
| zoomMode | `:57,228,698+` |
| dynamicButton | `:52,131-135` |
| colorScheme | `:111-114` |
| padding | `:108-110` |
| sub-panels text/title/variants{displayStyle,shape}/buttons/share | `:87-90,139-158,121-136` |

`visualConfig` is **hidden**; Rose `theme.json` blockDefaults.Product.visualConfig matches `DEFAULT_VISUAL_CONFIG` (`Product.types.ts:125-130`). Satin has **no** Product blockDefaults — same defaults anyway.

Satin `satinProductDetail.astro` is **not** the constructor apply path (compose overwrites `/product`). Not a visible-field gap.

---

## Gap list (Satin must match Rose apply)

Priority = visible constructor knob Rose applies, Satin dead or wired to the wrong behaviour.

### P1 — dead / wrong (merchant sees the control, live ignores or mis-applies)

1. **Slideshow `slides[].position` (9-grid «Позиция»)**  
   Rose: `themes/rose/src/components/sections/Slideshow.astro:67-94` — top/center/bottom × left/center/right.  
   Satin: `themes/satin/src/components/sections/Slideshow.astro:95-100` — exact `'left'`/`'right'` only. Visible options never match → always centered; no vertical.

2. **Video `size` «Размер заголовка»**  
   Rose/base: `packages/theme-base/blocks/Video/Video.astro:90-103` heading size.  
   Satin: `themes/satin/src/components/sections/Video.astro:48-55,101-104` — `size` = media aspect; heading ignores `p.size`.

3. **Video `subheading`**  
   Rose/base: `Video.astro:41-52,162`.  
   Satin Video.astro: no `subheading` (file 183 lines).

4. **Video `videoUrl` YouTube/Vimeo**  
   Rose/base: `parseVideo` + iframe `:121-185`.  
   Satin: `<video src>` only `:134-141`.

5. **Catalog `productCard.cardStyle` «Вид изображения»**  
   Rose: `Catalog.astro:141-145`.  
   Satin: unused; hardcoded `aspect-[430/564]` (`SatinProductCard.astro:42`, Catalog hydrate `:677`).

6. **Catalog `productCard.buttonStyle` «Стиль кнопки»**  
   Rose: `Catalog.astro:149-161`.  
   Satin: unused; hydrate always black fill `:668-674`.

7. **Catalog `productCard.nextPhoto` «Следующее фото при наведении»**  
   Rose: `Catalog.astro:170,220` + script hover.  
   Satin: unused.

8. **Catalog `productCard.quickAdd` standard vs cart**  
   Rose: none / «БЫСТРЫЙ ПРОСМОТР» / «В КОРЗИНУ» `:165-167`.  
   Satin: none vs always «В корзину» `:130-131,669`.

### P2 — defaults / manner (apply exists, not Rose-identical)

- Slideshow heading.size unset: Rose medium, Satin large (`slideHeadingCls` else-branch).
- Slideshow `size`: svh vs fixed px (both apply).
- Newsletter hidden `formLayout` default: Rose stacked, Satin inline-submit (`theme.json` + `!== "stacked"`).
- Catalog `quickAdd` default: Rose `'none'`, Satin `'cart'`.
- ContactForm `headingSize`: Rose dead, Satin applies (Satin ahead).
- Catalog `nextPhotoMode` (zones): dead on **both** theme overrides (only theme-base Catalog applies).

### Not gaps

- colorScheme on all seven: compositor `v2-page-composer` / `resolveBlockScheme` (see `THEMES_SETTINGS_PARITY.md`).
- Product visible fields: shared theme-base renderer.
- Gallery / Newsletter visible fields: Satin already applies.
- puckConfig sidebar: identical (Catalog re-export; others inherit theme-base).

---

## Architecture Map

```
Constructor sidebar
  resolveBlocks(theme.json)
    Catalog  → theme-rose/satin re-export → theme-base puckConfig
    others   → theme-base puckConfig
        │
        ▼
Preview / live renderBlock(themeId)
  1. dist/theme-sections/<theme>/manifest.json   ← sections.map.json v2 ports
  2. dist/astro-blocks/theme-<id>__X__X.mjs      ← package override (Catalog)
  3. dist/astro-blocks/theme-base__X__X.mjs      ← Rose Video, both Product
```

```
Add Slideshow/Gallery/Newsletter/ContactForm
  rose v2 port  ←→  satin v2 port     (compare these)
Add Video
  rose theme-base Video.astro  ←→  satin v2 Video.astro
Add Catalog
  rose Catalog.astro override  ←→  satin Catalog.astro override
Add Product
  theme-base Product.astro × 2 (no port gap)
```

---

## Key Files

| File | Role |
|------|------|
| `packages/theme-base/blocks/Slideshow/Slideshow.puckConfig.ts` | visible slideshow fields |
| `themes/rose/src/components/sections/Slideshow.astro` | Rose apply (9-grid) |
| `themes/satin/src/components/sections/Slideshow.astro` | Satin apply (position dead) |
| `packages/theme-base/blocks/Video/Video.puckConfig.ts` | size = heading size |
| `packages/theme-base/blocks/Video/Video.astro` | Rose Video apply |
| `themes/satin/src/components/sections/Video.astro` | Satin Video (wrong size, no subheading, no YT/Vimeo) |
| `packages/theme-base/blocks/Catalog/Catalog.puckConfig.ts` | shared catalog sidebar |
| `packages/theme-rose/blocks/Catalog/Catalog.puckConfig.ts` | re-export |
| `packages/theme-satin/blocks/Catalog/Catalog.puckConfig.ts` | re-export |
| `packages/theme-rose/blocks/Catalog/Catalog.astro` | Rose cardStyle/buttonStyle/nextPhoto/quickAdd |
| `packages/theme-satin/blocks/Catalog/Catalog.astro` | Satin catalog; those four dead/partial |
| `packages/theme-base/blocks/Product/Product.astro` | both themes PDP |
| `themes/rose/sections.map.json` | no Video/Catalog/Product |
| `themes/satin/sections.map.json` | Video; no Catalog/Product |
| `src/services/preview.service.ts:199-243` | v2 then cascade |
| `src/themes/page-registry.ts:108` | PRODUCT_UNIFIED_THEMES includes satin |

---

## Open Questions

- Should Satin Video be rewritten against theme-base `size`/`subheading`/`parseVideo`, or should Rose gain a v2 Video port and both be manner-specific? Today Rose **is** theme-base.
- Catalog `nextPhotoMode` is dead on both theme overrides — out of scope unless also porting theme-base zones to Rose.
- Satin `/product` still ships `SatinProductDetail` in the Astro page; compose overwrites on live. Local `astro dev` of the theme would not see constructor Product settings.
