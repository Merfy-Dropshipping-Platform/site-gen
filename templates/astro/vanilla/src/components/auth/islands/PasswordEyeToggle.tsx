/**
 * PasswordEyeToggle — React island: show/hide password toggle button.
 * Toggles type attribute of the associated input between 'password' and 'text'.
 */
import { useState, useEffect } from 'react';

interface Props {
  targetId: string; // id of the password input
  initialHidden?: boolean;
}

export default function PasswordEyeToggle({ targetId, initialHidden = true }: Props) {
  const [hidden, setHidden] = useState(initialHidden);

  useEffect(() => {
    const input = document.getElementById(targetId) as HTMLInputElement | null;
    if (input) {
      input.type = hidden ? 'password' : 'text';
    }
  }, [hidden, targetId]);

  return (
    <button
      type="button"
      className="auth-eye-toggle"
      aria-label={hidden ? 'Показать пароль' : 'Скрыть пароль'}
      onClick={() => setHidden((h) => !h)}
      data-testid={`password-eye-toggle-${targetId}`}
    >
      {hidden ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M10 4.5C5 4.5 1.73 8.11 0.75 10c0.98 1.89 4.25 5.5 9.25 5.5s8.27-3.61 9.25-5.5C18.27 8.11 15 4.5 10 4.5zm0 9c-1.93 0-3.5-1.57-3.5-3.5S8.07 6.5 10 6.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M2.1 2.1 17.9 17.9M7.5 7.5A3.5 3.5 0 0 0 10 13.5c.73 0 1.4-.23 1.96-.62M12.5 12.5A3.5 3.5 0 0 0 10 6.5c-.25 0-.5.03-.74.08M10 4.5c5 0 8.27 3.61 9.25 5.5a10.5 10.5 0 0 1-2.8 3.43M10 15.5c-5 0-8.27-3.61-9.25-5.5a10.5 10.5 0 0 1 3.48-3.93"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      )}
    </button>
  );
}
