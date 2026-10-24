import { defineSection } from '@merfy/shell';
import { label } from './lib/label.ts';

// Цвета шарфа (секция выпуска): выбранный цвет — в элементе data-ref="picked", текст — из своего файла секции.
export default defineSection({
  actions: {
    pick(button, ctx) {
      const color = button.attr('data-color');
      if (color !== null) ctx.ref('picked')?.text(label(color));
    },
  },
});
