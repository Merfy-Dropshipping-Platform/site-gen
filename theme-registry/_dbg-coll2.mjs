import { openPreview, applyProps } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
await applyProps(pg,'home','Collections-1',{id:'Collections-1',heading:'Проба кегля',headingSize:'small'});
const r=await pg.evaluate(()=>{
  const hits=[];
  const scan=(rules,src,media)=>{ for(const r of rules){ 
    if(r.cssRules){ scan(r.cssRules,src,(r.media&&r.media.mediaText)||media); continue; }
    if(r.selectorText&&r.selectorText.includes('collections-title')) hits.push({src,media:media||'',css:r.cssText.slice(0,160)});
  }};
  for(const s of document.styleSheets){ let rules; try{rules=s.cssRules}catch{continue}
    const src=s.href?s.href.split('/').pop():(s.ownerNode&&s.ownerNode.id)||'inline<'+((s.ownerNode&&s.ownerNode.parentElement&&s.ownerNode.parentElement.tagName)||'?')+'>';
    scan(rules,src);
  }
  // и инлайновые <style> ВНУТРИ секции
  const sec=document.querySelector('[data-puck-component-id="Collections-1"]');
  const inSec=[...(sec?.querySelectorAll('style')||[])].map(st=>st.textContent.slice(0,120));
  return {hits, stylesInsideSection: inSec.length, inSecPreview: inSec[0]||null};
});
console.log(JSON.stringify(r,null,1));
await browser.close();
