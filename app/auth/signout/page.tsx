/**
 * Auth.js signOut page (server component).
 *
 * Renders a sign-out confirmation form. The form posts to
 * `/api/auth/signout` (Auth.js's built-in endpoint). After
 * sign-out, Auth.js redirects to the configured
 * `pages.signOut` URL (this page) on subsequent visits.
 */

export const metadata = {
  title: 'Cerrar sesión — gastos-personales',
};

export default function SignOutPage() {
  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Cerrar sesión</h1>
      <p>¿Estás seguro de que querés cerrar la sesión?</p>
      <form method="post" action="/api/auth/signout" style={{ margin: '1rem 0' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Sí, cerrar sesión
        </button>
      </form>
    </main>
  );
}
