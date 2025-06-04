
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Label } from '@/components/ui/label-themed';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

console.log('OnboardingPage component is being loaded/rendered by Next.js');

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  profile_complete: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null | 'checking'>(null);
  const debouncedUsername = useDebounce(username, 500);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        console.log(`Onboarding: User ID: ${session.user.id}`);
        const { data: profile, error } = await supabase
          .from('users')
          .select('username, display_name, avatar_url, profile_complete')
          .eq('id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error('Onboarding: Error fetching profile:', error);
          toast({ title: 'Error fetching profile', description: error.message, variant: 'destructive' });
        } else if (profile) {
          console.log('Onboarding: Profile found:', profile);
          if (profile.profile_complete && router.asPath.includes('/onboarding')) {
            // User has completed onboarding, redirect away if they land here again
            router.replace('/');
            return;
          }
          setUsername(profile.username || '');
          setDisplayName(profile.display_name || '');
          setAvatarUrl(profile.avatar_url);
          if (profile.avatar_url) {
            setAvatarPreview(profile.avatar_url);
          }
        } else {
          // No profile found (PGRST116) or profile exists but is minimal (e.g., only ID from trigger)
          console.log('Onboarding: No existing complete profile found for user or profile is minimal.');
        }
      } else {
        // No active session, redirect to sign-in
        router.replace('/signin');
        return;
      }
      setLoading(false);
    };
    fetchUserAndProfile();
  }, [router, toast]);

  useEffect(() => {
    const checkUsername = async () => {
      if (!debouncedUsername || debouncedUsername.length < 3) {
        setUsernameAvailable(null);
        return;
      }
      setUsernameAvailable('checking');
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', debouncedUsername)
        .neq('id', user?.id || '') // Exclude current user's own username if they are just re-saving
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found (username is available)
        console.error('Error checking username:', error);
        setUsernameAvailable(null); // Could be an actual error
      } else {
        setUsernameAvailable(!data); // True if no data (username available), false if data (username taken)
      }
    };

    if (user) { // Only check if user is loaded
        checkUsername();
    }
  }, [debouncedUsername, user]);


  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        toast({ title: "Image too large", description: "Please select an image smaller than 2MB.", variant: "destructive" });
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      toast({ title: 'Authentication Error', description: 'User not found. Please sign in again.', variant: 'destructive'});
      return;
    }
    if (!username || username.length < 3) {
      toast({ title: 'Invalid Username', description: 'Username must be at least 3 characters.', variant: 'destructive'});
      return;
    }
    if (!displayName) {
        toast({ title: 'Display Name Required', description: 'Please enter a display name.', variant: 'destructive'});
        return;
    }
    if (usernameAvailable === false) { // Explicitly check for false
        toast({ title: 'Username Taken', description: 'Please choose a different username.', variant: 'destructive'});
        return;
    }
     if (usernameAvailable === 'checking') {
        toast({ title: 'Username Check Pending', description: 'Please wait for username availability check.', variant: 'default'});
        return;
    }

    setSaving(true);
    let newAvatarStoragePath: string | null = null;
    let finalAvatarUrl = avatarUrl; // Use existing avatar URL by default

    // 1. Upload avatar if a new one is selected
    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      newAvatarStoragePath = `${user.id}/${fileName}`; // Store in a user-specific folder

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(newAvatarStoragePath, avatarFile, { upsert: true }); // Use upsert for storage as well

      if (uploadError) {
        toast({ title: 'Avatar Upload Failed', description: uploadError.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      
      // Get public URL for the newly uploaded avatar
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(newAvatarStoragePath);
      if (!urlData || !urlData.publicUrl) {
        toast({ title: 'Avatar URL Failed', description: 'Could not get public URL for avatar.', variant: 'destructive' });
        setSaving(false);
        return;
      }
      finalAvatarUrl = urlData.publicUrl;
    }

    // 2. Client-side fallback: Ensure user row exists before upserting profile details
    // This is a fallback in case the server-side trigger (handle_new_user) hasn't run or failed.
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();

    if (checkError && checkError.code === 'PGRST116') { // PGRST116: No rows found
      console.log(`Onboarding: User row for ${user.id} not found. Attempting client-side insert fallback.`);
      const { error: insertError } = await supabase
        .from('users')
        .insert({ id: user.id }); // Insert minimal row; RLS 'WITH CHECK (auth.uid() = id)' must allow this.
      
      if (insertError) {
        console.error("Onboarding: Client-side fallback insertError:", insertError);
        toast({ title: 'Profile Setup Failed', description: `Could not create initial profile entry: ${insertError.message}`, variant: 'destructive' });
        setSaving(false);
        return;
      }
      console.log(`Onboarding: Client-side fallback - initial user row for ${user.id} inserted successfully.`);
    } else if (checkError) {
      // Another error occurred while checking for the user, not PGRST116
      console.error("Onboarding: Error checking for existing user row:", checkError);
      toast({ title: 'Profile Setup Error', description: `Could not verify profile: ${checkError.message}`, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 3. Upsert the full profile data
    const profileDataToUpsert: UserProfile = {
      id: user.id, // CRUCIAL for RLS policies
      username,
      display_name: displayName,
      avatar_url: finalAvatarUrl,
      profile_complete: true, // Mark profile as complete
    };

    console.log("Onboarding: Attempting to upsert profile data:", profileDataToUpsert);

    const { error: upsertError } = await supabase
      .from('users')
      .upsert(profileDataToUpsert, {
        onConflict: 'id', // Specify the conflict target for upsert
      })
      .select() // Optionally select to confirm the upsert
      .single(); // If you expect only one row to be affected

    if (upsertError) {
      toast({ title: 'Profile Update Failed', description: upsertError.message, variant: 'destructive' });
      console.error("Onboarding: Upsert Error:", upsertError);
    } else {
      toast({ title: 'Profile Updated!', description: 'Your profile has been set up.' });
      router.push('/'); // Navigate to home page or dashboard
      router.refresh(); // Force a refresh to update any user-dependent UI
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <p>Loading onboarding...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="window w-full max-w-lg">
        <div className="title-bar">
          <div className="title-bar-text">Set Up Your Profile</div>
        </div>
        <div className="window-body p-4 md:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="avatar-upload-input">Profile Picture</Label>
              <div className="mt-1 flex items-center space-x-4">
                <span className="inline-block h-20 w-20 rounded-full overflow-hidden bg-gray-100">
                  {avatarPreview ? (
                    <Image src={avatarPreview} alt="Avatar preview" width={80} height={80} className="object-cover h-full w-full" data-ai-hint="user avatar preview"/>
                  ) : (
                    <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                </span>
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  Change
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  accept="image/png, image/jpeg, image/gif"
                  className="hidden"
                  id="avatar-upload-input"
                  aria-labelledby="avatar-upload-input"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                  required
                  minLength={3}
                  maxLength={20}
                  className={cn(
                    usernameAvailable === true && username.length >=3 && 'border-green-500 focus:border-green-500',
                    usernameAvailable === false && username.length >=3 && 'border-red-500 focus:border-red-500'
                  )}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm pointer-events-none">
                  {usernameAvailable === 'checking' && <span className="text-gray-500 animate-pulse">Checking...</span>}
                  {usernameAvailable === true && username.length >=3 && <span className="text-green-500">✔️ Available</span>}
                  {usernameAvailable === false && username.length >=3 && <span className="text-red-500">❌ Taken</span>}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">3-20 characters. Letters, numbers, and underscores only.</p>
            </div>

            <div>
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 30))}
                required
                maxLength={30}
              />
               <p className="text-xs text-gray-500 mt-1">1-30 characters. This will be shown in chats if not anonymous.</p>
            </div>

            <Button type="submit" className="w-full" disabled={saving || usernameAvailable === 'checking' || (usernameAvailable === false && username.length >=3) }>
              {saving ? 'Saving...' : 'Save Profile & Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
