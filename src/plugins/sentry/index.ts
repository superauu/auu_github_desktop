import { SENTRY_PROVIDER } from '../manifests';
import { SentryClient } from './client';
export const sentryPlugin = { manifest: SENTRY_PROVIDER, createClient: (credentials: { token: string; baseUrl?: string }) => new SentryClient(credentials) };
