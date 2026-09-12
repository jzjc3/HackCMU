// Synthetic audio only. Usage: node scripts/smoke-voice-audio.mjs path/to/24khz-mono.wav
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const wav=await readFile(process.argv[2]);
if(wav.toString('ascii',0,4)!=='RIFF')throw new Error('Expected a WAV fixture');
let pcm;
for(let offset=12;offset+8<=wav.length;){
  const size=wav.readUInt32LE(offset+4),name=wav.toString('ascii',offset,offset+4);
  if(name==='fmt '&&(wav.readUInt16LE(offset+8)!==1||wav.readUInt16LE(offset+10)!==1||wav.readUInt32LE(offset+12)!==24000||wav.readUInt16LE(offset+22)!==16))throw new Error('Expected mono PCM16 at 24kHz');
  if(name==='data')pcm=wav.subarray(offset+8,offset+8+size);
  offset+=8+size+(size%2);
}
if(!pcm?.length)throw new Error('No PCM audio in fixture');
const vars=await readFile('.dev.vars','utf8');
const key=vars.split(/\r?\n/).find(row=>/^XAI_API_KEY\s*=/.test(row))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
if(!key)throw new Error('XAI_API_KEY is missing');
const voiceSource=await readFile('components/mind-travel/RealtimeVoice.tsx','utf8');
const instructions=voiceSource.match(/const VOICE_INSTRUCTIONS=`([\s\S]*?)`;/)[1];
const reports=[];
for(const mode of ['unified-current']){
  const response=await fetch('https://api.x.ai/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({expires_after:{seconds:300}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Credential request failed (${response.status})`);
  const token=await response.json();
  const report={mode,events:[],counts:{},transcriptMatched:false,toolCalled:false};
  await new Promise((resolve,reject)=>{
    const ws=new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0',[`xai-client-secret.${token.value}`]);
    let streaming=false,finished=false;
    const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();resolve()};
    const timer=setTimeout(finish,40000);
    const send=event=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(event))};
    ws.onopen=()=>send({type:'session.update',session:{voice:'eve',instructions,turn_detection:{type:'server_vad'},audio:{input:{format:{type:'audio/pcm',rate:24000}},output:{format:{type:'audio/pcm',rate:24000}}},tools:[{type:'function',name:'categorize_experiences',description:'Prepare the spoken experience for review.',parameters:{type:'object',properties:{},required:[],additionalProperties:false}}]}});
    ws.onerror=()=>{clearTimeout(timer);ws.close();reject(new Error('Voice socket failed'))};
    ws.onmessage=async message=>{
      const event=JSON.parse(String(message.data));
      report.counts[event.type]=(report.counts[event.type]||0)+1;
      if(!event.type.includes('delta')&&!event.type.endsWith('.updated'))report.events.push({type:event.type,itemId:event.item_id,responseId:event.response_id,hasTranscript:Boolean(event.transcript),error:event.error?.message});
      if(event.type.includes('input_audio_transcription')&&event.transcript)report.transcriptMatched||=/hik|sister/i.test(event.transcript);
      if(event.type==='response.function_call_arguments.done')report.toolCalled=true;
      if(event.type==='response.done')finish();
      if(event.type==='session.updated'&&!streaming){
        streaming=true;
        const audio=Buffer.concat([Buffer.alloc(24000),pcm,Buffer.alloc(48000*2)]);
        for(let offset=0;offset<audio.length&&!finished;offset+=4800){send({type:'input_audio_buffer.append',audio:audio.subarray(offset,offset+4800).toString('base64')});await delay(100)}
      }
    };
  });
  reports.push(report);console.log(JSON.stringify(report));
}
await writeFile('.sites-runtime/voice-audio-report.json',JSON.stringify(reports,null,2));
if(reports.some(report=>!report.transcriptMatched))process.exitCode=1;
