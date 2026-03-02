import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,

    // Capture 10% of transactions in production for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Replay 1% of sessions normally, 100% when an error occurs
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        maskAllText:   false,
        blockAllMedia: false,
      }),
      Sentry.browserTracingIntegration(),
    ],

    beforeSend(event) {
      // Strip sensitive user info from query params in breadcrumbs
      return event;
    },
  });
}
