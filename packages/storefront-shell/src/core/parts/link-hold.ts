import { navigation } from '../navigation';
import type { CoreHandle, SdkPart } from '../types';
import { cartRuntimeOf } from './cart';

// Переход ждёт добавления в корзину (06.11): счётчик прибавляет сразу, а запросы шлюза идут секунды; обычный переход по
// ссылке рвёт их, и товар пропадает. Пока cart.add в очереди, нажатая ссылка идёт после неё: срок запроса ограничивает
// ожидание, сбой шлюза переход не отменяет. Часть вне ядра (бюджет 16 КБ), в бандле каждой страницы магазина: товар
// добавляет и разметка, и скрипт секции, по HTML это не определить.

export const LINK_HOLD_PART = 'linkHold';

const sameFrame = (link: HTMLAnchorElement): boolean =>
  (link.target === '' || link.target === '_self') && !link.hasAttribute('download');

const staysOnPage = (link: HTMLAnchorElement): boolean =>
  link.hash !== '' && link.pathname === window.location.pathname && link.search === window.location.search;

// Ссылка, уводящая эту вкладку: новая вкладка, скачивание, якорь на странице и mailto: запросы не рвут.
function leavingLink(event: MouseEvent): HTMLAnchorElement | null {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  return sameFrame(link) && !staysOnPage(link) && link.protocol.startsWith('http') ? link : null;
}

function holdLink(core: CoreHandle, event: MouseEvent): void {
  const link = leavingLink(event);
  if (link === null) return;
  const rt = cartRuntimeOf(core.part('cart'));
  if (rt === undefined || rt.adding.get() === 0) return;
  event.preventDefault();
  void rt.enqueue(() => Promise.resolve(navigation.go(link.href)));
}

export const linkHold: SdkPart<typeof LINK_HOLD_PART, null> = {
  name: LINK_HOLD_PART,
  create: (core) => {
    if (core.mode === 'live') document.addEventListener('click', (event) => holdLink(core, event));
    return null;
  },
};
