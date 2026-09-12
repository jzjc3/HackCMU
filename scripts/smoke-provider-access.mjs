import fs from 'node:fs/promises';
import path from 'node:path';

async function key(name) {
  const candidates=[path.resolve('.dev.vars'),path.resolve('..','.env')];
  for(const file of candidates){
    try{
      const line=(await fs.readFile(file,'utf8')).split(/\r?\n/).find(row=>new RegExp(`^\\s*${name}\\s*=`).test(row));
      if(line)return line.slice(line.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'');
    }catch(error){if(error.code!=='ENOENT')throw error}
  }
  return null;
}

async function probe(label,url,secret){
  if(!secret){console.log(`${label}: key missing`);return}
  try{
    const response=await fetch(url,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(15000)});
    let detail='';
    if(!response.ok){try{const body=await response.json();detail=String(body?.error?.message||body?.error||'').slice(0,240)}catch{}}
    console.log(`${label}: HTTP ${response.status}${detail?` — ${detail}`:''}`);
  }catch(error){console.log(`${label}: ${error.name==='TimeoutError'?'timeout':'request failed'}`)}
}

await probe('IFM models','https://api.ifm.ai/v1/models',await key('IFM_API_KEY'));
const xaiKey=await key('XAI_API_KEY');
await probe('xAI models','https://api.x.ai/v1/models',xaiKey);
if(xaiKey){
  try{
    const response=await fetch('https://api.x.ai/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${xaiKey}`,'content-type':'application/json'},body:JSON.stringify({expires_after:{seconds:300}}),signal:AbortSignal.timeout(15000)});
    const body=await response.json().catch(()=>null);
    console.log(`xAI realtime client secret: HTTP ${response.status}${response.ok&&typeof body?.value==='string'?' — valid ephemeral credential returned':''}`);
  }catch(error){console.log(`xAI realtime client secret: ${error.name==='TimeoutError'?'timeout':'request failed'}`)}
}
