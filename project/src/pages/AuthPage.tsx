import { type FormEvent, useState } from 'react';
import { Eye, EyeOff, HeartPulse, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (mode === 'signin') {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
    } else {
      const { error: err } = await signUp(email, password);
      if (err) setError(err);
      else {
        setSuccess('Account created! You can now sign in.');
        setMode('signin');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-gradient-to-br from-pink-100 via-rose-50 to-pink-200">
      {/* Floating decorative blobs */}
      <div className="absolute top-[-10%] left-[-5%] w-[28rem] h-[28rem] bg-pink-300/30 rounded-full blur-3xl animate-pulse-soft" />
      <div className="absolute bottom-[-15%] right-[-8%] w-[32rem] h-[32rem] bg-rose-300/25 rounded-full blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-pink-200/30 rounded-full blur-3xl animate-pulse-soft" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        <div className="backdrop-blur-xl bg-white/70 border border-white/60 rounded-[2rem] shadow-[var(--shadow-soft-lg)] p-8 sm:p-10">
          {/* Brand header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center shadow-[var(--shadow-soft)] mb-4">
              <HeartPulse className="text-white" size={28} />
            </div>
            <h1 className="text-xl font-bold text-pink-900 tracking-tight">Oakwood24</h1>
            <p className="text-xs font-medium text-pink-500 mt-0.5">Maintenance Portal</p>
          </div>

          {/* Form heading */}
          <h2 className="text-2xl font-bold text-pink-900 mb-1 text-center">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-sm text-pink-500 mb-6 text-center">
            {mode === 'signin'
              ? 'Sign in to manage your compliance pipeline'
              : 'Start tracking your maintenance team in minutes'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Username or Email"
              placeholder="you@oakwood24.com"
              icon={<Mail size={16} />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div>
              <label htmlFor="password" className="block mb-1.5 text-sm font-medium text-pink-800">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400">
                  <Lock size={16} />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full h-11 rounded-xl border border-pink-200 bg-white/70 pl-10 pr-10 text-sm text-pink-900 placeholder:text-pink-300 transition-all-soft focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pink-400 hover:text-pink-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember me + forgot password */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded-md border-2 border-pink-300 bg-white/60 peer-checked:bg-pink-500 peer-checked:border-pink-500 transition-all-soft flex items-center justify-center">
                    {remember && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-pink-600 font-medium group-hover:text-pink-800 transition-colors">
                  Remember me
                </span>
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  className="text-sm text-pink-500 hover:text-pink-700 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-xl bg-danger-50 border border-danger-500/20 px-4 py-3 text-sm text-danger-600 animate-fade-in-down">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-success-50 border border-success-500/20 px-4 py-3 text-sm text-success-700 animate-fade-in-down">
                {success}
              </div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
              {mode === 'signin' ? 'Login' : 'Create account'}
            </Button>
          </form>

          {/* Toggle sign in / sign up */}
          <div className="mt-6 text-center text-sm text-pink-500">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="font-semibold text-pink-700 hover:text-pink-800 transition-colors"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="font-semibold text-pink-700 hover:text-pink-800 transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tagline */}
        <p className="text-center text-sm text-pink-600 mt-6 font-medium">
          Keeping compliance simple <span className="text-pink-500">🌸</span>
        </p>
      </div>
    </div>
  );
}
