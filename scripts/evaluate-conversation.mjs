// Opt-in real provider evaluation. Synthetic experiences only; never saves user data.
import {readFile,writeFile} from 'node:fs/promises';
import {loader,moduleUrl} from './test-loader.mjs';
const vars=await readFile('.dev.vars','utf8');globalThis.__evalEnv={IFM_API_KEY:vars.split(/\r?\n/).find(line=>/^IFM_API_KEY\s*=/.test(line))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'')};if(!globalThis.__evalEnv.IFM_API_KEY)throw new Error('IFM_API_KEY missing');
const capture=moduleUrl(`import OpenAI from ${JSON.stringify(import.meta.resolve('openai'))}; export default class extends OpenAI {constructor(...args){super(...args);const create=this.chat.completions.create.bind(this.chat.completions);this.chat.completions.create=async(...args)=>{const result=await create(...args);globalThis.__lastCompletion=result;return result}}}`);
const load=loader({'cloudflare:workers':moduleUrl('export const env=globalThis.__evalEnv;'),openai:capture});
const {converse}=await load('lib/server/conversation.ts'),{emptyWorld}=await load('lib/server/world-types.ts');
const world=emptyWorld(),card={id:'draft-lunch',key:'draft-lunch',revision:0,status:'draft',text:'I ate lunch at CMU today.',dims:['health'],reason:'Nutrition.',emotion:null,confidence:.95,date:'2026-09-12'};
world.dims.forEach(d=>d.active=true);
const history=(text,inputMode='text',role='user')=>({id:crypto.randomUUID(),role,text,status:'complete',inputMode});
const initial=[history('I ate lunch at CMU today.'),history('Ready for review.','text','assistant')];
const tests=[
 {name:'ordinary-lunch',text:'I ate lunch at CMU today.',check:r=>r.changes.length===1&&r.changes[0].proposal.dims.includes('health')},
 {name:'Chinese-ordinary-lunch',text:'今天中午我在CMU食堂吃了午饭。',mode:'voice',check:r=>r.changes.length===1&&r.changes[0].proposal.dims.includes('health')&&/[\u4e00-\u9fff]/.test(r.reply)},
 {name:'typed-to-voice-date-correction',text:'Actually that was yesterday.',mode:'voice',cards:[card],history:initial,check:r=>r.changes.length===1&&r.changes[0].cardId===card.id&&r.changes[0].proposal.date==='2026-09-11'},
 {name:'voice-to-typed-correction',text:'That lunch was at home, not CMU.',cards:[card],history:initial.map(h=>({...h,inputMode:'voice'})),check:r=>r.changes.length===1&&r.changes[0].cardId===card.id&&/home/i.test(r.changes[0].proposal.text)},
 {name:'save-status-confirmed',text:'Did that get saved?',cards:[{...card,status:'saved'}],history:[...initial,history('Save succeeded for cards: draft-lunch. These experiences are now saved on the map.','text','event')],check:r=>r.changes.length===0&&/saved/i.test(r.reply)},
 {name:'draft-is-not-saved',text:'Did that get saved?',cards:[card],history:initial,check:r=>r.changes.length===0&&/save|review/i.test(r.reply)},
 {name:'no-duplicate-on-thanks',text:'Thanks, that looks good.',cards:[card],history:initial,check:r=>r.changes.length===0},
 {name:'just-chat-prompt',text:'Just chat, do not draft anything: I went for a walk today.',check:r=>r.changes.length===0},
 {name:'tools-question',text:'What tools do you have?',check:r=>r.changes.length===0},
 {name:'two-distinct-experiences',text:'I ran five miles before work. In the evening I painted a watercolor landscape.',check:r=>r.changes.length===2&&r.changes.some(c=>c.proposal.dims.includes('health'))&&r.changes.some(c=>c.proposal.dims.includes('creativity'))},
];
const reports=[];
for(const test of tests.filter(t=>!process.env.EVAL_ONLY||t.name===process.env.EVAL_ONLY)){const context={today:'2026-09-12',history:[...(test.history??[]),history(test.text,test.mode??'text')],cards:test.cards??[]};try{const result=await converse(world,context,test.mode==='voice'?'draft':'chat');reports.push({name:test.name,passed:test.check(result),result})}catch(error){reports.push({name:test.name,passed:false,error:error.message});await writeFile('.sites-runtime/conversation-failure.json',JSON.stringify(globalThis.__lastCompletion,null,2))}console.log(JSON.stringify(reports.at(-1)));await writeFile('eval/conversation-report.json',JSON.stringify({date:new Date().toISOString(),results:reports},null,2)+'\n')}
if(reports.some(r=>!r.passed))process.exitCode=1;
