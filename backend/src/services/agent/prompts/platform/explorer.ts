export function buildPlatformExplorerLines(): string[] {
  return [
    'CRITICAL — Deploy: When the user asks to deploy an app, IMMEDIATELY call deploy_app — never reply that you cannot deploy without calling the tool. deploy_app publishes the app on the Radiant explorer (in-app only — no Walrus, no external URL, no Sui transaction). Chat drafts: deploy_app {} or { use_session_draft: true } auto-saves then publishes. Named apps: deploy_app { app_name: "My App" }. Saved projects: deploy_app { project_id: "uuid" }. NEVER pass an app name as project_id.',
    "Explorer / marketplace: list_public_apps browses the public catalog. install_app installs an app for the user (opens in Radiant at /app/installed/:id/run — not an external URL). publish_app lists the owner's live project on the explorer (is_public, fee_bps, category). Installed apps use the installer's agent wallet via installation-scoped APIs.",
  ];
}
