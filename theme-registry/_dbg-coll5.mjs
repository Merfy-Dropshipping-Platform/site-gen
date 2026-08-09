import { openPreview } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
const r=await pg.evaluate(()=>{
  const st=[...document.head.querySelectorAll('style')].find(s=>s.textContent.includes('collections-title'));
  const sheet=st.sheet;
  const text=st.textContent;
  const parsed=sheet?sheet.cssRules.length:-1;
  const lastRule=sheet&&sheet.cssRules.length?sheet.cssRules[sheet.cssRules.length-1].cssText:null;
  // где в тексте кончается последний распарсенный кусок
  let cutPos=-1;
  if(lastRule){ const key=lastRule.slice(0,40).split('{')[0].trim(); cutPos=text.indexOf(key); }
  return {
    textLen:text.length, parsedRules:parsed,
    lastRuleHead:lastRule?lastRule.slice(0,80):null,
    aroundCut: cutPos>=0? text.slice(cutPos, cutPos+400):null,
    rulePos: text.indexOf('collections-title'),
    braces:(text.match(/\{/g)||[]).length,
  };
});
console.log(JSON.stringify(r,null,1));
await browser.close();
