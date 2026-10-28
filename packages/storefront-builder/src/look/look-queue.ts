// Имена контракта снимков черновика отдельно от кода отрисовки: брокер сборщика объявляет очередь, не подтягивая
// модули браузера. Те же имена — в шлюзе (`api-gateway src/sites/look/look.contract.ts`).
export const LOOKS_QUEUE = 'storefront_looks';
export const LOOK_PATTERN = 'storefront.look';
