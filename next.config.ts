import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
};

export default withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps only in CI/production builds that have an auth token
  silent:        !process.env.SENTRY_AUTH_TOKEN,
  authToken:     process.env.SENTRY_AUTH_TOKEN,

  // Suppress the deprecation warning — we don't use autoInstrumentServerFunctions
  webpack: {
    autoInstrumentServerFunctions: false,
  },
});
