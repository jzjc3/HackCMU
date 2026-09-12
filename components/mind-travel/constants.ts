import {REGIONS,EMOTIONS,type Dimension,type MemoryDraft,type Region,type World,type Memory,type Rating} from '@/lib/types';
export const PALETTE=[{name:'Coral',hex:'#ff7759'},{name:'Blue',hex:'#1863dc'},{name:'Green',hex:'#2f8f6b'},{name:'Violet',hex:'#9b60aa'},{name:'Amber',hex:'#d99a3a'},{name:'Teal',hex:'#2b9aa8'},{name:'Rose',hex:'#c4506f'}];
export const DEFAULT_DIMS:Dimension[]=[{id:'career',name:'Career',region:'North America',color:'#1863dc',active:true},{id:'health',name:'Physical Health',region:'South America',color:'#2f8f6b',active:true},{id:'relationships',name:'Relationships',region:'Europe',color:'#ff7759',active:true},{id:'entertainment',name:'Entertainment',region:'Asia',color:'#9b60aa',active:true},{id:'travel',name:'Travel',region:'Africa',color:'#d99a3a',active:false},{id:'creativity',name:'Creativity',region:'Oceania',color:'#2b9aa8',active:false},{id:'growth',name:'Personal Growth',region:'Antarctica',color:'#c4506f',active:false}];
export const emptyWorld=():World=>({setupDone:false,dims:DEFAULT_DIMS.map(d=>({...d})),memories:[],overrides:{},lastOpened:null,revision:0});
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const emptyMemory=():MemoryDraft=>({text:'',title:'',date:today(),dims:[],emotion:null,importance:null,clarity:null,attachmentIds:[]});
export const dimForRegion=(w:World,r:Region)=>w.dims.find(d=>d.active&&d.region===r)||null;
export const memsForDim=(w:World,id:string)=>w.memories.filter(m=>m.dims.includes(id)).sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);
export const fmtDate=(s:string)=>new Date(`${s}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
export const attachmentUrl=(id:string)=>`/api/attachments/${encodeURIComponent(id)}`;
export const photoFor=(m:{attachmentIds?:string[];photo?:string})=>m.attachmentIds?.[0]?attachmentUrl(m.attachmentIds[0]):m.photo||null;

export function seed(w:World,n=100):World {
 const texts=['Long run along the river before work.','Dinner with old friends from school.','Finished the last chapter of a novel.','Presented the quarterly plan.','Called home for an hour.','Tried a pottery class.','Weekend trip to the coast.','Slept nine hours for once.','Started the new role.','Watched the whole trilogy in one night.'];
 let r=7; const rnd=()=>(r=(r*9301+49297)%233280)/233280;
 const act=w.dims.filter(d=>d.active).map(d=>d.id);if(!act.length)return w;
 const pickW=<T,>(items:T[],ws:number[]):T=>{let t=rnd()*ws.reduce((a,b)=>a+b,0);for(let i=0;i<items.length;i++){t-=ws[i];if(t<=0)return items[i]}return items[items.length-1]};
 const dimW=act.map((_,i)=>Math.pow(.6,i)),pairs:string[][]=[];for(let i=0;i<act.length;i++)for(let j=i+1;j<act.length;j++)pairs.push([act[i],act[j]]);
 const pairW=pairs.map((_,i)=>i===0?10:i===1?4:i<4?1.2:.25),out:Memory[]=[];
 for(let i=0;i<n;i++){const d=new Date(2026,8,11);d.setDate(d.getDate()-Math.floor(rnd()*400));const multi=rnd()<.32,ds=multi&&pairs.length?[...pickW(pairs,pairW)]:[pickW(act,dimW)];out.push({id:crypto.randomUUID(),text:texts[Math.floor(rnd()*texts.length)],title:'',date:d.toISOString().slice(0,10),dims:ds,emotion:rnd()<.6?EMOTIONS[Math.floor(rnd()*EMOTIONS.length)]:null,importance:rnd()<.5?(1+Math.floor(rnd()*5)) as Rating:null,clarity:rnd()<.4?(1+Math.floor(rnd()*5)) as Rating:null,created:Date.now()-i*1000})}return {...w,memories:[...w.memories,...out]};
}
export const STORE={REGIONS,EMOTIONS,PALETTE,DEFAULT_DIMS,today,empty:emptyWorld,uid:()=>crypto.randomUUID(),seed,KEY:'mindtravel.world.v1',EXAMPLE:{text:'I finished my first internship presentation. I was nervous, but proud that I did it.',title:'First internship presentation',dims:['career','growth'],emotion:'Proud' as const,importance:4 as const,clarity:3 as const}};
