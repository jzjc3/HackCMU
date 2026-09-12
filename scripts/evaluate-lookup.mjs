// Opt-in paid IFM evaluation. Synthetic saved records; no database writes.
// PowerShell: $env:LOOKUP_EVAL_ENV_FILE='C:\path\to\.dev.vars'; node scripts/evaluate-lookup.mjs
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loader,moduleUrl} from './test-loader.mjs';
const vars=await readFile(process.env.LOOKUP_EVAL_ENV_FILE||'.dev.vars','utf8');
const key=vars.split(/\r?\n/).find(line=>/^IFM_API_KEY\s*=/.test(line))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
if(!key)throw new Error('IFM_API_KEY missing');
globalThis.__lookupEvalEnv={IFM_API_KEY:key};
const load=loader({'cloudflare:workers':moduleUrl('export const env=globalThis.__lookupEvalEnv;')});
const {converse}=await load('lib/server/conversation.ts'),{emptyWorld}=await load('lib/server/world-types.ts');
const world=emptyWorld();world.dims.forEach(d=>d.active=true);
const records=[
  {id:'saved-beach',text:'I walked on Coral Beach with Maya and watched the sunrise.',textTruncated:false,categories:[{id:'relationships',name:'Relationships'}],date:'2026-08-03',created:1},
  {id:'saved-beach-two',text:'I collected shells on Coral Beach with my brother.',textTruncated:false,categories:[{id:'relationships',name:'Relationships'}],date:'2026-08-06',created:2},
  {id:'saved-chinese',text:'我在上海外滩看日出，然后和姐姐吃了早餐。',textTruncated:false,categories:[{id:'travel',name:'Travel'}],date:'2026-07-14',created:3},
  {id:'saved-percent',text:'I celebrated reaching 100% of my robotics project milestone.',textTruncated:false,categories:[{id:'career',name:'Career'}],date:'2026-08-10',created:4},
];
const entry=(text,role='user')=>({id:crypto.randomUUID(),role,text,status:'complete',inputMode:'text'});
const tests=[
  {name:'retrieve-single-before-recall',text:'Find my saved experience mentioning Maya. What did we do?',check:(r,c)=>c.length>0&&r.lookups?.some(l=>l.results.some(x=>x.id==='saved-beach'))&&/sunrise/i.test(r.reply)&&r.changes.length===0},
  {name:'multiple-matches',text:'Find my saved Coral Beach experiences and tell me what happened on the different visits.',check:(r,c)=>c.length>0&&r.lookups?.some(l=>l.results.length===2)&&/shell/i.test(r.reply)&&/sunrise/i.test(r.reply)&&r.changes.length===0},
  {name:'no-match',text:'Do you remember my saved experience about moonwalking on Neptune? Please search for Neptune.',check:(r,c)=>c.length>0&&r.lookups?.every(l=>l.results.length===0)&&/no |not |couldn.t|didn.t|don.t/i.test(r.reply)&&!/draft|creat(e|ing)|invent/i.test(r.reply)&&r.changes.length===0},
  {name:'Chinese-recall',text:'帮我找一下以前保存的上海经历，聊聊当时发生了什么。',check:(r,c)=>c.length>0&&r.lookups?.some(l=>l.results.some(x=>x.id==='saved-chinese'))&&/上海|日出|早餐/.test(r.reply)&&r.changes.length===0},
  {name:'literal-percent',text:'Search my saved experiences for the exact literal string 100%. What did I achieve?',check:(r,c)=>c.some(a=>a.query==='100%')&&/robotics|project|milestone/i.test(r.reply)&&r.changes.length===0},
  {name:'recalled-followup-no-duplicate',text:'What does that suggest about how I spend time with people?',history:[entry('Find my saved experience mentioning Maya.'),entry('Saved experience lookup (read-only): '+JSON.stringify({query:'Maya',results:[records[0]],hasMore:false}),'event'),entry('You walked on Coral Beach with Maya and watched the sunrise.','assistant')],check:r=>r.changes.length===0},
  {name:'new-experience-still-drafts',text:'Today I ate lunch at CMU.',check:r=>r.changes.length===1&&r.changes[0].proposal.dims.includes('health')},
];
const results=[];
for(const test of tests.filter(test=>!process.env.EVAL_ONLY||test.name===process.env.EVAL_ONLY)){
  const calls=[];
  const find=async args=>{calls.push(args);const hits=records.filter(record=>record.text.toLowerCase().includes(args.query.toLowerCase()));return {query:args.query,results:hits.slice(0,args.limit),hasMore:hits.length>args.limit}};
  try{
    const result=await converse(world,{today:'2026-09-12',history:[...(test.history??[]),entry(test.text)],cards:[]},'chat',undefined,find);
    results.push({name:test.name,passed:Boolean(test.check(result,calls)),calls,result});
  }catch(error){results.push({name:test.name,passed:false,calls,error:error instanceof Error?error.message:'Evaluation failed'})}
  console.log(JSON.stringify(results.at(-1)));
  await mkdir('eval',{recursive:true});
  await writeFile('eval/lookup-report.json',JSON.stringify({date:new Date().toISOString(),provider:'live IFM',storage:'synthetic read-only callback; SQL and auth tested separately',results},null,2)+'\n');
}
if(results.some(result=>!result.passed))process.exitCode=1;
