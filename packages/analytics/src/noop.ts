import type { AnalyticsClient, AnalyticsEvent } from './events';

/** No-op analytics client used in tests and Phase 1 dev. */
export const NoopAnalytics: AnalyticsClient = {
  track(_event: AnalyticsEvent): void {
    // intentionally empty
  },
  identify(_userId: string, _traits?: Record<string, unknown>): void {
    // intentionally empty
  },
};
