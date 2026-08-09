// Репро: мобильный вьюпорт 390px, реальные пропы юзера — виден ли контент-блок Hero
import { chromium } from 'playwright';
const b=await chromium.launch({headless:true});
const pg=await b.newPage({viewport:{width:390,height:844}});
await pg.goto('http://localhost:3110/api/sites/132d3a3e-a28f-40b7-98fa-a0200151cfb8/preview?page=home',{waitUntil:'networkidle',timeout:60000});
await pg.waitForTimeout(1500);
const r=await pg.evaluate(()=>{
  const root=document.querySelector('[data-puck-component-id="Hero-home"]');
  const vis=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();let o=1,n=el;while(n&&n!==document.body){const cs=getComputedStyle(n);if(cs.display==='none')return{display:'none'};o*=parseFloat(cs.opacity||'1');n=n.parentElement;}return{w:r.width,h:r.height,x:r.x,y:r.y,opacity:o};};
  const h1=root?.querySelector('h1');
  const btn=[...(root?.querySelectorAll('a,button')||[])].find(e=>(e.textContent||'').includes('Смотреть каталог'));
  const imgs=[...(root?.querySelectorAll('img')||[])].map(i=>({w:i.getBoundingClientRect().width,h:i.getBoundingClientRect().height,cls:(i.className||'').slice(0,60)}));
  // логотип мобильной шапки
  const logo=document.querySelector('[data-puck-component-id="Header-home"] img');
  return {
    hero:vis(root), h1:vis(h1), h1txt:h1?.textContent?.trim().slice(0,30), btn:vis(btn),
    imgs, logoSrc:logo?.getAttribute('src'), logoLoaded:logo?logo.complete&&logo.naturalWidth>0:null,
  };
});
console.log(JSON.stringify(r,null,1));
await pg.screenshot({path:'/tmp/merfy-local-logs/_mob-hero.png', fullPage:false});
await b.close();
