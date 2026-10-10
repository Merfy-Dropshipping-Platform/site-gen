// <merfy-section data-section="<имя>"> — один общий элемент на секции всех авторов (design.md блока 7, С7-15 Б, п. 11):
// браузер сам зовёт connectedCallback, когда секция появилась на странице (в том числе после перехода без
// перезагрузки), и disconnectedCallback, когда ушла. Элемент регистрируется один раз на окно; реестр ядра подключается
// к нему через hooks — так тесты запускают ядро несколько раз в одном окне. Глобалов на window элемент не заводит.
export const SECTION_TAG = 'merfy-section';

export interface ElementHooks {
  connect: (element: HTMLElement) => void;
  disconnect: (element: HTMLElement) => void;
}

// Хуки остановленного ядра: элемент на странице есть, но ничего не запускает.
export const IDLE_HOOKS: ElementHooks = { connect: () => undefined, disconnect: () => undefined };

let active: ElementHooks = IDLE_HOOKS;

export function useSectionElement(registry: CustomElementRegistry, hooks: ElementHooks): void {
  active = hooks;
  if (registry.get(SECTION_TAG) !== undefined) return;
  registry.define(
    SECTION_TAG,
    class MerfySection extends HTMLElement {
      connectedCallback(): void {
        active.connect(this);
      }

      disconnectedCallback(): void {
        active.disconnect(this);
      }
    },
  );
}
