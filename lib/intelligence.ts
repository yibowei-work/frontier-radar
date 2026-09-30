export type RunMode = 'daily' | 'weekly' | 'monthly';

export interface Revision {
  at: string;
  previous_title: string;
  previous_summary: string;
}

export interface IntelligenceItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  source_id: string;
  source_tier: string;
  company: string;
  company_scale: string;
  region: string;
  topic: string;
  signal_type: string;
  published_at: string;
  first_seen_at: string;
  last_checked_at: string;
  matched_windows: RunMode[];
  confidence: string;
  verification_status: string;
  why_it_matters: string;
  career_angle: string;
  score: number;
  content_hash: string;
  revisions: Revision[];
}

export interface SourceStatus {
  id: string;
  name: string;
  status: 'ok' | 'error';
  kind: string;
  fetched?: number;
  matched: number;
  latest_item_at?: string | null;
  duration_ms?: number;
  error?: string;
}

export interface IntelligenceData {
  meta: {
    schema_version: number;
    generated_at: string;
    generated_at_beijing: string;
    run_status: 'healthy' | 'degraded' | 'failed';
    active_modes: RunMode[];
    window_start: string;
    window_end: string;
    source_count: number;
    healthy_source_count: number;
    degraded_source_count: number;
    new_or_checked_count: number;
    total_item_count: number;
    revision_count: number;
    weekly_last_due_date?: string | null;
    monthly_complete_through?: string | null;
  };
  items: IntelligenceItem[];
  sources: SourceStatus[];
}
