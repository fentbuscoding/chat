
'use client';
import { useState } from 'react';
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
  const router = useRouter();
  const { currentTheme } = useTheme();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // For email/password signups, if you have email confirmation enabled,
        // the user will get an email. The redirect in the email link is configured in Supabase dashboard.
        // If you want to specify a redirect after confirmation for THIS flow, it's done here.
        // For OAuth, it's in signInWithOAuth.
        emailRedirectTo: `${window.location.origin}/onboarding`, 
      }
    });

    if (signUpError) {
      setError(signUpError.message);
    } else if (data.user && data.user.identities?.length === 0) {
      // This condition might indicate the user already exists but is unconfirmed.
      // Supabase returns a user object but no session in this case.
      setError("User might already exist or is unconfirmed. If you signed up, check your email to confirm. Otherwise, try signing in or use a different email.");
    } else if (data.user) {
      // If user is created and there's a session (e.g. auto-confirm is on, or email confirmed via magic link)
      if (data.session) {
        router.push('/onboarding'); // Directly to onboarding if session exists
        router.refresh();
      } else {
        // If no session, means email confirmation is likely pending
        setMessage('Sign up successful! Please check your email for a confirmation link to complete your registration. Once confirmed, you will be guided through profile setup.');
      }
    } else {
        // Fallback for other unexpected scenarios
        setError("An unknown error occurred during sign up. Please try again.");
    }
    setLoading(false);
  };

  const handleOAuthSignIn = async (provider: 'google' | 'discord' | 'spotify') => {
    setError(null);
    setMessage(null);
    setLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/onboarding`
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false); // Reset loading on error
    }
    // On success, Supabase handles redirection
  };

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
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">Password (min. 6 characters)</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && <p className="text-red-600 text-xs p-1 bg-red-100 border border-red-400 rounded">{error}</p>}
              {message && <p className="text-green-600 text-xs p-1 bg-green-100 border border-green-400 rounded">{message}</p>}
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
