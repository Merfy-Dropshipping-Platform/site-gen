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
  const focusedRef = useRef(false);

  // Sync from props only when inputs are NOT focused (avoid overwriting user typing)
  useEffect(() => {
    if (!focusedRef.current) {
      setMin(priceMin?.toString() ?? '');
      setMax(priceMax?.toString() ?? '');
    }
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
    }, 800);
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

  const formatDisplay = (val: string) => {
    if (!val) return '0';
    return new Intl.NumberFormat('ru-RU').format(Number(val));
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    borderBottom: '1px solid rgb(var(--color-muted))',
  };

  return (
    <div>
      <h3
        className="font-[family-name:var(--font-body)]"
        style={{ fontSize: 16, lineHeight: '22px', color: 'rgb(var(--color-foreground))', marginBottom: 12 }}
      >
        Стоимость
      </h3>
      <div className="flex flex-col" style={{ gap: 0 }}>
        {/* Min row */}
        <div style={rowStyle} className="font-[family-name:var(--font-body)]">
          <span style={{ fontSize: 16, color: 'rgb(var(--color-muted))' }}>от</span>
          <div className="relative" style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              inputMode="numeric"
              value={min}
              onChange={handleMinChange}
              onFocus={() => { focusedRef.current = true; }}
              onBlur={() => { focusedRef.current = false; }}
              placeholder="0"
              className="font-[family-name:var(--font-body)]"
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 16,
                color: 'rgb(var(--color-muted))',
                textAlign: 'right',
                width: 80,
                padding: 0,
              }}
            />
            <span style={{ fontSize: 16, color: 'rgb(var(--color-muted))', marginLeft: 4 }}>&#8381;</span>
          </div>
        </div>
        {/* Max row */}
        <div style={rowStyle} className="font-[family-name:var(--font-body)]">
          <span style={{ fontSize: 16, color: 'rgb(var(--color-muted))' }}>до</span>
          <div className="relative" style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              inputMode="numeric"
              value={max}
              onChange={handleMaxChange}
              onFocus={() => { focusedRef.current = true; }}
              onBlur={() => { focusedRef.current = false; }}
              placeholder="0"
              className="font-[family-name:var(--font-body)]"
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 16,
                color: 'rgb(var(--color-muted))',
                textAlign: 'right',
                width: 80,
                padding: 0,
              }}
            />
            <span style={{ fontSize: 16, color: 'rgb(var(--color-muted))', marginLeft: 4 }}>&#8381;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
