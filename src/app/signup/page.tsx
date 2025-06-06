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

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const router = useRouter();
  const { currentTheme } = useTheme();

  // Check if user is already authenticated
  useEffect(() => {
    let mounted = true;

    const checkExistingAuth = async () => {
      try {
        console.log('SignUp: Checking existing authentication...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('SignUp: Session error:', sessionError);
          if (mounted) setInitialLoading(false);
          return;
        }

        if (session?.user && mounted) {
          console.log('SignUp: User already authenticated, redirecting to home');
          router.replace('/');
          return;
        }

        if (mounted) {
          console.log('SignUp: No existing session, showing signup form');
          setInitialLoading(false);
        }
      } catch (error) {
        console.error('SignUp: Error checking auth session:', error);
        if (mounted) setInitialLoading(false);
      }
    };

    checkExistingAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  const checkIfUserExists = async (email: string): Promise<boolean> => {
    try {
      // Try to trigger a password reset to see if user exists
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://example.com' // Dummy redirect, we just want to check existence
      });

      if (error) {
        // If error message indicates user not found, user doesn't exist
        if (error.message.includes('User not found') || 
            error.message.includes('Invalid email') ||
            error.message.includes('not found')) {
          return false;
        }
        // For other errors, assume user might exist to be safe
        return true;
      }

      // If no error, user exists
      return true;
    } catch (error) {
      console.error('SignUp: Error checking user existence:', error);
      // On error, assume user might exist to be safe
      return true;
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      console.log('SignUp: Starting signup process for:', email);

      // Check if user already exists
      console.log('SignUp: Checking if user exists...');
      const userExists = await checkIfUserExists(email);
      
      if (userExists) {
        setError("An account with this email already exists. Please sign in instead or use a different email.");
        setTimeout(() => {
          console.log('SignUp: Redirecting to signin page');
          router.push('/signin');
        }, 3000);
        setLoading(false);
        return;
      }

      console.log('SignUp: User does not exist, proceeding with signup');

      // Proceed with signup
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding`, 
        }
      });

      if (signUpError) {
        console.error('SignUp: Signup error:', signUpError);
        
        if (signUpError.message.includes('already registered') || 
            signUpError.message.includes('already exists') ||
            signUpError.message.includes('User already registered')) {
          setError("An account with this email already exists. Redirecting to sign in...");
          setTimeout(() => {
            router.push('/signin');
          }, 2000);
        } else {
          setError(signUpError.message);
        }
      } else if (data.user && data.user.identities?.length === 0) {
        // User already exists but is unconfirmed
        console.log('SignUp: User exists but unconfirmed');
        setError("An account with this email already exists. Please check your email for confirmation or try signing in.");
        setTimeout(() => {
          router.push('/signin');
        }, 3000);
      } else if (data.user) {
        // Successful signup
        console.log('SignUp: Signup successful, user:', data.user.id);
        
        if (data.session) {
          // Auto-confirmed, redirect to onboarding
          console.log('SignUp: User auto-confirmed, redirecting to onboarding');
          router.push('/onboarding');
        } else {
          // Email confirmation required
          console.log('SignUp: Email confirmation required');
          setMessage('Account created successfully! Please check your email for a confirmation link. After confirming, you\'ll be guided through profile setup.');
        }
      } else {
        console.error('SignUp: Unexpected signup result');
        setError("An unexpected error occurred during sign up. Please try again.");
      }
    } catch (error: any) {
      console.error('SignUp: Exception during signup:', error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'discord' | 'spotify') => {
    setError(null);
    setMessage(null);
    setLoading(true);
    
    try {
      console.log(`SignUp: Starting ${provider} OAuth signup`);
      
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/onboarding`
        },
      });

      if (oauthError) {
        console.error(`SignUp: ${provider} OAuth error:`, oauthError);
        setError(oauthError.message);
        setLoading(false);
      }
      // On success, Supabase handles redirection
    } catch (error: any) {
      console.error(`SignUp: ${provider} OAuth exception:`, error);
      setError("Failed to sign up with " + provider);
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
            <div className="title-bar-text">Create Account</div>
             <div className="title-bar-controls">
                <button aria-label="Close" onClick={() => router.push('/')}></button>
            </div>
          </div>
          <div className="window-body p-4">
            <form onSubmit={handleSignUp} className="space-y-4">
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
                />
              </div>
              <div>
                <Label htmlFor="password">Password (min. 6 characters)</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  minLength={6}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <div className="text-red-600 text-xs p-2 bg-red-100 border border-red-400 rounded">
                  {error}
                </div>
              )}
              {message && (
                <div className="text-green-600 text-xs p-2 bg-green-100 border border-green-400 rounded">
                  {message}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
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
              Already have an account? <Link href="/signin" className="text-blue-600 hover:underline">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}