// Per Figma 1:13560 — button 56h, radius 4, fill black (button-bg), text white (button-text), Manrope 16/400.
// Use --color-button-* (always emitted by theme generator) instead of --color-accent which is missing in current scheme CSS output.
// Trailing `!` forces important to beat Tailwind preflight `button,[type=submit]{background-color:#0000}`.
//
// Владелец, 16.09, п.2, дословно: «Кнопка не должна применять на себя при
// наведении цвет кнопки при наведении, но выбранный цвет кнопки должен
// оживлять когда на него наводишь.» Раньше `buttonFill` красил `:hover`
// отдельными токенами схемы `--color-button-bg-hover`/`-text-hover` — ровно
// то, что запретили. Сняты; вместо них — маркер-класс `checkout-submit-btn-
// fill`, на который CHECKOUT_SUBMIT_HOVER_LIGHTEN_CSS (tokens-css.ts) вешает
// `:hover{background-color:color-mix(...,--color-button-bg,white)}` — hover
// «оживляет» ЕЁ ЖЕ выбранный цвет, не читая отдельный hover-токен. Текст на
// hover тоже больше не отдельный токен — остаётся --color-button-text, как в
// покое (владелец не просил менять текст, только «оживление» кнопки).
export const CheckoutSubmitClasses = {
  root: 'w-full',
  buttonFill: 'checkout-submit-btn-fill w-full h-14 bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] transition-colors disabled:opacity-50',
  buttonOutline: 'w-full h-14 bg-transparent! text-[rgb(var(--color-text))] border-2 border-[rgb(var(--color-text))] rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] hover:bg-[rgb(var(--color-text)/.06)] disabled:opacity-50',
  buttonGradient: 'w-full h-14 bg-[rgb(var(--color-button-bg))]! text-[rgb(var(--color-button-text))]! rounded-[var(--radius-button)] [font-family:var(--font-body)] text-[length:var(--size-body)] disabled:opacity-50',
} as const;
