// Что бросила функция: тесты сверяют код и путь ошибки пакета через toMatchObject.
export function thrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('функция не бросила ошибку');
}

// То же для асинхронной функции.
export async function rejected(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('функция не бросила ошибку');
}
