import { PROJECT_NOTIFICATION_SCHEMA_VERSION } from "./notification-schema.types.js";

/** Example notification catalog for flash-arb dashboard apps (agent codegen / templates). */
export const FLASH_ARB_DASHBOARD_NOTIFICATION_SCHEMA = {
  schema_version: PROJECT_NOTIFICATION_SCHEMA_VERSION,
  app_id: "flash-arb-dashboard",
  types: [
    {
      type: "opportunity_found",
      label: "Flash loan opportunity",
      description: "Alert when a profitable flash loan path is detected",
      trigger_kind: "poll" as const,
      poll_interval_seconds: 60,
      evaluator: "deepbook.flash_loan_scanner",
      default_channels: ["in_app", "web_push"] as const,
      condition_schema: [
        { name: "min_profit_bps", type: "number" as const, required: true },
        { name: "pool_keys", type: "array" as const },
        { name: "borrow_amount", type: "number" as const },
        { name: "max_gas_usd", type: "number" as const },
      ],
      presentation: {
        title_template: "Flash arb {{profit_bps}} bps",
        body_template: "{{route_summary}} — est. surplus {{profit_display}}",
        deep_link_template: "/app/projects/{{project_id}}/run",
      },
    },
  ],
};
