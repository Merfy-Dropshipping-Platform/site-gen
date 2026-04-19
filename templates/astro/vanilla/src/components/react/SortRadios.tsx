import React from 'react';

const SORT_OPTIONS = [
  { value: 'popular', label: 'По популярности' },
  { value: 'newest', label: 'По новизне' },
  { value: 'price_desc', label: 'По убыванию цены' },
  { value: 'price_asc', label: 'По возрастанию цены' },
] as const;

interface SortRadiosProps {
  value: string;
  onChange: (sort: string) => void;
}

export function SortRadios({ value, onChange }: SortRadiosProps) {
  return (
    <div>
      <h3
        className="font-[family-name:var(--font-body)]"
        style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-foreground))', marginBottom: 12 }}
      >
        Сортировать
      </h3>
      <div
        className="flex flex-col"
        style={{ gap: 12, padding: 12, borderRadius: 8, backgroundColor: 'rgb(var(--color-background))' }}
      >
        {SORT_OPTIONS.map((opt) => {
          const isActive = value === opt.value;
          return (
            <label key={opt.value} className="flex items-center cursor-pointer" style={{ gap: 8 }}>
              {/* Custom radio circle */}
              <span
                className="flex items-center justify-center shrink-0"
                style={{ width: 24, height: 24 }}
              >
                <span
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 18,
                    height: 18,
                    border: `2px solid ${isActive ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))'}`,
                  }}
                >
                  {isActive && (
                    <span
                      className="rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        backgroundColor: 'rgb(var(--color-foreground))',
                      }}
                    />
                  )}
                </span>
              </span>
              <span
                className="font-[family-name:var(--font-body)]"
                style={{
                  fontSize: 16,
                  lineHeight: '22px',
                  color: isActive ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
                }}
              >
                {opt.label}
              </span>
              <input
                type="radio"
                name="sort"
                value={opt.value}
                checked={isActive}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
