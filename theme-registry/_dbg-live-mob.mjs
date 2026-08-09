import { chromium } from 'playwright';
const b=await chromium.launch({headless:true});
const pg=await b.newPage({viewport:{width:390,height:844}});
await pg.goto('http://localhost:8099/',{waitUntil:'domcontentloaded',timeout:60000});
await pg.waitForTimeout(2500);
const r=await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="Hero-home"]')||document.querySelector('section[aria-labelledby="hero-title"]')||[...document.querySelectorAll('section')][0];
  const vis=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();let o=1,n=el;while(n&&n!==document.body){const cs=getComputedStyle(n);if(cs.display==='none')return{display:'none'};o*=parseFloat(cs.opacity||'1');n=n.parentElement;}return{w:+r.width.toFixed(0),h:+r.height.toFixed(0),y:+r.y.toFixed(0),op:+o.toFixed(2)};};
  const h1=root?.querySelector('h1');
  const btn=[...(root?.querySelectorAll('a,button')||[])].find(e=>(e.textContent||'').includes('Смотреть каталог'));
  const logo=[...document.querySelectorAll('header img, [data-nt="flux-header"] img')].map(i=>({src:(i.getAttribute('src')||'').slice(-30),loaded:i.complete&&i.naturalWidth>0,vis:i.getBoundingClientRect().width>0}));
  return {rootTag:root?.tagName, h1:vis(h1), h1txt:h1?.textContent?.trim().slice(0,28), btn:vis(btn), logo:logo.slice(0,4)};
});
console.log(JSON.stringify(r,null,1));
await pg.screenshot({path:'/tmp/merfy-local-logs/_live-mob.png'});
await b.close();
