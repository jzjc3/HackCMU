export const REGIONS = ['North America','South America','Europe','Asia','Africa','Oceania','Antarctica'] as const;
export type Region = typeof REGIONS[number];
export const EMOTIONS = ['Proud','Calm','Grateful','Nervous','Sad','Curious','Tired'] as const;
export type Emotion = typeof EMOTIONS[number];
export type Rating = 1|2|3|4|5|null;

export interface Dimension { id:string; name:string; region:Region; color:string; active:boolean }
export interface AppearanceOverride { color?:string; opacity?:number }
export interface Attachment { id:string; url:string; name:string; contentType:string; size:number; kind:'upload'|'generated'; created:number }
export interface Memory { id:string; text:string; title:string; date:string; dims:string[]; emotion:Emotion|null; importance:Rating; clarity:Rating; created:number; photo?:string; attachmentIds?:string[] }
export interface MemoryDraft extends Omit<Memory,'id'|'created'> { id?:string; created?:number }
export interface Proposal { text:string; dims:string[]; reason:string; emotion:Emotion|null; confidence:number; key?:string|number; removed?:boolean }
export interface World { setupDone:boolean; dims:Dimension[]; memories:Memory[]; overrides:Partial<Record<Region,AppearanceOverride>>; lastOpened:string|null; revision?:number }
export interface ExtractResponse { items:Proposal[]; question:string|null; source:'model'|'local' }
export interface ApiErrorBody { error:{code:string;message:string} }
export interface VoiceTokenResponse { token:string; expiresAt?:number; url:string; model:string }
export interface AuthUser { name?:string|null; email?:string|null; image?:string|null }
