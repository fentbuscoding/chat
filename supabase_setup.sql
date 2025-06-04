
-- Supabase Setup SQL for User Profiles

-- 1. Ensure your public.users table exists.
-- Adjust column names and types if your table is different (e.g., 'profiles').
-- The 'id' column MUST be uuid and primary key, matching auth.users.id.
-- 'username' can be text, consider adding a UNIQUE constraint if desired.
-- 'display_name', 'avatar_url' are examples; add what you need.
-- 'profile_complete' is useful for tracking onboarding.
-- 'created_at' and 'updated_at' are good practice.

CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  profile_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20)
);

-- Optional: Add a comment to describe the table
COMMENT ON TABLE public.users IS 'Stores public user profile information linked to auth.users.';

-- 2. Create the function to handle new user creation.
-- This function will be called by the trigger.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a new row into public.users, copying the id from the auth.users table.
  -- You can add default values for other columns here if needed.
  INSERT INTO public.users (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the function owner is supabase_admin to avoid permission issues.
-- You might need to run this separately if you encounter permission errors during creation.
-- ALTER FUNCTION public.handle_new_user() OWNER TO supabase_admin;


-- 3. Create the trigger on the auth.users table.
-- This trigger will execute the handle_new_user function AFTER a new user is inserted into auth.users.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Drop if it already exists
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS Policies for public.users table

-- Enable Row Level Security on the table if not already enabled.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to SELECT their own profile.
DROP POLICY IF EXISTS "Allow individual user read access" ON public.users;
CREATE POLICY "Allow individual user read access"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Allow authenticated users to INSERT their own profile row.
-- This is crucial for the client-side upsert/fallback.
DROP POLICY IF EXISTS "Allow individual user insert access" ON public.users;
CREATE POLICY "Allow individual user insert access"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy: Allow authenticated users to UPDATE their own profile.
DROP POLICY IF EXISTS "Allow individual user update access" ON public.users;
CREATE POLICY "Allow individual user update access"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy (Optional): Allow public read access to certain profile fields if needed.
-- For example, to allow anyone to see usernames and avatars.
-- Be careful with what you expose publicly.
-- DROP POLICY IF EXISTS "Allow public read access to basic profile info" ON public.users;
-- CREATE POLICY "Allow public read access to basic profile info"
--   ON public.users FOR SELECT
--   TO public -- or anon, authenticated
--   USING (true); -- This would allow reading all rows for selected columns.
                  -- To restrict columns, you'd rely on your SELECT query not asking for sensitive data.

-- 5. (Optional but Recommended) Function and Trigger to auto-update 'updated_at' timestamp

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- After running this SQL in your Supabase SQL Editor:
-- 1. New users signing up will automatically get a row in `public.users`.
-- 2. Your client-side code (Next.js app) will be able to securely interact
--    with the `public.users` table based on these RLS policies.
-- 3. The `updated_at` column will automatically update.

SELECT 'Supabase setup SQL for user profiles executed.';
