import { chromium } from 'playwright';
const b=await chromium.launch({headless:true});
const pg=await b.newPage({viewport:{width:390,height:844}});
await pg.goto('http://localhost:4321/',{waitUntil:'domcontentloaded',timeout:60000});
await pg.waitForTimeout(2000);
const r=await pg.evaluate(()=>{
  const sec=[...document.querySelectorAll('section')].find(s=>s.querySelector('h1'))||document.querySelector('section');
  const h1=sec?.querySelector('h1');
  const imgs=[...(sec?.querySelectorAll('img')||[])].map(i=>({w:+i.getBoundingClientRect().width.toFixed(0),h:+i.getBoundingClientRect().height.toFixed(0)}));
  const btn=[...(sec?.querySelectorAll('a,button')||[])].map(e=>({t:(e.textContent||'').trim().slice(0,20),y:+e.getBoundingClientRect().y.toFixed(0)})).slice(0,3);
  return {h1txt:h1?.textContent?.trim().slice(0,30), h1y:+(h1?.getBoundingClientRect().y??-1).toFixed(0), imgs, btn, secH:+(sec?.getBoundingClientRect().height??0).toFixed(0)};
});
console.log(JSON.stringify(r));
await pg.screenshot({path:'/tmp/merfy-local-logs/_verstka-mob.png'});
await b.close();
