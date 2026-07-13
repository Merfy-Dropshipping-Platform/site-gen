import fs from 'node:fs';
import path from 'node:path';

const astro = fs.readFileSync(
  path.resolve(__dirname, '../Slideshow.astro'),
  'utf8',
);
const classes = fs.readFileSync(
  path.resolve(__dirname, '../Slideshow.classes.ts'),
  'utf8',
);

describe('Slideshow visible settings wiring', () => {
  it('wires section size and image mode into layout classes', () => {
    expect(astro).toContain('C.size[size]');
    expect(astro).toContain("imagePosition === 'contained' ? C.container : C.containerFullscreen");
    expect(astro).toContain('data-image-position={imagePosition}');
  });

  it('wires per-slide overlay, container, position and typography classes', () => {
    expect(astro).toContain('style={`opacity:${slide.overlayN / 100}`}');
    expect(astro).toContain('slide.container && C.contentBox');
    expect(astro).toContain('C.position[slide.position]');
    expect(astro).toContain('C.headingSize[slide.headingSize]');
    expect(astro).toContain('C.textSize[slide.textSize]');
  });

  it('renders a real counter pagination variant', () => {
    expect(astro).toContain('data-slide-counter');
    expect(astro).toContain("pagination === 'counter'");
  });

  it('keeps layout and typography variants in the shared class map', () => {
    expect(classes).toContain('size:');
    expect(classes).toContain('position:');
    expect(classes).toContain('headingSize:');
    expect(classes).toContain('textSize:');
  });

  it('aligns the whole content column, including the CTA', () => {
    expect(classes).toContain('contentItems:');
    expect(astro).toContain('C.contentItems[textAlignment]');
  });
});
