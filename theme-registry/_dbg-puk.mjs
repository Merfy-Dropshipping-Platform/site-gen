import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'132d3a3e-a28f-40b7-98fa-a0200151cfb8',themeId:'flux',page:'home'});
for(const w of ['small','large']){
  await applyProps(pg,'home','ImageWithText-home',{id:'ImageWithText-home',width:w,heading:{text:'Проба'},image:{url:'https://minio.merfy.ru/product-images/c02b5c8c-6b9b-4f32-9edb-7df26a953236.png'}});
  const r=await pg.evaluate(()=>{
    const root=document.querySelector('[data-puck-component-id="ImageWithText-home"]');
    const grid=root?.querySelector('.grid');
    return {gridW:grid?.getBoundingClientRect().width, gridCls:(grid?.className||'').match(/max-w-\S+/)?.[0]};
  });
  console.log(w,'→',JSON.stringify(r));
}
await browser.close();
