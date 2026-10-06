import { describe, expect, it } from 'vitest';
import { buyerCredentials } from '../src/run/buyer';

// Значения выдуманы для теста. Настоящие почта и пароль покупателя живут только в окружении.
const EMAIL = 'buyer@stand.example';
const PASSWORD = 'not-a-real-password';

function errorText(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

describe('buyerCredentials', () => {
  it('берёт почту и пароль покупателя из окружения', () => {
    const env = { STAND_BUYER_EMAIL: EMAIL, STAND_BUYER_PASSWORD: PASSWORD };
    expect(buyerCredentials(env)).toEqual({ email: EMAIL, password: PASSWORD });
  });

  it('нет пароля — ошибка env-missing называет переменную', () => {
    expect(() => buyerCredentials({ STAND_BUYER_EMAIL: EMAIL })).toThrow(
      'env-missing: нужна переменная окружения STAND_BUYER_PASSWORD',
    );
  });

  it('пустая почта — как её нет; пароля в тексте ошибки нет', () => {
    const text = errorText(() => buyerCredentials({ STAND_BUYER_EMAIL: '', STAND_BUYER_PASSWORD: PASSWORD }));
    expect(text).toBe('env-missing: нужна переменная окружения STAND_BUYER_EMAIL');
    expect(text).not.toContain(PASSWORD);
  });
});
