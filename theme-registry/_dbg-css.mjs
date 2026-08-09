import { chromium } from 'playwright';
const b=await chromium.launch({headless:true});
const pg=await b.newPage({viewport:{width:1400,height:900}});
const fails=[]; pg.on('response',r=>{ if(r.status()>=400) fails.push(r.status()+' '+r.url().slice(0,120)); });
await pg.goto('http://localhost:3110/api/sites/e03dd420-febf-4499-9fc4-992412cc1b99/preview?page=home',{waitUntil:'networkidle',timeout:60000});
await pg.waitForTimeout(800);
const css=await pg.evaluate(()=>{
  const sheets=[...document.styleSheets].map(s=>{try{return {href:s.href&&s.href.slice(-60), rules:s.cssRules.length}}catch(e){return {href:s.href, err:String(e).slice(0,40)}}});
  let absRule=false;
  try{ for(const s of document.styleSheets){ for(const r of s.cssRules){ if(r.selectorText==='.absolute'){absRule=true;break} } if(absRule)break; } }catch{}
  const links=[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href.slice(-80));
  return {sheets,absRule,links};
});
console.log('40x/50x:',fails.slice(0,10));
console.log('links:',css.links);
console.log('sheets:',JSON.stringify(css.sheets));
console.log('.absolute rule есть?',css.absRule);
await b.close();
