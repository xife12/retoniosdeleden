import { supabase } from '../../lib/supabase';

/**
 * Statische Seite (siehe astro.config.mjs, output: 'static') + client-seitiger
 * Auth-Gate: Login/Logout laufen komplett im Browser über Supabase Auth. Die
 * eigentliche Schutzgrenze ist Row Level Security (supabase/schema.sql) -
 * ohne gültige Session liefert die Datenbank weder Entwürfe/Archiviertes
 * noch erlaubt sie Schreibzugriffe. Siehe Architektur-Entscheidung im Plan.
 */

const loginSection = document.querySelector<HTMLElement>('[data-admin-login]')!;
const dashSection = document.querySelector<HTMLElement>('[data-admin-dash]')!;
const loginForm = document.querySelector<HTMLFormElement>('[data-login-form]')!;
const loginError = document.querySelector<HTMLElement>('[data-login-error]')!;
const logoutBtn = document.querySelector<HTMLButtonElement>('[data-logout]')!;
const emailInp = document.querySelector<HTMLInputElement>('#admin-email')!;
const passwordInp = document.querySelector<HTMLInputElement>('#admin-password')!;

function showDashboard() {
  loginSection.hidden = true;
  dashSection.hidden = false;
  document.dispatchEvent(new CustomEvent('admin:signed-in'));
}

function showLogin() {
  dashSection.hidden = true;
  loginSection.hidden = false;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const submitBtn = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submitBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInp.value.trim(),
      password: passwordInp.value,
    });
    if (error) {
      loginError.textContent =
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : `No se pudo iniciar sesión: ${error.message}`;
      loginError.hidden = false;
      return;
    }
    passwordInp.value = '';
  } finally {
    submitBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showDashboard();
  } else {
    showLogin();
  }
});

// Initialer Check (z. B. bereits eingeloggt aus vorheriger Sitzung).
supabase.auth.getSession().then(({ data }) => {
  if (data.session) showDashboard();
});
