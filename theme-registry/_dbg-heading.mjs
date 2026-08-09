import { openPreview, applyProps } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
const base={id:'Hero-1',backgroundImages:{url1:'https://minio.merfy.ru/product-images/c02b5c8c-6b9b-4f32-9edb-7df26a953236.png'},heading:{text:'Проба кегля'}};
for(const v of ['small','medium','large','small']){
  await applyProps(pg,'home','Hero-1',{...base,heading:{...base.heading,size:v}});
  const r=await pg.evaluate(()=>{
    const e=document.querySelector('[data-puck-component-id="Hero-1"]');
    const h=e?.querySelector('h1,h2,h3');
    return h?{fs:getComputedStyle(h).fontSize,cls:(h.className||'').match(/text-\[[^\]]*\]|lg:[^ ]*text[^ ]*/g)?.slice(0,6)}:null;
  });
  console.log(v,'→',JSON.stringify(r));
}
await browser.close();
