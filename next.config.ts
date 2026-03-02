import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Automatically instrument server-side code
  autoInstrumentServerFunctions: true,

  // Upload source maps only in CI/production
  silent: process.env.NODE_ENV !== "production",

  // Disable source map upload if Sentry isn't configured
  // (prevents build failure when SENTRY_AUTH_TOKEN is absent)
  disableClientWebpackPlugin:  !process.env.SENTRY_AUTH_TOKEN,
  disableServerWebpackPlugin:  !process.env.SENTRY_AUTH_TOKEN,
});
