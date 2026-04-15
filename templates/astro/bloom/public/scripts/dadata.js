/**
 * DaData address suggestions module
 * Подсказки адресов через DaData Suggestions API
 */

const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

/** @type {number|null} */
let _debounceTimer = null;

/**
 * Запрос подсказок адреса из DaData
 * @param {string} query - Текст запроса (адрес)
 * @param {string} token - API-токен DaData
 * @returns {Promise<Array<{value: string, data: {city: string, city_fias_id: string, street_with_type: string, house: string, block: string, flat: string, postal_code: string, fias_id: string, kladr_id: string, geo_lat: string, geo_lon: string}}>>}
 */
async function fetchAddressSuggestions(query, token) {
  if (!query || query.trim().length < MIN_QUERY_LENGTH) {
    return [];
  }

  try {
    const res = await fetch(DADATA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Token ${token}`,
      },
      body: JSON.stringify({ query: query.trim(), count: 5 }),
    });

    if (!res.ok) {
      console.warn(`[DaData] HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const json = await res.json();
    const suggestions = json.suggestions || [];

    return suggestions.map((s) => ({
      value: s.value,
      data: {
        city: s.data.city || '',
        city_fias_id: s.data.city_fias_id || '',
        street_with_type: s.data.street_with_type || '',
        house: s.data.house || '',
        block: s.data.block || '',
        flat: s.data.flat || '',
        postal_code: s.data.postal_code || '',
        fias_id: s.data.fias_id || '',
        kladr_id: s.data.kladr_id || '',
        geo_lat: s.data.geo_lat || '',
        geo_lon: s.data.geo_lon || '',
      },
    }));
  } catch (err) {
    console.warn('[DaData] Ошибка запроса подсказок:', err.message || err);
    return [];
  }
}

/**
 * Обёртка с debounce для подсказок адреса
 * Вызывает callback с результатами после паузы в наборе текста
 * @param {string} query - Текст запроса
 * @param {string} token - API-токен DaData
 * @param {(suggestions: Array) => void} callback - Функция-обработчик результатов
 */
function fetchAddressSuggestionsDebounced(query, token, callback) {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }

  if (!query || query.trim().length < MIN_QUERY_LENGTH) {
    callback([]);
    return;
  }

  _debounceTimer = setTimeout(async () => {
    const results = await fetchAddressSuggestions(query, token);
    callback(results);
  }, DEBOUNCE_MS);
}

export { fetchAddressSuggestions, fetchAddressSuggestionsDebounced };
