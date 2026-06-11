/** Trim and lowercase email before DB writes and lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
