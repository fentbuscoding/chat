// src/components/ProfileCard.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button-themed';
import { useTheme } from '@/components/theme-provider';
import { supabase } from '@/lib/supabase';
import { sanitizeCSS } from '@/lib/SafeCSS';
import { cn } from '@/lib/utils';

interface ProfileData {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  profile_card_css?: string;
}

interface ProfileCardProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onScrollToggle: (enabled: boolean) => void;
}

const DEFAULT_PROFILE_CSS = `
/* Default Profile Card Styles */
.profile-card-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 20px;
  color: white;
  font-family: Arial, sans-serif;
  max-width: 400px;
  min-height: 300px;
  position: relative;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.profile-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.3);
  margin-bottom: 15px;
  object-fit: cover;
}

.profile-display-name {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 5px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.profile-username {
  font-size: 14px;
  opacity: 0.8;
  margin-bottom: 15px;
}

.profile-bio {
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.9;
  margin-top: 10px;
}

.profile-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 15px 0;
}
`;

export const ProfileCard: React.FC<ProfileCardProps> = ({ 
  userId, 
  isOpen, 
  onClose, 
  onScrollToggle 
}) => {
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { currentTheme } = useTheme();

  useEffect(() => {
    if (isOpen) {
      onScrollToggle(false); // Disable scroll when modal opens
      fetchProfile();
    } else {
      onScrollToggle(true); // Enable scroll when modal closes
    }

    return () => {
      onScrollToggle(true); // Ensure scroll is enabled on cleanup
    };
  }, [isOpen, userId, onScrollToggle]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  const fetchProfile = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching profile for userId:', userId);
      
      // First, try to get the profile data
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url, bio, profile_card_css')
        .eq('id', userId);

      if (fetchError) {
        console.error('Profile fetch error:', fetchError);
        throw fetchError;
      }

      console.log('Profile query result:', data);

      // Check if we got any results
      if (!data || data.length === 0) {
        console.log('No profile found for user:', userId);
        // Create a basic profile with just the user ID
        setProfileData({
          id: userId,
          username: 'Unknown User',
          display_name: 'Unknown User'
        });
      } else {
        console.log('Profile data fetched:', data[0]);
        setProfileData(data[0]);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isTheme98 = currentTheme === 'theme-98';

  const renderProfileContent = () => {
    if (loading) {
      return (
        <div className={cn(
          "flex items-center justify-center",
          isTheme98 ? "window-body p-4" : "h-64"
        )}>
          <div className={cn(
            isTheme98 ? "" : "text-white"
          )}>
            Loading profile...
          </div>
        </div>
      );
    }

    if (error || !profileData) {
      return (
        <div className={cn(
          "flex items-center justify-center",
          isTheme98 ? "window-body p-4" : "h-64"
        )}>
          <div className={cn(
            isTheme98 ? "" : "text-white"
          )}>
            {error || 'Profile not found'}
          </div>
        </div>
      );
    }

    // Combine default CSS with user's custom CSS
    const customCSS = profileData.profile_card_css || '';
    const sanitizedCSS = sanitizeCSS(customCSS);
    const finalCSS = DEFAULT_PROFILE_CSS + '\n' + sanitizedCSS;

    if (isTheme98) {
      return (
        <div className="window">
          <div className="title-bar">
            <div className="title-bar-text">Profile - @{profileData.username}</div>
            <div className="title-bar-controls">
              <Button
                onClick={onClose}
                className="title-bar-control"
                aria-label="Close profile"
              >
                <X size={12} />
              </Button>
            </div>
          </div>
          <div className="window-body">
            <style dangerouslySetInnerHTML={{ __html: finalCSS }} />
            <div className="profile-card-container">
              {profileData.avatar_url && (
                <img 
                  src={profileData.avatar_url} 
                  alt="Profile Avatar"
                  className="profile-avatar"
                />
              )}
              
              {profileData.display_name && (
                <div className="profile-display-name">
                  {profileData.display_name}
                </div>
              )}
              
              <div className="profile-username">
                @{profileData.username}
              </div>
              
              {profileData.bio && (
                <>
                  <div className="profile-divider"></div>
                  <div className="profile-bio">
                    {profileData.bio}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: finalCSS }} />
        <div className="profile-card-container">
          {profileData.avatar_url && (
            <img 
              src={profileData.avatar_url} 
              alt="Profile Avatar"
              className="profile-avatar"
            />
          )}
          
          {profileData.display_name && (
            <div className="profile-display-name">
              {profileData.display_name}
            </div>
          )}
          
          <div className="profile-username">
            @{profileData.username}
          </div>
          
          {profileData.bio && (
            <>
              <div className="profile-divider"></div>
              <div className="profile-bio">
                {profileData.bio}
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        ref={modalRef}
        className={cn(
          "relative max-w-md w-full mx-4",
          isTheme98 ? "" : "bg-transparent"
        )}
      >
        {!isTheme98 && (
          <Button
            onClick={onClose}
            className="absolute -top-2 -right-2 z-10 w-8 h-8 p-0 rounded-full bg-gray-800 hover:bg-gray-700 text-white"
            aria-label="Close profile"
          >
            <X size={16} />
          </Button>
        )}
        
        {renderProfileContent()}
      </div>
    </div>
  );
};