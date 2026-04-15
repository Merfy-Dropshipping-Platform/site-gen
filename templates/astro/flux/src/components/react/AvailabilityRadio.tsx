import React from 'react';

const OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'in_stock', label: 'В наличии' },
  { value: 'sold_out', label: 'Распродано' },
] as const;

interface AvailabilityRadioProps {
  value: string;
  onChange: (v: string) => void;
}

export function AvailabilityRadio({ value, onChange }: AvailabilityRadioProps) {
  const selected = value || 'all';

  return (
    <div>
      <h3
        className="font-[family-name:var(--font-body)]"
        style={{ fontSize: 20, lineHeight: '27px', color: 'rgb(var(--color-foreground))' }}
      >
        Наличие
      </h3>
      <div className="flex flex-col" style={{ gap: 10, marginTop: 15 }}>
        {OPTIONS.map((opt) => {
          const isActive = selected === opt.value;
          return (
            <label key={opt.value} className="flex items-center cursor-pointer" style={{ gap: 10 }}>
              {/* Custom radio circle */}
              <span
                className="flex items-center justify-center shrink-0"
                style={{ width: 24, height: 24 }}
              >
                <span
                  className="rounded-full border-2 flex items-center justify-center"
                  style={{
                    width: 20,
                    height: 20,
                    borderColor: isActive ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
                  }}
                >
                  {isActive && (
                    <span
                      className="rounded-full"
                      style={{
                        width: 10,
                        height: 10,
                        backgroundColor: 'rgb(var(--color-foreground))',
                      }}
                    />
                  )}
                </span>
              </span>
              <span
                className="font-[family-name:var(--font-body)]"
                style={{
                  fontSize: 20,
                  lineHeight: '27px',
                  color: isActive ? 'rgb(var(--color-foreground))' : 'rgb(var(--color-muted))',
                }}
              >
                {opt.label}
              </span>
              <input
                type="radio"
                name="availability"
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
