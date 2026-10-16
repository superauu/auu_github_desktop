import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseVersions } from '../scripts/check-release.mjs';

const compatible = () => ({
  appVersions: { 'package.json': '0.3.7', 'Cargo.toml': '0.3.7' },
  tauri: '2.12.3', api: '2.12.4', cli: '2.12.3', runtime: '2.12.2', runtimeWry: '2.12.2', tag: 'v0.3.7',
});

test('release accepts compatible Tauri patch versions', () => {
  assert.doesNotThrow(() => validateReleaseVersions(compatible()));
});
test('release rejects the v0.3.6 API mismatch before desktop compilation', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), api: '2.11.1' }), /Tauri version mismatch: api/);
});
test('release rejects the v0.3.5 runtime mismatch', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), tauri: '2.11.6', api: '2.11.1', cli: '2.11.4' }), /Tauri version mismatch: runtime/);
});
test('release rejects inconsistent application versions', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), appVersions: { 'package.json': '0.3.7', 'Cargo.toml': '0.3.6' } }), /App version mismatch/);
});
test('release rejects a tag that differs from the installer version', () => {
  assert.throws(() => validateReleaseVersions({ ...compatible(), tag: 'v0.3.6' }), /Release tag/);
});
