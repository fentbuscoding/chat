// src/components/ProfileCustomizer.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { supabase } from '@/lib/supabase';
import { sanitizeCSS, getDefaultProfileCSS } from '@/lib/SafeCSS';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface ProfileCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileCustomizer: React.FC<ProfileCustomizerProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const [customCSS, setCustomCSS] = useState('');
  const [bio, setBio] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null | 'checking'>(null);
  const [originalUsername, setOriginalUsername] = useState('');

  const { toast } = useToast();
  const { currentTheme } = useTheme();
  
  const debouncedUsername = useDebounce(username, 500);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCurrentProfile();
    }
  }, [isOpen]);

  // Username availability check
  useEffect(() => {
    const checkUsername = async () => {
      if (!debouncedUsername || debouncedUsername.length < 3 || !currentUser || !mountedRef.current) {
        setUsernameAvailable(null);
        return;
      }

      // If username is the same as original, it's available
      if (debouncedUsername === originalUsername) {
        setUsernameAvailable(true);
        return;
      }

      setUsernameAvailable('checking');
      
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('username', debouncedUsername)
          .neq('id', currentUser.id)
          .maybeSingle();

        if (!mountedRef.current) return;

        if (error) {
          console.error('Error checking username availability:', error);
          setUsernameAvailable(null);
        } else {
          setUsernameAvailable(!data); // If data is null, username is available
        }
      } catch (error) {
        console.error('Exception checking username:', error);
        if (mountedRef.current) {
          setUsernameAvailable(null);
        }
      }
    };

    checkUsername();
  }, [debouncedUsername, currentUser, originalUsername]);

  const loadCurrentProfile = async () => {
    if (!mountedRef.current) return;
    
    setLoading(true);
    try {
      console.log('ProfileCustomizer: Getting current user...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('ProfileCustomizer: Auth error:', userError);
        toast({
          title: "Authentication Error",
          description: "Please sign in to customize your profile",
          variant: "destructive"
        });
        onClose();
        return;
      }

      if (!mountedRef.current) return;

      console.log('ProfileCustomizer: Loading profile for user:', user.id);
      setCurrentUser(user);

      const { data, error } = await supabase
        .from('user_profiles')
        .select('profile_card_css, bio, display_name, username, avatar_url')
        .eq('id', user.id)
        .single();

      if (!mountedRef.current) return;

      if (error && error.code !== 'PGRST116') {
        console.error('ProfileCustomizer: Error loading profile:', error);
        // Initialize with empty values
        setCustomCSS('');
        setBio('');
        setDisplayName('');
        setUsername('');
        setOriginalUsername('');
        setAvatarUrl(null);
        setAvatarPreview(null);
      } else if (data) {
        console.log('ProfileCustomizer: Profile data loaded:', data);
        setCustomCSS(data.profile_card_css || '');
        setBio(data.bio || '');
        setDisplayName(data.display_name || '');
        setUsername(data.username || '');
        setOriginalUsername(data.username || '');
        setAvatarUrl(data.avatar_url);
        
        if (data.avatar_url) {
          setAvatarPreview(data.avatar_url);
        }
      } else {
        console.log('ProfileCustomizer: No existing profile data found');
        setCustomCSS('');
        setBio('');
        setDisplayName('');
        setUsername('');
        setOriginalUsername('');
        setAvatarUrl(null);
        setAvatarPreview(null);
      }
    } catch (error) {
      console.error('ProfileCustomizer: Exception loading profile:', error);
      if (mountedRef.current) {
        setCustomCSS('');
        setBio('');
        setDisplayName('');
        setUsername('');
        setOriginalUsername('');
        setAvatarUrl(null);
        setAvatarPreview(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !mountedRef.current) return;

    const file = e.target.files[0];
    
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please select an image smaller than 2MB.", variant: "destructive" });
      return;
    }
    
    setAvatarFile(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      if (mountedRef.current) {
        setAvatarPreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (saving || !mountedRef.current) {
      console.log('ProfileCustomizer: Save already in progress or component unmounted');
      return;
    }

    if (!currentUser) {
      toast({
        title: "Authentication Error",
        description: "No user found - please refresh and try again",
        variant: "destructive"
      });
      return;
    }

    if (!username || username.length < 3) {
      toast({
        title: "Invalid Username",
        description: "Username must be at least 3 characters long",
        variant: "destructive"
      });
      return;
    }

    if (usernameAvailable === false) {
      toast({
        title: "Username Taken",
        description: "Please choose a different username",
        variant: "destructive"
      });
      return;
    }

    if (usernameAvailable === 'checking') {
      toast({
        title: "Username Check Pending",
        description: "Please wait for username availability check",
        variant: "default"
      });
      return;
    }

    setSaving(true);
    
    try {
      console.log('ProfileCustomizer: Starting save process for user:', currentUser.id);

      let finalAvatarUrl = avatarUrl;

      // Upload avatar if a new file was selected
      if (avatarFile) {
        console.log('ProfileCustomizer: Uploading new avatar...');
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${uuidv4()}.${fileExt}`;
        const avatarStoragePath = `public/${currentUser.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(avatarStoragePath, avatarFile, { upsert: true });

        if (uploadError) {
          console.error('ProfileCustomizer: Avatar upload error:', uploadError);
          toast({
            title: "Avatar Upload Failed",
            description: uploadError.message,
            variant: "destructive"
          });
          setSaving(false);
          return;
        }
        
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(avatarStoragePath);
        if (!urlData || !urlData.publicUrl) {
          toast({
            title: "Avatar URL Failed",
            description: "Could not get public URL for avatar",
            variant: "destructive"
          });
          setSaving(false);
          return;
        }
        
        finalAvatarUrl = urlData.publicUrl;
        console.log('ProfileCustomizer: Avatar uploaded successfully');
      }

      // Sanitize CSS before saving
      const sanitizedCSS = sanitizeCSS(customCSS);
      console.log('ProfileCustomizer: CSS sanitized, original length:', customCSS.length, 'sanitized length:', sanitizedCSS.length);

      // Prepare the data to save
      const profileData = {
        profile_card_css: sanitizedCSS,
        bio: bio.trim(),
        display_name: displayName.trim() || null,
        username: username.trim(),
        avatar_url: finalAvatarUrl
      };

      console.log('ProfileCustomizer: Attempting to save profile data:', profileData);

      // Try to update the existing profile
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(profileData)
        .eq('id', currentUser.id);

      if (updateError) {
        console.error('ProfileCustomizer: Update error:', updateError);
        
        if (updateError.code === 'PGRST116') {
          // No rows found, try to insert
          console.log('ProfileCustomizer: No existing profile found, attempting insert');
          
          const insertData = {
            id: currentUser.id,
            ...profileData,
            profile_complete: false
          };

          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert(insertData);

          if (insertError) {
            console.error('ProfileCustomizer: Insert error:', insertError);
            throw new Error(`Failed to create profile: ${insertError.message}`);
          }

          console.log('ProfileCustomizer: Profile created successfully');
        } else {
          throw new Error(`Failed to update profile: ${updateError.message}`);
        }
      } else {
        console.log('ProfileCustomizer: Profile updated successfully');
      }

      // Update original username for future checks
      setOriginalUsername(username);

      toast({
        title: "Success",
        description: "Profile customization saved!",
        variant: "default"
      });

      setTimeout(() => {
        if (mountedRef.current) {
          onClose();
        }
      }, 500);

    } catch (error: any) {
      console.error('ProfileCustomizer: Save error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save profile customization",
        variant: "destructive"
      });
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const handleReset = () => {
    setCustomCSS(getDefaultProfileCSS());
  };

  const handleClose = () => {
    if (saving) {
      console.log('ProfileCustomizer: Cannot close while saving');
      return;
    }
    onClose();
  };

  if (!isOpen) return null;

  const isTheme98 = currentTheme === 'theme-98';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={cn(
        'window flex flex-col relative',
        'max-w-6xl w-full mx-4 max-h-[90vh]',
        isTheme98 ? '' : 'bg-white dark:bg-gray-800 rounded-lg'
      )} style={{ width: '90vw', height: '90vh' }}>
        
        <div className={cn("title-bar", isTheme98 ? '' : 'border-b p-4')}>
          <div className="flex items-center justify-between">
            <div className="title-bar-text">Profile Customizer</div>
            <Button 
              onClick={handleClose} 
              className={cn(isTheme98 ? '' : 'ml-auto')}
              variant={isTheme98 ? undefined : "outline"}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Close'}
            </Button>
          </div>
        </div>

        <div className={cn(
          'window-body window-body-content flex-grow overflow-hidden',
          isTheme98 ? 'p-2' : 'p-6'
        )}>
          {loading ? (
            <div className="text-center py-8">
              <p className="text-black dark:text-white animate-pulse">Loading profile data...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              <div className="space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Profile Picture
                  </label>
                  <div className="flex items-center space-x-4">
                    <span className="inline-block h-16 w-16 rounded-full overflow-hidden bg-gray-100">
                      {avatarPreview ? (
                        <Image 
                          src={avatarPreview} 
                          alt="Avatar preview" 
                          width={64} 
                          height={64} 
                          className="object-cover h-full w-full" 
                        />
                      ) : (
                        <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      )}
                    </span>
                    <Button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving}
                      variant="outline"
                    >
                      Change Avatar
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAvatarChange}
                      accept="image/png, image/jpeg, image/gif"
                      className="hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                      placeholder="Your username"
                      maxLength={20}
                      minLength={3}
                      disabled={saving}
                      className={cn(
                        usernameAvailable === true && username.length >= 3 && 'border-green-500 focus:border-green-500',
                        usernameAvailable === false && username.length >= 3 && 'border-red-500 focus:border-red-500'
                      )}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm pointer-events-none">
                      {usernameAvailable === 'checking' && <span className="text-gray-500 animate-pulse">Checking...</span>}
                      {usernameAvailable === true && username.length >= 3 && <span className="text-green-500">✔️ Available</span>}
                      {usernameAvailable === false && username.length >= 3 && <span className="text-red-500">❌ Taken</span>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    3-20 characters. Letters, numbers, and underscores only.
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Display Name
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    maxLength={50}
                    disabled={saving}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    This will be shown in chats and on your profile
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell people about yourself..."
                    className={cn(
                      "w-full h-24 p-3 resize-none",
                      isTheme98 
                        ? "sunken-panel" 
                        : "border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    )}
                    maxLength={200}
                    disabled={saving}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {bio.length}/200 characters
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Custom CSS
                  </label>
                  <textarea
                    value={customCSS}
                    onChange={(e) => setCustomCSS(e.target.value)}
                    placeholder="/* Add your custom CSS here */&#10;.profile-card-container {&#10;  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);&#10;  border-radius: 15px;&#10;}"
                    className={cn(
                      "w-full h-64 p-3 font-mono text-sm resize-none",
                      isTheme98 
                        ? "sunken-panel" 
                        : "border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    )}
                    disabled={saving}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Allowed selectors: .profile-card-container, .profile-avatar, .profile-display-name, .profile-username, .profile-bio, .profile-divider
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button 
                    onClick={handleReset} 
                    variant="outline"
                    disabled={saving}
                  >
                    Reset CSS
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    disabled={
                      saving || 
                      usernameAvailable === 'checking' || 
                      (usernameAvailable === false && username.length >= 3) ||
                      !username ||
                      username.length < 3
                    }
                    className="flex-1"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>

                {saving && (
                  <div className="text-xs text-gray-500 text-center">
                    Please wait while we save your changes...
                  </div>
                )}
              </div>

              <div className={cn(
                "flex flex-col",
                isTheme98 ? "" : "lg:border-l lg:pl-6"
              )}>
                <h3 className="text-lg font-semibold mb-4">Preview</h3>
                <div className={cn(
                  "flex-1 p-4 overflow-auto",
                  isTheme98 
                    ? "sunken-panel" 
                    : "bg-gray-100 dark:bg-gray-900 rounded-lg"
                )}>
                  <ProfilePreview 
                    customCSS={customCSS}
                    bio={bio}
                    displayName={displayName}
                    username={username}
                    avatarPreview={avatarPreview}
                    currentUser={currentUser}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ProfilePreviewProps {
  customCSS: string;
  bio: string;
  displayName: string;
  username: string;
  avatarPreview: string | null;
  currentUser: any;
}

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ 
  customCSS, 
  bio, 
  displayName,
  username,
  avatarPreview,
  currentUser
}) => {
  const defaultCSS = `
    .profile-card-container {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 20px;
      color: white;
      font-family: Arial, sans-serif;
      max-width: 300px;
      min-height: 200px;
      position: relative;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    .profile-avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.3);
      margin-bottom: 10px;
      object-fit: cover;
      background: #ccc;
    }
    .profile-display-name {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 5px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    .profile-username {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 10px;
    }
    .profile-bio {
      font-size: 12px;
      line-height: 1.4;
      opacity: 0.9;
      margin-top: 8px;
    }
    .profile-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.2);
      margin: 10px 0;
    }
  `;

  const sanitizedCSS = sanitizeCSS(customCSS);
  const finalCSS = defaultCSS + '\n' + sanitizedCSS;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: finalCSS }} />
      <div className="profile-card-container">
        {avatarPreview ? (
          <img src={avatarPreview} alt="Profile Avatar" className="profile-avatar" />
        ) : (
          <div className="profile-avatar"></div>
        )}
        
        <div className="profile-display-name">
          {displayName || 'Display Name'}
        </div>
        
        <div className="profile-username">
          @{username || currentUser?.email?.split('@')[0] || 'username'}
        </div>
        
        {bio && (
          <>
            <div className="profile-divider"></div>
            <div className="profile-bio">
              {bio}
            </div>
          </>
        )}
      </div>
    </>
  );
};