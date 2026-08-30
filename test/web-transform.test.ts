import { describe, expect, it } from 'bun:test';
import { stripServerExports } from '../src/web/transform-server-exports.js';

describe('stripServerExports', () => {
  it('removes loader/action/headers and keeps the client exports', () => {
    const out = stripServerExports(`
import { db } from './db.server';
import { useLoaderData } from 'react-router';
export async function loader() { return db.query(); }
export function action() { return null; }
export function headers() { return { 'Cache-Control': 'no-store' }; }
export const meta = () => [{ title: 'Post' }];
export function ErrorBoundary() { return null; }
export default function Post() { return useLoaderData(); }
`);
    expect(out).not.toMatch(/export (async )?function loader/);
    expect(out).not.toMatch(/export function action/);
    expect(out).not.toMatch(/export function headers/);
    expect(out).toMatch(/export const meta/);
    expect(out).toMatch(/export function ErrorBoundary/);
    expect(out).toMatch(/export default function Post/);
  });

  it('trims an import used only by a stripped server export', () => {
    const out = stripServerExports(`
import { db } from './db.server';
import { useLoaderData } from 'react-router';
export function loader() { return db.query(); }
export default function C() { return useLoaderData(); }
`);
    // the named binding is gone (db was only used by loader)…
    expect(out).not.toMatch(/\bdb\.query\b/);
    // …and react-router stays (used by the component)
    expect(out).toMatch(/from ['"]react-router['"]/);
  });

  it('leaves a module with no server exports essentially intact', () => {
    const out = stripServerExports(`
export const meta = () => [{ title: 'About' }];
export default function About() { return null; }
`);
    expect(out).toMatch(/export const meta/);
    expect(out).toMatch(/export default function About/);
  });
});
