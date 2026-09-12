// Opt-in paid Grok Realtime evaluation. Text injection + synthetic lookup callback; no microphone or database access.
// PowerShell: $env:LOOKUP_EVAL_ENV_FILE='C:\path\to\.dev.vars'; node scripts/evaluate-voice-lookup.mjs
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {loader} from './test-loader.mjs';

const envFile=process.env.LOOKUP_EVAL_ENV_FILE;
if(!envFile)throw new Error('LOOKUP_EVAL_ENV_FILE must point to the existing Site .dev.vars file.');
const vars=await readFile(envFile,'utf8');
const key=vars.split(/\r?\n/).find(line=>/^\s*XAI_API_KEY\s*=/.test(line))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
if(!key)throw new Error('XAI_API_KEY is missing from LOOKUP_EVAL_ENV_FILE.');

const {FIND_EXPERIENCES_TOOL,LOOKUP_INSTRUCTIONS}=await loader()('lib/experience-lookup.ts');
const voiceTools=[
  {type:'function',name:'categorize_experiences',description:'Prepare a newly described personal experience as a draft. Never use this for a previously saved experience returned by lookup.',parameters:{type:'object',properties:{},required:[],additionalProperties:false}},
  {type:'function',...FIND_EXPERIENCES_TOOL.function},
];
const instructions=`You are Mind Travel's live conversational interface. Answer in one or two short sentences. ${LOOKUP_INSTRUCTIONS}`;
const cases=[
  {
    name:'english-recall',
    input:'Do you remember my saved Zephyr Lantern experience? Search my saved experiences before answering.',
    lookup:{query:'Zephyr Lantern',results:[{id:'synthetic-zephyr',text:'At the Zephyr Lantern workshop in Reykjavík, I built a copper compass with my cousin Mira.',textTruncated:false,categories:[{id:'creative',name:'Creative'}],date:'2026-08-17',created:1}],hasMore:false},
    check:text=>/reykjav[ií]k/i.test(text)&&/copper compass/i.test(text),
  },
  {
    name:'no-match',
    input:'Do you remember a saved experience about the Violet Moon Orchard? Search before answering.',
    lookup:{query:'Violet Moon Orchard',results:[],hasMore:false},
    check:text=>/(no|not|couldn.t|didn.t|don.t).{0,50}(match|find|saved|experience)|no saved/i.test(text),
  },
];

async function clientSecret(){
  const response=await fetch('https://api.x.ai/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({expires_after:{seconds:120}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Grok Realtime credential request failed (${response.status}).`);
  const body=await response.json();
  if(typeof body?.value!=='string')throw new Error('Grok Realtime returned no ephemeral credential.');
  return body.value;
}

async function run(test){
  const token=await clientSecret();
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0',[`xai-client-secret.${token}`]);
    const calls=[],counts={};let transcript='',pendingOutput=false,continued=false,finished=false;
    const close=(error)=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();if(error)reject(error);else resolve({name:test.name,calls,counts,transcript,passed:calls.some(call=>call.name==='find_experiences')&&!calls.some(call=>call.name==='categorize_experiences')&&test.check(transcript)})};
    const timer=setTimeout(()=>close(new Error(`${test.name} exceeded 40 seconds.`)),40000);
    const send=event=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(event))};
    ws.onerror=()=>close(new Error(`${test.name} voice socket failed.`));
    ws.onopen=()=>send({type:'session.update',session:{voice:'eve',instructions,turn_detection:{type:'server_vad'},audio:{input:{format:{type:'audio/pcm',rate:24000}},output:{format:{type:'audio/pcm',rate:24000}}},tools:voiceTools}});
    ws.onmessage=message=>{
      let event;try{event=JSON.parse(String(message.data))}catch{return}
      counts[event.type]=(counts[event.type]??0)+1;
      if(event.type==='error'){close(new Error(`${test.name} provider error: ${event.error?.message??'unknown error'}`));return}
      if(event.type==='session.updated'){
        send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:test.input}]}});
        send({type:'response.create'});
      }
      if(event.type==='response.function_call_arguments.done'){
        calls.push({name:event.name,arguments:event.arguments??''});
        const output=event.name==='find_experiences'?test.lookup:{status:'unsupported_for_evaluation'};
        send({type:'conversation.item.create',item:{type:'function_call_output',call_id:event.call_id,output:JSON.stringify(output)}});
        pendingOutput=true;
      }
      if(event.type==='response.output_audio_transcript.done'&&typeof event.transcript==='string')transcript+=event.transcript;
      if(event.type==='response.done'){
        if(pendingOutput&&!continued){continued=true;send({type:'response.create'});return}
        if(continued)close();
        else close(new Error(`${test.name} completed without calling find_experiences.`));
      }
    };
  });
}

const results=[];
for(const test of cases){
  try{const result=await run(test);results.push(result);console.log(JSON.stringify({name:result.name,passed:result.passed,calls:result.calls.map(call=>call.name),transcript:result.transcript}))}
  catch(error){results.push({name:test.name,passed:false,error:error instanceof Error?error.message:'Evaluation failed'});console.log(JSON.stringify(results.at(-1)))}
}
if(results.every(result=>result.passed)){
  await mkdir('eval',{recursive:true});
  await writeFile('eval/voice-lookup-report.json',JSON.stringify({date:new Date().toISOString(),provider:'live Grok Realtime (grok-voice-think-fast-2.0)',input:'synthetic text injection; microphone and audio capture not exercised',storage:'synthetic read-only lookup callback; authentication and database lookup tested separately',results},null,2)+'\n');
}else process.exitCode=1;
