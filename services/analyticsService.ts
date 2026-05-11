import { monitoringService } from './monitoringService';

export type AnalyticsEventName =
  | 'open_article'
  | 'article_load_success'
  | 'article_load_fallback'
  | 'article_open_external'
  | 'prediction_submitted'
  | 'preview_opened'
  | 'notification_subscribe_toggled'
  | 'news_rate_limited'
  | 'news_provider_unsupported'
  | 'firebase_permission_error'
  | 'image_load_failed'
  | 'moderation_blocked_message';

export type AnalyticsPayload = Record<string, unknown>;

class AnalyticsService {
  track(event: AnalyticsEventName, payload: AnalyticsPayload = {}) {
    // Equivalent lightweight analytics sink for production hardening.
    // Replace with Firebase Analytics/Segment/PostHog later without touching callsites.
    monitoringService.info(`analytics:${event}`, payload);
  }
}

export const analyticsService = new AnalyticsService();
