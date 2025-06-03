
-- Ensure Row Level Security (RLS) is enabled for your 'public.users' table in the Supabase Dashboard.
-- Apply these policies using the Supabase SQL Editor.
-- Replace 'public.users' if your table is named differently (e.g., 'public.profiles').

-- 1. Policy for SELECT: Authenticated users can read their own profile.
-- This is necessary for the onboarding page to fetch existing profile data.
DROP POLICY IF EXISTS "Allow individual user read access" ON public.users;
CREATE POLICY "Allow individual user read access"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 2. Policy for UPDATE: Authenticated users can update their own profile.
-- This is necessary for the onboarding page to save changes.
DROP POLICY IF EXISTS "Allow individual user update access" ON public.users;
CREATE POLICY "Allow individual user update access"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Policy for INSERT: Authenticated users can insert their own profile row.
-- This is necessary if you are relying on the client-side `upsert` to create the profile row
-- (e.g., if the Supabase trigger `handle_new_user` is not used or as a fallback).
-- If the trigger is reliably creating the row, this client-side INSERT policy might be optional
-- but makes `upsert` more robust.
DROP POLICY IF EXISTS "Allow individual user insert access" ON public.users;
CREATE POLICY "Allow individual user insert access"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Note: You might also want a DELETE policy if users are allowed to delete their accounts.
-- DROP POLICY IF EXISTS "Allow individual user delete access" ON public.users;
-- CREATE POLICY "Allow individual user delete access"
-- ON public.users
-- FOR DELETE
-- TO authenticated
-- USING (auth.uid() = id);

-- Reminder: The Supabase trigger `handle_new_user` (provided in a previous step)
-- is highly recommended to automatically create a row in `public.users`
-- when a user signs up in `auth.users`. The trigger operates with `SECURITY DEFINER`
-- and handles the initial insertion linked to `auth.users.id`.
-- The RLS policies above then govern client-side access to these rows.

    