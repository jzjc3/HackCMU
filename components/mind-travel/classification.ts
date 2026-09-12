import {clientApi} from '@/lib/client-api';
import type {Dimension,ExtractResponse,Proposal} from '@/lib/types';
const keywords:Record<string,string[]>={career:['work','presentation','presented','job','meeting','client','promotion','interview','project','internship'],health:['run','ran','gym','sleep','doctor','yoga','swim','workout','walk','hike','rest'],relationships:['friend','mom','dad','family','partner','sister','brother','called','parents'],entertainment:['movie','film','watched','novel','book','concert','game','music'],travel:['trip','flight','hotel','abroad','train','airport','visited'],creativity:['pottery','painted','wrote','sketch','drawing','composed','craft','design'],growth:['learned','first','courage','habit','reflect','overcame']};
export async function classify(text:string,dims:Dimension[],{useModel=true,context}:{useModel?:boolean;context?:Parameters<typeof clientApi.extract>[2]}={}):Promise<ExtractResponse>{
 if(useModel)return clientApi.extract(text,dims,context);
 const active=dims.filter(d=>d.active);if(!active.length)return{items:[],question:'Choose a dimension first.',source:'local'};
 const items:Proposal[]=text.split(/(?<=[.!?])\s+|;\s+|\s+(?:and then|then|after that|later)\s+/i).filter(s=>s.trim().length>8).slice(0,6).map(s=>{
 const scores=active.map(d=>({d,hits:(keywords[d.id]||d.name.toLowerCase().split(/\s+/)).filter(k=>s.toLowerCase().includes(k))})).filter(v=>v.hits.length).sort((a,b)=>b.hits.length-a.hits.length);
 const picks=scores.length?scores.slice(0,2):[{d:active[0],hits:[]}];return{text:s.trim(),dims:picks.map(p=>p.d.id),reason:picks.map(p=>p.hits.length?`“${p.hits[0]}” → ${p.d.name}`:`No clear signal, defaulting to ${p.d.name}`).join('; '),emotion:null,confidence:scores.length?.5:.3};
 });return{items,question:null,source:'local'};
}
