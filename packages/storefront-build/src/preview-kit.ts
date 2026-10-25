import type { BundleKit } from './bundle';
import type { ShellBuild } from './shell';

// Поведения бандла превью конструктора (блок 6 «Секций и SDK», часть 6в; design.md блока 6, раздел 12): все поведения
// сборки ядра, появления и провайдер ctx.animate — мерчант может добавить слайдер на любую страницу без перезагрузки
// превью. Появлений в превью нет, ctx.animate сразу ставит последний кадр (часть behaviors в режиме preview); флага
// data-merfy-motion у превью нет. Нет kit у сборки ядра (подставные сборки тестов) — превью без поведений, как в 5г.
export function previewKit(shell: ShellBuild): { kit?: BundleKit } {
  if (shell.kit === undefined) return {};
  const behaviors = [...shell.kit.behaviors];
  return { kit: { files: shell.kit.files, plan: { behaviors, reveal: true, animate: true } } };
}
