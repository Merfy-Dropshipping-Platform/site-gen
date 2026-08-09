import { openPreview, applyProps, snapshot } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const real={id:'Hero-1',backgroundImages:{url1:'https://minio.merfy.ru/product-images/c02b5c8c-6b9b-4f32-9edb-7df26a953236.png'}};
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
const h1=async()=>pg.evaluate(()=>{const h=document.querySelector('[data-puck-component-id="Hero-1"] h1');return h?{fs:getComputedStyle(h).fontSize,t:(h.textContent||'').slice(0,22)}:null;});
// имитация полного прогона: heading.text A → B → restore → heading.size small
console.log('apply text Альфа →', await applyProps(pg,'home','Hero-1',{...real,heading:{text:'Проба реестра Альфа'}}), JSON.stringify(await h1()));
console.log('apply text Бета  →', await applyProps(pg,'home','Hero-1',{...real,heading:{text:'Проба реестра Бета'}}), JSON.stringify(await h1()));
console.log('restore real     →', await applyProps(pg,'home','Hero-1',real), JSON.stringify(await h1()));
console.log('apply size=small →', await applyProps(pg,'home','Hero-1',{...real,heading:{text:'Проба кегля',size:'small'}}), JSON.stringify(await h1()));
console.log('apply size=medium→', await applyProps(pg,'home','Hero-1',{...real,heading:{text:'Проба кегля',size:'medium'}}), JSON.stringify(await h1()));
// контейнер: предки заголовка
await applyProps(pg,'home','Hero-1',{...real,heading:{text:'Проба контейнера'},container:'true'});
const chain=await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="Hero-1"]');
  const h=root?.querySelector('h1'); if(!h) return 'нет h1';
  const out=[]; let a=h.parentElement;
  while(a&&a!==root){const cs=getComputedStyle(a);out.push({cls:(a.className||'').slice(0,80),bg:cs.backgroundColor,pad:cs.padding});a=a.parentElement;}
  return out;
});
console.log('container=true предки h1:', JSON.stringify(chain,null,1).slice(0,900));
await browser.close();
