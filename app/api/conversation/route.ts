import {getChatGPTUser} from '@/app/chatgpt-auth';
import {checkAbuseLimit,errorResponse} from '@/lib/server/ai';
import {loadWorld} from '@/lib/server/storage';
import {ConversationBody,converse} from '@/lib/server/conversation';
import {findExperiences} from '@/lib/server/experience-lookup';

export async function POST(request:Request){
  try{
    const user=await getChatGPTUser();if(!user)return Response.json({error:{code:'unauthorized',message:'Sign in to continue.'}},{status:401});
    checkAbuseLimit(user.userId,'conversation',20);
    const body=ConversationBody.safeParse(await request.json());if(!body.success)return Response.json({error:{code:'invalid_request',message:'The conversation could not be read. Please try a shorter message.'}},{status:400});
    const world=await loadWorld(user.userId);if(!world)return Response.json({error:{code:'world_not_found',message:'Set up your world first.'}},{status:409});
    const result=await converse(world,body.data.context,body.data.intent,request.signal,args=>findExperiences(user.userId,args));
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error)}
}
