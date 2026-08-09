import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'e03dd420-febf-4499-9fc4-992412cc1b99',themeId:'rose',page:'catalog'});
await applyProps(pg,'catalog','Catalog-1',{id:'Catalog-1',showFilter:'true',filterPosition:'top'});
await pg.waitForTimeout(4000);
console.log('TOP:',JSON.stringify(await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="Catalog-1"]');
  return {summaries:[...root.querySelectorAll('summary')].map(s=>({t:(s.textContent||'').trim().slice(0,20),vis:s.getBoundingClientRect().width>1}))};
})));
await applyProps(pg,'catalog','Catalog-1',{id:'Catalog-1',showFilter:'true',filterPosition:'side'});
await pg.waitForTimeout(4000);
console.log('SIDE:',JSON.stringify(await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="Catalog-1"]');
  const rect=(el)=>{const r=el?.getBoundingClientRect();return r&&r.width>1?{x:+r.x.toFixed(0),y:+r.y.toFixed(0),w:+r.width.toFixed(0)}:null};
  const aside=rect(root.querySelector('aside[data-nt="filter-sidebar"]'));
  const li=root.querySelector('li[data-product-id]');
  return {aside, li:rect(li), liParent:rect(li?.parentElement), attr:root.getAttribute('data-catalog-layout')};
})));
await browser.close();
