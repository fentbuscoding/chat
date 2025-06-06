// src/components/ProfileCustomizer.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/components/theme-provider';
import { supabase } from '@/lib/supabase';
import { sanitizeCSS, getDefaultProfileCSS } from '@/lib/SafeCSS';
import { cn } from '@/lib/utils';

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { currentTheme } = useTheme();

  useEffect(() => {
    if (isOpen) {
      loadCurrentProfile();
    }
  }, [isOpen]);

  const loadCurrentProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('profile_card_css, bio, display_name')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setCustomCSS(data.profile_card_css || '');
        setBio(data.bio || '');
        setDisplayName(data.display_name || '');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Sanitize CSS before saving
      const sanitizedCSS = sanitizeCSS(customCSS);

      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          profile_card_css: sanitizedCSS,
          bio: bio.trim(),
          display_name: displayName.trim() || null
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile customization saved!",
        variant: "default"
      });

      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: "Failed to save profile customization",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCustomCSS(getDefaultProfileCSS());
  };

  if (!isOpen) return null;

  // Use 98.css theme styling similar to ChatPageClientContent
  const isTheme98 = currentTheme === 'theme-98';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={cn(
        'window flex flex-col relative',
        'max-w-6xl w-full mx-4 max-h-[90vh]',
        isTheme98 ? '' : 'bg-white dark:bg-gray-800 rounded-lg'
      )} style={{ width: '90vw', height: '90vh' }}>
        
        {/* Title Bar */}
        <div className={cn("title-bar", isTheme98 ? '' : 'border-b p-4')}>
          <div className="flex items-center justify-between">
            <div className="title-bar-text">Profile Customizer</div>
            <Button 
              onClick={onClose} 
              className={cn(isTheme98 ? '' : 'ml-auto')}
              variant={isTheme98 ? undefined : "outline"}
            >
              Close
            </Button>
          </div>
        </div>

        {/* Window Body */}
        <div className={cn(
          'window-body window-body-content flex-grow overflow-hidden',
          isTheme98 ? 'p-2' : 'p-6'
        )}>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              {/* Left Panel - Form */}
              <div className="space-y-4 overflow-y-auto">
                <div>
                  <label className={cn(
                    "block text-sm font-medium mb-2",
                    isTheme98 ? '' : ''
                  )}>
                    Display Name
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                    maxLength={50}
                  />
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
                    placeholder="/* Add your custom CSS here */&#10;.profile-card-container {&#10;  background: your-gradient;&#10;  border-radius: 15px;&#10;}"
                    className={cn(
                      "w-full h-64 p-3 font-mono text-sm resize-none",
                      isTheme98 
                        ? "sunken-panel" 
                        : "border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    )}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Allowed selectors: .profile-card-container, .profile-avatar, .profile-display-name, .profile-username, .profile-bio, .profile-divider
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button onClick={handleReset} variant="outline">
                    Reset to Default
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="flex-1"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>

              {/* Right Panel - Preview */}
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

// Preview component
interface ProfilePreviewProps {
  customCSS: string;
  bio: string;
  displayName: string;
}

const ProfilePreview: React.FC<ProfilePreviewProps> = ({ 
  customCSS, 
  bio, 
  displayName 
}) => {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });
  }, []);

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
        <div className="profile-avatar"></div>
        
        <div className="profile-display-name">
          {displayName || 'Display Name'}
        </div>
        
        <div className="profile-username">
          @{currentUser?.email?.split('@')[0] || 'username'}
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