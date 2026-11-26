import { describe, expect, it } from 'vitest';
import { disposableDatabaseUrl } from './helpers/disposable-database.js';

describe('migration database boundary', () => {
  it('defaults to in-memory isolation', () => expect(disposableDatabaseUrl({})).toBeNull());
  it('rejects any application database URL', () => expect(() => disposableDatabaseUrl({ DATABASE_URL: 'postgres://localhost/voxrelay_test' })).toThrow('Refusing application'));
  it.each([
    'postgres://db.example.com/voxrelay_test',
    'postgres://localhost/production',
    'postgres://localhost/voxrelay_test?host=db.example.com',
    'https://localhost/voxrelay_test',
    'postgres://localhost/voxrelay_test#production',
  ])('rejects unsafe target %s before connection', (url) => {
    expect(() => disposableDatabaseUrl({ VOXRELAY_TEST_DATABASE_URL: url, VOXRELAY_ALLOW_DISPOSABLE_DB: 'voxrelay_test' })).toThrow();
  });
  it('requires explicit opt in', () => expect(() => disposableDatabaseUrl({ VOXRELAY_TEST_DATABASE_URL: 'postgres://localhost/voxrelay_test' })).toThrow());
  it('accepts only the explicitly disposable local database', () => {
    expect(disposableDatabaseUrl({ VOXRELAY_TEST_DATABASE_URL: 'postgres://localhost/voxrelay_test', VOXRELAY_ALLOW_DISPOSABLE_DB: 'voxrelay_test' })).toBe('postgres://localhost/voxrelay_test');
  });
});
