import { openPreview, applyProps } from './probe.mjs';
const siteId='e03dd420-febf-4499-9fc4-992412cc1b99';
const {browser,pg}=await openPreview({siteId,themeId:'rose',page:'home'});
const probe=async(tag)=>{
  const r=await pg.evaluate(()=>{
    const hits=[];
    const scan=(rules,src,media)=>{for(const r of rules){ if(r.cssRules){scan(r.cssRules,src,(r.media&&r.media.mediaText)||media);continue;} if(r.selectorText&&r.selectorText.includes('collections-title'))hits.push(src+(media?' @'+media.slice(0,20):'')); }};
    for(const s of document.styleSheets){let rules;try{rules=s.cssRules}catch{continue};scan(rules,s.href?s.href.split('/').pop():'inline');}
    const h2=document.querySelector('#collections-title');
    const wrap=h2&&h2.closest('[data-nt="section-heading"]')?.parentElement;
    if(wrap) wrap.style.setProperty('--size-section-heading','17px');
    const fsManual=h2?getComputedStyle(h2).fontSize:null;
    return {rules:hits, fsWithManualVar:fsManual, h2exists:!!h2};
  });
  console.log(tag, JSON.stringify(r));
};
await probe('ДО апдейтов:');
await applyProps(pg,'home','Collections-1',{id:'Collections-1',heading:'Проба кегля',headingSize:'small'});
await probe('ПОСЛЕ update-block:');
await browser.close();
