import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OtpInput from '../OtpInput';

describe('OtpInput', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
  });

  it('renders 4 cells by default', () => {
    render(<OtpInput />);
    for (let i = 0; i < 4; i += 1) {
      expect(screen.getByTestId(`otp-cell-${i}`)).toBeTruthy();
    }
  });

  it('renders a hidden input named "otp" with empty initial value', () => {
    render(<OtpInput />);
    const hidden = screen.getByTestId('otp-value') as HTMLInputElement;
    expect(hidden.type).toBe('hidden');
    expect(hidden.name).toBe('otp');
    expect(hidden.value).toBe('');
  });

  it('advances focus to next cell after typing a digit', () => {
    render(<OtpInput />);
    const first = screen.getByTestId('otp-cell-0') as HTMLInputElement;
    const second = screen.getByTestId('otp-cell-1') as HTMLInputElement;
    fireEvent.change(first, { target: { value: '3' } });
    expect(second).toBe(document.activeElement);
  });

  it('emits otp:complete CustomEvent when all 4 digits filled via sequential typing', () => {
    render(<OtpInput id="test-otp" />);
    const cells = [0, 1, 2, 3].map((i) => screen.getByTestId(`otp-cell-${i}`) as HTMLInputElement);
    fireEvent.change(cells[0], { target: { value: '1' } });
    fireEvent.change(cells[1], { target: { value: '2' } });
    fireEvent.change(cells[2], { target: { value: '3' } });
    fireEvent.change(cells[3], { target: { value: '4' } });
    const completeCall = dispatchSpy.mock.calls.find((c) => (c[0] as CustomEvent).type === 'otp:complete');
    expect(completeCall).toBeTruthy();
    const detail = (completeCall?.[0] as CustomEvent).detail;
    expect(detail.value).toBe('1234');
    expect(detail.id).toBe('test-otp');
  });

  it('handles backspace by clearing current, then moving to previous when already empty', () => {
    render(<OtpInput />);
    const first = screen.getByTestId('otp-cell-0') as HTMLInputElement;
    const second = screen.getByTestId('otp-cell-1') as HTMLInputElement;
    fireEvent.change(first, { target: { value: '5' } });
    expect(second).toBe(document.activeElement);
    // backspace on empty second cell → focus returns to first, first clears
    fireEvent.keyDown(second, { key: 'Backspace' });
    expect(first).toBe(document.activeElement);
  });

  it('supports pasting a 4-digit code into any cell', () => {
    render(<OtpInput id="paste-otp" />);
    const first = screen.getByTestId('otp-cell-0') as HTMLInputElement;
    fireEvent.paste(first, {
      clipboardData: { getData: () => '9876' },
    });
    const hidden = screen.getByTestId('otp-value') as HTMLInputElement;
    expect(hidden.value).toBe('9876');
    const completeCall = dispatchSpy.mock.calls.find((c) => (c[0] as CustomEvent).type === 'otp:complete');
    expect((completeCall?.[0] as CustomEvent).detail.value).toBe('9876');
  });

  it('strips non-digits on paste and clamps to 4 chars', () => {
    render(<OtpInput />);
    const first = screen.getByTestId('otp-cell-0') as HTMLInputElement;
    fireEvent.paste(first, {
      clipboardData: { getData: () => 'ab12-cd34xx' },
    });
    const hidden = screen.getByTestId('otp-value') as HTMLInputElement;
    expect(hidden.value).toBe('1234');
  });
});
