# Quick Fix: Responsive Typography — Collections.astro (satin, flux, vanilla)
Generated: 2026-04-16

## Change Made
All three files were identical to each other (and to Bloom's pre-fix version), so the same transformation was applied to all.

### Part 1 — Typography lookup tables
Added `headingFS`, `textFS`, `hfs`, `tfs` constants after `const schemeClass` line (before `const aspectMap`).

### Part 2 — Responsive heading/subtitle HTML
- Wrapper div: `gap-[8px] mb-[40px]` -> `gap-2 sm:gap-3 md:gap-4 mb-8 sm:mb-10 md:mb-12`
- `<h2>`: removed `text-[20px]`, added class `collections-heading`, style changed to template literal with `--fs-*` CSS vars
- `<p>`: removed `text-[16px]`, added class `collections-subtitle`, style changed to template literal with `--ts-*` CSS vars
- Grid div: removed `gap-[16px]` (gap now handled by CSS)

### Part 3 — CSS additions
- Base `.collections-grid`: added `gap: 1.5rem;`
- Added `.collections-heading` and `.collections-subtitle` base rules
- `@media (min-width: 640px)`: `.collections-grid` gap `2rem`, heading/subtitle font-size rules
- `@media (min-width: 1024px)`: `.collections-grid` gap `2.5rem`, heading/subtitle font-size rules

## Files Modified
1. `templates/astro/satin/src/components/Collections.astro` - responsive typography applied
2. `templates/astro/flux/src/components/Collections.astro` - responsive typography applied
3. `templates/astro/vanilla/src/components/Collections.astro` - responsive typography applied

## Notes
All three source files were byte-for-byte identical before the fix. No edge cases or deviations.
