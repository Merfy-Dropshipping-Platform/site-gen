import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel';
import Autoplay, { type AutoplayType } from 'embla-carousel-autoplay';
import Fade from 'embla-carousel-fade';
import { done, refuse } from './command';
import { animateNode } from './motion';
import type { NoData, Result } from '../types';
import type { Behavior, BehaviorCommand, BehaviorHost, BehaviorInstance } from './types';

// Слайдер (design.md блока 6, раздел 3; факты 5, 7, 17): Embla с Autoplay и Fade, доступность по W3C APG, текст нового
// слайда проявляется как у vanilla (факт 7). «Уменьшить движение» — без автопрокрутки, смена сразу (duration 0).

// change (мс CSS пяти тем) → duration ядра Embla: замер 22.10, Р6-5. Других значений нет — их подбирают замером.
const DURATION_OF_CHANGE: Readonly<Record<string, number>> = { '700': 25, '500': 20 };
const COPY_DURATION = 500;

interface Parts {
  readonly slides: readonly HTMLElement[];
  readonly dots: readonly HTMLElement[];
  readonly thumbs: readonly HTMLElement[];
}

const partOf = (host: BehaviorHost, name: string): HTMLElement | null =>
  host.root.querySelector<HTMLElement>(`[data-part="${name}"]`);

const partsOf = (host: BehaviorHost, name: string): readonly HTMLElement[] =>
  [...host.root.querySelectorAll<HTMLElement>(`[data-part="${name}"]`)].filter(
    (element) => element.closest('[data-behavior]') === host.root,
  );

function markSlides(parts: Parts): void {
  parts.slides.forEach((slide, index) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${index + 1} из ${parts.slides.length}`);
  });
}

// Признак текущего элемента у точки и миниатюры; счётчик и доступность стрелок — по состоянию Embla.
function setCurrent(host: BehaviorHost, parts: Parts, index: number, embla: EmblaCarouselType): void {
  const current = (element: HTMLElement, on: boolean): void => {
    if (on) {
      element.setAttribute('aria-current', 'true');
      element.setAttribute('data-active', '');
    } else {
      element.removeAttribute('aria-current');
      element.removeAttribute('data-active');
    }
  };
  parts.dots.forEach((dot, i) => current(dot, i === index));
  parts.thumbs.forEach((thumb, i) => current(thumb, i === index));
  const counter = partOf(host, 'counter');
  if (counter !== null) counter.textContent = String(index + 1);
  const prev = partOf(host, 'prev');
  const next = partOf(host, 'next');
  if (prev !== null) prev.toggleAttribute('disabled', !embla.canScrollPrev());
  if (next !== null) next.toggleAttribute('disabled', !embla.canScrollNext());
}

// Текст нового текущего слайда (факт 7): проявление снизу 20 px за 500 мс material, синхронно в обработчике.
function revealCopy(host: BehaviorHost, slide: HTMLElement | undefined): void {
  const copy = slide?.querySelector<HTMLElement>('[data-part="copy"]');
  if (copy === null || copy === undefined || host.motion.reduced) return;
  void animateNode(
    copy,
    { opacity: [0, 1], transform: ['translate(0px, 20px)', 'none'] },
    { duration: COPY_DURATION, easing: 'material' },
    { instant: false, signal: host.signal },
  );
}

function syncState(host: BehaviorHost, parts: Parts, embla: EmblaCarouselType): void {
  const index = embla.selectedScrollSnap();
  setCurrent(host, parts, index, embla);
  revealCopy(host, parts.slides[index]);
}

function autoplayOf(host: BehaviorHost): AutoplayType | null {
  const seconds = Number(host.params.autoplay);
  if (!Number.isInteger(seconds) || seconds <= 0 || host.motion.reduced) return null;
  return Autoplay({
    delay: seconds * 1000,
    stopOnInteraction: false,
    stopOnFocusIn: true,
    stopOnMouseEnter: false,
  });
}

function listenControls(
  host: BehaviorHost,
  parts: Parts,
  embla: EmblaCarouselType,
  autoplay: AutoplayType | null,
): void {
  const signal = host.signal;
  const scroll = (work: () => void): void => {
    work();
    autoplay?.reset();
  };
  partOf(host, 'prev')?.addEventListener('click', () => scroll(() => embla.scrollPrev()), { signal });
  partOf(host, 'next')?.addEventListener('click', () => scroll(() => embla.scrollNext()), { signal });
  [...parts.dots, ...parts.thumbs].forEach((element, index) =>
    element.addEventListener('click', () => scroll(() => embla.scrollTo(index)), { signal }),
  );
  host.root.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowLeft') scroll(() => embla.scrollPrev());
      if (event.key === 'ArrowRight') scroll(() => embla.scrollNext());
    },
    { signal },
  );
}

// Пауза автопрокрутки: aria-pressed у кнопки и data-paused на корне поведения. Кнопка и команды скрипта секции —
// один переключатель.
function pausing(host: BehaviorHost, autoplay: AutoplayType | null): ((paused: boolean) => void) | null {
  if (autoplay === null) return null;
  const play = partOf(host, 'play');
  const set = (paused: boolean): void => {
    host.root.toggleAttribute('data-paused', paused);
    play?.setAttribute('aria-pressed', String(paused));
    if (paused) autoplay.stop();
    else autoplay.play();
  };
  play?.setAttribute('aria-pressed', 'false');
  play?.addEventListener('click', () => set(!host.root.hasAttribute('data-paused')), { signal: host.signal });
  return set;
}

// Команды для скрипта секции (ctx.behavior("carousel"), 03.11): смена слайда сбрасывает автопрокрутку, как нажатие стрелки.
function commandsOf(
  parts: Parts,
  embla: EmblaCarouselType,
  autoplay: AutoplayType | null,
  pause: ((paused: boolean) => void) | null,
): Readonly<Record<string, BehaviorCommand>> {
  const move = (work: () => void): Result<NoData> => {
    work();
    autoplay?.reset();
    return done();
  };
  const autoplayOnly = (paused: boolean): Result<NoData> => {
    if (pause === null) return refuse('ctx.behavior("carousel"): автопрокрутки нет — нужен data-autoplay больше 0');
    pause(paused);
    return done();
  };
  return {
    next: () => move(() => embla.scrollNext()),
    prev: () => move(() => embla.scrollPrev()),
    goTo: (index) =>
      typeof index === 'number' && index < parts.slides.length
        ? move(() => embla.scrollTo(index))
        : refuse(`ctx.behavior("carousel").goTo: нет слайда ${JSON.stringify(index)}`),
    play: () => autoplayOnly(false),
    pause: () => autoplayOnly(true),
  };
}

interface Started {
  readonly embla: EmblaCarouselType;
  readonly autoplay: AutoplayType | null;
}

// Embla Fade 8.6 двигает прозрачность в scrollBody.settled(), а ядро Embla зовёт settled() раз в кадр отрисовки:
// на 120 Гц смена шла вдвое быстрее (стоп GLM 22.10). Шаг Fade — не чаще раза в 1/60 с прошедшего времени, как
// update() ядра; на медленных кадрах догоняет, не больше четырёх шагов за кадр.
const FADE_STEP_MS = 1000 / 60;

function fadeStepsByTime(api: EmblaCarouselType): void {
  const body = api.internalEngine().scrollBody;
  const fadeSettled = body.settled;
  let last: number | null = null;
  let lag = 0;
  let result = false;
  body.settled = () => {
    const now = performance.now();
    // Смена началась после паузы — один шаг сразу, время простоя не догоняем.
    lag = last === null || now - last > 100 ? FADE_STEP_MS : lag + (now - last);
    last = now;
    for (let steps = 0; lag >= FADE_STEP_MS * 0.9 && steps < 4; steps += 1) {
      result = fadeSettled();
      lag = Math.max(0, lag - FADE_STEP_MS);
    }
    return result;
  };
}

function createEmbla(host: BehaviorHost, slides: readonly HTMLElement[]): Started {
  const autoplay = autoplayOf(host);
  const plugins = [...(autoplay === null ? [] : [autoplay]), ...(host.params.effect === 'fade' ? [Fade()] : [])];
  const embla = EmblaCarousel(
    partOf(host, 'viewport') ?? host.root,
    {
      container: partOf(host, 'container') ?? undefined,
      slides: [...slides],
      loop: host.params.loop === true,
      watchDrag: host.params.drag !== false,
      duration: host.motion.reduced ? 0 : (DURATION_OF_CHANGE[String(host.params.change)] ?? 25),
    },
    plugins,
  );
  host.signal.addEventListener('abort', () => embla.destroy(), { once: true });
  return { embla, autoplay };
}

export const carousel: Behavior<'carousel'> = {
  name: 'carousel',
  attach(host: BehaviorHost): BehaviorInstance {
    const parts: Parts = {
      slides: [...partsOf(host, 'slide')],
      dots: partsOf(host, 'dot'),
      thumbs: partsOf(host, 'thumb'),
    };
    host.root.setAttribute('role', 'region');
    host.root.setAttribute('aria-roledescription', 'carousel');
    markSlides(parts);
    const { embla, autoplay } = createEmbla(host, parts.slides);
    const sync = (): void => syncState(host, parts, embla);
    if (host.params.effect === 'fade') {
      fadeStepsByTime(embla);
      embla.on('reInit', fadeStepsByTime);
    }
    embla.on('init', sync);
    embla.on('select', sync);
    embla.on('reInit', sync);
    listenControls(host, parts, embla, autoplay);
    const pause = pausing(host, autoplay);
    return {
      commands: commandsOf(parts, embla, autoplay, pause),
      save: () => ({ index: embla.selectedScrollSnap() }),
      restore: (state) => {
        if (typeof state !== 'object' || state === null || !('index' in state)) return;
        embla.scrollTo(Number(state.index), true);
      },
    };
  },
};
