
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
    const fetchUserAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);

      if (session?.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('username')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') { // PGRST116 means no rows found
          console.error("Error fetching profile username for AuthButtons:", profileError);
        } else if (profileData) {
          setProfileUsername(profileData.username);
        } else {
          setProfileUsername(null); // No profile or username found
        }
      } else {
        setProfileUsername(null);
      }
      setLoading(false);
    };

    fetchUserAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('username')
          .eq('id', session.user.id)
          .single();
        
        if (profileError && profileError.code !== 'PGRST116') {
          console.error("Error fetching profile username on auth change:", profileError);
        } else if (profileData) {
          setProfileUsername(profileData.username);
        } else {
          setProfileUsername(null);
        }
      } else {
        setProfileUsername(null);
      }
      setLoading(false);

      if (_event === 'SIGNED_OUT' && pathname !== '/' && !pathname.startsWith('/signin') && !pathname.startsWith('/signup')) {
        router.push('/');
      }
      if (_event === 'SIGNED_IN' && (pathname.startsWith('/signin') || pathname.startsWith('/signup'))) {
        router.push('/');
      }
    });

    return () => {
      authListener.subscription?.unsubscribe();
    };
  }, [router, pathname]);

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
        <Button onClick={async () => { setLoading(true); await supabase.auth.signOut(); setLoading(false);}} className="text-xs p-1" variant="outline">Sign Out</Button>
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
