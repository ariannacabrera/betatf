/*
  # Fix profiles table to auto-generate ID

  Changes the id column to auto-generate UUID values when inserting new profiles
  without authentication. Handles foreign key constraints properly.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'id' AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE profiles
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END $$;
