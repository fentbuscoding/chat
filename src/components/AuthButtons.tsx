'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button-themed';
import { usePathname, useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { ProfileCustomizer } from '@/components/ProfileCustomizer';

export default function AuthButtons() {
  const [user, setUser] = useState<User | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Initialize auth state
  const initializeAuth = useCallback(async () => {
    try {
      console.log("AuthButtons: Initializing auth state...");
      
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("AuthButtons: Session error:", sessionError);
        setUser(null);
        setProfileUsername(null);
        setAuthLoading(false);
        return;
      }

      const currentUser = session?.user ?? null;
      console.log("AuthButtons: Current user from session:", currentUser?.id || 'anonymous');
      
      setUser(currentUser);

      if (currentUser) {
        // Fetch user profile
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('username, profile_complete')
            .eq('id', currentUser.id)
            .single();

          if (profileError && profileError.code !== 'PGRST116') {
            console.error("AuthButtons: Profile fetch error:", profileError);
            setProfileUsername(null);
          } else if (profileData) {
            console.log("AuthButtons: Profile found:", profileData);
            setProfileUsername(profileData.username);
          } else {
            console.log("AuthButtons: No profile found");
            setProfileUsername(null);
          }
        } catch (profileError) {
          console.error("AuthButtons: Profile fetch exception:", profileError);
          setProfileUsername(null);
        }
      } else {
        setProfileUsername(null);
      }

      setAuthLoading(false);
      console.log("AuthButtons: Auth initialization complete");
    } catch (error) {
      console.error("AuthButtons: Init error:", error);
      setUser(null);
      setProfileUsername(null);
      setAuthLoading(false);
    }
  }, []);

  // Set up auth listener
  useEffect(() => {
    let mounted = true;

    // Initialize auth state immediately
    initializeAuth();

    // Set up auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log("AuthButtons: Auth state change:", event, "session:", !!session);
      
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      const isAuthPage = pathname.startsWith('/signin') || pathname.startsWith('/signup');

      if (currentUser) {
        // User signed in - fetch profile
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('username, profile_complete')
            .eq('id', currentUser.id)
            .single();

          if (profileError && profileError.code !== 'PGRST116') {
            console.error("AuthButtons: Profile error in auth change:", profileError);
            if (mounted) setProfileUsername(null);
          } else if (profileData && mounted) {
            setProfileUsername(profileData.username);
            console.log("AuthButtons: Profile updated:", profileData);

            // Handle navigation for sign-in events
            if (event === 'SIGNED_IN' && isAuthPage) {
              if (profileData.profile_complete) {
                console.log("AuthButtons: Redirecting to home (profile complete)");
                router.push('/');
              } else {
                console.log("AuthButtons: Redirecting to onboarding (profile incomplete)");
                router.push('/onboarding');
              }
            }
          } else if (mounted) {
            setProfileUsername(null);
            if (event === 'SIGNED_IN' && isAuthPage) {
              console.log("AuthButtons: No profile found, redirecting to onboarding");
              router.push('/onboarding');
            }
          }
        } catch (error) {
          console.error("AuthButtons: Profile fetch error in auth change:", error);
          if (mounted) setProfileUsername(null);
        }
      } else {
        // User signed out
        if (mounted) {
          setProfileUsername(null);
          setSigningOut(false); // Reset signing out state
        }
        
        if (event === 'SIGNED_OUT' && !isAuthPage && mounted) {
          console.log("AuthButtons: User signed out, redirecting to home");
          router.push('/');
        }
      }
    });

    return () => {
      mounted = false;
      authListener.subscription?.unsubscribe();
    };
  }, [router, pathname, initializeAuth]);

  const handleSignOut = async () => {
    if (signingOut) return; // Prevent multiple clicks
    
    setSigningOut(true);
    console.log("AuthButtons: Starting sign out process");
    
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("AuthButtons: Sign out error:", error.message);
        setSigningOut(false);
      } else {
        console.log("AuthButtons: Sign out successful");
        // Don't reset signingOut here - let the auth listener handle it
        // Clear local state immediately for better UX
        setUser(null);
        setProfileUsername(null);
        
        // Navigate to home
        router.push('/');
      }
    } catch (error) {
      console.error("AuthButtons: Sign out exception:", error);
      setSigningOut(false);
    }
  };

  const handleOpenCustomizer = useCallback(() => {
    setIsCustomizerOpen(true);
  }, []);

  const handleCloseCustomizer = useCallback(() => {
    setIsCustomizerOpen(false);
  }, []);

  // Show loading state while initializing
  if (authLoading) {
    return <div className="text-xs animate-pulse text-gray-500">Auth...</div>;
  }

  // Show authenticated user UI
  if (user) {
    const displayName = profileUsername || user.email;
    return (
      <>
        <div className="flex items-center space-x-2">
          <Button 
            onClick={handleOpenCustomizer}
            className="text-xs p-1 w-8 h-8" 
            variant="outline"
            disabled={signingOut}
            title="Customize Profile"
            aria-label="Customize Profile"
          >
            <Settings size={14} />
          </Button>
          <span 
            className="text-xs hidden sm:inline truncate max-w-[100px] sm:max-w-[150px]" 
            title={displayName ?? undefined}
          >
            {displayName}
          </span>
          <Button 
            onClick={handleSignOut} 
            className="text-xs p-1" 
            variant="outline" 
            disabled={signingOut}
          >
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </Button>
        </div>

        {/* Profile Customizer Modal */}
        <ProfileCustomizer 
          isOpen={isCustomizerOpen} 
          onClose={handleCloseCustomizer} 
        />
      </>
    );
  }

  // Show sign in/up buttons for unauthenticated users
  return (
    <div className="flex items-center space-x-2">
      <Link href="/signin" passHref>
        <Button className="text-xs p-1" variant="outline" disabled={signingOut}>
          Sign In
        </Button>
      </Link>
      <Link href="/signup" passHref>
        <Button className="text-xs p-1" disabled={signingOut}>
          Sign Up
        </Button>
      </Link>
    </div>
  );
}