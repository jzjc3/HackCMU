import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../components/mind-travel/voice-turns.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {VoiceTurnTracker}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

{
  const turns=new VoiceTurnTracker();
  assert.equal(turns.speechStarted(),1);
  const partial=turns.update('item-1','I moved to a new');
  const corrected=turns.update('item-1','I moved to a new city');
  const complete=turns.update('item-1','I moved to a new city.',true);
  assert.equal(partial.id,corrected.id,'cumulative transcript updates replace one visible bubble');
  assert.equal(corrected.id,complete.id,'the final transcript replaces the partial bubble');
  assert.equal(turns.hasDisplayed(1),true);
  assert.equal(turns.hasCompleted(1),true);
  assert.deepEqual(turns.unconsumed(),{items:[{id:complete.id,text:complete.text}],text:'I moved to a new city.'});
  turns.markConsumed(turns.unconsumed());
  assert.deepEqual(turns.unconsumed(),{items:[],text:''},'a successful classifier call consumes a transcript once');
}

{
  const turns=new VoiceTurnTracker();
  turns.speechStarted();
  const partial=turns.update('item-race','I trained for my first half marathon');
  assert.equal(turns.hasCompleted(1),false,'a tool arriving before ASR completion must wait');
  assert.equal(turns.unconsumed().text,'','partial words must not be classified as the final experience');
  const lateFinal=turns.update('item-race','I trained through winter for my first half-marathon.',true);
  assert.equal(lateFinal.id,partial.id,'a late final event still updates the same bubble');
  assert.equal(turns.unconsumed().text,'I trained through winter for my first half-marathon.');
}

{
  const turns=new VoiceTurnTracker();
  turns.speechStarted('early');turns.speechStarted('late');
  turns.update('late','Second utterance.',true);
  assert.equal(turns.readyThrough(2),false,'a later final cannot hide an earlier missing transcript');
  turns.update('early','First utterance.',true);
  assert.equal(turns.readyThrough(2),true);
  assert.equal(turns.unconsumed().text,'First utterance.\nSecond utterance.');
  const captured=turns.unconsumed(1);
  turns.update('early','Corrected first utterance.',true);
  turns.markConsumed(captured);
  assert.equal(turns.unconsumed(1).text,'Corrected first utterance.','corrections arriving during classification are retained');
  assert.equal(turns.update('early','stale partial',false),null);
  assert.equal(turns.speechStarted('early'),1,'replayed VAD events do not create another turn');
}

{
  const turns=new VoiceTurnTracker();
  turns.speechStarted();
  turns.update('item-1','First experience',true);
  turns.speechStarted();
  turns.update('item-2','Second experience',true);
  assert.equal(turns.unconsumed().text,'First experience\nSecond experience','multiple voice turns preserve order for classification');
}

console.log('Voice turn checks passed: revised completions, final-only classification, consumption, late corrections, and multi-turn ordering.');
