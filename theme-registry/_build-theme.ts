import { ThemeBuildService } from '../src/generator/theme-build.service';
const theme = process.argv[2] ?? 'rose';
new ThemeBuildService()
  .build(theme)
  .then((r) => console.log('BUILD OK →', r.previewDir))
  .catch((e) => { console.error('FAIL', String(e).slice(0, 500)); process.exit(1); });
