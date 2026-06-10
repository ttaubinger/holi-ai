export interface Message { id: string; role: string; content: string; created_at?: string; }
export interface Cron { cron_id: string; category?: string; title: string; schedule: string; description?: string; linked_module?: string; is_active: boolean; requires_logging?: boolean; log_type?: string; log_unit?: string; }
export interface ActionModule { module_title: string; description: string; key_metrics: {label: string; value: string}[]; categories: { name: string; content: string }[]; }
export interface Payload { headline?: string; diagnostic_summary?: string; action_modules?: ActionModule[]; active_crons?: Cron[]; }
