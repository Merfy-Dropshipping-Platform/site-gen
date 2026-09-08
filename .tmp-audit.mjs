import { chromium } from 'playwright';
const URL = process.argv[2] || 'https://1dw339dxomuy.merfy.ru';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true });
const page = await ctx.newPage();
await page.goto(URL,{waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('warn',e.message));
await page.waitForTimeout(3000);
const sections = await page.evaluate(()=>{
  const main=document.querySelector('main')||document.body;
  return Array.from(main.children).filter(el=>el.tagName!=='SCRIPT'&&el.tagName!=='STYLE'&&el.tagName!=='TEMPLATE').map(el=>{
    const r=el.getBoundingClientRect();
    return { block: el.getAttribute('data-block')||el.getAttribute('data-nt')||el.tagName.toLowerCase()+'.'+(el.className||'').slice(0,30), h:Math.round(r.height), w:Math.round(r.width), vh:Math.round(r.height/window.innerHeight*100)+'vh' };
  });
});
console.log('VIEWPORT 390x844');
console.log(JSON.stringify(sections,null,1));
await page.screenshot({path:'/tmp/audit-full.png', fullPage:true});
console.log('fullpage: /tmp/audit-full.png');
await browser.close();
