type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(eventName: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(
  eventName: string,
  data?: AnalyticsData,
): void {
  if (typeof window === 'undefined') return;

  try {
    window.umami?.track(eventName, data);
  } catch {
    // Analytics must never interrupt a study session.
  }
}
