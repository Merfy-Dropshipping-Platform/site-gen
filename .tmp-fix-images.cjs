// Фикс картинок: 60 товаров flux-сайта 10caf133 ссылаются на МЁРТВЫЕ MinIO-URL (404).
// Заменяем на ЖИВЫЕ (старые product-images, проверенные 200). PATCH через Product Service :3113.
// Запуск: node .tmp-fix-images.cjs

const SITE = '10caf133-cb75-4bb9-875e-a429b201b8a7';
const BASE = `http://176.57.218.121:3113/${SITE}`;

// Пул старых ЖИВЫХ картинок (createdAt < май, статус 200)
const LIVE = [
  '3f3e17fb-5a2a-43f4-80fb-9297846ac9f9.png','d89df818-2a88-46ad-b08e-002f4b4641a5.png',
  'af5d375f-822d-43d4-a036-d707cef74c4e.png','55df55df-b760-469a-8af2-1fbc264b8c28.png',
  'd07201d0-79b4-4623-a58d-b698c4e3d09f.png','7d343f1a-b0b0-42eb-9ba9-c717de196685.png',
  '7bee15b1-1b71-4f35-ae6f-ef1e359a1d10.jpg','365be086-5f5f-483c-a42d-b5c4602a2d77.jpg',
  'cde639db-c8c9-4e62-9dbc-9a20b4ca18fc.jpg','8b1959a0-8ef6-46be-afb7-08da237e9c4c.jpg',
  '0d29b9b8-167c-4633-8159-6280130afb3a.jpg','fa49cf06-6099-402e-b2ab-6418a0dd05e2.jpg',
  '24df30b2-8a5b-4697-a76d-adb8039c09ea.png','9eee2c04-6fb7-48ad-a821-f685fde43098.png',
  '0e580b31-3c2a-4c19-a6b1-f5215b00f26e.jpg','254f5b67-d6c1-410d-8093-50de94e10b5a.jpg',
  '5365be14-659b-4a38-b2f4-8ddf98d2e54a.png','0638f355-7538-42c6-a94e-689ac2a6c942.png',
  '3b5ce389-70d9-47dd-a0a5-0c9bbd16136c.jpg','840550c3-e1ed-4829-84ea-b6043edae2ae.jpg',
  '2fd25c8f-7231-454e-bbbe-434c8eafce02.jpg','e5350713-44dd-46e9-a96e-0ca469fe25a8.jpg',
  '83eb76e8-7c4d-4d7e-a3be-9cd41e6c23ce.png','874e1548-da1e-4e66-9e03-5b58b77358df.png',
  'f5dfca57-47a9-4ddc-b624-8a5e3f039e75.png','1eeae773-5db4-4843-af5b-afa0834cec4e.png',
  '7b726c06-697e-47e5-b667-95adcdef76f2.png','a4d18204-9035-43a3-910c-02248e99bacd.png',
  '8ea59767-5da6-4b46-96f7-2abc4706c990.png','0415af88-a6c9-4466-a42f-2efcbd4dc2fe.jpg',
  'b275c5df-cc0e-46e9-b9c1-88145192b963.jpg','5297e2bf-5cf0-4a3a-872e-414987f65d80.jpeg',
  '174ca3fa-1bc0-4630-8a75-4e2971584d87.jpeg','197e9b8f-fe21-4ba6-aec3-841e4d0b1541.jpeg',
  'cf46d90d-62da-46d1-9a03-059eb1c201d1.jpeg','46535070-21f4-4a7c-b625-7fc5fea82222.jpeg',
  '48de1b34-f14d-4bf3-b1fa-d0127547a889.jpeg','719c9c5c-261f-419c-aeab-593d34d70dd2.jpg',
  '152a4a63-15f1-492b-bf2e-582c45057722.jpeg','c4db8b52-d658-4afe-bb4e-2e3ac45e5583.jpg',
  'e9ca8fcb-55d9-4def-8799-a56e66a332b3.jpeg','ba88a6a7-51bb-45f6-93f1-8781014a3f5d.jpg',
  '145163d5-0a9b-4e0f-9d83-a541aabfa406.jpg','a44c8122-111f-4d70-800d-4cc7d81e39b0.jpg',
  '2a5e92ed-03eb-4990-8389-b4e38a80d9b7.png',
].map((u) => `https://minio.merfy.ru/product-images/${u}`);

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = txt; }
  return { ok: res.ok, status: res.status, json, txt };
}
async function head(url) {
  try { const r = await fetch(url, { method: 'GET' }); return r.status; } catch { return 0; }
}

(async () => {
  // 1. Проверить живость пула
  console.log('Проверяю живость пула...');
  const alive = [];
  for (const u of LIVE) {
    const st = await head(u);
    if (st === 200) alive.push(u);
    else console.log('  ✗ мёртвая:', u.split('/').pop(), st);
  }
  console.log(`Живых картинок: ${alive.length}/${LIVE.length}`);
  if (alive.length === 0) { console.error('НЕТ живых картинок!'); process.exit(1); }

  // 2. Точный список 60 живых ID (из SQL, deletedAt IS NULL)
  const IDS = 'efdb6b7c-dfd3-44b0-8882-60e536c9ec8a,8f024089-0231-4897-8f68-099c21cc3a3e,09c6db97-1faf-4d65-916c-57f6f161272b,06c15f26-367f-47c7-a0a1-20fe05510987,234d76a3-9677-4834-b109-616e1760fd8e,c65887d0-7170-44c7-9029-1d2a8d891008,535464c0-4ecd-4ac0-b4d3-251dfe86c25b,aca00b3e-4474-4188-8ef5-ab37b2e6564f,86736e34-5cc6-46b0-916b-ef2fc38bb3b0,348bc58d-9208-4f2f-8bcf-c8c8401a29e9,cec8a083-e6d2-479a-bb64-9733b9167275,9479a93f-973d-4e87-bdf5-e6385dc53f34,409523e7-31ec-4936-be17-255e53a194c8,711fa50d-df8f-43de-9450-aa66c844c13c,c3e790eb-f432-48cb-bfa0-1362a1d2e3f3,552abe66-f6d4-471c-a627-53933f59fff8,9a4712f8-00ba-4ccc-9bd2-60d63e765201,4a47b5e0-0f41-4f9d-b870-2a0cd96c7568,58482110-ca94-453d-984d-681143b83711,352b6605-943f-4eb2-b786-548f65ff50df,3e480e47-73a8-4147-88d9-9450c1dc616c,4bdcd83f-6539-48ac-beaf-74751afe40cb,33697a13-23dd-4fc5-bc95-e8732e50b2a4,f257856a-bc1c-4da6-b3c3-86b462547c03,efd76143-0479-4615-95a0-9f0d526d3945,3d19554d-9d2b-444c-8d2a-24f86be20379,0be3c3b2-de98-407b-a1bb-d8a135f4d625,d1f04720-baa6-4a03-8179-aca27ddf8fc1,9be3168d-d45b-40cf-ab25-da262277aad5,d5a361a7-df8e-4c01-b205-f56d1be9b7d6,e074ff1f-ddcf-499d-8ea4-eff6c8270043,ed2817e3-14f1-4d5e-b4c2-e0a7b535d781,fe9d40c5-6324-4281-be8b-763a14feef90,251bcf74-b509-4c6f-8828-5e53ef284050,ebb6c527-7dba-4617-a291-1432053d5d6f,4f55dabb-3a7d-4c7e-8a99-b0dd82cef0fe,721fb7c5-b32f-43a4-9202-104e10bcdf45,c69cf9b6-e9be-4002-bd9f-3c62a1bdd0f5,db3a0b05-8128-425d-abfb-edaeb4f0e410,7ef9be59-467f-493a-9930-14dda9c763c8,97cb6660-07f2-477b-8bc3-6e7961d560a4,6dbaf3c4-b7d8-47ac-9ea0-5b45db4c49f7,aef1338b-2771-4c29-948e-f9f97be08db9,8c2b3a06-1747-4bed-8f9a-ee312a0ae750,99a7cf1d-6156-4c0c-b957-121f727e1c4b,35d9a862-c83e-4f08-8841-295d0b5fe5f3,2502a5b2-a090-4ad9-9435-63778b4587b2,18b03fd2-d322-49ed-8257-82885b9e9236,63d8f599-232a-46fc-9df4-088e1dac6e67,3abc5274-5e66-43a6-ae3a-6c40821560fb,be337d66-db24-4b8d-b17f-c6a39a8f1bf0,50eaf964-aba5-49fd-bfb3-19a4a44da05b,4b1cd064-a085-4b10-a882-0d3e76ed8cdd,3d9697d4-a42a-4c8f-9577-4bf52f064cfc,aca5be82-7d14-49b6-933f-55e086a7aaac,3cfdd3ac-584c-4a42-a6ac-4d0a38462dca,8318e2bf-cae5-455e-a44c-5096c4d1f5f1,7071a65c-676f-4de8-b81f-e946bda7495e,0443447e-dd1e-4d81-91ff-b8cc9dfd28a9,0e0e358c-7536-448e-9129-7ecc77bfccbc'.split(',');
  console.log(`Товаров (живых ID): ${IDS.length}`);

  // 3. PATCH каждому живую картинку (циклически, разнообразие)
  let ok = 0, fail = 0;
  for (let i = 0; i < IDS.length; i++) {
    const img = alive[i % alive.length];
    const r = await api('PATCH', `/products/${IDS[i]}`, { images: [img] });
    if (r.ok) ok++; else { fail++; if (fail <= 3) console.log('  ✗ PATCH', IDS[i], r.status, String(r.txt).slice(0,100)); }
  }
  console.log(`\n=== ИТОГ ===`);
  console.log(`Обновлено images: ${ok} | ошибок: ${fail}`);
})().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
