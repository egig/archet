import { describe, expect, it } from 'bun:test';
import { defineDomain, field } from '../src/core/index.js';
import { serializeDomainSettingsMeta } from '../src/console/serialize-domain.js';

describe('serializeDomainSettingsMeta (src/console/serialize-domain.ts)', () => {
  it('humanizes the domain name into a label when label is not set', () => {
    const AuthSettings = defineDomain('auth', { settings: { sessionTtlDays: field.integer({ default: 7 }) } });
    expect(serializeDomainSettingsMeta(AuthSettings).label).toBe('Auth');
  });

  it('uses the declared label when set', () => {
    const AuthSettings = defineDomain('auth', {
      label: 'Authentication',
      settings: { sessionTtlDays: field.integer({ default: 7 }) },
    });
    expect(serializeDomainSettingsMeta(AuthSettings).label).toBe('Authentication');
  });

  it('serializes each declared field the same way a model field is serialized', () => {
    const AuthSettings = defineDomain('auth', {
      settings: { sessionTtlDays: field.integer({ default: 7, displayText: 'Session TTL (days)' }) },
    });
    const meta = serializeDomainSettingsMeta(AuthSettings);
    expect(meta.fields).toEqual([
      expect.objectContaining({ key: 'sessionTtlDays', label: 'Session TTL (days)', kind: 'integer', default: 7 }),
    ]);
  });

  it('defaults consoleMenu to an empty array when not declared', () => {
    const AuthSettings = defineDomain('auth', { settings: { sessionTtlDays: field.integer({ default: 7 }) } });
    expect(serializeDomainSettingsMeta(AuthSettings).consoleMenu).toEqual([]);
  });

  it('passes through a declared consoleMenu', () => {
    const Automation = defineDomain('automation', { consoleMenu: [{ label: 'Chat', to: '/chat' }] });
    expect(serializeDomainSettingsMeta(Automation).consoleMenu).toEqual([{ label: 'Chat', to: '/chat' }]);
    expect(serializeDomainSettingsMeta(Automation).fields).toEqual([]);
  });
});
