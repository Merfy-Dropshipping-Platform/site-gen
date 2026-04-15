import React, { useState, useRef, useEffect } from 'react';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Новинки' },
  { value: 'popular', label: 'Популярности' },
  { value: 'price_asc', label: 'Цена ↑' },
  { value: 'price_desc', label: 'Цена ↓' },
] as const;

interface SortDropdownProps {
  value: string;
  onChange: (sort: string) => void;
}

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLabel = SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Новинки';

  return (
    <div ref={ref} className="relative font-[family-name:var(--font-body)] text-sm sm:text-xl" style={{ lineHeight: '27px' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 sm:gap-[25px]"
      >
        <span className="hidden sm:inline" style={{ color: 'rgb(var(--color-muted))' }}>Сортировать по:</span>
        <span className="sm:hidden" style={{ color: 'rgb(var(--color-muted))' }}>Сорт:</span>
        <span className="flex items-center" style={{ gap: 8, color: 'rgb(var(--color-foreground))' }}>
          {activeLabel}
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            className="sm:w-6 sm:h-6"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-10"
          style={{
            top: 36,
            border: '1px solid rgb(var(--color-muted))',
            borderRadius: 0,
            backgroundColor: 'rgb(var(--color-background))',
            minWidth: 180,
            padding: '8px 0',
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left hover:opacity-70 text-sm sm:text-xl"
              style={{
                padding: '8px 15px',
                lineHeight: '27px',
                color: value === opt.value ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
