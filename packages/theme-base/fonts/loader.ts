export interface FontSpec {
  family: string;
  weights: number[];
  italic?: boolean;
  source: 'google' | 'self-hosted' | string;
}

export function buildFontHead(fonts: FontSpec[]): string {
  const parts: string[] = [];

  const googleFonts = fonts.filter(f => f.source === 'google');
  if (googleFonts.length > 0) {
    parts.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    parts.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    for (const f of googleFonts) {
      parts.push(buildGoogleFontLink(f));
    }
  }

  for (const f of fonts) {
    if (f.source.startsWith('./')) {
      parts.push(buildSelfHostedFace(f));
    }
  }

  return parts.join('\n');
}

function buildGoogleFontLink(f: FontSpec): string {
  const family = encodeURIComponent(f.family).replace(/%20/g, '+');
  const weights = [...f.weights].sort((a, b) => a - b);
  let param: string;
  if (f.italic) {
    const pairs = [
      ...weights.map(w => `0,${w}`),
      ...weights.map(w => `1,${w}`),
    ];
    param = `ital,wght@${pairs.join(';')}`;
  } else {
    param = `wght@${weights.join(';')}`;
  }
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:${param}&display=swap">`;
}

function buildSelfHostedFace(f: FontSpec): string {
  const url = f.source;
  const format = url.endsWith('.woff2') ? 'woff2' : url.endsWith('.woff') ? 'woff' : 'truetype';
  const weight = f.weights[0] ?? 400;
  return `<style>
@font-face {
  font-family: '${f.family}';
  src: url('${url}') format('${format}');
  font-weight: ${weight};
  font-style: ${f.italic ? 'italic' : 'normal'};
  font-display: swap;
}
</style>`;
}
