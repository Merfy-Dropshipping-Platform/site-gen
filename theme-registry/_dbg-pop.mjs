import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'e03dd420-febf-4499-9fc4-992412cc1b99',themeId:'rose',page:'home'});
await applyProps(pg,'home','PopularProducts-1',{id:'PopularProducts-1',quickAddMode:'cart',cards:8});
await pg.waitForTimeout(5000);
console.log(JSON.stringify(await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="PopularProducts-1"]');
  const lis=[...(root?.querySelectorAll('li')||[])];
  return {lis:lis.length, withProd:lis.filter(l=>l.hasAttribute('data-product-id')).length,
    addBtns:root?.querySelectorAll('[data-add-to-cart]').length, demo:!!root?.querySelector('[data-nt="catalog-demo"], .placeholder'),
    firstLiTxt:(lis[0]?.innerText||'').slice(0,30)};
})));
await browser.close();
