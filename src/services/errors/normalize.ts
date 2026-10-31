/**
 * 语义归一层（PRD §5.2）：把各平台的 severity/status 映射为统一四档/三态。
 * 表驱动——新增平台只加一张表；未知原始值回落默认档（error / unresolved），不抛错。
 */
import type { NormalizedSeverity, NormalizedStatus } from './types';

type SeverityTable = Readonly<Record<string, NormalizedSeverity>>;
type StatusTable = Readonly<Record<string, NormalizedStatus>>;

const SEVERITY_TABLES: Readonly<Record<string, SeverityTable>> = {
  sentry: { fatal: 'critical', error: 'error', warning: 'warning', info: 'info', debug: 'info' },
  rollbar: { critical: 'critical', error: 'error', warning: 'warning', info: 'info' },
  bugsnag: { error: 'error', warning: 'warning', info: 'info' },
};

const STATUS_TABLES: Readonly<Record<string, StatusTable>> = {
  // reprocessing 归一为 unresolved，原始语义由 rawStatus 保留给详情页。
  sentry: { unresolved: 'unresolved', resolved: 'resolved', ignored: 'ignored', reprocessing: 'unresolved' },
  rollbar: { active: 'unresolved', resolved: 'resolved', muted: 'ignored' },
};

const keyOf = (raw: string | null | undefined): string => (raw ?? '').trim().toLowerCase();

export function normalizeSeverity(providerId: string, raw: string | null | undefined): NormalizedSeverity {
  return SEVERITY_TABLES[providerId]?.[keyOf(raw)] ?? 'error';
}

export function normalizeStatus(providerId: string, raw: string | null | undefined): NormalizedStatus {
  return STATUS_TABLES[providerId]?.[keyOf(raw)] ?? 'unresolved';
}
