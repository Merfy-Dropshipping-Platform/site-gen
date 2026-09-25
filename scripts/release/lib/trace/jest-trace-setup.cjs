/**
 * setupFilesAfterEnv jest: запись входов spec-файла для памяти результатов
 * (spec 115, часть 3). Включается переменной MERFY_TRACE_DIR — её ставит
 * `pnpm checks`; без неё файл ничего не делает.
 *
 * Запись файла = модули его реестра (require.cache: TS, JS, JSON, в том
 * числе подгруженные динамически) + всё, что он и вызванный им код прочитали
 * через fs, + входы тёплого рендера и дочерних node (их докладывает
 * render-bridge-install.cjs) + пометки «гонять всегда». Пишется в
 * MERFY_TRACE_DIR/<sha1 пути>.json после всех проверок файла.
 *
 * Обёртка fs ставится в настоящем контексте процесса, а не в песочнице
 * файла: так она видит и код, который тест вызвал, и она одна на воркер.
 */
const dir = process.env.MERFY_TRACE_DIR;

if (dir) {
  const { runInThisContext } = require('node:vm');
  const realRequire = runInThisContext('process').getBuiltinModule('node:module').createRequire(__filename);
  const tracer = realRequire('./fs-tracer.cjs').install();
  const { writeFileSync } = realRequire('node:fs');
  const { createHash } = realRequire('node:crypto');
  const { testPath } = expect.getState();
  const scope = tracer.openScope(testPath);

  afterAll(() => {
    tracer.closeScope(scope);
    const record = {
      testPath,
      modules: Object.keys(require.cache),
      reads: [...scope.reads],
      writes: [...scope.writes],
      volatile: scope.volatile,
    };
    writeFileSync(`${dir}/${createHash('sha1').update(testPath).digest('hex')}.json`, JSON.stringify(record));
  });
}
