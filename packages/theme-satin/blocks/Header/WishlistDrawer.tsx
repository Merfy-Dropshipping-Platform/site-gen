import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  useWishlist,
  $wishlistCount,
} from '../../../../../packages/storefront/wishlist';

interface WishlistProductData {
  id: string;
  title: string;
  handle: string;
  price: number;
  compareAtPrice?: number | null;
  image?: string | null;
}

function formatRub(kopecks: number): string {
  const rub = kopecks / 100;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rub);
}

const FONT_HEAD = "'Kelly Slab', serif";
const FONT_BODY = "'Arsenal', sans-serif";
const FONT_BTN = "'Manrope', sans-serif";

function pickImage(p: any): string | null {
  const img = Array.isArray(p?.images) ? p.images[0] : null;
  if (typeof img === 'string') return img;
  if (img && typeof img.url === 'string') return img.url;
  if (typeof p?.image === 'string') return p.image;
  return null;
}

async function fetchProductById(id: string): Promise<WishlistProductData | null> {
  const cfg = (window as any).__MERFY_CONFIG__ || {};
  const apiUrl = cfg.apiUrl || '/api';
  const shopId = cfg.shopId || '';
  if (!shopId) return null;
  try {
    const res = await fetch(
      `${apiUrl}/store/products/${encodeURIComponent(id)}?store_id=${encodeURIComponent(shopId)}`,
      { headers: { 'X-Shop-Id': shopId } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const p = json?.data ?? json?.product ?? json;
    if (!p?.id) return null;
    return {
      id: p.id,
      title: p.title || '',
      handle: p.handle || p.slug || p.id,
      price: typeof p.price === 'number' ? p.price : 0,
      compareAtPrice: p.compareAtPrice ?? null,
      image: pickImage(p),
    };
  } catch {
    return null;
  }
}

export default function WishlistDrawer() {
  const [open, setOpen] = useState(false);
  const [productMap, setProductMap] = useState<Map<string, WishlistProductData>>(new Map());
  const [loading, setLoading] = useState(false);
  const { items, remove } = useWishlist();
  const wlCount = useStore($wishlistCount);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('wishlist:open', handler);
    return () => window.removeEventListener('wishlist:open', handler);
  }, []);

  useEffect(() => {
    const badges = document.querySelectorAll<HTMLElement>('[data-wishlist-badge]');
    badges.forEach((badge) => {
      if (wlCount > 0) {
        badge.textContent = wlCount > 99 ? '99+' : String(wlCount);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });
  }, [wlCount]);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = '';
      return;
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    const missing = items
      .map((i) => i.productId)
      .filter((id) => !productMap.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(missing.map(fetchProductById))
      .then((results) => {
        if (cancelled) return;
        const next = new Map(productMap);
        results.forEach((r) => {
          if (r) next.set(r.id, r);
        });
        setProductMap(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [items, productMap]);

  if (!open) return null;

  const renderItems = items
    .slice()
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((it) => productMap.get(it.productId))
    .filter((p): p is WishlistProductData => Boolean(p));

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end"
      role="dialog"
      aria-label="Любимые товары"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-[590px] h-full bg-[#f5f5f5] flex flex-col animate-wl-slide-in"
        style={{ fontFamily: FONT_BODY }}
      >
        <div className="relative h-[104px] flex-shrink-0">
          <h2
            className="absolute m-0 uppercase text-[20px] text-black leading-[normal]"
            style={{
              left: '40px',
              top: '40px',
              fontFamily: FONT_HEAD,
              fontWeight: 400,
            }}
          >
            Любимые товары
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute uppercase text-[16px] text-[#999] hover:text-black transition-colors"
            style={{
              right: '40px',
              top: '40px',
              fontFamily: FONT_BODY,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label="Закрыть избранное"
          >
            Скрыть
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '0 40px 40px' }}>
          {renderItems.length === 0 ? (
            <div
              className="text-[14px] text-[#999] uppercase pt-[20px]"
              style={{ fontFamily: FONT_BODY }}
            >
              {loading && items.length > 0 ? 'Загрузка…' : 'Пусто'}
            </div>
          ) : (
            <ul
              className="flex flex-col list-none m-0 p-0"
              style={{ gap: '16px' }}
            >
              {renderItems.map((p) => {
                const hasDiscount =
                  p.compareAtPrice != null && p.compareAtPrice > p.price;
                return (
                  <li
                    key={p.id}
                    className="relative w-full"
                    style={{ height: '80px' }}
                  >
                    <a
                      href={`/product/${p.handle}`}
                      className="absolute block"
                      style={{ left: 0, top: 0, width: 80, height: 80 }}
                      aria-label={p.title}
                      onClick={() => setOpen(false)}
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#e0e0e0]" />
                      )}
                      {hasDiscount && (
                        <span
                          className="absolute uppercase flex items-center justify-center bg-black"
                          style={{
                            left: 0,
                            top: 60,
                            height: 20,
                            padding: '0 4px',
                            fontFamily: FONT_BTN,
                            fontWeight: 500,
                            fontSize: 10,
                            color: '#eee',
                            lineHeight: 1,
                          }}
                        >
                          Скидка
                        </span>
                      )}
                    </a>

                    <a
                      href={`/product/${p.handle}`}
                      onClick={() => setOpen(false)}
                      className="absolute uppercase no-underline whitespace-nowrap overflow-hidden"
                      style={{
                        left: 96,
                        top: 13,
                        transform: 'translateY(-50%)',
                        fontFamily: FONT_BODY,
                        fontSize: 16,
                        color: '#000',
                        maxWidth: '370px',
                        textOverflow: 'ellipsis',
                        lineHeight: 'normal',
                      }}
                    >
                      {p.title}
                    </a>
                    <span
                      className="absolute"
                      style={{
                        left: 96,
                        top: 36,
                        transform: 'translateY(-50%)',
                        fontFamily: FONT_BODY,
                        fontSize: 14,
                        color: '#000',
                        lineHeight: 'normal',
                      }}
                    >
                      {formatRub(p.price)}
                    </span>
                    {hasDiscount && (
                      <span
                        className="absolute line-through"
                        style={{
                          left: 138,
                          top: 36.5,
                          transform: 'translateY(-50%)',
                          fontFamily: FONT_BODY,
                          fontSize: 12,
                          color: '#999',
                          lineHeight: 'normal',
                        }}
                      >
                        {formatRub(p.compareAtPrice!)}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="absolute flex items-center justify-center hover:opacity-70 transition-opacity"
                      style={{
                        right: 0,
                        top: 4,
                        width: 24,
                        height: 24,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#e53935',
                        padding: 0,
                      }}
                      aria-label={`Убрать ${p.title} из избранного`}
                    >
                      <svg
                        width="22"
                        height="20"
                        viewBox="0 0 22 20"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 18.35l-1.45-1.32C4.4 12.36 1 9.28 1 5.5 1 2.42 3.42 0 6.5 0c1.74 0 3.41.81 4.5 2.09C12.09.81 13.76 0 15.5 0 18.58 0 21 2.42 21 5.5c0 3.78-3.4 6.86-8.55 11.54L11 18.35z" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <style>{`
          @keyframes wlSlideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .animate-wl-slide-in {
            animation: wlSlideIn 0.3s ease-out;
          }
        `}</style>
      </div>
    </div>
  );
}
