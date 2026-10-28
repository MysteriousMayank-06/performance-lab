// ---------------------------------------------------------------------------
// Supabase connection (PUBLIC values only — safe to ship in a browser app
// because every table is protected by Row Level Security).
//
// Option A (permanent): paste your project URL + publishable/anon key below.
// Option B (no code edit): leave blank; the app shows a one-time setup screen
//   and stores the values in this browser.
//
// NEVER put the service_role key or database password here.
// ---------------------------------------------------------------------------
export const SUPABASE_URL = '';
export const SUPABASE_PUBLISHABLE_KEY = '';

// Pinned client library (loaded from a free CDN, cached by the service worker).
export const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const LS = 'pl_supabase';

export function getConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { /* ignore */ }
  return { url: SUPABASE_URL || saved.url || '', key: SUPABASE_PUBLISHABLE_KEY || saved.key || '' };
}
export function saveConfig(url, key) { localStorage.setItem(LS, JSON.stringify({ url: url.trim(), key: key.trim() })); }
export function isConfigured() { const c = getConfig(); return /^https:\/\/.+\..+/.test(c.url) && c.key.length > 20; }
export function looksLikeSecret(key) {
  // service_role JWTs and "sb_secret_" keys must never be used in the browser.
  if (/^sb_secret_/.test(key)) return true;
  try { const p = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.role === 'service_role'; } catch { return false; }
}
