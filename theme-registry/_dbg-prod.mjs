import { openPreview, applyProps } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'product'});
const r=await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="Product-1"]');
  const out=[];
  const walk=(el,d)=>{ if(d>3)return; const r=el.getBoundingClientRect();
    if(r.width>60&&r.height>60) out.push('  '.repeat(d)+el.tagName+(el.className?'.'+String(el.className).split(' ').slice(0,3).join('.'):'')+` ${r.width.toFixed(0)}×${r.height.toFixed(0)} @${(r.x).toFixed(0)},${(r.y).toFixed(0)}`+(el.querySelector('img')?' [есть img глубже]':''));
    for(const c of el.children) walk(c,d+1); };
  walk(root,0);
  return {tree: out.slice(0,25), imgs: root.querySelectorAll('img').length, svgs: root.querySelectorAll('svg').length};
});
console.log(r.imgs,'img,',r.svgs,'svg'); console.log(r.tree.join('\n'));
await browser.close();
