/**
 * @jest-environment jsdom
 *
 * Баг-репорт владельца (16.09, п.4): «При загруженном видео, не отображает
 * его в сайдбаре бесконечная загрузка + видео не ставится на паузу и при
 * просмотре всегда кнопка плей стоит по середине». Три симптома одной
 * причины в `packages/theme-base/blocks/Video/Video.astro`:
 *
 *   [a] «бесконечная загрузка» — до фикса ничего не гарантировало, что
 *       play-кнопка видна СРАЗУ, если видео не начало играть само (нет
 *       автоплея / автоплей заблокирован политикой браузера) — мерчант видел
 *       замерший на первом кадре ролик БЕЗ способа его запустить.
 *   [b] «видео не ставится на паузу» — старый click-обработчик ВСЕГДА звал
 *       `v.play()`, никогда `v.pause()` — сторожит sabotage ниже.
 *   [c] «кнопка плей всегда по центру» — видимость кнопки не была
 *       синхронизирована с РЕАЛЬНЫМ состоянием видео (play/pause/ended).
 *
 * Скрипт извлекается из .astro-исходника (тот же приём, что
 * `checkout-submit-promo.dom.test.ts`) и исполняется в jsdom — проверяем
 * РЕАЛЬНОЕ поведение обработчиков, а не текст исходника.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ASTRO = join(__dirname, '..', 'blocks', 'Video', 'Video.astro');

function inlineScriptBody(src: string): string {
  const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src);
  if (!m) throw new Error('no <script> in Video.astro');
  return m[1];
}

const SRC = readFileSync(ASTRO, 'utf8');
const SCRIPT = inlineScriptBody(SRC);

/** Mounts a branch-A DOM: SSR already rendered <video> + play/pause button. */
function mountVideoDom(): { section: HTMLElement; video: HTMLVideoElement; btn: HTMLElement } {
  document.body.innerHTML = `
    <section data-media-slot="video" data-media-block-id="vid-1">
      <div data-media-target>
        <video data-media-video src="https://example.test/v.mp4"></video>
        <button type="button" data-media-play-overlay aria-label="Воспроизвести или поставить на паузу видео">
          <svg></svg>
        </button>
      </div>
    </section>`;
  const section = document.querySelector('[data-media-slot="video"]') as HTMLElement;
  const video = section.querySelector('video[data-media-video]') as HTMLVideoElement;
  const btn = section.querySelector('[data-media-play-overlay]') as HTMLElement;
  return { section, video, btn };
}

function runScript(section: HTMLElement, opts: { siteId?: string } = {}) {
  (window as any).__merfyRoot = () => section;
  const vars = { blockId: 'vid-1', siteId: opts.siteId ?? '' };
  // eslint-disable-next-line no-new-func
  new Function('blockId', 'siteId', SCRIPT)(vars.blockId, vars.siteId);
}

describe('theme-base Video — play/pause больше не декоративный (владелец, 16.09, п.4)', () => {
  let playSpy: jest.Mock;
  let pauseSpy: jest.Mock;

  beforeEach(() => {
    // jsdom не реализует HTMLMediaElement.play/pause — подменяем.
    playSpy = jest.fn().mockResolvedValue(undefined);
    pauseSpy = jest.fn();
    window.HTMLMediaElement.prototype.play = playSpy;
    window.HTMLMediaElement.prototype.pause = pauseSpy;
    // effectiveSiteId должен остаться пустым, чтобы скрипт НЕ дошёл до
    // fetch(): localhost не матчит /^[0-9a-f]{12}\.merfy\.ru$/, siteId=''.
    document.body.innerHTML = '';
  });

  it('[c] кнопка видна СРАЗУ, если видео на паузе (не предполагает «скрыта по умолчанию»)', () => {
    const { btn } = mountVideoDom();
    runScript(document.querySelector('[data-media-slot="video"]') as HTMLElement);
    expect((btn as HTMLElement).style.opacity).toBe('1');
    expect((btn as HTMLElement).style.pointerEvents).toBe('auto');
  });

  it('[c] кнопка ПРЯЧЕТСЯ, когда видео реально играет (событие play)', () => {
    const { section, video, btn } = mountVideoDom();
    runScript(section);
    video.dispatchEvent(new Event('play'));
    expect(btn.style.opacity).toBe('0');
    expect(btn.style.pointerEvents).toBe('none');
  });

  it('[c] кнопка возвращается на паузе/по окончании (pause, ended)', () => {
    const { section, video, btn } = mountVideoDom();
    runScript(section);
    video.dispatchEvent(new Event('play'));
    expect(btn.style.opacity).toBe('0');
    video.dispatchEvent(new Event('pause'));
    expect(btn.style.opacity).toBe('1');
    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('ended'));
    expect(btn.style.opacity).toBe('1');
  });

  it('[b] клик на паузе — зовёт play(), не pause()', () => {
    const { section, video, btn } = mountVideoDom();
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    runScript(section);
    btn.dispatchEvent(new Event('click', { cancelable: true }));
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it('[b] клик ВО ВРЕМЯ ИГРЫ — зовёт pause(), НЕ play() (это и был баг: раньше play() звался всегда)', () => {
    const { section, video, btn } = mountVideoDom();
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    runScript(section);
    btn.dispatchEvent(new Event('click', { cancelable: true }));
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('клик добавляет нативные controls (страховка доступности/скраббинга)', () => {
    const { section, video, btn } = mountVideoDom();
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    runScript(section);
    expect(video.hasAttribute('controls')).toBe(false);
    btn.dispatchEvent(new Event('click', { cancelable: true }));
    expect(video.hasAttribute('controls')).toBe(true);
  });

  it('идемпотентность: повторный вызов скрипта не плодит второй обработчик клика', () => {
    const { section, video, btn } = mountVideoDom();
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    runScript(section);
    runScript(section); // ре-хидрация (напр. повторный рендер блока)
    btn.dispatchEvent(new Event('click', { cancelable: true }));
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
