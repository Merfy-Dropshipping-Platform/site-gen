import { defineSection, type Ctx, type El } from '@merfy/shell';

// «Подвал»: подписка на рассылку — часть newsletter ядра (POST /storefront/newsletter/subscribe, как у rose и flux на
// проде). Тексты ответов — в шаблоне (data-ref по исходу), скрипт показывает один; в превью ничего не отправляется.

const NOTICES = ['subscribed', 'already-subscribed', 'too-many', 'invalid', 'failed'] as const;
type Notice = (typeof NOTICES)[number];

// Код отказа части newsletter → текст под формой.
const NOTICE_OF_CODE: Readonly<Record<string, Notice>> = { limit: 'too-many', invalid: 'invalid' };

const showNotice = (ctx: Ctx<Record<string, unknown>, 'newsletter'>, notice: Notice | null): void => {
  for (const name of NOTICES) ctx.ref(name)?.toggle(name === notice);
};

async function subscribe(ctx: Ctx<Record<string, unknown>, 'newsletter'>, button: El | null): Promise<void> {
  const email = ctx.ref('email')?.value().trim() ?? '';
  if (email === '') {
    showNotice(ctx, 'invalid');
    return;
  }
  button?.attr('disabled', '');
  const result = await ctx.newsletter.subscribe({ email }, { quiet: true });
  button?.attr('disabled', null);
  if (!result.ok) {
    showNotice(ctx, NOTICE_OF_CODE[result.error.code] ?? 'failed');
    return;
  }
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
