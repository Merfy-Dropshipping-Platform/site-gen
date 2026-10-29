import { defineSection, type Ctx, type El } from '@merfy/shell';

// «Подписка на рассылку»: подписка — часть newsletter ядра (POST /storefront/newsletter/subscribe, как у rose и flux на
// проде); так же устроен «Подвал». Тексты ответов — в шаблоне (data-ref по исходу), скрипт показывает один; в превью
// ничего не отправляется. Флажок согласия (если он есть в форме) обязателен, как на проде.

const NOTICES = ['subscribed', 'already-subscribed', 'too-many', 'invalid', 'consent-missing', 'failed'] as const;
type Notice = (typeof NOTICES)[number];

// Код отказа части newsletter → текст под формой.
const NOTICE_OF_CODE: Readonly<Record<string, Notice>> = { limit: 'too-many', invalid: 'invalid' };

type NewsletterCtx = Ctx<Record<string, unknown>, 'newsletter'>;

const showNotice = (ctx: NewsletterCtx, notice: Notice | null): void => {
  for (const name of NOTICES) ctx.ref(name)?.toggle(name === notice);
};

async function subscribe(ctx: NewsletterCtx, button: El | null): Promise<void> {
  const email = ctx.ref('email')?.value().trim() ?? '';
  if (email === '') {
    showNotice(ctx, 'invalid');
    return;
  }
  const consent = ctx.ref('consent');
  if (consent !== null && !consent.checked()) {
    showNotice(ctx, 'consent-missing');
    return;
  }
  button?.attr('disabled', '');
  const result = await ctx.newsletter.subscribe({ email }, { quiet: true });
  button?.attr('disabled', null);
  if (!result.ok) {
    showNotice(ctx, NOTICE_OF_CODE[result.error.code] ?? 'failed');
    return;
  }
  ctx.ref('email')?.value('');
  consent?.checked(false);
  showNotice(ctx, result.data.alreadySubscribed ? 'already-subscribed' : 'subscribed');
}

export default defineSection({
  actions: {
    subscribe(_form, ctx) {
      if (ctx.mode === 'preview') return;
      void subscribe(ctx, ctx.ref('submit'));
    },
  },
});
