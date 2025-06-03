
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button-themed';
import { Input } from '@/components/ui/input-themed';
import { Label } from '@/components/ui/label-themed';
import Link from 'next/link'; // Added Link import
import { useTheme } from '@/components/theme-provider';
import HomeButton from '@/components/HomeButton';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { currentTheme } = useTheme(); // Get current theme

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
    } else if (data.user && data.user.identities?.length === 0) {
      // This condition might indicate the user exists but is unconfirmed by Supabase
      // or other edge cases like email rate limits if the user is already confirmed.
      setError("User might already exist or is unconfirmed. If you signed up, check your email to confirm. Otherwise, try signing in or use a different email.");
    } else if (data.user) {
      // If Supabase email confirmation is enabled (default), data.session will be null.
      // If auto-confirm is on (dev settings) or email pre-verified (OAuth), session might be active.
      if (data.session) {
        // User is signed up and logged in (e.g. auto-confirm is on)
        // For now, redirect to home. Later, this could be profile setup.
        router.push('/');
        router.refresh();
      } else {
        // User needs to confirm their email
        setMessage('Sign up successful! Please check your email for a confirmation link to complete your registration.');
      }
    } else {
        setError("An unknown error occurred during sign up. Please try again.");
    }
    setLoading(false);
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
            <p className="text-xs text-center mt-4">
              Already have an account? <Link href="/signin" className="text-blue-600 hover:underline">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
