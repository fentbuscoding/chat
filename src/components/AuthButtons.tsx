
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button-themed';
import { usePathname, useRouter } from 'next/navigation';

export default function AuthButtons() {
  const [user, setUser] = useState<User | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setLoading(true);
    const fetchInitialUserAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      if (session?.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error("AuthButtons: Error fetching profile username on initial load:", profileError);
        } else if (profileData) {
          setProfileUsername(profileData.username);
        } else {
          setProfileUsername(null);
        }
      } else {
        setProfileUsername(null);
      }
      setLoading(false);
    };

    fetchInitialUserAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("AuthButtons: onAuthStateChange event:", _event, "session:", !!session);
      setUser(session?.user ?? null);
      setLoading(false); // User state is now known

      const isAuthPage = pathname.startsWith('/signin') || pathname.startsWith('/signup');

      if (session?.user) {
        // Fetch username and profile_complete status regardless of event type for consistency
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('username, profile_complete')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error("AuthButtons: Error fetching profile on auth change:", profileError);
          setProfileUsername(null);
        } else if (profileData) {
          setProfileUsername(profileData.username);
          console.log("AuthButtons: Profile fetched on auth change:", profileData);

          // Handle redirection for SIGNED_IN event
          if (_event === 'SIGNED_IN') {
            if (isAuthPage) { // If user is on signin/signup page
              if (profileData.profile_complete) {
                console.log("AuthButtons: SIGNED_IN on auth page, profile complete, redirecting to /");
                router.push('/');
              } else {
                console.log("AuthButtons: SIGNED_IN on auth page, profile NOT complete, redirecting to /onboarding");
                router.push('/onboarding');
              }
            } else {
                 // If SIGNED_IN on a different page, refresh to reflect logged-in state, or stay.
                 // router.refresh(); // Or specific logic if needed
                 console.log("AuthButtons: SIGNED_IN on non-auth page:", pathname);
            }
          }
        } else {
          // No profile row exists yet in user_profiles
          setProfileUsername(null);
          console.log("AuthButtons: No profile found in user_profiles on auth change for user:", session.user.id);
          if (_event === 'SIGNED_IN' && isAuthPage) {
            console.log("AuthButtons: SIGNED_IN on auth page, no profile row, redirecting to /onboarding");
            router.push('/onboarding'); // Definitely needs onboarding
          }
        }
      } else {
        // No user session
        setProfileUsername(null);
        if (_event === 'SIGNED_OUT' && !isAuthPage) {
          console.log("AuthButtons: SIGNED_OUT on non-auth page, redirecting to /");
          router.push('/');
        }
      }
    });

    return () => {
      authListener.subscription?.unsubscribe();
    };
  }, [router, pathname]); // Ensure pathname is a dependency

  if (loading) {
    return <div className="text-xs animate-pulse text-gray-500">Loading...</div>;
  }

  if (user) {
    const displayName = profileUsername || user.email;
    return (
      <div className="flex items-center space-x-2">
        <span className="text-xs hidden sm:inline truncate max-w-[100px] sm:max-w-[150px]" title={displayName ?? undefined}>
            {displayName}
        </span>
        <Button onClick={async () => { setLoading(true); await supabase.auth.signOut(); /* State update handled by listener */ }} className="text-xs p-1" variant="outline">Sign Out</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Link href="/signin" passHref>
        <Button className="text-xs p-1" variant="outline">Sign In</Button>
      </Link>
      <Link href="/signup" passHref>
        <Button className="text-xs p-1">Sign Up</Button>
      </Link>
    </div>
  );
}
