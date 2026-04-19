/**
 * ResendTimer — React island: countdown with CTA "Resend code".
 * While timer > 0 shows "N sec." (disabled). At timer === 0 shows active button,
 * click emits 'otp:resend-request' event for parent script.
 */
import { useEffect, useState } from 'react';

interface Props {
  /** Initial seconds countdown. */
  seconds?: number;
  /** ID for DOM identification. */
  id?: string;
}

export default function ResendTimer({ seconds = 60, id = 'otp-resend' }: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  // Parent script can reset timer via 'otp:resend-ack'
  useEffect(() => {
    function onAck(event: Event) {
      const ce = event as CustomEvent<{ id?: string; seconds?: number }>;
      if (ce.detail?.id && ce.detail.id !== id) return;
      setRemaining(ce.detail?.seconds ?? seconds);
      setSending(false);
    }
    window.addEventListener('otp:resend-ack', onAck as EventListener);
    return () => window.removeEventListener('otp:resend-ack', onAck as EventListener);
  }, [id, seconds]);

  const handleClick = () => {
    if (remaining > 0 || sending) return;
    setSending(true);
    window.dispatchEvent(new CustomEvent('otp:resend-request', { detail: { id } }));
    // Fallback: restart timer after 3s if no ack
    setTimeout(() => {
      if (sending) {
        setRemaining(seconds);
        setSending(false);
      }
    }, 3000);
  };

  const label = sending ? 'Отправка...' : 'Отправить код повторно';
  const active = remaining === 0 && !sending;

  return (
    <div id={id} className="flex flex-col items-center gap-2" data-testid="resend-timer">
      <button
        type="button"
        className={active ? 'auth-link' : 'auth-link-muted'}
        disabled={!active}
        onClick={handleClick}
        aria-disabled={!active}
        data-testid="resend-button"
      >
        {label}
      </button>
      {remaining > 0 && !sending && (
        <span className="text-center text-base" style={{ color: '#444444' }} data-testid="resend-countdown">{remaining} сек.</span>
      )}
    </div>
  );
}
