/**
 * PostCSS configuration for gastos-personales.
 *
 * Tailwind v4 uses a dedicated PostCSS plugin
 * (`@tailwindcss/postcss`) instead of the legacy
 * `tailwindcss` PostCSS plugin. The plugin is registered
 * here so `next build` and `next dev` pick it up
 * automatically (Next.js 16 reads `postcss.config.mjs`
 * from the project root).
 *
 * The smoke UI under `app/accounts/*` uses Tailwind
 * utility classes; the production `ui-accounts` change
 * will extend the design system (theme tokens, component
 * primitives) without re-doing setup.
 *
 * No other PostCSS plugins are needed for the smoke
 * slice. Autoprefixer is not required because Tailwind
 * v4's `@tailwindcss/postcss` ships its own vendor
 * prefixing via Lightning CSS.
 */

const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
