import { h, clear } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { field, once } from '../components/ui.js';
import { auth, friendlyAuthError } from '../auth.js';
import { saveConfig, looksLikeSecret } from '../config.js';
import { resetClient } from '../supabase-client.js';

const shell = (...kids) => h('div', { class: 'auth-wrap view' },
  h('div', { class: 'glass logo' }, icon('logo', 32)),
  h('div', { class: 'stack', style: { textAlign: 'center', gap: '6px' } }, h('h1', { class: 'hero-title' }, 'Performance Lab'), h('p', { style: { color: 'var(--on-stage-muted)' } }, 'Your private gym companion.')),
  ...kids);

/** One-time setup when no Supabase project is configured yet. */
export function renderSetup(onDone) {
  const url = h('input', { class: 'input', placeholder: 'https://abcdxyz.supabase.co', inputmode: 'url', autocapitalize: 'off', autocomplete: 'off' });
  const key = h('input', { class: 'input', placeholder: 'Publishable (anon) key', autocapitalize: 'off', autocomplete: 'off' });
  const msg = h('div', { class: 'field-error', role: 'alert' });
  const go = once(h('button', { class: 'btn btn-light btn-block' }, 'Save and continue'), async () => {
    msg.textContent = '';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)\/?$/i.test(url.value.trim())) { msg.textContent = 'That doesn\'t look like a Supabase project URL (https://xxxx.supabase.co).'; return; }
    if (key.value.trim().length < 20) { msg.textContent = 'Paste your publishable / anon key.'; return; }
    if (looksLikeSecret(key.value.trim())) { msg.textContent = 'That is a SECRET key. Never use it in the browser — copy the publishable / anon key instead.'; return; }
    saveConfig(url.value.replace(/\/$/, ''), key.value); resetClient(); onDone();
  });
  return shell(h('div', { class: 'glass auth-card' },
    h('h2', null, 'Connect your Supabase project'),
    h('p', { style: { color: 'var(--on-stage-muted)', fontSize: 'var(--fs-sm)', lineHeight: 1.5 } }, 'Paste the two PUBLIC values from Supabase → Project Settings → API. They are stored only in this browser. See the README for the 5-minute setup.'),
    field('Project URL', url), field('Publishable / anon key', key), msg, go));
}

export function renderAuth({ mode = 'signin', onDone }) {
  const root = h('div');
  const draw = (m, note = '') => {
    clear(root);
    const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com', required: true });
    const pass = h('input', { class: 'input', type: 'password', autocomplete: m === 'signin' ? 'current-password' : 'new-password', placeholder: 'At least 8 characters', minlength: 8 });
    const name = h('input', { class: 'input', autocomplete: 'given-name', placeholder: 'What should we call you?', maxlength: 40 });
    const msg = h('div', { class: 'field-error', role: 'alert' }, note);
    const titles = { signin: 'Welcome back', signup: 'Create your account', reset: 'Reset password', 'new-password': 'Choose a new password' };
    const cta = { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link', 'new-password': 'Update password' };
    const form = h('form', { class: 'glass auth-card', novalidate: true },
      h('h2', null, titles[m]),
      m === 'signup' ? field('Name', name) : null,
      m !== 'new-password' ? field('Email', email) : null,
      m !== 'reset' ? field(m === 'new-password' ? 'New password' : 'Password', pass) : null,
      msg,
      h('button', { class: 'btn btn-light btn-block', type: 'submit' }, cta[m]),
      m === 'signin' ? h('div', { class: 'auth-links' }, h('button', { type: 'button', onclick: () => draw('reset') }, 'Forgot password?'), h('button', { type: 'button', onclick: () => draw('signup') }, 'Create account')) : null,
      m === 'signup' || m === 'reset' ? h('div', { class: 'auth-links' }, h('span', null, 'Already have an account?'), h('button', { type: 'button', onclick: () => draw('signin') }, 'Sign in')) : null);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (form.dataset.busy) return;
      msg.textContent = '';
      const em = email.value.trim(), pw = pass.value;
      if (m !== 'new-password' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = 'Enter a valid email address.'; email.focus(); return; }
      if (m !== 'reset' && pw.length < (m === 'signin' ? 1 : 8)) { msg.textContent = m === 'signin' ? 'Enter your password.' : 'Use at least 8 characters.'; pass.focus(); return; }
      form.dataset.busy = '1'; const btn = form.querySelector('button[type=submit]'); btn.setAttribute('aria-busy', 'true');
      try {
        if (m === 'signin') onDone(await auth.signIn(em, pw));
        else if (m === 'signup') {
          const r = await auth.signUp(em, pw, name.value.trim());
          if (r.session) onDone(r.session); else draw('signin', 'Account created. Check your email to confirm it, then sign in.');
        } else if (m === 'reset') { await auth.resetPassword(em); draw('signin', 'If that email has an account, a reset link is on its way.'); }
        else { await auth.updatePassword(pw); location.hash = '/home'; location.reload(); }
      } catch (err) { msg.textContent = friendlyAuthError(err); }
      finally { delete form.dataset.busy; btn.removeAttribute('aria-busy'); }
    });
    root.append(shell(form));
  };
  draw(mode);
  return root;
}
