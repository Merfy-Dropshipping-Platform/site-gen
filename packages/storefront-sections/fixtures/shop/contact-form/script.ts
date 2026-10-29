import { defineSection } from '@merfy/shell';

// «Контактная форма»: как у пяти тем на проде, форма НИКУДА НЕ ОТПРАВЛЯЕТ — после проверки полей (браузер: обязательные
// и адрес почты) показывает «Спасибо!» и очищает поля. Настоящая отправка — отдельная задача (план базовых секций,
// «Не входит»): ей нужны часть SDK и приём на стороне платформы. В превью ничего не происходит.

export default defineSection({
  actions: {
    submit(_form, ctx) {
      if (ctx.mode === 'preview') return;
      for (const field of ctx.refs('field')) field.value('');
      ctx.ref('thanks')?.show();
    },
  },
});
