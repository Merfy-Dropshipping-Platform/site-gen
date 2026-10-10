import { afterEach, describe, expect, it, vi } from 'vitest';
import { SECTION_TAG, useSectionElement } from '../src/element';

afterEach(() => {
  document.body.replaceChildren();
});

describe('<merfy-section>', () => {
  it('браузер зовёт connect и disconnect, когда секция появилась и ушла', () => {
    const hooks = { connect: vi.fn(), disconnect: vi.fn() };
    useSectionElement(window.customElements, hooks);
    document.body.innerHTML = '<merfy-section data-section="nova:scarf-colors"></merfy-section>';
    const element = document.querySelector(SECTION_TAG);
    expect(hooks.connect).toHaveBeenCalledWith(element);
    element?.remove();
    expect(hooks.disconnect).toHaveBeenCalledWith(element);
  });

  it('второй запуск ядра в том же окне: элемент не регистрируется заново, вызовы идут новому реестру', () => {
    const first = { connect: vi.fn(), disconnect: vi.fn() };
    const second = { connect: vi.fn(), disconnect: vi.fn() };
    useSectionElement(window.customElements, first);
    useSectionElement(window.customElements, second);
    document.body.innerHTML = '<merfy-section data-section="reviews:list"></merfy-section>';
    expect(first.connect).not.toHaveBeenCalled();
    expect(second.connect).toHaveBeenCalledTimes(1);
    expect(window.customElements.get(SECTION_TAG)).toBeDefined();
  });
});
