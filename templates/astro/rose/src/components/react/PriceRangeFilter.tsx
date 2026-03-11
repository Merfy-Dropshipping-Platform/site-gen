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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 60,
    padding: '10px 15px',
    border: '1px solid rgb(var(--color-muted))',
    borderRadius: 10,
    backgroundColor: 'rgb(var(--color-background))',
    fontSize: 20,
    lineHeight: '27px',
    fontWeight: 300,
    color: 'rgb(var(--color-foreground))',
    outline: 'none',
  };

  return (
    <div>
      <h3
        className="font-[family-name:var(--font-body)]"
        style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-foreground))', marginBottom: 15 }}
      >
        Стоимость
      </h3>
      <div className="flex flex-col" style={{ gap: 10 }}>
        {/* Min input */}
        <div className="relative font-[family-name:var(--font-body)]">
          <span
            className="absolute left-[15px] top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ fontSize: 20, lineHeight: '27px', fontWeight: 300, color: 'rgb(var(--color-muted))' }}
          >
            от
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={min}
            onChange={handleMinChange}
            className="font-[family-name:var(--font-body)]"
            style={{ ...inputStyle, paddingLeft: 45 }}
          />
          <span
            className="absolute right-[15px] top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ fontSize: 20, lineHeight: '27px', fontWeight: 300, color: 'rgb(var(--color-muted))' }}
          >
            ₽
          </span>
        </div>
        {/* Max input */}
        <div className="relative font-[family-name:var(--font-body)]">
          <span
            className="absolute left-[15px] top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ fontSize: 20, lineHeight: '27px', fontWeight: 300, color: 'rgb(var(--color-muted))' }}
          >
            до
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={max}
            onChange={handleMaxChange}
            className="font-[family-name:var(--font-body)]"
            style={{ ...inputStyle, paddingLeft: 45 }}
          />
          <span
            className="absolute right-[15px] top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ fontSize: 20, lineHeight: '27px', fontWeight: 300, color: 'rgb(var(--color-muted))' }}
          >
            ₽
          </span>
        </div>
      </div>
    </div>
  );
}
