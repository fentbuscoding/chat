
-- 1. Create public.users table with a foreign key to auth.users.id
-- This table will store user profile information.
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- Ensures id matches auth.users.id and cascades deletes
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  profile_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, now()) NOT NULL
);

-- Add comments to explain the purpose of columns
COMMENT ON COLUMN public.users.id IS 'User ID, references auth.users.id';
COMMENT ON COLUMN public.users.username IS 'Unique username for the user';
COMMENT ON COLUMN public.users.display_name IS 'Display name for the user';
COMMENT ON COLUMN public.users.avatar_url IS 'URL of the user''s avatar image';
COMMENT ON COLUMN public.users.profile_complete IS 'Flag indicating if the user has completed their profile setup';

-- 2. Create a function to automatically insert a new row into public.users
-- when a new user signs up in auth.users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a new row into public.users, setting the id to the new auth user's id.
  -- Other fields will have their default values (e.g., username will be NULL, profile_complete will be FALSE).
  INSERT INTO public.users (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a comment to explain the purpose of the function
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a profile in public.users when a new user signs up in auth.users.';

-- 3. Create a trigger to execute the handle_new_user function
-- after a new row is inserted into auth.users.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Drop if exists to ensure a clean setup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add a comment to explain the purpose of the trigger
COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 'When a new user is created in auth.users, this trigger calls handle_new_user() to create a corresponding profile.';

-- 4. Function to update 'updated_at' timestamp automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = timezone('utc'::TEXT, now());
   RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Add a comment to explain the purpose of the function
COMMENT ON FUNCTION public.update_updated_at_column() IS 'Automatically updates the updated_at timestamp on row modification.';

-- 5. Trigger to update 'updated_at' on the public.users table
DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add a comment to explain the purpose of the trigger
COMMENT ON TRIGGER set_users_updated_at ON public.users IS 'Updates the updated_at field whenever a user''s profile is modified.';

-- 6. Enable Row Level Security (RLS) on the public.users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Add a comment to explain RLS
COMMENT ON TABLE public.users IS 'Stores user profile information. RLS is enabled to control access.';

-- 7. RLS Policies for public.users

-- Policy: Allow authenticated users to read their own profile.
DROP POLICY IF EXISTS "Allow individual user read access" ON public.users;
CREATE POLICY "Allow individual user read access"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Allow authenticated users to insert their own profile row.
-- This is crucial for the onboarding page's upsert/insert logic.
DROP POLICY IF EXISTS "Allow individual user insert access" ON public.users;
CREATE POLICY "Allow individual user insert access"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy: Allow authenticated users to update their own profile.
DROP POLICY IF EXISTS "Allow individual user update access" ON public.users;
CREATE POLICY "Allow individual user update access"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- (Optional) Policy: Disallow deleting profiles (or restrict to admins if needed)
-- By default, if no DELETE policy exists, deletes are disallowed.
-- DROP POLICY IF EXISTS "Disallow delete access" ON public.users;
-- CREATE POLICY "Disallow delete access"
--   ON public.users FOR DELETE
--   TO authenticated
--   USING (FALSE); -- This effectively blocks all deletes for authenticated users

-- Grant usage on schema public to supabase_functions_admin to allow trigger function creation
-- This is often needed if you run into permission issues creating SECURITY DEFINER functions.
-- May not be necessary if your default user has sufficient privileges.
-- GRANT USAGE ON SCHEMA public TO supabase_functions_admin;
-- GRANT CREATE ON SCHEMA public TO supabase_functions_admin;

SELECT 'Supabase setup SQL for public.users table, trigger, and RLS policies executed successfully.';
