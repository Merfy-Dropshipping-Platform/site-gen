import { openPreview } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
const r=await pg.evaluate(()=>{
  const st=[...document.head.querySelectorAll('style')].find(s=>s.textContent.includes('collections-title'));
  const rules=[...st.sheet.cssRules].map((r,i)=>i+': '+r.cssText.slice(0,70));
  const firstChunk=st.textContent.slice(0,700);
  // standalone-парс первого правила
  const test=new CSSStyleSheet();
  let standalone='?';
  try{ test.replaceSync(firstChunk); standalone=test.cssRules.length+' rules'; }catch(e){ standalone='ERR '+e; }
  return {rules, firstChunk: firstChunk.slice(0,340), standalone};
});
console.log(JSON.stringify(r,null,1));
await browser.close();
