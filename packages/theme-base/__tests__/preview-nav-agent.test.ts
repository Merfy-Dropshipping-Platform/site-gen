/**
 * @jest-environment jsdom
 */
import { installPreviewNavAgent } from '../runtime/preview-nav-agent';

describe('preview-nav-agent', () => {
  let postMessages: unknown[] = [];

  beforeEach(() => {
    postMessages = [];
    Object.defineProperty(window, 'parent', {
      value: { postMessage: (msg: unknown) => postMessages.push(msg) },
      configurable: true,
    });
    document.body.innerHTML = '';
    installPreviewNavAgent({ origin: '*' });
  });

  it('intercepts anchor click and sends navigate message', () => {
    document.body.innerHTML = '<a href="/product/rose" id="l1">link</a>';
    const a = document.getElementById('l1')!;
    a.click();
    expect(postMessages.length).toBe(1);
    expect((postMessages[0] as any).type).toBe('navigate');
    expect((postMessages[0] as any).path).toBe('/product/rose');
  });

  it('preventsDefault on anchor click', () => {
    document.body.innerHTML = '<a href="/x" id="l">link</a>';
    const a = document.getElementById('l') as HTMLAnchorElement;
    const e = new MouseEvent('click', { cancelable: true, bubbles: true });
    a.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('intercepts form submit', () => {
    document.body.innerHTML = '<form id="f1"><input name="x"/><button type="submit">Go</button></form>';
    const form = document.getElementById('f1') as HTMLFormElement;
    const e = new Event('submit', { cancelable: true, bubbles: true });
    form.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(postMessages.some(m => (m as any).type === 'form-submit-blocked')).toBe(true);
  });

  it('sends select-block on click on element with data-puck-component-id', () => {
    document.body.innerHTML = '<section data-puck-component-id="hero-1" id="s"><p>x</p></section>';
    const s = document.getElementById('s')!;
    s.click();
    expect(postMessages.some(m => (m as any).type === 'select-block' && (m as any).blockId === 'hero-1')).toBe(true);
  });

  it('does NOT send select-block if click target is inside an <a>', () => {
    document.body.innerHTML = '<section data-puck-component-id="h1"><a href="/x" id="a">link</a></section>';
    const a = document.getElementById('a')!;
    a.click();
    expect(postMessages.some(m => (m as any).type === 'select-block')).toBe(false);
    expect(postMessages.some(m => (m as any).type === 'navigate')).toBe(true);
  });
});
