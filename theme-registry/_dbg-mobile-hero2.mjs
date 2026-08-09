// Сценарий конструктора: грузим на десктопе 1400 → ресайзим до 390 БЕЗ перезагрузки
import { chromium } from 'playwright';
const b=await chromium.launch({headless:true});
const pg=await b.newPage({viewport:{width:1400,height:900}});
await pg.goto('http://localhost:3110/api/sites/132d3a3e-a28f-40b7-98fa-a0200151cfb8/preview?page=home',{waitUntil:'domcontentloaded',timeout:60000});
await pg.waitForTimeout(1500);
const probe=async(tag)=>{
  const r=await pg.evaluate(()=>{
    const root=document.querySelector('[data-puck-component-id="Hero-home"]');
    const vis=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();let o=1,n=el;while(n&&n!==document.body){const cs=getComputedStyle(n);if(cs.display==='none')return{display:'none'};o*=parseFloat(cs.opacity||'1');n=n.parentElement;}return{w:+r.width.toFixed(0),h:+r.height.toFixed(0),y:+r.y.toFixed(0),opacity:+o.toFixed(2)};};
    const h1=root?.querySelector('h1');
    const btn=[...(root?.querySelectorAll('a,button')||[])].find(e=>(e.textContent||'').includes('Смотреть каталог'));
    const content=h1?.closest('[data-reveal],[data-reveal-group]')||h1?.parentElement;
    const headerImgs=[...document.querySelectorAll('[data-puck-component-id="Header-home"] img')].map(i=>({src:(i.getAttribute('src')||'').slice(-40),loaded:i.complete&&i.naturalWidth>0,vis:i.getBoundingClientRect().width>0}));
    return {h1:vis(h1),btn:vis(btn),contentReveal:content?{cls:(content.className||'').slice(0,50),...vis(content),reveal:content.hasAttribute('data-reveal')||content.hasAttribute('data-reveal-group')}:null,headerImgs};
  });
  console.log(tag,JSON.stringify(r,null,1));
};
await probe('1400px:');
await pg.setViewportSize({width:390,height:844});
await pg.waitForTimeout(1800);
await probe('после ресайза до 390:');
await pg.screenshot({path:'/tmp/merfy-local-logs/_mob-hero-resized.png'});
await b.close();
