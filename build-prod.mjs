import pg from 'pg';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SITES_DB_URL = 'postgres://postgres:cVA8ECEkmfrJmgTagElGLVxoE5em8CRN7mGisQkAQpotHcurNwdhRyFlu5Ck7l9O@176.57.218.121:54321/sites_service';
const PRODUCT_DB_URL = 'postgres://postgres:cVA8ECEkmfrJmgTagElGLVxoE5em8CRN7mGisQkAQpotHcurNwdhRyFlu5Ck7l9O@176.57.218.121:54321/product_service';
const S3_CONFIG = {
  endpoint: 'https://minio.merfy.ru',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'dpOHmZ0XdL3SgOA8',
    secretAccessKey: 'IN90JDi2qrmgAnTrMP1OucFx7AMXHRzM',
  },
  forcePathStyle: true,
};
const BUCKET = 'merfy-sites';
const SITE_ID = '78140a6d-1863-4bc4-b507-439ae1fdb774';
const TENANT_ID = '1431a28c-bce5-45e9-bf42-e45a8b9f21f3';

async function copyDir(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'inherit' });
    proc.on('exit', code => code === 0 ? resolve() : reject(new Error(cmd + ' failed')));
    proc.on('error', reject);
  });
}

async function deletePrefix(s3, bucket, prefix) {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  if (!list.Contents || list.Contents.length === 0) return;
  await s3.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: list.Contents.map(obj => ({ Key: obj.Key })) },
  }));
}

async function uploadDirectory(s3, bucket, prefix, dir) {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const key = prefix + entry.name;
    if (entry.isDirectory()) {
      count += await uploadDirectory(s3, bucket, key + '/', fullPath);
    } else {
      const body = await fs.readFile(fullPath);
      const contentType = mime.lookup(entry.name) || 'application/octet-stream';
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      count++;
    }
  }
  return count;
}

async function main() {
  console.log('Connecting to Sites DB...');
  const sitesPool = new pg.Pool({ connectionString: SITES_DB_URL });

  console.log('Connecting to Product DB...');
  const productPool = new pg.Pool({ connectionString: PRODUCT_DB_URL });

  const siteRows = await sitesPool.query(
    'SELECT s.id, s.name, s.theme_id, s.current_revision_id, s.public_url, t.template_id FROM site s LEFT JOIN theme t ON s.theme_id = t.id WHERE s.id = $1',
    [SITE_ID]
  );
  const site = siteRows.rows[0];
  console.log('Site:', site?.name, 'theme:', site?.template_id);

  const revRows = await sitesPool.query('SELECT id, data, meta FROM site_revision WHERE id = $1', [site.current_revision_id]);
  const revision = revRows.rows[0];

  // Получаем товары из Product Service (как это делает RabbitMQ)
  const productsRows = await productPool.query(
    'SELECT id, title, description, "basePrice", images FROM products WHERE "shopId" = $1 AND status = $2 LIMIT 20',
    [TENANT_ID, 'active']
  );
  const products = productsRows.rows.map(p => ({
    id: p.id,
    name: p.title,
    description: p.description,
    price: parseFloat(p.basePrice) || 0,
    images: p.images || [],
    slug: p.id,
  }));
  console.log('Products from Product Service:', products.length);

  const workDir = path.join('/tmp', 'astro-build', SITE_ID);
  const templatesDir = path.join(__dirname, 'templates/astro/rose');

  console.log('Templates dir:', templatesDir);

  await fs.rm(workDir, { recursive: true, force: true });
  await copyDir(templatesDir, workDir);

  const pageData = {
    ...(revision?.data || {}),
    meta: {
      ...(revision?.meta || {}),
      title: site.name || 'Мой магазин',
      shopId: TENANT_ID,
      apiUrl: 'https://api.merfy.ru',
    },
  };
  await fs.mkdir(path.join(workDir, 'src/data'), { recursive: true });
  await fs.writeFile(path.join(workDir, 'src/data/data.json'), JSON.stringify(pageData, null, 2));
  await fs.writeFile(path.join(workDir, 'src/data/products.json'), JSON.stringify(products, null, 2));
  console.log('Data files written');

  console.log('npm install...');
  await runCommand('npm', ['install', '--silent'], workDir);
  console.log('astro build...');
  await runCommand('npm', ['run', 'build'], workDir);

  const distDir = path.join(workDir, 'dist');
  const prefix = 'sites/1431a28cbce5/';

  console.log('Uploading to S3...');
  const s3 = new S3Client(S3_CONFIG);
  await deletePrefix(s3, BUCKET, prefix);
  const uploaded = await uploadDirectory(s3, BUCKET, prefix, distDir);
  console.log('Uploaded', uploaded, 'files to', prefix);

  await sitesPool.end();
  await productPool.end();
  console.log('Done!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
