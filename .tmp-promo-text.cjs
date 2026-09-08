const { Client } = require('pg'); const fs = require('fs');
const mcp = JSON.parse(fs.readFileSync('/Users/alexey/projects/merfy/.mcp.json','utf8'));
let conn; for (const v of Object.values(mcp.mcpServers||{})) { const all=[...(v.args||[]),...Object.values(v.env||{})]; for (const a of all) if (typeof a==='string'&&a.includes('sites_service')&&a.startsWith('postgres://')) conn=a; }
const SID='10caf133-cb75-4bb9-875e-a429b201b8a7';
(async()=>{
  const c=new Client({connectionString:conn}); await c.connect();
  const {rows}=await c.query('SELECT current_revision_id FROM site WHERE id=$1',[SID]);
  const rid=rows[0].current_revision_id;
  const {rows:rr}=await c.query('SELECT data FROM site_revision WHERE id=$1',[rid]);
  const data=rr[0].data;
  let done=false;
  for (const b of data.pagesData.home.content) {
    if (b.type==='PromoBanner') {
      b.props=b.props||{};
      b.props.text='Бесплатная доставка на весь ассортимент до 30.06.2026.';
      b.props.link={href:'/catalog',text:'Смотреть больше'};
      done=true;
    }
  }
  console.log('PromoBanner текст задан:',done);
  if (done) await c.query('UPDATE site_revision SET data=$1 WHERE id=$2',[JSON.stringify(data),rid]);
  await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
