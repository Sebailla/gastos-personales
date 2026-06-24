/**
 * Public surface of the `api` module. Other modules (and
 * the `app/` tree) import ONLY from this file.
 */

export {
  honoApp,
  createHonoApp,
  type AppType,
  type HonoAppDeps,
  type HonoContextVariables,
} from './app';
export { apiClient } from './client';
