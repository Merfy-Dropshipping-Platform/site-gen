import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ResendTimer from '../ResendTimer';

describe('ResendTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with initial seconds and shows countdown', () => {
    render(<ResendTimer seconds={10} id="test" />);
    expect(screen.getByTestId('resend-countdown').textContent).toBe('10 сек.');
  });

  it('decrements each second', () => {
    render(<ResendTimer seconds={3} />);
    expect(screen.getByTestId('resend-countdown').textContent).toBe('3 сек.');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('resend-countdown').textContent).toBe('2 сек.');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('resend-countdown').textContent).toBe('1 сек.');
  });

  it('disables button until countdown reaches 0', () => {
    render(<ResendTimer seconds={2} />);
    const btn = screen.getByTestId('resend-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // step-by-step so each state update flushes through React
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(btn.disabled).toBe(false);
    expect(screen.queryByTestId('resend-countdown')).toBeNull();
  });

  it('dispatches otp:resend-request event on active click', () => {
    render(<ResendTimer seconds={1} id="timer-x" />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const btn = screen.getByTestId('resend-button') as HTMLButtonElement;
    btn.click();
    const call = dispatchSpy.mock.calls.find((c) => (c[0] as CustomEvent).type === 'otp:resend-request');
    expect(call).toBeTruthy();
    expect((call?.[0] as CustomEvent).detail.id).toBe('timer-x');
    dispatchSpy.mockRestore();
  });

  it('resets countdown when receiving otp:resend-ack', () => {
    render(<ResendTimer seconds={1} id="timer-ack" />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('otp:resend-ack', { detail: { id: 'timer-ack', seconds: 5 } }));
    });
    expect(screen.getByTestId('resend-countdown').textContent).toBe('5 сек.');
  });
});
