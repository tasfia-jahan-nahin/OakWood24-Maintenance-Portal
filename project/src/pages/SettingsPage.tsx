import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

export function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setDisplayName(
          user.user_metadata?.display_name || 
          user.user_metadata?.full_name || 
          user.email?.split('@')[0] || ''
        );
      }
    };
    fetchUser();
  }, []);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      });

      if (error) throw error;

      setMessage('Display name updated successfully! Refresh to see changes.');
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setMessage(`Failed to update: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-900">Settings</h1>
        <p className="text-sm text-pink-500">Manage your profile settings</p>
      </div>

      <form onSubmit={handleSaveProfile} className="bg-white/80 backdrop-blur-md border border-pink-100 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-pink-900">Profile Information</h2>
        
        <div>
          <label className="block text-sm font-medium text-pink-800 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your display name"
            className="w-full h-11 px-4 rounded-xl border border-pink-200 bg-white text-sm text-pink-900 focus:outline-none focus:ring-2 focus:ring-pink-300"
            required
          />
        </div>

        {message && (
          <p className={`text-sm font-medium ${message.startsWith('Failed') ? 'text-rose-600' : 'text-emerald-600'}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}git add .
git commit -m "Add self-contained profile display name update to SettingsPage"
git push origin main