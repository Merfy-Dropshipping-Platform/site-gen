import React from 'react';

const SORT_OPTIONS = [
  { value: 'popular', label: 'По популярности' },
  { value: 'newest', label: 'По новизне' },
  { value: 'price_asc', label: 'По возрастанию цены' },
  { value: 'price_desc', label: 'По убыванию цены' },
] as const;

interface SortRadiosProps {
  value: string;
  onChange: (sort: string) => void;
}

export function SortRadios({ value, onChange }: SortRadiosProps) {
  return (
    <div className="flex flex-wrap gap-2 sm:gap-3 font-[family-name:var(--font-body)]">
      {SORT_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="text-xs sm:text-sm transition-all"
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-button, 0px)',
              border: `1px solid ${isActive ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-border))'}`,
              backgroundColor: isActive ? 'rgb(var(--color-foreground))' : 'transparent',
              color: isActive ? 'rgb(var(--color-background))' : 'rgb(var(--color-muted))',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
