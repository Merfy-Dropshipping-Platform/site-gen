import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'e03dd420-febf-4499-9fc4-992412cc1b99',themeId:'rose',page:'catalog'});
const base={id:'Catalog-1'};
await applyProps(pg,'catalog','Catalog-1',{...base,cards:4,showFilter:'true',showSort:'true',filterPosition:'top','productCard':{quickAdd:'true',buttonStyle:'primary',cardStyle:'card',cardBackground:'true'},containerColorScheme:'scheme-4'});
await pg.waitForTimeout(5000);
const r=await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="Catalog-1"]');
  const attrs={}; for(const a of root.attributes) if(a.name.startsWith('data-')) attrs[a.name]=a.value.slice(0,40);
  const lis=[...root.querySelectorAll('li[data-product-id]')].filter(li=>!li.closest('template'));
  const li=lis[0];
  const liDump=li?{
    attrs:[...li.attributes].map(a=>a.name+'='+a.value.slice(0,24)).join(' '),
    html:li.innerHTML.slice(0,500),
    bg:getComputedStyle(li).backgroundColor,
    innerBgs:[...li.querySelectorAll('*')].slice(0,6).map(e=>({t:e.tagName,bg:getComputedStyle(e).backgroundColor,cls:(e.className||'').toString().slice(0,40)})),
  }:null;
  const sortEls=[...root.querySelectorAll('details,button,summary')].filter(e=>/сортир|популярн|по цене|sort/i.test(e.textContent||'')).map(e=>({t:e.tagName,txt:(e.textContent||'').trim().slice(0,40),vis:e.getBoundingClientRect().width>1}));
  const filtRow=root.querySelector('[data-nt="catalog-filters"]');
  const scheme=[...root.querySelectorAll('[class*="color-scheme"]')].slice(0,3).map(e=>({cls:(e.className||'').toString().match(/color-scheme-\d+/)?.[0],bg:getComputedStyle(e).backgroundColor,tag:e.tagName}));
  return {attrs, liCount:lis.length, liDump, sortEls:sortEls.slice(0,4), filtRowVisible:!!filtRow&&filtRow.getBoundingClientRect().height>1, scheme};
});
console.log(JSON.stringify(r,null,1).slice(0,2600));
await browser.close();
