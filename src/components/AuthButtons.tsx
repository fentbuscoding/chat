'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button-themed';
import { usePathname, useRouter } from 'next/navigation';

export default function AuthButtons() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined means initial unknown state
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  // const { toast } = useToast(); // Uncomment for toast notifications

  useEffect(() => {
    // Initial state is loading=true.
    // The onAuthStateChange listener will fire immediately with the current session state.
    // It will set user and then setLoading(false).

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("AuthButtons: onAuthStateChange event:", _event, "session:", !!session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      const isAuthPage = pathname.startsWith('/signin') || pathname.startsWith('/signup');

      if (currentUser) {
        setLoading(true); // Set loading true while fetching profile
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('username, profile_complete')
          .eq('id', currentUser.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error("AuthButtons: Error fetching profile on auth change:", profileError);
          setProfileUsername(null);
        } else if (profileData) {
          setProfileUsername(profileData.username);
          console.log("AuthButtons: Profile fetched on auth change:", profileData);

          if (_event === 'SIGNED_IN') {
            if (isAuthPage) {
              if (profileData.profile_complete) {
                console.log("AuthButtons: SIGNED_IN on auth page, profile complete, redirecting to /");
                router.push('/');
              } else {
                console.log("AuthButtons: SIGNED_IN on auth page, profile NOT complete, redirecting to /onboarding");
                router.push('/onboarding');
              }
            } else {
                 console.log("AuthButtons: SIGNED_IN on non-auth page:", pathname);
            }
          }
        } else {
          setProfileUsername(null);
          console.log("AuthButtons: No profile found in user_profiles on auth change for user:", currentUser.id);
          if (_event === 'SIGNED_IN' && isAuthPage) {
            console.log("AuthButtons: SIGNED_IN on auth page, no profile row, redirecting to /onboarding");
            router.push('/onboarding');
          }
        }
      } else {
        // No user session (user is null)
        setProfileUsername(null);
        if (_event === 'SIGNED_OUT') { // Specifically handle SIGNED_OUT for redirection
          if (!isAuthPage) {
            console.log("AuthButtons: SIGNED_OUT on non-auth page, redirecting to /");
            router.push('/');
          } else {
            console.log("AuthButtons: SIGNED_OUT on auth page:", pathname);
          }
        }
      }
      setLoading(false); // Done processing this auth event
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
        <Button className="text-xs p-1" variant="outline" disabled={loading}>Sign In</Button>
      </Link>
      <Link href="/signup" passHref>
        <Button className="text-xs p-1" disabled={loading}>Sign Up</Button>
      </Link>
    </div>
  );
}