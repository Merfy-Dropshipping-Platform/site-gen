import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'e03dd420-febf-4499-9fc4-992412cc1b99',themeId:'rose',page:'catalog'});
await applyProps(pg,'catalog','Catalog-1',{id:'Catalog-1',showFilter:'true',filterPosition:'side'});
for(const w of [3000,6000]){ await pg.waitForTimeout(w);
  console.log(w,JSON.stringify(await pg.evaluate(()=>{
    const root=document.querySelector('[data-puck-component-id="Catalog-1"]');
    const uls=[...root.querySelectorAll('ul,ol')].map(u=>({kids:u.children.length, liProd:u.querySelectorAll('li[data-product-id]').length, sk:u.querySelectorAll('[data-nt="catalog-skeleton"]').length, vis:u.getBoundingClientRect().width>1, cls:(u.className||'').slice(0,30)})).filter(u=>u.kids>0).slice(0,5);
    return {uls, layout:root.getAttribute('data-catalog-layout')};
  })));
}
await browser.close();
