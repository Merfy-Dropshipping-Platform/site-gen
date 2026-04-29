import { useCallback, useState } from 'react';

export interface DadataSuggestion {
  value: string;
  data: {
    fias_id?: string;
    city_fias_id?: string;
    postal_code?: string;
    city?: string;
    region_with_type?: string;
  };
}

let token: string | null = null;
function getDadataToken(): string | null {
  if (token) return token;
  if (typeof window === 'undefined') return null;
  token = (window as any).__DADATA_TOKEN__ ?? null;
  return token;
}

const URL_BY_KIND = {
  city: 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
  address: 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
} as const;

export function useDadata() {
  const [suggestions, setSuggestions] = useState<DadataSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const suggest = useCallback(async (kind: 'city' | 'address', query: string, opts?: { city?: string }) => {
    const tok = getDadataToken();
    if (!tok || query.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { query, count: 8 };
      if (kind === 'city') body.from_bound = { value: 'city' };
      if (kind === 'city') body.to_bound = { value: 'settlement' };
      if (kind === 'address' && opts?.city) {
        body.locations = [{ city: opts.city }];
      }
      const res = await fetch(URL_BY_KIND[kind], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${tok}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setSuggestions((json?.suggestions ?? []) as DadataSuggestion[]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setSuggestions([]), []);

  return { suggestions, loading, suggest, clear };
}
