import { requireChatGPTUser } from './chatgpt-auth';
import MindTravelApp from '@/components/mind-travel/MindTravelApp';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <MindTravelApp userId={user.userId} />;
}
