import type { NotificationEvaluator } from "../notification-evaluator.types.js";

const evaluators = new Map<string, NotificationEvaluator>();

export function registerNotificationEvaluator(evaluator: NotificationEvaluator): void {
  if (evaluators.has(evaluator.key)) {
    throw new Error(`Notification evaluator already registered: ${evaluator.key}`);
  }
  evaluators.set(evaluator.key, evaluator);
}

export function getNotificationEvaluator(key: string): NotificationEvaluator | undefined {
  return evaluators.get(key);
}

export function listRegisteredNotificationEvaluators(): string[] {
  return [...evaluators.keys()].sort();
}

export function resetNotificationEvaluatorRegistryForTests(): void {
  evaluators.clear();
}
