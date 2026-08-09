import { openPreview } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
const r=await pg.evaluate(async()=>{
  const headStyles=[...document.head.querySelectorAll('style')];
  const domHit=headStyles.findIndex(s=>s.textContent.includes('collections-title'));
  const bodyStyleHit=[...document.body.querySelectorAll('style')].some(s=>s.textContent.includes('collections-title'));
  const resp=await fetch(location.href); const html=await resp.text();
  return {
    headStyleCount: headStyles.length,
    domHit, bodyStyleHit,
    fetchHasRule: html.includes('collections-title{font-size'),
    fetchLen: html.length,
    domLen: document.documentElement.outerHTML.length,
  };
});
console.log(JSON.stringify(r,null,1));
await browser.close();
