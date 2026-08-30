/*
 * Global settings, as the deployment serves them.
 *
 * In a real installation this file comes from the backend and carries the flags
 * an administrator has set, applied to window.config before the bundles load.
 * The demonstration has no backend, and the page comments already say that when
 * the file is unreachable the values from app-config.js stand — so this is
 * deliberately empty of overrides.
 *
 * It exists at all because a development server answers a missing path with
 * index.html rather than a 404, and a script tag handed HTML fails to parse and
 * stops the page before anything renders. An empty file is the difference
 * between the intended fallback and a blank screen.
 */
