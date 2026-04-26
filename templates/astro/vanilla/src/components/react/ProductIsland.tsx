import React, { useEffect, useMemo, useState, useCallback } from 'react';

/**
 * ProductIsland — React island for the vanilla theme product detail page (Puck-managed).
 *
 * Replaces the legacy vanilla-JS `/scripts/product-detail.js` with a React component.
 * Mounted from `pages/product/[id].astro` with `client:only="react"`.
 *
 * Fetches product data at runtime from `/api/sites/:siteId/storefront-data?product=:id`
 * (siteId comes from `window.__MERFY_CONFIG__.shopId`). All cart actions go through
 * `window.cartStore.addItem(productId, variantId, quantity)`.
 *
 * Visual design matches the pre-T13 vanilla product page: 1320px container, vertical
 * 88px thumbnail strip right of main image, info column on left (lg:flex-1), max-w-552
 * main image, --color-button / --color-button-text / --radius-button / --radius-card
 * theme tokens, 56px button height, 14/24/16 typography (smaller than rose).
 *
 * photoPosition default: 'right' (vanilla pre-T13 had photo on right, info on left).
 */

// --- Types -----------------------------------------------------------------

type EnabledFlag = 'true' | 'false' | undefined;
type PhotoPosition = 'left' | 'right' | undefined;
type LayoutMode = 'full' | 'compact' | undefined;
type ZoomMode = 'hover' | 'click' | 'none' | undefined;

interface VariantOption {
  id: string;
  title: string;
  price: string | number;
  available: boolean;
  options?: Record<string, string>;
}

interface ProductData {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  price?: number | string;
  basePrice?: number | string;
  compareAtPrice?: number | string;
  oldPrice?: number | string;
  sku?: string | null;
  slug?: string;
  handle?: string;
  images?: Array<string | { url?: string; alt?: string }>;
  image?: string;
  hasVariants?: boolean;
  variants?: VariantOption[];
  metaTitle?: string | null;
  metaDescription?: string | null;
}

interface VariantGroup {
  key: string;
  values: Array<{ value: string; available: boolean }>;
}

export interface ProductIslandProps {
  productId: string;
  layout?: LayoutMode;
  photoPosition?: PhotoPosition;
  zoomMode?: ZoomMode;
  text?: { content?: string };
  title?: { enabled?: EnabledFlag };
  price?: { show?: EnabledFlag };
  variants?: { style?: 'list' | 'pill' };
  quantity?: { enabled?: EnabledFlag };
  buttons?: {
    addToCart?: { text?: string };
    buyNow?: { text?: string; enabled?: EnabledFlag };
  };
  description?: { content?: string; enabled?: EnabledFlag };
  share?: { text?: string; enabled?: EnabledFlag };
}

// --- Helpers ---------------------------------------------------------------

function getMerfyConfig(): { siteId: string; apiBase: string } {
  if (typeof window === 'undefined') return { siteId: '', apiBase: '' };
  const cfg = (window as any).__MERFY_CONFIG__ || {};
  return {
    siteId: cfg.shopId || cfg.siteId || '',
    apiBase: cfg.apiUrl || 'https://gateway.merfy.ru/api',
  };
}

function getBrandName(): string {
  if (typeof window === 'undefined') return '';
  const cfg = (window as any).__MERFY_CONFIG__ || {};
  if (cfg.shopName) return String(cfg.shopName);
  const meta = document.querySelector('meta[name="shop-name"]');
  return meta?.getAttribute('content') || '';
}

function isVisible(flag: EnabledFlag): boolean {
  // visible by default; only hide on explicit 'false'
  return flag !== 'false';
}

function parseNumericPrice(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatPriceRub(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} ₽`;
}

function normalizeImages(product: ProductData | null): string[] {
  if (!product) return [];
  const arr = Array.isArray(product.images) ? product.images : [];
  const mapped = arr
    .map((img) => (typeof img === 'string' ? img : img?.url ?? ''))
    .filter((s): s is string => !!s);
  if (mapped.length > 0) return mapped;
  return product.image ? [product.image] : [];
}

function buildVariantGroups(variants: VariantOption[]): VariantGroup[] {
  const groupMap = new Map<string, Map<string, boolean>>();
  for (const v of variants) {
    if (!v.options) continue;
    for (const [key, value] of Object.entries(v.options)) {
      if (!groupMap.has(key)) groupMap.set(key, new Map());
      const valMap = groupMap.get(key)!;
      // A value is available if ANY variant with that value is available.
      if (!valMap.has(value) || v.available) {
        valMap.set(value, valMap.get(value) || v.available);
      }
    }
  }
  return Array.from(groupMap.entries()).map(([key, valMap]) => ({
    key,
    values: Array.from(valMap.entries()).map(([value, available]) => ({
      value,
      available,
    })),
  }));
}

function findVariantByOptions(
  variants: VariantOption[],
  selected: Record<string, string>,
): VariantOption | null {
  const keys = Object.keys(selected);
  if (keys.length === 0) return null;
  for (const v of variants) {
    if (!v.options) continue;
    let allMatch = true;
    for (const k of keys) {
      if (v.options[k] !== selected[k]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return v;
  }
  return null;
}

// --- Component -------------------------------------------------------------

const ProductIsland: React.FC<ProductIslandProps> = (props) => {
  const {
    productId,
    // Vanilla default: photo on RIGHT, info on LEFT (matches pre-T13 layout).
    photoPosition = 'right',
    text,
    title,
    price: priceProp,
    quantity: quantityProp,
    buttons,
    description: descriptionProp,
    share: shareProp,
  } = props;

  const showTitle = isVisible(title?.enabled);
  const showPrice = isVisible(priceProp?.show);
  const showQuantity = isVisible(quantityProp?.enabled);
  const showDescription = isVisible(descriptionProp?.enabled);
  const showShare = isVisible(shareProp?.enabled);
  const showBuyNow = isVisible(buttons?.buyNow?.enabled);

  const addToCartLabelDefault = 'Добавить в корзину';
  const buyNowLabelDefault = 'Купить сейчас';
  const shareLabelDefault = 'Поделиться';

  const addToCartLabel = buttons?.addToCart?.text || addToCartLabelDefault;
  const buyNowLabel = buttons?.buyNow?.text || buyNowLabelDefault;
  const shareLabel = shareProp?.text || shareLabelDefault;

  // --- Data state ---
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // --- Interactive state ---
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  // For flat-variant fallback (variants without options map) — explicit id selection
  const [selectedFlatVariantId, setSelectedFlatVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);

  const [addToCartLabelLive, setAddToCartLabelLive] = useState<string>(addToCartLabel);
  const [buyNowLabelLive, setBuyNowLabelLive] = useState<string>(buyNowLabel);
  const [shareLabelLive, setShareLabelLive] = useState<string>(shareLabel);
  const [addToCartBusy, setAddToCartBusy] = useState<boolean>(false);
  const [buyNowBusy, setBuyNowBusy] = useState<boolean>(false);

  // Sync labels when puck props change
  useEffect(() => setAddToCartLabelLive(addToCartLabel), [addToCartLabel]);
  useEffect(() => setBuyNowLabelLive(buyNowLabel), [buyNowLabel]);
  useEffect(() => setShareLabelLive(shareLabel), [shareLabel]);

  // --- Fetch product data ---
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { siteId, apiBase } = getMerfyConfig();
        if (!siteId) {
          if (!cancelled) {
            setError('Магазин не настроен');
            setLoading(false);
          }
          return;
        }
        const url = `${apiBase}/sites/${encodeURIComponent(siteId)}/storefront-data?product=${encodeURIComponent(productId)}`;
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        let p: ProductData | null = (data?.product as ProductData) || null;
        if (!p && Array.isArray(data?.products)) {
          p =
            (data.products.find(
              (it: ProductData) =>
                it.id === productId ||
                it.handle === productId ||
                it.slug === productId,
            ) as ProductData | undefined) ?? null;
        }
        if (!cancelled) {
          setProduct(p);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Ошибка загрузки товара');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // --- Derived values ---
  const images = useMemo(() => normalizeImages(product), [product]);
  const productVariants: VariantOption[] = useMemo(
    () => (Array.isArray(product?.variants) ? product!.variants! : []),
    [product],
  );
  const hasVariants =
    !!product?.hasVariants && productVariants.length > 0;
  const variantGroups = useMemo(
    () => (hasVariants ? buildVariantGroups(productVariants) : []),
    [hasVariants, productVariants],
  );

  // Initialise variant selection on first product load
  useEffect(() => {
    if (!hasVariants) return;
    if (variantGroups.length > 0) {
      const initial: Record<string, string> = {};
      for (const g of variantGroups) {
        const firstAvailable = g.values.find((v) => v.available) ?? g.values[0];
        if (firstAvailable) initial[g.key] = firstAvailable.value;
      }
      setSelectedOptions(initial);
    } else {
      // Flat variant list: pre-select first available
      const first =
        productVariants.find((v) => v.available) ?? productVariants[0] ?? null;
      setSelectedFlatVariantId(first?.id ?? null);
    }
  }, [hasVariants, variantGroups, productVariants]);

  const currentVariant = useMemo<VariantOption | null>(() => {
    if (!hasVariants) return null;
    if (variantGroups.length > 0) {
      return findVariantByOptions(productVariants, selectedOptions);
    }
    // Flat variant list — pick by explicit selectedFlatVariantId, fallback first available
    if (selectedFlatVariantId) {
      const match = productVariants.find((v) => v.id === selectedFlatVariantId);
      if (match) return match;
    }
    return productVariants.find((v) => v.available) ?? productVariants[0] ?? null;
  }, [hasVariants, variantGroups, productVariants, selectedOptions, selectedFlatVariantId]);

  const baseUnitPrice = useMemo(() => {
    const fromVariant = currentVariant?.price;
    if (fromVariant != null) return parseNumericPrice(fromVariant);
    return parseNumericPrice(
      product?.price ?? product?.basePrice ?? 0,
    );
  }, [currentVariant, product]);

  const baseOldPrice = useMemo(() => {
    return parseNumericPrice(
      product?.compareAtPrice ?? product?.oldPrice ?? 0,
    );
  }, [product]);

  const totalPrice = baseUnitPrice * Math.max(1, quantity);
  const totalOldPrice = baseOldPrice > 0 ? baseOldPrice * Math.max(1, quantity) : 0;

  const productName = product?.name ?? product?.title ?? 'Товар';
  const brandName = getBrandName();

  // --- Handlers ---
  const onSelectOption = useCallback(
    (groupKey: string, value: string, available: boolean) => {
      if (!available) return;
      setSelectedOptions((prev) => ({ ...prev, [groupKey]: value }));
    },
    [],
  );

  const decQty = useCallback(() => setQuantity((q) => Math.max(1, q - 1)), []);
  const incQty = useCallback(() => setQuantity((q) => q + 1), []);

  const requireVariantSelected = (): boolean => {
    if (!hasVariants) return true;
    return !!currentVariant;
  };

  const onAddToCart = useCallback(async () => {
    if (!product) return;
    if (!requireVariantSelected()) {
      setAddToCartLabelLive('Выберите вариант');
      window.setTimeout(() => setAddToCartLabelLive(addToCartLabel), 1500);
      return;
    }
    setAddToCartBusy(true);
    setAddToCartLabelLive('Добавляем...');
    try {
      const cs = (window as any).cartStore;
      if (cs && typeof cs.addItem === 'function') {
        const ok = await cs.addItem(product.id, currentVariant?.id ?? null, quantity);
        if (ok) {
          setAddToCartLabelLive('Добавлено!');
          window.setTimeout(() => {
            setAddToCartLabelLive(addToCartLabel);
            setAddToCartBusy(false);
          }, 1500);
          return;
        }
      } else {
        // Fallback if cartStore not available
        window.alert('Не удалось добавить в корзину: cartStore недоступен');
      }
    } catch {
      // swallow — fall through to reset
    }
    setAddToCartLabelLive(addToCartLabel);
    setAddToCartBusy(false);
  }, [product, currentVariant, quantity, addToCartLabel, hasVariants]);

  const onBuyNow = useCallback(async () => {
    if (!product) return;
    if (!requireVariantSelected()) {
      setBuyNowLabelLive('Выберите вариант');
      window.setTimeout(() => setBuyNowLabelLive(buyNowLabel), 1500);
      return;
    }
    setBuyNowBusy(true);
    setBuyNowLabelLive('Оформляем...');
    try {
      const cs = (window as any).cartStore;
      if (cs && typeof cs.addItem === 'function') {
        await cs.addItem(product.id, currentVariant?.id ?? null, quantity);
      }
    } catch {
      // continue to checkout regardless
    }
    const slugOrId = product.slug ?? product.handle ?? product.id;
    window.location.href = `/checkout?productId=${encodeURIComponent(slugOrId)}`;
  }, [product, currentVariant, quantity, buyNowLabel, hasVariants]);

  const onShare = useCallback(() => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const docTitle = typeof document !== 'undefined' ? document.title : productName;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      (navigator as any)
        .share({ title: docTitle, url })
        .catch(() => undefined);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setShareLabelLive('Ссылка скопирована!');
          window.setTimeout(() => setShareLabelLive(shareLabel), 1500);
        })
        .catch(() => undefined);
    }
  }, [productName, shareLabel]);

  // --- Render ---
  if (loading) {
    return (
      <div
        className="max-w-[1320px] mx-auto px-4 sm:px-6 py-[75px] flex items-center justify-center"
        style={{ minHeight: 400 }}
      >
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{
            border: '3px solid rgb(var(--color-muted) / 0.3)',
            borderTopColor: 'rgb(var(--color-foreground))',
          }}
          aria-label="Загрузка..."
        />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div
        className="max-w-[1320px] mx-auto px-4 sm:px-6 py-[75px] text-center"
        style={{ color: 'rgb(var(--color-foreground))' }}
      >
        <p className="font-body" style={{ fontSize: 20, lineHeight: '27px' }}>
          {error ? 'Ошибка загрузки товара' : 'Товар не найден'}
        </p>
      </div>
    );
  }

  const mainImage = images[selectedImageIndex] ?? images[0] ?? null;
  const hasMultipleImages = images.length > 1;
  // photoPosition prop describes WHERE the photo is.
  // Vanilla default: photo right, info left — matches pre-T13 layout.
  // 'right' → reverse desktop direction so photo (second child) appears on the right.
  // Wait — actually with default ordering: info-first, gallery-second, lg:flex-row places
  // info LEFT, gallery RIGHT (photo on right). That IS the vanilla default.
  // To put the photo on the LEFT (rose-style), reverse the row.
  const flexDir =
    photoPosition === 'left' ? 'lg:flex-row-reverse' : 'lg:flex-row';

  // --- Pill style helpers (group variants) ---
  const STYLE_BASE: React.CSSProperties = {
    height: 40,
    padding: 10,
    fontSize: 16,
    lineHeight: '22px',
    borderRadius: 'var(--radius-button)',
  };
  function pillStyle(
    selected: boolean,
    available: boolean,
  ): React.CSSProperties {
    if (!available) {
      return {
        ...STYLE_BASE,
        background: 'rgba(153,153,153,0.05)',
        border: '1px solid rgb(var(--color-muted))',
        color: 'rgb(var(--color-muted))',
        textDecoration: 'line-through',
        cursor: 'not-allowed',
      };
    }
    if (selected) {
      return {
        ...STYLE_BASE,
        background: 'rgb(var(--color-foreground))',
        border: '1px solid rgb(var(--color-foreground))',
        color: 'rgb(var(--color-background))',
      };
    }
    return {
      ...STYLE_BASE,
      background: 'transparent',
      border: '1px solid rgb(var(--color-foreground))',
      color: 'rgb(var(--color-foreground))',
      cursor: 'pointer',
    };
  }

  return (
    <div
      className="w-full"
      style={{
        background: 'rgb(var(--color-background))',
        color: 'rgb(var(--color-foreground))',
      }}
    >
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-[75px]">
        <div className={`flex flex-col ${flexDir} gap-[40px]`}>
          {/* --- Product info column (LEFT in default layout, lg:flex-1) --- */}
          <div className="flex flex-col w-full lg:flex-1" style={{ gap: 40 }}>
            <div className="flex flex-col">
              {/* Optional text block above brand */}
              {text?.content && text.content.trim() ? (
                <span
                  className="font-body"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.4,
                    color: 'rgb(var(--color-muted))',
                    marginBottom: 4,
                  }}
                >
                  {text.content}
                </span>
              ) : null}

              {/* Brand name */}
              {brandName ? (
                <span
                  className="font-body"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.4,
                    color: 'rgb(var(--color-muted))',
                  }}
                >
                  {brandName}
                </span>
              ) : null}

              {/* Product name — vanilla: 24px, no uppercase, line-height 1.366 */}
              {showTitle ? (
                <h1
                  className="font-body"
                  style={{
                    fontSize: 24,
                    lineHeight: 1.366,
                    color: 'rgb(var(--color-foreground))',
                    margin: 0,
                  }}
                >
                  {productName}
                </h1>
              ) : null}

              {/* Price — vanilla: 16px primary, 14px line-through old price */}
              {showPrice ? (
                <div
                  className="flex items-center"
                  style={{ gap: 8, marginTop: 5 }}
                >
                  <span
                    className="font-body"
                    style={{
                      fontSize: 16,
                      lineHeight: 1.4,
                      color: 'rgb(var(--color-foreground))',
                    }}
                  >
                    {formatPriceRub(totalPrice)}
                  </span>
                  {totalOldPrice > 0 ? (
                    <span
                      className="font-body line-through"
                      style={{
                        fontSize: 14,
                        lineHeight: 1.4,
                        color: 'rgb(var(--color-muted))',
                      }}
                    >
                      {formatPriceRub(totalOldPrice)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Variant groups (grouped by option key) */}
            {hasVariants && variantGroups.length > 0 ? (
              <div className="flex flex-col" style={{ gap: 25 }}>
                {variantGroups.map((group) => (
                  <div
                    key={group.key}
                    className="flex flex-col"
                    style={{ gap: 15 }}
                  >
                    <span
                      className="font-body"
                      style={{
                        fontSize: 20,
                        lineHeight: '27px',
                        color: 'rgb(var(--color-muted))',
                      }}
                    >
                      {group.key}
                    </span>
                    <div
                      className="flex flex-wrap"
                      style={{ gap: 10 }}
                    >
                      {group.values.map((opt) => {
                        const selected =
                          selectedOptions[group.key] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={!opt.available}
                            onClick={() =>
                              onSelectOption(
                                group.key,
                                opt.value,
                                opt.available,
                              )
                            }
                            className="font-body transition-colors"
                            style={pillStyle(selected, opt.available)}
                          >
                            {opt.value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Fallback: flat variant list (no options map) */}
            {hasVariants && variantGroups.length === 0 ? (
              <div className="flex flex-wrap" style={{ gap: 10 }}>
                {productVariants.map((v) => {
                  const selected = currentVariant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={!v.available}
                      onClick={() => setSelectedFlatVariantId(v.id)}
                      className="font-body transition-colors"
                      style={pillStyle(selected, v.available)}
                    >
                      {v.title}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Quantity */}
            {showQuantity ? (
              <div className="flex flex-col" style={{ gap: 15 }}>
                <span
                  className="font-body"
                  style={{
                    fontSize: 20,
                    lineHeight: '27px',
                    color: 'rgb(var(--color-muted))',
                  }}
                >
                  Количество
                </span>
                <div className="flex items-center" style={{ gap: 5 }}>
                  <button
                    type="button"
                    onClick={decQty}
                    className="w-[40px] h-[40px] flex items-center justify-center cursor-pointer"
                    style={{
                      borderRadius: 'var(--radius-button)',
                      border: '1px solid rgb(var(--color-foreground))',
                      background: 'rgb(var(--color-background))',
                      color: 'rgb(var(--color-foreground))',
                    }}
                    aria-label="Уменьшить количество"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 32 32"
                      fill="none"
                    >
                      <path
                        d="M8 16H24"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <div
                    className="w-[40px] h-[40px] flex items-center justify-center"
                    style={{
                      borderRadius: 'var(--radius-button)',
                      background: 'rgb(var(--color-background))',
                    }}
                  >
                    <span
                      className="font-body"
                      style={{
                        fontSize: 16,
                        lineHeight: '22px',
                        color: 'rgb(var(--color-foreground))',
                      }}
                    >
                      {quantity}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={incQty}
                    className="w-[40px] h-[40px] flex items-center justify-center cursor-pointer"
                    style={{
                      borderRadius: 'var(--radius-button)',
                      border: '1px solid rgb(var(--color-foreground))',
                      background: 'rgb(var(--color-background))',
                      color: 'rgb(var(--color-foreground))',
                    }}
                    aria-label="Увеличить количество"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 32 32"
                      fill="none"
                    >
                      <path
                        d="M16 8V24M8 16H24"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Cart buttons — vanilla: 56px, 16px font, 12px gap, button color tokens */}
            <div className="flex flex-col" style={{ gap: 12 }}>
              <button
                type="button"
                onClick={onAddToCart}
                disabled={addToCartBusy}
                className="w-full flex items-center justify-center font-body cursor-pointer transition-colors"
                style={{
                  height: 56,
                  fontSize: 16,
                  lineHeight: '22px',
                  borderRadius: 'var(--radius-button)',
                  background: 'transparent',
                  border: '1px solid rgb(var(--color-foreground))',
                  color: 'rgb(var(--color-foreground))',
                  opacity: addToCartBusy ? 0.7 : 1,
                }}
              >
                {addToCartLabelLive}
              </button>
              {showBuyNow ? (
                <button
                  type="button"
                  onClick={onBuyNow}
                  disabled={buyNowBusy}
                  className="w-full flex items-center justify-center font-body cursor-pointer transition-colors border-0"
                  style={{
                    height: 56,
                    fontSize: 16,
                    lineHeight: '22px',
                    borderRadius: 'var(--radius-button)',
                    background: 'rgb(var(--color-button))',
                    color: 'rgb(var(--color-button-text))',
                    opacity: buyNowBusy ? 0.7 : 1,
                  }}
                >
                  {buyNowLabelLive}
                </button>
              ) : null}
            </div>

            {/* Description */}
            {showDescription &&
            (descriptionProp?.content || product.description) ? (
              <div className="flex flex-col" style={{ gap: 15 }}>
                <h2
                  className="font-body uppercase"
                  style={{
                    fontSize: 20,
                    lineHeight: '27px',
                    color: 'rgb(var(--color-foreground))',
                    margin: 0,
                  }}
                >
                  Описание
                </h2>
                <p
                  className="font-body whitespace-pre-line"
                  style={{
                    fontSize: 16,
                    lineHeight: '22px',
                    color: 'rgb(var(--color-muted))',
                    margin: 0,
                  }}
                >
                  {descriptionProp?.content || product.description}
                </p>
              </div>
            ) : null}

            {/* Share */}
            {showShare ? (
              <button
                type="button"
                onClick={onShare}
                className="flex items-center bg-transparent p-0 border-0 cursor-pointer hover:opacity-80 transition-opacity"
                style={{
                  gap: 15,
                  color: 'rgb(var(--color-foreground))',
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className="font-body"
                  style={{ fontSize: 16, lineHeight: '22px' }}
                >
                  {shareLabelLive}
                </span>
              </button>
            ) : null}
          </div>

          {/* --- Image gallery column (RIGHT in default layout, max-w-648, lg:shrink-0) --- */}
          <div
            className="w-full lg:shrink-0 flex flex-col lg:flex-row"
            style={{ maxWidth: 648, gap: 8 }}
          >
            {/* Main image — max-w-552, aspect-square, no border-radius, subtle bg */}
            <div
              className="overflow-hidden aspect-square flex items-center justify-center w-full"
              style={{
                maxWidth: 552,
                background: 'rgb(var(--color-foreground) / 0.03)',
              }}
            >
              {mainImage ? (
                <img
                  src={mainImage}
                  alt={productName}
                  className="w-full h-full object-cover"
                  loading="eager"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ color: 'rgb(var(--color-muted))' }}
                >
                  <svg
                    width="64"
                    height="64"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21,15 16,10 5,21" />
                  </svg>
                </div>
              )}
            </div>

            {/* Thumbnails — vertical strip 88px wide, hidden on mobile */}
            {hasMultipleImages ? (
              <div
                className="hidden lg:flex flex-col flex-shrink-0 overflow-y-auto"
                style={{ gap: 8, width: 88, maxHeight: 552 }}
              >
                {images.map((img, i) => {
                  const active = selectedImageIndex === i;
                  return (
                    <button
                      key={`${img}-${i}`}
                      type="button"
                      onClick={() => setSelectedImageIndex(i)}
                      className="overflow-hidden flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors"
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: 'var(--radius-card)',
                        background: 'rgb(var(--color-foreground) / 0.03)',
                        border: '2px solid',
                        borderColor: active
                          ? 'rgb(var(--color-foreground))'
                          : 'transparent',
                      }}
                      aria-label={`Изображение ${i + 1}`}
                    >
                      <img
                        src={img}
                        alt={`${productName} — фото ${i + 1}`}
                        className="w-full h-full object-cover"
                        loading={i === 0 ? 'eager' : 'lazy'}
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductIsland;
