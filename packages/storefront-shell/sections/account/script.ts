import { defineSection, type Ctx, type El } from '@merfy/shell';

// «Личный кабинет» (блок 10 «Секций и SDK», 10.8, «Решил сам» п. 20; часть 10в, Р10в-12): поля — из ctx.auth.$customer;
// «Сохранить» — auth.updateProfile с quiet: true, статус — под кнопкой; «Выйти» — auth.signout в разметке.

const SAVED_TEXT = 'Сохранено!';
const SAVE_FAILED_TEXT = 'Не удалось сохранить';
const SAVING_TEXT = 'Сохранение...';
const SAVE_TEXT = 'Сохранить';

// Поля формы: что покупательница вводила сами — не перезаписываем стором.
interface AccountState {
  nameTouched: boolean;
  phoneTouched: boolean;
}

const stateOf = (ctx: Ctx<AccountState, 'auth'>): AccountState => {
  const fresh: AccountState = {
    nameTouched: ctx.state.nameTouched ?? false,
    phoneTouched: ctx.state.phoneTouched ?? false,
  };
  ctx.state = fresh;
  return fresh;
};

const showStatus = (message: string, ctx: Ctx<AccountState, 'auth'>): void => {
  const status = ctx.ref('status');
  status?.text(message);
  status?.show();
};

function fillForm(customer: { readonly email: string; readonly name: string | null; readonly phone: string | null } | null, ctx: Ctx<AccountState, 'auth'>): void {
  ctx.ref('email')?.value(customer === null ? '' : customer.email);
  const state = stateOf(ctx);
  if (!state.nameTouched) ctx.ref('name')?.value(customer?.name ?? '');
  if (!state.phoneTouched) ctx.ref('phone')?.value(customer?.phone ?? '');
}

const busy = (button: El | null, on: boolean): void => {
  button?.text(on ? SAVING_TEXT : SAVE_TEXT);
  button?.attr('disabled', on ? '' : null);
};

async function saveProfile(ctx: Ctx<AccountState, 'auth'>, button: El | null): Promise<void> {
  const name = ctx.ref('name')?.value().trim() ?? '';
  const phone = ctx.ref('phone')?.value().trim() ?? '';
  busy(button, true);
  const result = await ctx.auth.updateProfile({ name, phone }, { quiet: true });
  busy(button, false);
  showStatus(result.ok ? SAVED_TEXT : SAVE_FAILED_TEXT, ctx);
}

export default defineSection<AccountState, 'auth'>({
  mount(_el, ctx) {
    ctx.watch(ctx.auth.$customer, (state) => {
      if (!state.ready) return;
      ctx.ref('form')?.show();
      ctx.ref('loading')?.hide();
      ctx.ref('form')?.show();
      fillForm(state.customer, ctx);
    });
    // Правки с клавиатуры — свои: стор их больше не перезаписывает.
    ctx.on('document', 'keydown', (event) => {
      const name = ctx.ref('name');
      const phone = ctx.ref('phone');
      const state = stateOf(ctx);
      if (name !== null && event.inside(name)) state.nameTouched = true;
      if (phone !== null && event.inside(phone)) state.phoneTouched = true;
    });
  },
  actions: {
    save(target, ctx) {
      void saveProfile(ctx, target);
    },
  },
});
