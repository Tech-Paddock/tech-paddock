CREATE TABLE editor.model_status (
  id integer PRIMARY KEY DEFAULT 1,
  checked_at timestamptz NOT NULL DEFAULT now(),
  pinned_model text NOT NULL,
  known_sonnet_models jsonb NOT NULL DEFAULT '[]'::jsonb,
  newly_detected jsonb NOT NULL DEFAULT '[]'::jsonb,
  drift_detected boolean NOT NULL DEFAULT false,
  CONSTRAINT model_status_singleton CHECK (id = 1)
);

ALTER TABLE editor.model_status ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON editor.model_status TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
