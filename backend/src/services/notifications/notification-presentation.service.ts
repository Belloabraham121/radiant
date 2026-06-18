import type { NotificationPresentationTemplate } from "./notification-schema.types.js";

export function renderNotificationTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) {
      return "";
    }
    return String(value);
  });
}

export function renderNotificationPresentation(
  presentation: NotificationPresentationTemplate | undefined,
  vars: Record<string, string | number | undefined | null>,
  fallback: { title: string; body: string; deep_link?: string },
): { title: string; body: string; deep_link?: string } {
  const title = presentation?.title_template
    ? renderNotificationTemplate(presentation.title_template, vars).trim() || fallback.title
    : fallback.title;

  const body = presentation?.body_template
    ? renderNotificationTemplate(presentation.body_template, vars).trim() || fallback.body
    : fallback.body;

  const deep_link = presentation?.deep_link_template
    ? renderNotificationTemplate(presentation.deep_link_template, vars).trim() || fallback.deep_link
    : fallback.deep_link;

  return {
    title,
    body,
    ...(deep_link ? { deep_link } : {}),
  };
}
