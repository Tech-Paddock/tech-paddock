-- The `lando` schema, for the puppy journal (TEC-119). Alone, so every table
-- created after the grants migration that follows inherits its default
-- privileges.
--
-- **Still outside this file and still required:** adding `lando` to the
-- exposed-schemas list in the Supabase dashboard. `/api/health` probes for it.
--
-- **Shape: additive.** A new, empty schema.

CREATE SCHEMA IF NOT EXISTS lando;
