
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button-themed';
import { usePathname, useRouter } from 'next/navigation';

export default function AuthButtons() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check initial session
    async function getInitialSession() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user ?? null);
        } catch (error) {
            console.error("Error fetching initial session:", error);
        } finally {
            setLoading(false);
        }
    }
    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      // If user signs out from a non-auth page, redirect to home
      if (event === 'SIGNED_OUT' && pathname !== '/' && !pathname.startsWith('/signin') && !pathname.startsWith('/signup')) {
        router.push('/');
      }
      // If user signs in from an auth page, redirect to home
      if (event === 'SIGNED_IN' && (pathname.startsWith('/signin') || pathname.startsWith('/signup'))) {
        router.push('/');
      }
    });


    return () => {
      authListener?.unsubscribe();
    };
  }, [router, pathname]);

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    // setUser(null); // onAuthStateChange will handle this
    // No need to manually push, onAuthStateChange handles it if not on specific pages
    setLoading(false);
  };

  if (loading) {
    return <div className="text-xs animate-pulse">Loading...</div>;
  }

  if (user) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-xs hidden sm:inline truncate max-w-[100px] sm:max-w-[150px]" title={user.email}>
            {user.email}
        </span>
        <Button onClick={handleSignOut} className="text-xs p-1" variant="outline">Sign Out</Button>
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
