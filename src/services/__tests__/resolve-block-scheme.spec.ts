import {
  PreviewService,
  type IAstroContainer,
  type ContainerFactory,
  type ComponentResolver,
} from '../preview.service';
import { adaptLegacyProps } from '../../themes/page-blocks';

/**
 * Minimal stub container and resolver — тесты resolveBlockScheme не рендерят HTML.
 */
const stubContainer: IAstroContainer = {
  async renderToString() {
    return '<div></div>';
  },
};

const stubContainerFactory: ContainerFactory = async () => stubContainer;

const stubResolver: ComponentResolver = async () => ({ __block: 'Stub' });

describe('PreviewService.resolveBlockScheme', () => {
  let svc: PreviewService;

  beforeEach(() => {
    svc = new PreviewService(stubContainerFactory, stubResolver);
    // Сбрасываем кэш blockDefaults между тестами, чтобы theme.json
    // резолвился с process.cwd() (корень сервиса sites).
    // Метод private — обходим через any.
    (svc as unknown as { themeDefaultsCache: Map<string, unknown> }).themeDefaultsCache.clear();
  });

  it('props.colorScheme побеждает blockDefaults: Hero scheme-2 overrides theme default scheme-4', async () => {
    const result = await svc.resolveBlockScheme('Hero', { colorScheme: 'scheme-2' }, 'rose');
    expect(result).toBe('2');
  });

  it('blockDefaults темы rose: Hero без props.colorScheme → scheme-4', async () => {
    const result = await svc.resolveBlockScheme('Hero', { id: 'Hero-1' }, 'rose');
    expect(result).toBe('4');
  });

  it('Gallery в rose не имеет colorScheme в blockDefaults → null', async () => {
    const result = await svc.resolveBlockScheme('Gallery', {}, 'rose');
    expect(result).toBeNull();
  });

  // --- Тесты потока: seed-пропсы проходят через adaptLegacyProps → resolveBlockScheme ---

  it('seed-пропсы Hero после adaptLegacyProps получают схему из blockDefaults (поток)', async () => {
    // Hero без colorScheme — адаптер не должен впрыснуть fallback '1'
    const adapted = adaptLegacyProps({ id: 'Hero-1' }, null, 'Hero');
    expect(adapted.colorScheme).toBeUndefined(); // адаптер НЕ впрыскивает
    const scheme = await svc.resolveBlockScheme('Hero', adapted, 'rose');
    expect(scheme).toBe('4'); // blockDefaults.Hero.colorScheme = 'scheme-4'
  });

  it('clamp: scheme-5 через adaptLegacyProps нормализуется к 5 (не к fallback 1)', () => {
    // Проверяем что clamp расширен до 5
    const adapted = adaptLegacyProps({ colorScheme: 'scheme-5' }, null, 'Hero');
    // После адаптации colorScheme должен быть 5, а не fallback 1
    expect(adapted.colorScheme).toBe(5);
  });

  // --- T8-fix2: коэрсеры НЕ впрыскивают padding когда поле отсутствует ---

  it('Header без padding в props → adapted.padding === undefined (blockDefaults побеждает)', () => {
    const adapted = adaptLegacyProps({ id: 'Header-1' }, null, 'Header');
    expect(adapted.padding).toBeUndefined();
  });

  it('Footer без padding в props → adapted.padding === undefined', () => {
    const adapted = adaptLegacyProps({ id: 'Footer-1' }, null, 'Footer');
    expect(adapted.padding).toBeUndefined();
  });

  it('Hero без padding в props → adapted.padding === undefined', () => {
    const adapted = adaptLegacyProps({ id: 'Hero-1', title: 'Test' }, null, 'Hero');
    expect(adapted.padding).toBeUndefined();
  });

  it('PopularProducts без padding в props → adapted.padding === undefined', () => {
    const adapted = adaptLegacyProps({ id: 'PP-1' }, null, 'PopularProducts');
    expect(adapted.padding).toBeUndefined();
  });

  // --- T13: коэрсер не теряет heading.size ---

  it('PopularProducts heading {text,size} → объект сохранён (size не потерян)', () => {
    const adapted = adaptLegacyProps(
      { id: 'PP-1', heading: { text: 'X', size: 'large' } },
      null,
      'PopularProducts',
    );
    expect(adapted.heading).toEqual({ text: 'X', size: 'large' });
  });

  it('PopularProducts heading {size} без text → дефолт-текст, size сохранён', () => {
    const adapted = adaptLegacyProps(
      { id: 'PP-1', heading: { size: 'medium' } },
      null,
      'PopularProducts',
    );
    expect(adapted.heading).toEqual({ text: 'Популярные товары', size: 'medium' });
  });

  it('PopularProducts heading {text} без size → плющится в строку (прежнее поведение)', () => {
    const adapted = adaptLegacyProps(
      { id: 'PP-1', heading: { text: 'X' } },
      null,
      'PopularProducts',
    );
    expect(adapted.heading).toBe('X');
  });

  it('PopularProducts heading строкой → строка как была', () => {
    const adapted = adaptLegacyProps(
      { id: 'PP-1', heading: 'Хиты' },
      null,
      'PopularProducts',
    );
    expect(adapted.heading).toBe('Хиты');
  });

  it('Collections heading {text,size} → heading строкой + size поднят в headingSize', () => {
    const adapted = adaptLegacyProps(
      { id: 'C-1', heading: { text: 'Коллекции', size: 'large' } },
      null,
      'Collections',
    );
    expect(adapted.heading).toBe('Коллекции');
    expect(adapted.headingSize).toBe('large');
  });

  it('Collections heading {text,size} при явном headingSize → top-level приоритетнее', () => {
    const adapted = adaptLegacyProps(
      { id: 'C-1', heading: { text: 'К', size: 'large' }, headingSize: 'small' },
      null,
      'Collections',
    );
    expect(adapted.heading).toBe('К');
    expect(adapted.headingSize).toBe('small');
  });

  it('ContactForm без padding в props → adapted.padding === undefined', () => {
    const adapted = adaptLegacyProps({ id: 'CF-1' }, null, 'ContactForm');
    expect(adapted.padding).toBeUndefined();
  });

  it('ImageWithText без padding в props → adapted.padding === undefined', () => {
    const adapted = adaptLegacyProps({ id: 'IWT-1' }, null, 'ImageWithText');
    expect(adapted.padding).toBeUndefined();
  });

  it('MainText без padding и align в props → оба undefined', () => {
    const adapted = adaptLegacyProps({ id: 'MT-1', text: 'Hello' }, null, 'MainText');
    expect(adapted.padding).toBeUndefined();
    expect(adapted.align).toBeUndefined();
  });

  it('Hero без size в props → adapted.size === undefined (тема задаёт дефолт)', () => {
    const adapted = adaptLegacyProps({ id: 'Hero-1', title: 'Test' }, null, 'Hero');
    expect(adapted.size).toBeUndefined();
  });

  it('Hero без overlay/overlayOpacity → adapted.overlay === undefined', () => {
    const adapted = adaptLegacyProps({ id: 'Hero-1', title: 'Test' }, null, 'Hero');
    expect(adapted.overlay).toBeUndefined();
  });

  it('Hero с overlayOpacity=0.5 → overlay конвертируется в 50 (нормализация формата)', () => {
    const adapted = adaptLegacyProps({ id: 'Hero-1', overlayOpacity: 0.5 }, null, 'Hero');
    expect(adapted.overlay).toBe(50);
  });

  it('Header с явным padding → значение сохраняется (нормализация не трогает существующие)', () => {
    const adapted = adaptLegacyProps({ id: 'Header-1', padding: { top: 24, bottom: 24 } }, null, 'Header');
    expect(adapted.padding).toEqual({ top: 24, bottom: 24 });
  });
});
