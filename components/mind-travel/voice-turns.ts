export type VoiceTranscript = {
  id:string;
  text:string;
  final:boolean;
  turn:number;
};

type StoredTranscript = VoiceTranscript & {
  providerId?:string;
  consumedText?:string;
};
export type TranscriptBatch={items:{id:string;text:string}[];text:string};

export class VoiceTurnTracker {
  private turn=0;
  private readonly transcripts:StoredTranscript[]=[];

  speechStarted(providerId?:string){
    const existing=providerId?this.transcripts.find(item=>item.providerId===providerId):undefined;
    if(existing)return existing.turn;
    this.turn+=1;
    this.transcripts.push({id:`voice-user-${this.turn}`,providerId,text:'',final:false,turn:this.turn});
    return this.turn;
  }

  currentTurn(){return this.turn}
  hasDisplayed(turn:number){return this.transcripts.some(item=>item.turn===turn&&Boolean(item.text))}
  hasCompleted(turn:number){return this.transcripts.some(item=>item.turn===turn&&item.final)}
  readyThrough(turn:number){return turn>0&&this.transcripts.filter(item=>item.turn<=turn).every(item=>item.final)}

  update(providerId:string|undefined,text:string,final=false):VoiceTranscript|null {
    const clean=text.trim();
    let stored=providerId?this.transcripts.find(item=>item.providerId===providerId):undefined;
    if(!stored)stored=this.transcripts.find(item=>item.turn===this.turn&&!item.providerId);
    if(!stored){
      this.speechStarted(providerId);
      stored=this.transcripts[this.transcripts.length-1];
    }
    if(providerId)stored.providerId=providerId;
    // A late partial cannot overwrite a final transcript. Revised completions can.
    if(stored.final&&!final)return null;
    stored.text=clean;stored.final=final;
    return {id:stored.id,text:stored.text,final:stored.final,turn:stored.turn};
  }

  unconsumed(through=this.turn):TranscriptBatch{
    const items=this.transcripts.filter(item=>item.turn<=through&&item.final&&item.text&&item.consumedText!==item.text).map(({id,text})=>({id,text}));
    return {items,text:items.map(item=>item.text).join('\n').trim()};
  }

  markConsumed(batch:TranscriptBatch){
    for(const captured of batch.items){const item=this.transcripts.find(item=>item.id===captured.id);if(item)item.consumedText=captured.text}
  }
}
