import { useMemo, useState } from 'react';
import { usePickupPoints, type PickupPoint } from '../hooks/usePickupPoints';

interface Props {
  selectedCode: string | null;
  onPick: (point: PickupPoint) => void;
}

/**
 * Список ПВЗ для выбранного города. Раскрывается под cdek_pvz радио-кнопкой
 * в DeliveryMethodSection. Поиск по адресу/названию, click → onPick(point).
 * Сначала PVZ, потом POSTAMAT (постаматы).
 */
export function PickupPointPicker({ selectedCode, onPick }: Props) {
  const { points, loading, error, refresh } = usePickupPoints();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...points].sort((a, b) => {
      // PVZ перед POSTAMAT
      if (a.type !== b.type) return a.type === 'PVZ' ? -1 : 1;
      return a.address.localeCompare(b.address, 'ru');
    });
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.address.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q),
    );
  }, [points, query]);

  if (loading) {
    return (
      <div className="mt-3 px-3 py-2 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
        Загружаем пункты выдачи…
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-3 px-3 py-2 text-[length:var(--size-small)] text-[rgb(var(--color-error,252,165,165))]">
        {error}{' '}
        <button
          type="button"
          onClick={refresh}
          className="underline underline-offset-2 hover:no-underline"
        >
          Повторить
        </button>
      </div>
    );
  }
  if (!points.length) {
    return (
      <div className="mt-3 px-3 py-2 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
        Нет доступных пунктов выдачи в этом городе.
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] bg-[rgb(var(--color-bg))] p-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Поиск среди ${points.length} ${points.length === 1 ? 'пункта' : 'пунктов'}…`}
        className="w-full h-10 px-3 [font-family:var(--font-body)] text-[length:var(--size-body)] text-[rgb(var(--color-text))] bg-[rgb(var(--color-input-bg,255,255,255))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] outline-none focus:border-[rgb(var(--color-text)/.4)]"
      />
      <ul className="max-h-[300px] overflow-auto flex flex-col">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-[length:var(--size-small)] text-[rgb(var(--color-muted))]">
            Ничего не найдено
          </li>
        )}
        {filtered.map((p) => {
          const selected = selectedCode === p.code;
          return (
            <li key={p.code}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 rounded-[var(--radius-input,4px)] transition-colors ${
                  selected
                    ? 'bg-[rgb(var(--color-text)/.06)] outline outline-1 outline-[rgb(var(--color-text))]'
                    : 'hover:bg-[rgb(var(--color-text)/.04)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="[font-family:var(--font-body)] text-[length:var(--size-small)] text-[rgb(var(--color-text))] flex-1">
                    {p.address}
                  </span>
                  <span className="text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))] uppercase tracking-wider flex-shrink-0">
                    {p.type === 'POSTAMAT' ? 'постамат' : 'пвз'}
                  </span>
                </div>
                {p.workTime && (
                  <div className="text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))]">
                    {p.workTime}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
