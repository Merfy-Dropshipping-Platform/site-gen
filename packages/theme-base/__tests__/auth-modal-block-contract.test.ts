import path from 'node:path';
import { validateBlock } from '@merfy/theme-contract/validators/validateBlock';
import {
  AuthModalPuckConfig,
  AuthModalSchema,
  AuthModalTokens,
  AuthModalClasses,
} from '../blocks/AuthModal';

describe('AuthModal chrome block', () => {
  it('conforms to validateBlock', async () => {
    const dir = path.resolve(__dirname, '../blocks/AuthModal');
    const result = await validateBlock(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is singleton (maxInstances: 1)', () => {
    expect(AuthModalPuckConfig.maxInstances).toBe(1);
  });

  it('category is layout', () => {
    expect(AuthModalPuckConfig.category).toBe('layout');
  });

  it('schema parses all four modes (login, register, otp, closed)', () => {
    const modes: Array<'login' | 'register' | 'otp' | 'closed'> = [
      'login',
      'register',
      'otp',
      'closed',
    ];
    for (const mode of modes) {
      const result = AuthModalSchema.safeParse({
        mode,
        siteTitle: 'Test Shop',
        showSocialLogin: false,
        colorScheme: 1,
        padding: { top: 32, bottom: 32 },
      });
      expect(result.success).toBe(true);
    }
  });

  it('tokens include button, input, error (form primitives)', () => {
    expect(AuthModalTokens).toContain('--color-button-bg');
    expect(AuthModalTokens).toContain('--radius-input');
    expect(AuthModalTokens).toContain('--color-error');
    expect(AuthModalTokens).toContain('--radius-button');
  });

  it('classes expose root + form variants + submit', () => {
    expect(AuthModalClasses.root).toBeDefined();
    expect(AuthModalClasses.loginForm).toBeDefined();
    expect(AuthModalClasses.registerForm).toBeDefined();
    expect(AuthModalClasses.otpForm).toBeDefined();
    expect(AuthModalClasses.submitBtn).toBeDefined();
  });
});
