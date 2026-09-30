import intelligence from '@/public/data/intelligence.json';

import { IntelligenceDashboard } from './intelligence-dashboard';
import type { IntelligenceData } from '@/lib/intelligence';

export const dynamic = 'force-static';

export default function Home() {
  return <IntelligenceDashboard data={intelligence as IntelligenceData} />;
}
