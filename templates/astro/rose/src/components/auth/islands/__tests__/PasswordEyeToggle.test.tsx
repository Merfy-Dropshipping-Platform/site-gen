import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordEyeToggle from '../PasswordEyeToggle';

describe('PasswordEyeToggle', () => {
  it('toggles associated input between password and text types', () => {
    const input = document.createElement('input');
    input.type = 'password';
    input.id = 'pwd-field';
    document.body.appendChild(input);

    render(<PasswordEyeToggle targetId="pwd-field" />);
    const btn = screen.getByTestId('password-eye-toggle-pwd-field');

    // initial state: hidden (password)
    expect(input.type).toBe('password');
    expect(btn.getAttribute('aria-label')).toBe('Показать пароль');

    fireEvent.click(btn);
    expect(input.type).toBe('text');
    expect(btn.getAttribute('aria-label')).toBe('Скрыть пароль');

    fireEvent.click(btn);
    expect(input.type).toBe('password');
    expect(btn.getAttribute('aria-label')).toBe('Показать пароль');

    input.remove();
  });

  it('does not crash when target element is missing', () => {
    expect(() => render(<PasswordEyeToggle targetId="nonexistent" />)).not.toThrow();
  });
});
