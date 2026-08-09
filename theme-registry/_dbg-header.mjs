import { openPreview, applyProps } from './probe.mjs';
const {browser,pg}=await openPreview({siteId:'e03dd420-febf-4499-9fc4-992412cc1b99',themeId:'rose',page:'home'});
const NAV=[{label:'НавПроба Каталог',href:'/catalog'}];
const base={id:'Header-1',navigationLinks:NAV};
const dump=async(tag)=>{
  const r=await pg.evaluate(()=>{
    const root=document.querySelector('[data-puck-component-id="Header-1"]');
    const links=[...root.querySelectorAll('a')].slice(0,4).map(a=>({href:a.getAttribute('href'),txt:(a.textContent||'').trim().slice(0,14),img:!!a.querySelector('img,svg')}));
    const hdr=root.querySelector('header');
    const nav=root.querySelector('[data-nav-inline]');
    const wrap=root.parentElement;
    return {links, hdrBg:hdr?getComputedStyle(hdr).bg||getComputedStyle(hdr).backgroundColor:null,
      rootCls:(root.className||'').slice(0,60), wrapCls:(wrap.className||'').slice(0,80),
      navCls:(nav?.className||'').slice(0,80), navColor:nav?getComputedStyle(nav).color:null,
      navLinkColor:nav?getComputedStyle(nav.querySelector('a')||nav).color:null};
  });
  console.log(tag, JSON.stringify(r,null,1));
};
await applyProps(pg,'home','Header-1',{...base,colorScheme:'scheme-1',menuColorScheme:'scheme-1'});
await dump('scheme-1:');
await applyProps(pg,'home','Header-1',{...base,colorScheme:'scheme-4',menuColorScheme:'scheme-4'});
await dump('scheme-4:');
await browser.close();
