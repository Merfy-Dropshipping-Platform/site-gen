import { defineSection, type Ctx, type El } from '@merfy/shell';

// «Личный кабинет» (по страницам кабинета прода, flux): /account — хаб «Учётная запись» (заголовок, e-mail, навигация
// и «Выйти из аккаунта»; у прода это отдельная страница, здесь /account — алиас page-profile, поэтому вид выбирается
// по адресу страницы), /account/profile — «Основные данные»: поля — из ctx.auth.$customer; «Сохранить» —
// auth.updateProfile с quiet: true, статус — под кнопкой («Сохранено!» / «Не удалось сохранить»); «Выйти» —
// auth.signout в разметке; гость на страницы кабинета не попадает — её уводит каркас. В превью конструктора —
// вид «Основных данных».

// Хаб кабинета — адрес /account (алиас страницы профиля); вид «Основных данных» — /account/profile.
const HUB_PATH = '/account';

const SAVED_TEXT = 'Сохранено!';
const SAVE_FAILED_TEXT = 'Не удалось сохранить';
const SAVING_TEXT = 'Сохранение...';
const SAVE_TEXT = 'Сохранить';

// Поля формы: что покупательница вводила сама — не перезаписываем стором.
interface AccountState {
  phoneTouched: boolean;
}

const stateOf = (ctx: Ctx<AccountState, 'auth'>): AccountState => {
  const fresh: AccountState = { phoneTouched: ctx.state.phoneTouched ?? false };
  ctx.state = fresh;
  return fresh;
};

const showStatus = (message: string, ctx: Ctx<AccountState, 'auth'>): void => {
  const status = ctx.ref('status');
  status?.text(message);
  status?.show();
};

function fillForm(customer: { readonly email: string; readonly phone: string | null } | null, ctx: Ctx<AccountState, 'auth'>): void {
  ctx.ref('email')?.value(customer === null ? '' : customer.email);
  ctx.ref('email-display')?.text(customer === null ? '' : customer.email);
  const state = stateOf(ctx);
  if (!state.phoneTouched) ctx.ref('phone')?.value(customer?.phone ?? '');
}

const busy = (button: El | null, on: boolean): void => {
  button?.text(on ? SAVING_TEXT : SAVE_TEXT);
  button?.attr('disabled', on ? '' : null);
};

async function saveProfile(ctx: Ctx<AccountState, 'auth'>, button: El | null): Promise<void> {
  const phone = ctx.ref('phone')?.value().trim() ?? '';
  busy(button, true);
  const result = await ctx.auth.updateProfile({ phone }, { quiet: true });
  busy(button, false);
  showStatus(result.ok ? SAVED_TEXT : SAVE_FAILED_TEXT, ctx);
}

export default defineSection<AccountState, 'auth'>({
  mount(_el, ctx) {
    // Хаб кабинета (адрес /account): вместо «Основных данных» — «Учётная запись» с навигацией, как у прода.
    if (ctx.mode === 'live' && ctx.page.path === HUB_PATH) {
      ctx.ref('profile-view')?.hide();
      ctx.ref('hub-view')?.show();
      ctx.watch(ctx.auth.$customer, (state) => {
        ctx.ref('hub-email')?.text(state.ready && state.customer !== null ? state.customer.email : '');
      });
      return;
    }
    ctx.watch(ctx.auth.$customer, (state) => {
      if (!state.ready) return;
      fillForm(state.customer, ctx);
      ctx.ref('loading')?.hide();
      ctx.ref('form')?.show();
    });
    // Правки с клавиатуры — свои: стор их больше не перезаписывает.
    ctx.on('document', 'keydown', (event) => {
      const phone = ctx.ref('phone');
      if (phone !== null && event.inside(phone)) stateOf(ctx).phoneTouched = true;
    });
  },
  actions: {
    save(target, ctx) {
      void saveProfile(ctx, target);
    },
  },
});
