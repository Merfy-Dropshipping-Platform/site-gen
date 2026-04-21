export interface RobotsConfig {
  allowIndex: boolean;
  sitemapUrl?: string;
  host?: string; // Yandex-specific
  cleanParam?: string[]; // Yandex-specific: Clean-param directives
  disallow?: string[];
  allow?: string[];
}

export function buildRobots(cfg: RobotsConfig): string {
  const lines: string[] = [];
  lines.push('User-agent: *');
  if (!cfg.allowIndex) {
    lines.push('Disallow: /');
  } else {
    (cfg.disallow ?? []).forEach((d) => lines.push(`Disallow: ${d}`));
    (cfg.allow ?? []).forEach((a) => lines.push(`Allow: ${a}`));
  }
  if (cfg.sitemapUrl) {
    lines.push('');
    lines.push(`Sitemap: ${cfg.sitemapUrl}`);
  }
  if (cfg.host) {
    lines.push(`Host: ${cfg.host}`);
  }
  if (cfg.cleanParam) {
    cfg.cleanParam.forEach((p) => lines.push(`Clean-param: ${p}`));
  }
  return lines.join('\n') + '\n';
}
