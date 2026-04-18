/**
 * OtpInput — React island: 4 digit cells with auto-focus, backspace navigation, paste support.
 * SSR рендерит 4 placeholder-ячейки (все показывают "0" neutral-400); после гидратации — интерактив.
 * Emit глобального события 'otp:complete' когда все 4 цифры заполнены.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  length?: number;
  autoFocus?: boolean;
  /** Имя скрытого input для form submit (value = concatenated digits). */
  name?: string;
  /** Id wrapper — для DOM-обращения из родительского скрипта. */
  id?: string;
}

export default function OtpInput({ length = 4, autoFocus = true, name = 'otp', id = 'otp-input' }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus && inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, [autoFocus]);

  const updateDigit = (index: number, value: string) => {
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);

    if (value && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    const joined = newDigits.join('');
    if (joined.length === length && !newDigits.includes('')) {
      // Emit событие для родительского script/form
      window.dispatchEvent(
        new CustomEvent('otp:complete', { detail: { id, value: joined } }),
      );
    }
  };

  const handleChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.replace(/\D/g, '');
    if (!raw) {
      updateDigit(index, '');
      return;
    }
    // Если вставили сразу несколько цифр (paste в одну ячейку)
    if (raw.length > 1) {
      handlePasteValue(raw);
      return;
    }
    updateDigit(index, raw[0]);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      if (digits[index]) {
        updateDigit(index, '');
      } else if (index > 0) {
        inputsRef.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        event.preventDefault();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
      event.preventDefault();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
      event.preventDefault();
    }
  };

  const handlePasteValue = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, length);
    if (!cleaned) return;
    const newDigits = Array(length).fill('');
    cleaned.split('').forEach((d, i) => {
      newDigits[i] = d;
    });
    setDigits(newDigits);
    const focusIdx = Math.min(cleaned.length, length - 1);
    inputsRef.current[focusIdx]?.focus();
    if (cleaned.length === length) {
      window.dispatchEvent(
        new CustomEvent('otp:complete', { detail: { id, value: cleaned } }),
      );
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    handlePasteValue(pasted);
  };

  const joined = digits.join('');

  return (
    <div id={id} className="w-full flex justify-center items-center gap-1">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={digit}
          placeholder="0"
          data-filled={digit ? 'true' : 'false'}
          data-testid={`otp-cell-${index}`}
          aria-label={`Цифра ${index + 1}`}
          className="auth-otp-cell"
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
        />
      ))}
      <input type="hidden" name={name} value={joined} data-testid="otp-value" />
    </div>
  );
}
