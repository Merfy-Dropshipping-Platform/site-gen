// Satin Catalog — token whitelist. Re-export из base: набор CSS-переменных
// каталога общий, тема адаптирует значения через theme-satin/tokens.json.
// Satin-специфика (satin-pad / satin-container / satin-button / font-logo /
// font-manrope) — обычные CSS-классы из satin global.css, доезжают через
// prebuilt satin dist шелл (composeContentPagesIntoDist), а не через этот
// whitelist.
export { CatalogTokens } from '../../../theme-base/blocks/Catalog/Catalog.tokens';
