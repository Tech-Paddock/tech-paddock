-- Lando's profile (TEC-260): the details the journal cannot derive, kept in one row.
--
-- Breed, birth date, microchip number, insurance provider and policy number, and the vet clinic's name and phone.
-- The Profile page (opened from the app bar's icon) reads and edits them; everything else on that page (latest weight,
-- last and next vet visit, vaccines, regular medications) is derived from the journal and the plans.
--
-- **One row.** `id` is a boolean that must be true and is the primary key, so a second row cannot exist; the app saves
-- with an upsert on it. Every detail is nullable: an empty profile is a row with nothing in it, or no row at all.
-- The length checks match `apps/lando/lib/profile.ts` (`PROFILE_MAX`), and a test holds them equal.
--
-- **Personal data.** The microchip and policy numbers are kept only here, never in the repo, and the app never logs
-- them (RULES.md, Never 2). No row is seeded: the owner types the details in the app.
--
-- RLS on, zero policies: only the server's service role reads or writes it. The grant is explicit for the service role
-- (the schema's default privileges also cover a new table).
--
-- **Shape: additive.** One new table in the existing `lando` schema; nothing else changes.
-- Undo: DROP TABLE lando.profile (a destructive migration; the owner runs it).

CREATE TABLE lando.profile (
  id boolean PRIMARY KEY DEFAULT true CONSTRAINT profile_one_row CHECK (id),
  breed text CHECK (breed IS NULL OR char_length(breed) BETWEEN 1 AND 60),
  birth_on date,
  microchip text CHECK (microchip IS NULL OR char_length(microchip) BETWEEN 1 AND 30),
  insurance_provider text CHECK (insurance_provider IS NULL OR char_length(insurance_provider) BETWEEN 1 AND 60),
  insurance_policy text CHECK (insurance_policy IS NULL OR char_length(insurance_policy) BETWEEN 1 AND 40),
  clinic_name text CHECK (clinic_name IS NULL OR char_length(clinic_name) BETWEEN 1 AND 80),
  clinic_phone text CHECK (clinic_phone IS NULL OR char_length(clinic_phone) BETWEEN 1 AND 30),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lando.profile ENABLE ROW LEVEL SECURITY;

GRANT ALL ON lando.profile TO service_role;

NOTIFY pgrst, 'reload schema';
