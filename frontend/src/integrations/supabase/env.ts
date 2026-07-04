// Centralized environment variable resolver for Supabase configuration.
// This module is the single source of truth for all Supabase env vars.
// It resolves variables from VITE_* sources (available everywhere via Vite build-time replacement)
// with fallback to process.env, then to hardcoded defaults.
//
// WHY THIS EXISTS:
// - VITE_* vars are baked into the client bundle at build time (import.meta.env)
// - VITE_* vars are also available on the server via import.meta.env (Vite replaces them statically)
// - Hardcoded fallbacks ensure the app works without any manual env setup on deployment
//
// DEPLOYMENT: The app is self-contained — no env vars needed. Just deploy and go.

// Hardcoded defaults — these are the production Supabase project credentials.
// They serve as fallback when no env vars are set, ensuring the app works anywhere.
const DEFAULT_SUPABASE_URL = "https://sofurxihjwgmbosyzeib.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvZnVyeGloandnbWJvc3l6ZWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzA3MTksImV4cCI6MjA5ODI0NjcxOX0.wihTlsW93kHIMUAjeKR7926Ndg9VW4cyJWNmTuTuoHA";
const DEFAULT_SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvZnVyeGloandnbWJvc3l6ZWliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjY3MDcxOSwiZXhwIjoyMDk4MjQ2NzE5fQ.S3psucFwK2cMl9e0f6qwmP6TZHHInYOcGsU6Wc1hCKg";

export function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

export function getSupabasePublishableKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getSupabaseServiceRoleKey(): string {
  return (
    import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    DEFAULT_SUPABASE_SERVICE_ROLE_KEY
  );
}

// Convenience object for destructuring
export const supabaseEnv = {
  get url() {
    return getSupabaseUrl();
  },
  get publishableKey() {
    return getSupabasePublishableKey();
  },
  get serviceRoleKey() {
    return getSupabaseServiceRoleKey();
  },
};
