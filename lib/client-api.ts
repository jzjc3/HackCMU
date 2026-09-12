import type { Attachment, Dimension, ExtractResponse, VoiceTokenResponse, World } from './types';
import type {ConversationContext,ConversationResult} from './conversation';
import type {FindExperiencesResult} from './experience-lookup';
export type {FindExperiencesResult} from './experience-lookup';

export class ClientApiError extends Error {
  constructor(message:string, public status:number, public code:string, public retryable:boolean){super(message);this.name='ClientApiError'}
}
const uploadKeys=new WeakMap<File,string>();
async function parse<T>(response:Response):Promise<T>{
  if(response.status===204) return {ok:true} as T;
  if(response.ok) return response.json() as Promise<T>;
  let body:unknown; try{body=await response.json()}catch{body=null}
  const e=(body as {error?:{code?:string;message?:string}}|null)?.error;
  throw new ClientApiError(e?.message||`Request failed (${response.status})`,response.status,e?.code||'REQUEST_FAILED',response.status===409||response.status===429||response.status>=500);
}
async function request<T>(url:string, init?:RequestInit):Promise<T>{
  let response:Response; try{response=await fetch(url,{credentials:'same-origin',...init})}catch{throw new ClientApiError('Could not reach Mind Travel. Your draft is still here.',0,'NETWORK_ERROR',true)}
  return parse<T>(response);
}
export const clientApi={
  converse:(context:ConversationContext,intent:'chat'|'draft',signal?:AbortSignal)=>request<ConversationResult>('/api/conversation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({context,intent}),signal}),
  findExperiences:(query:string,limit=5,signal?:AbortSignal)=>request<FindExperiencesResult>('/api/experiences/find',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,limit}),signal}),
  getWorld:()=>request<{world:World}>('/api/world'),
  getAttachment:(id:string)=>request<{attachment:Attachment}>(`/api/attachments/${encodeURIComponent(id)}?metadata=1`),
  putWorld:(world:World,expectedRevision:number|undefined)=>request<{world:World}>('/api/world',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({world,expectedRevision})}),
  extract:(text:string,_dimensions:Dimension[],context?:{recent?:{text:string;dims?:string[]}[];priorItems?:import('./types').Proposal[];correction?:string})=>request<ExtractResponse>('/api/experiences/extract',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,context})}),
  transcribe:(audio:Blob,filename='dictation.webm')=>{const form=new FormData();form.append('file',audio,filename);return request<{text:string}>('/api/audio/transcribe',{method:'POST',body:form})},
  uploadAttachment:async(file:File)=>{if(!file.size||file.size>10*1024*1024)throw new ClientApiError('Images must be between 1 byte and 10 MB.',413,'file_too_large',false);if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new ClientApiError('Only JPEG, PNG, and WebP images are supported.',415,'unsupported_image',false);let key=uploadKeys.get(file);if(!key){key=crypto.randomUUID();uploadKeys.set(file,key)}const form=new FormData();form.append('file',file,file.name);return request<{attachment:Attachment}>('/api/attachments',{method:'POST',headers:{'Idempotency-Key':key},body:form})},
  deleteAttachment:(id:string)=>request<{ok:true}>(`/api/attachments/${encodeURIComponent(id)}`,{method:'DELETE'}),
  generateImage:(prompt:string,memoryId?:string)=>request<{attachment:Attachment}>('/api/images/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,memoryId})}),
  getVoiceToken:()=>request<VoiceTokenResponse>('/api/voice/token',{method:'POST'}),
  deleteWorld:()=>request<{ok:true}>('/api/world',{method:'DELETE'}),
  exportUrl:'/api/world/export'
};
