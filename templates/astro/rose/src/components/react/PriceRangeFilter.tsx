import React, { useState, useEffect, useRef } from 'react';

interface PriceRangeFilterProps {
  priceMin?: number;
  priceMax?: number;
  onChange: (min?: number, max?: number) => void;
}

export function PriceRangeFilter({ priceMin, priceMax, onChange }: PriceRangeFilterProps) {
  const [min, setMin] = useState(priceMin?.toString() ?? '');
  const [max, setMax] = useState(priceMax?.toString() ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setMin(priceMin?.toString() ?? '');
    setMax(priceMax?.toString() ?? '');
  }, [priceMin, priceMax]);

  const applyFilter = (newMin: string, newMax: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      let minVal = newMin ? Number(newMin) : undefined;
      let maxVal = newMax ? Number(newMax) : undefined;

      // Auto-swap if min > max
      if (minVal !== undefined && maxVal !== undefined && minVal > maxVal) {
        [minVal, maxVal] = [maxVal, minVal];
      }

      onChange(minVal, maxVal);
    }, 300);
  };

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setMin(val);
    applyFilter(val, max);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setMax(val);
    applyFilter(min, val);
  };

  const hasFilter = min !== '' || max !== '';

  const reset = () => {
    setMin('');
    setMax('');
    onChange(undefined, undefined);
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 font-[family-name:var(--font-heading)]">
        Цена
      </h3>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          inputMode="numeric"
          placeholder="от"
          value={min}
          onChange={handleMinChange}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-background)] text-sm text-[var(--color-text)] font-[family-name:var(--font-body)] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary-rgb))]"
        />
        <span className="text-[var(--color-text-muted)] text-sm">—</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="до"
          value={max}
          onChange={handleMaxChange}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-[var(--radius-base)] bg-[var(--color-background)] text-sm text-[var(--color-text)] font-[family-name:var(--font-body)] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-primary-rgb))]"
        />
      </div>
      {hasFilter && (
        <button
          onClick={reset}
          className="mt-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors underline"
        >
          Сбросить цену
        </button>
      )}
    </div>
  );
}
