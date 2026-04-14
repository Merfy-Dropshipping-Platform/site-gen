import React, { useState, useRef, useEffect } from 'react';

const COLOR_MAP: Record<string, string> = {
  'Белый': '#FFFFFF',
  'Чёрный': '#000000',
  'Черный': '#000000',
  'Красный': '#E53935',
  'Синий': '#1E88E5',
  'Голубой': '#42A5F5',
  'Зелёный': '#43A047',
  'Зеленый': '#43A047',
  'Жёлтый': '#FDD835',
  'Желтый': '#FDD835',
  'Оранжевый': '#FB8C00',
  'Розовый': '#EC407A',
  'Фиолетовый': '#8E24AA',
  'Серый': '#9E9E9E',
  'Коричневый': '#795548',
  'Бежевый': '#D7CCC8',
};

function getColorHex(name: string): string {
  return COLOR_MAP[name] ?? '#CCCCCC';
}

interface ColorFilterDropdownProps {
  colors: string[];
  selected?: string;
  onChange: (color: string | undefined) => void;
}

export function ColorFilterDropdown({ colors, selected, onChange }: ColorFilterDropdownProps) {
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

  if (colors.length === 0) return null;

  const displayLabel = selected || 'Все';
  const displayColor = selected ? getColorHex(selected) : undefined;

  return (
    <div>
      <h3
        className="font-[family-name:var(--font-body)]"
        style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-foreground))', marginBottom: 15 }}
      >
        Цвет
      </h3>
      <div ref={ref} className="relative">
        {/* Trigger */}
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center font-[family-name:var(--font-body)]"
          style={{
            width: 285,
            height: 60,
            padding: '10px 15px',
            border: '1px solid rgb(var(--color-muted))',
            borderRadius: 0,
            backgroundColor: 'rgb(var(--color-background))',
            fontSize: 20,
            lineHeight: '27px',
            color: 'rgb(var(--color-foreground))',
          }}
        >
          {displayColor && (
            <span
              className="shrink-0"
              style={{
                width: 30,
                height: 30,
                borderRadius: 5,
                backgroundColor: displayColor,
                border: displayColor === '#FFFFFF' ? '1px solid rgb(var(--color-muted))' : 'none',
                marginRight: 15,
              }}
            />
          )}
          <span className="flex-1 text-left">{displayLabel}</span>
          <svg
            width="24" height="24" viewBox="0 0 24 24" fill="none"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute left-0 w-full z-10"
            style={{
              top: 64,
              border: '1px solid rgb(var(--color-muted))',
              borderRadius: 0,
              backgroundColor: 'rgb(var(--color-background))',
              maxHeight: 300,
              overflowY: 'auto',
            }}
          >
            {/* "Все" option */}
            <button
              onClick={() => { onChange(undefined); setOpen(false); }}
              className="w-full flex items-center font-[family-name:var(--font-body)] hover:opacity-70"
              style={{
                padding: '10px 15px',
                fontSize: 20,
                lineHeight: '27px',
                color: !selected ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
              }}
            >
              Все
            </button>
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => { onChange(color); setOpen(false); }}
                className="w-full flex items-center font-[family-name:var(--font-body)] hover:opacity-70"
                style={{
                  padding: '10px 15px',
                  fontSize: 20,
                  lineHeight: '27px',
                  color: selected === color ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
                }}
              >
                <span
                  className="shrink-0"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 5,
                    backgroundColor: getColorHex(color),
                    border: getColorHex(color) === '#FFFFFF' ? '1px solid rgb(var(--color-muted))' : 'none',
                    marginRight: 15,
                  }}
                />
                {color}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
