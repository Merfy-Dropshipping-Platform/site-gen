// Хранилища браузера для модуля аналитики (design.md блока 11). localStorage и sessionStorage бывают недоступны: cookie
// запрещены, рамка с песочницей, Firefox с выключенным хранилищем (там localStorage — null). Тогда модуль работает с
// хранилищем этой страницы в памяти: ответ о согласии не прочитан — «не ответил», визит живёт до ухода со страницы.
// Сбоем секции это не считается — тихий запасной ход по прямому слову плана блока 11 (RULES.md, 3.7).
export interface KeyValue {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function pageStorage(): KeyValue {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

export function storageOf(open: () => KeyValue | null): KeyValue {
  try {
    return open() ?? pageStorage();
  } catch {
    return pageStorage();
  }
}
