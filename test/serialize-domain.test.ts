import { describe, expect, it } from 'vitest';
import { defineDomainSettings, field } from '../src/core/index.js';
import { serializeDomainSettingsMeta } from '../src/console/serialize-domain.js';

describe('serializeDomainSettingsMeta (src/console/serialize-domain.ts)', () => {
  it('humanizes the domain name into a label when label is not set', () => {
    const AuthSettings = defineDomainSettings('auth', { fields: { sessionTtlDays: field.integer({ default: 7 }) } });
    expect(serializeDomainSettingsMeta(AuthSettings).label).toBe('Auth');
  });

  it('uses the declared label when set', () => {
    const AuthSettings = defineDomainSettings('auth', {
      label: 'Authentication',
      fields: { sessionTtlDays: field.integer({ default: 7 }) },
    });
    expect(serializeDomainSettingsMeta(AuthSettings).label).toBe('Authentication');
  });

  it('serializes each declared field the same way a model field is serialized', () => {
    const AuthSettings = defineDomainSettings('auth', {
      fields: { sessionTtlDays: field.integer({ default: 7, displayText: 'Session TTL (days)' }) },
    });
    const meta = serializeDomainSettingsMeta(AuthSettings);
    expect(meta.fields).toEqual([
      expect.objectContaining({ key: 'sessionTtlDays', label: 'Session TTL (days)', kind: 'integer', default: 7 }),
    ]);
  });
});
