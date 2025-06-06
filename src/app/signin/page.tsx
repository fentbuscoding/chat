'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Label } from '@/components/ui/label-themed';
import Link from 'next/link';
import { useTheme } from '@/components/theme-provider';
import HomeButton from '@/components/HomeButton';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const router = useRouter();
  const { currentTheme } = useTheme();

  // Check if user is already authenticated
  useEffect(() => {
    let mounted = true;

    const checkExistingAuth = async () => {
      try {
        console.log('SignIn: Checking existing authentication...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('SignIn: Session error:', sessionError);
          if (mounted) setInitialLoading(false);
          return;
        }

        if (session?.user && mounted) {
          console.log('SignIn: User already authenticated, checking profile...');
          
          // Check if user has completed profile setup
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('profile_complete')
            .eq('id', session.user.id)
            .single();

          if (profileError && profileError.code !== 'PGRST116') {
            console.error('SignIn: Profile check error:', profileError);
            // If can't check profile, assume they need onboarding
            router.replace('/onboarding');
          } else if (profile?.profile_complete) {
            console.log('SignIn: Profile complete, redirecting to home');
            router.replace('/');
          } else {
            console.log('SignIn: Profile incomplete, redirecting to onboarding');
            router.replace('/onboarding');
          }
          return;
        }

        if (mounted) {
          console.log('SignIn: No existing session, showing signin form');
          setInitialLoading(false);
        }
      } catch (error) {
        console.error('SignIn: Error checking auth session:', error);
        if (mounted) setInitialLoading(false);
      }
    };

    checkExistingAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      console.log('SignIn: Starting signin process for:', email);
      
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });

      if (signInError) {
        console.error('SignIn: Signin error:', signInError);
        
        if (signInError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setError('Please check your email and click the confirmation link before signing in.');
        } else {
          setError(signInError.message);
        }
      } else if (data.user) {
        console.log('SignIn: Signin successful for user:', data.user.id);
        
        try {
          // Check if user has completed profile setup
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('profile_complete, username')
            .eq('id', data.user.id)
            .single();

          if (profileError && profileError.code !== 'PGRST116') {
            console.error('SignIn: Profile check error:', profileError);
            // If can't check profile, assume they need onboarding
            console.log('SignIn: Cannot check profile, redirecting to onboarding');
            router.push('/onboarding');
          } else if (profile?.profile_complete) {
            console.log('SignIn: Profile complete, redirecting to home');
            router.push('/');
          } else {
            console.log('SignIn: Profile incomplete or not found, redirecting to onboarding');
            router.push('/onboarding');
          }
        } catch (profileError) {
          console.error('SignIn: Profile check exception:', profileError);
          // On error, send to onboarding to be safe
          router.push('/onboarding');
        }
      } else {
        console.error('SignIn: No user data returned');
        setError('Sign in failed. Please try again.');
      }
    } catch (error: any) {
      console.error('SignIn: Exception during signin:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'discord' | 'spotify') => {
    setError(null);
    setLoading(true);

    try {
      console.log(`SignIn: Starting ${provider} OAuth signin`);
      
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/onboarding`
        },
      });

      if (oauthError) {
        console.error(`SignIn: ${provider} OAuth error:`, oauthError);
        setError(oauthError.message);
        setLoading(false);
      }
      // On success, Supabase handles redirection
    } catch (error: any) {
      console.error(`SignIn: ${provider} OAuth exception:`, error);
      setError("Failed to sign in with " + provider);
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <>
        <HomeButton />
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="window w-full max-w-md">
            <div className="title-bar">
              <div className="title-bar-text">Loading...</div>
            </div>
            <div className="window-body p-4">
              <div className="text-center">Checking authentication status...</div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <HomeButton />
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="window w-full max-w-md">
          <div className="title-bar">
            <div className="title-bar-text">Sign In</div>
             <div className="title-bar-controls">
                <button aria-label="Close" onClick={() => router.push('/')}></button>
            </div>
          </div>
          <div className="window-body p-4">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  disabled={loading}
                  autoComplete="email"
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  disabled={loading}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
              </div>
              {error && (
                <div className="text-red-600 text-xs p-2 bg-red-100 border border-red-400 rounded">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
            
            <div className="flex items-center my-4">
              <hr className="flex-grow border-t border-gray-300 dark:border-gray-600" />
              <span className="mx-2 text-xs text-gray-500 dark:text-gray-400">OR</span>
              <hr className="flex-grow border-t border-gray-300 dark:border-gray-600" />
            </div>
            
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => handleOAuthSignIn('google')} disabled={loading}>
                Continue with Google
              </Button>
              <Button variant="outline" onClick={() => handleOAuthSignIn('discord')} disabled={loading}>
                Continue with Discord
              </Button>
              <Button variant="outline" onClick={() => handleOAuthSignIn('spotify')} disabled={loading}>
                Continue with Spotify
              </Button>
            </div>
            
            <p className="text-xs text-center mt-4">
              Don&apos;t have an account? <Link href="/signup" className="text-blue-600 hover:underline">Sign Up</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}