import {
  PreviewService,
  type IAstroContainer,
  type ContainerFactory,
  type ComponentResolver,
} from '../preview.service';

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
});
