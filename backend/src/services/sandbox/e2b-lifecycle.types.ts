export type E2bLifecycleWebhookPayload = {
  id: string;
  version?: string;
  type: string;
  timestamp?: string;
  event_category?: string;
  event_label?: string;
  event_data?: {
    sandbox_metadata?: Record<string, string>;
    execution?: {
      started_at?: string;
      vcpu_count?: number;
      memory_mb?: number;
      execution_time?: number;
    };
  };
  sandbox_id?: string;
  sandbox_execution_id?: string;
  sandbox_template_id?: string;
  sandbox_build_id?: string;
  sandbox_team_id?: string;
};
