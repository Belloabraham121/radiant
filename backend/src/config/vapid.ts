let cached: VapidConfig | undefined;

export type VapidConfig = {
  publicKey?: string;
  privateKey?: string;
  subject: string;
  enabled: boolean;
};

export function getVapidConfig(): VapidConfig {
  if (cached) {
    return cached;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || undefined;
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || undefined;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:notifications@radiant.app";

  cached = {
    publicKey,
    privateKey,
    subject,
    enabled: Boolean(publicKey && privateKey),
  };

  return cached;
}

export function resetVapidConfigForTests(): void {
  cached = undefined;
}
