import { deepMergeBlockProps } from '../preview.service';

describe('deepMergeBlockProps', () => {
  it('preserves blockDefaults logo when revision seed uses empty string', () => {
    const merged = deepMergeBlockProps(
      { logo: '/icons/Bloom.svg', siteTitle: 'Bloom' },
      { logo: '', siteTitle: 'Bloom' },
    );
    expect(merged.logo).toBe('/icons/Bloom.svg');
    expect(merged.siteTitle).toBe('Bloom');
  });

  it('allows merchant logo override over blockDefaults', () => {
    const merged = deepMergeBlockProps(
      { logo: '/icons/Bloom.svg' },
      { logo: 'https://minio.example/logo.webp' },
    );
    expect(merged.logo).toBe('https://minio.example/logo.webp');
  });
});
