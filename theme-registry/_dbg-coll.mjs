import { openPreview, applyProps } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
await applyProps(pg,'home','Collections-1',{id:'Collections-1',heading:'Проба кегля',headingSize:'small'});
const r=await pg.evaluate(()=>{
  const sec=document.querySelector('[data-puck-component-id="Collections-1"]');
  const h2=sec?.querySelector('#collections-title')||sec?.querySelector('h2');
  const wrap=h2?.closest('[class*="--size-section-heading"]');
  let ruleFound=false;
  try{ for(const s of document.styleSheets){ if(s.href&&!s.href.startsWith(location.origin)&&!s.href.includes('/__theme/'))continue; let rules; try{rules=s.cssRules}catch{continue} for(const r of rules){ if(r.selectorText&&r.selectorText.includes('#collections-title')){ruleFound=true;break} } if(ruleFound)break; } }catch(e){}
  return {
    h2Id: h2?.id, fs: h2?getComputedStyle(h2).fontSize:null,
    varOnH2: h2?getComputedStyle(h2).getPropertyValue('--size-section-heading'):null,
    wrapHasCls: !!wrap, wrapClsSnippet: (h2?.closest('div[class*="flex w-full"]')?.className||'').slice(0,140),
    idRuleInCss: ruleFound,
  };
});
console.log(JSON.stringify(r,null,1));
await browser.close();
