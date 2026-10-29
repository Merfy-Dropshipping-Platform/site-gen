import { DocsPublishError, clientFor, configFrom, publishDocs } from '../src/publish';

// pnpm docs:publish (раздел «Документация», З2): generated/ → MinIO, storefront-sdk/v<мажор>/ и versions.json.
// Адрес DOCS_S3_ENDPOINT и ключи DOCS_S3_ACCESS_KEY, DOCS_S3_SECRET_KEY — обязательны; бакет DOCS_S3_BUCKET
// по умолчанию merfy-docs. Без адреса или ключей — сообщение и код выхода 1.
try {
  const config = configFrom(process.env);
  const result = await publishDocs(clientFor(config), config);
  process.stdout.write(`${result.keys.map((key) => `выгружен ${key}`).join('\n')}\n`);
  process.stdout.write(
    `${config.endpoint}/${config.bucket}: ${result.keys.length} файлов, текущий мажор ${result.versions.current}\n`,
  );
} catch (error) {
  const text = error instanceof DocsPublishError ? error.message : `Выгрузка не удалась: ${String(error)}`;
  process.stderr.write(`${text}\n`);
  process.exitCode = 1;
}
