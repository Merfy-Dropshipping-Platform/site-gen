// Глубокая заморозка (design.md блока 5, разделы 3.2 и 3.5): входные данные, детали событий и значения сторов секция
// только читает. Уже замороженный объект не обходится: ядро замораживает объекты целиком, вместе с вложенными.
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.keys(value).forEach((key) => {
    const item: unknown = Reflect.get(value, key);
    deepFreeze(item);
  });
  return value;
}
