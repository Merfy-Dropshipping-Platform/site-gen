# Фаза 1 — стабилизация архитектуры сборки

Дата: 2026-07-29. **Gate 1 пройден.**

## Зачем это было нужно

Прошлая попытка (Task 12) отчиталась «превью и live совпадают на 0.000%». Эта
проверка ничего не значила: локально сборка шла **legacy-монолитом**, а прод
собирает themes-v2. Сравнивались два артефакта одного и того же неправильного
движка. Ниже — три дыры, которые это допускали, и чем они закрыты.

## Дыра 1 — молчаливый откат на legacy scaffold

`build.service.ts` выбирал конвейер так:

```js
const useThemeV2 = MIGRATED_THEMES.has(bareTheme) && (await themeLiveDistExists(bareTheme));
```

`themeLiveDistExists` возвращает `false` на любой ошибке (`.catch(() => false)`).
Нет пред-собранного диста → сборка молча уходила в legacy scaffold и получала
статус `uploaded`. По статусу это неотличимо от успеха.

**Закрыто:** `resolveThemePipeline(bareTheme, hasLiveDist)` бросает исключение →
`runBuildPipeline` переводит билд в `failed`. Тест `theme-pipeline-guard.spec.ts`, 5/5.

**Проверено вживую:** дист временно скрыт → сборка вернула `success:false` с
точным текстом, строка `site_build` получила статус `failed` и текст ошибки.

## Дыра 2 — legacy-режим как значение по умолчанию

`SiteGeneratorService.build` выбирает движок по `BUILD_PIPELINE_ENABLED`, у
которого **дефолт `"false"`**. В `.env.local` переменная не задана. Ветка
themes-v2 существует только внутри `runBuildPipeline`, поэтому локально Flux
собирался монолитом `buildWithAstro` — то есть прод и машина разработчика
собирали витрину **разными сборщиками**.

**Закрыто:** `assertPipelineModeForTheme(bareTheme, pipelineEnabled)` в точке
диспетчеризации. Тест `legacy-mode-guard.spec.ts`, 5/5.

## Дыра 3 — заглушка засчитывалась как успешная публикация

```js
this.logger.warn(`Astro build failed, fallback to stub: ${astroResult.error ?? ""}`);
await fs.writeFile(artifactFile, JSON.stringify({ buildId, siteId, mode }, null, 2));
```

Сборка падала → вместо zip писался JSON на 131 байт → билд всё равно `uploaded`,
наружу `success: true`. Обнаружено предметно: артефакт `da2a0708` оказался
не-архивом на 131 байт при норме ~23 МБ.

**Закрыто:** провал Astro бросает исключение; добавлен `catch`, переводящий
`site_build` в `failed` с текстом ошибки (раньше строка навсегда застревала в
`running`). Осознанный режим «без сборки» (`ASTRO_BUILD_ENABLED=false`) не тронут.

## Дыра 4 — локальная сборка писала в боевой MinIO

`.env.local` (отслеживается git) содержит `S3_ENDPOINT=https://minio.merfy.ru`,
и он **приоритетнее** `MINIO_ENDPOINT`. Переопределения `MINIO_*` не действовали.
Один артефакт локальной сборки уехал в боевой бакет; удалён, отсутствие
подтверждено HTTP 404.

Дополнительно: на `:9000` слушает `mio-minio-local` — MinIO **другого проекта**;
merfy-minio на `9010`. То есть `MINIO_PORT=9000` целился бы в чужое хранилище.

**Закрыто:** `assertLocalS3Endpoint()` вне `NODE_ENV=production` валит старт при
неизвестном хосте; обойти можно только осознанным `ALLOW_REMOTE_S3=true`.
Тест `local-s3-guard.spec.ts`, 11/11.

## Дыра 5 — у локального live не было рабочей раздачи

Витрина в MinIO лежит под префиксом `sites/<slug>/`, а HTML ссылается на
корневые пути (`/_astro/…`, `/icons/…`). При раздаче напрямую из MinIO —
25 упавших запросов, CSS не загружался, computed-шрифты вырождались в
Times New Roman. Сравнивать такое с эталоном бессмысленно.

**Закрыто:** локальный live поднят отдельным контейнером `merfy-local-live`
(`:8099`) по **тому же** шаблону, что прод — `backend/services/nginx-minio-proxy/
default.conf.template`, с `SITE_PATH=sites/8bcf6fe3862d`. Существующий
`merfy-nginx-sites` не тронут.

## Gate 1 — результат

| критерий | как проверено | итог |
|---|---|---|
| Preview и live выглядят одинаково | PNG сняты на 375/768/1280/1920, sha256 попарно совпали | ✓ |
| …и это не артефакт инструмента | HTML у них разный: live 111 209 Б, preview 186 348 Б | ✓ |
| Preview и live берут одну ревизию | `site.current_revision_id` = `revision_id` последнего успешного билда = `5bcd235d-6c90-4663-8452-abfdc15155c7` | ✓ |
| Сломанная сборка показывает ошибку | дист скрыт → `success:false`, `site_build.status='failed'` | ✓ |
| Нет перехода на fallback | legacy для мигрированных тем недоступен (2 гейта + 10 тестов) | ✓ |
| Локальная сборка пишет только в локальный MinIO | 166 файлов в `localhost:9010`, ноль обращений к `minio.merfy.ru` в логе | ✓ |

**Отступление от буквы дока:** гейт снят на реальной главной странице, а не на
«пустой технической странице с одним тестовым блоком». Побайтовое совпадение
превью и live на четырёх viewport реальной страницы — более сильное
доказательство, чем на одноблочной; отдельную техническую страницу не заводил.

## Как воспроизвести

```bash
# локальный запуск (держит контур локальным; гейты не дадут ошибиться)
/tmp/merfy-local-logs/start-local.sh          # :3114, BUILD_PIPELINE_ENABLED=true, S3 → localhost:9010

# локальный live по продовому конфигу раздачи
docker run -d --name merfy-local-live --network merfy-network -p 8099:80 \
  -v /tmp/merfy-local-logs/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro nginx:alpine

curl -X POST "http://localhost:3114/regenerate-site/<siteId>?template=flux"

node flux-baseline/capture.mjs --url http://localhost:8099/ --label local-live
node flux-baseline/capture.mjs --url http://localhost:3114/api/sites/<siteId>/preview --label local-preview
node flux-baseline/report.mjs reference local-live > flux-baseline/GAP-REFERENCE-VS-LOCAL.md
```

## Разрыв с эталоном — теперь измерим

Полная таблица: `flux-baseline/GAP-REFERENCE-VS-LOCAL.md`. Главное:

| секция | эталон (h: 375/768/1280/1920) | локальный Flux | комментарий |
|---|---|---|---|
| Hero | 380 / 480 / 540 / 810 | 280 / 360 / 480 / 480 | ровно та самая опечатка `380→280`; на 1920 нет `aspect-[1920/810]` |
| Header | 80 / 136 / 136 / 136 | 80 / 88 / 88 / 88 | эталон двухрядный (навигация отдельной строкой), наш однорядный |
| Footer | 901 / 638 / 638 / 638 | 339 / 359 / 359 / 359 | подвал заметно беднее эталона |
| ImageWithText | секция `aria-labelledby="cta-title"` | якоря нет → определяется как `main-child-4` | потерян семантический якорь |
| Gallery | `section#gallery` | якоря нет → `main-child-5` | потерян `id` |

⚠️ Часть расхождений в `featured`/`popular` объясняется данными, а не вёрсткой:
локально `RPC returned 0 products` (product-сервис не поднят) → рендерится демо.
Эти секции нельзя принимать по высоте, пока нет товаров.

## Изменённые файлы

| файл | что |
|---|---|
| `src/generator/build.service.ts` | `resolveThemePipeline`, `assertPipelineModeForTheme` |
| `src/generator/generator.service.ts` | вызов гейта в legacy-ветке; заглушка → исключение; `catch` со статусом `failed` |
| `src/storage/s3.service.ts` | `assertLocalS3Endpoint` + вызов вне `try` |
| `Dockerfile` | проверка обоих дистов (`theme-preview` + `theme-live`) для всех 5 мигрированных тем |
| `src/generator/__tests__/theme-pipeline-guard.spec.ts` | новый, 5 тестов |
| `src/generator/__tests__/legacy-mode-guard.spec.ts` | новый, 5 тестов |
| `src/storage/__tests__/local-s3-guard.spec.ts` | новый, 11 тестов |

Тесты: 21/21 новых; `src/generator/__tests__/` — 234/235 (единственный провал
`registries-rose` числится унаследованным с начала работ).

## Откат

```bash
git -C backend/services/sites/.worktrees/flux-constructor-live-markup diff > /tmp/phase1.patch
git -C backend/services/sites/.worktrees/flux-constructor-live-markup checkout -- \
  src/generator/build.service.ts src/generator/generator.service.ts src/storage/s3.service.ts Dockerfile
rm src/generator/__tests__/theme-pipeline-guard.spec.ts \
   src/generator/__tests__/legacy-mode-guard.spec.ts \
   src/storage/__tests__/local-s3-guard.spec.ts
docker rm -f merfy-local-live
```

Коммитов не делал, ничего не пушил, прод не деплоил.
