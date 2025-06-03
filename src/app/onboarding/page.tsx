
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

console.log('OnboardingPage component is being loaded/rendered by Next.js'); // Diagnostic log

interface UserProfile {
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
        const { data: profile, error } = await supabase
          .from('users')
          .select('username, display_name, avatar_url, profile_complete')
          .eq('id', session.user.id)
          .single();

        if (error && error.code !== 'PGRST116') { 
          console.error('Error fetching profile:', error);
          toast({ title: 'Error fetching profile', description: error.message, variant: 'destructive' });
        } else if (profile) {
          if (profile.profile_complete) {
            router.replace('/'); 
            return;
          }
          setUsername(profile.username || '');
          setDisplayName(profile.display_name || '');
          setAvatarUrl(profile.avatar_url);
          if (profile.avatar_url) {
            setAvatarPreview(profile.avatar_url);
          }
        }
      } else {
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
        .neq('id', user?.id || '') 
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking username:', error);
        setUsernameAvailable(null); 
      } else {
        setUsernameAvailable(!data);
      }
    };

    if (user) { 
        checkUsername();
    }
  }, [debouncedUsername, user]);


  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) { 
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
    if (!user) return;
    if (!username || username.length < 3) {
      toast({ title: 'Invalid Username', description: 'Username must be at least 3 characters.', variant: 'destructive'});
      return;
    }
    if (!displayName) {
        toast({ title: 'Display Name Required', description: 'Please enter a display name.', variant: 'destructive'});
        return;
    }
    if (usernameAvailable === false) {
        toast({ title: 'Username Taken', description: 'Please choose a different username.', variant: 'destructive'});
        return;
    }
    if (usernameAvailable === 'checking') {
        toast({ title: 'Username Check Pending', description: 'Please wait for username availability check.', variant: 'default'});
        return;
    }


    setSaving(true);
    let newAvatarUrl = avatarUrl; 

    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${uuidv4()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true }); 

      if (uploadError) {
        toast({ title: 'Avatar Upload Failed', description: uploadError.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      if (!urlData || !urlData.publicUrl) {
        toast({ title: 'Avatar URL Failed', description: 'Could not get public URL for avatar.', variant: 'destructive' });
        setSaving(false);
        return;
      }
      newAvatarUrl = urlData.publicUrl;
    }

    const profileData: Partial<UserProfile> = {
      username,
      display_name: displayName,
      avatar_url: newAvatarUrl,
      profile_complete: true,
    };

    const { error: updateError } = await supabase
      .from('users')
      .update(profileData)
      .eq('id', user.id);

    if (updateError) {
      toast({ title: 'Profile Update Failed', description: updateError.message, variant: 'destructive' });
    } else {
      toast({ title: 'Profile Updated!', description: 'Your profile has been set up.' });
      router.push('/'); 
      router.refresh(); 
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
              <Label htmlFor="avatar">Profile Picture</Label>
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
                    usernameAvailable === true && 'border-green-500 focus:border-green-500',
                    usernameAvailable === false && 'border-red-500 focus:border-red-500'
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

            <Button type="submit" className="w-full" disabled={saving || usernameAvailable === 'checking' || usernameAvailable === false}>
              {saving ? 'Saving...' : 'Save Profile & Continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

    