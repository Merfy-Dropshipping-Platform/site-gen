import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'132d3a3e-a28f-40b7-98fa-a0200151cfb8',themeId:'flux',page:'home'});
const NAV=[{label:'НавПроба Каталог',href:'/catalog'},{label:'НавПроба О нас',href:'/about'}];
for(const sch of ['scheme-1','scheme-4']){
  await applyProps(pg,'home','Header-home',{id:'Header-home',navigationLinks:NAV,menuColorScheme:sch});
  const r=await pg.evaluate(()=>{
    const root=document.querySelector('[data-puck-component-id="Header-home"]');
    const navs=[...root.querySelectorAll('[data-nav-inline]')].map(n=>({vis:n.getBoundingClientRect().height>1,cls:(n.className||'').slice(0,70),
      links:[...n.querySelectorAll('a')].slice(0,3).map(a=>({t:(a.textContent||'').trim().slice(0,12),c:getComputedStyle(a).color,cls:(a.className||'').slice(0,60)}))}));
    return navs;
  });
  console.log(sch, JSON.stringify(r,null,1).slice(0,800));
}
await browser.close();
