import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'132d3a3e-a28f-40b7-98fa-a0200151cfb8',themeId:'flux',page:'home'});
const NAV=[{label:'НавПроба Каталог',href:'/catalog'}];
for(const sch of ['scheme-1','scheme-4','scheme-2']){
  await applyProps(pg,'home','Header-home',{id:'Header-home',navigationLinks:NAV,menuColorScheme:sch});
  const r=await pg.evaluate(()=>{
    const navs=[...document.querySelectorAll('[data-puck-component-id="Header-home"] [data-nav-inline]')].filter(n=>n.getBoundingClientRect().height>1);
    const n=navs[0]; const a=n?.querySelector('a');
    return {cls:(n?.className||'').slice(0,60), varText:n?getComputedStyle(n).getPropertyValue('--color-text'):null, aColor:a?getComputedStyle(a).color:null};
  });
  console.log(sch, JSON.stringify(r));
}
await browser.close();
