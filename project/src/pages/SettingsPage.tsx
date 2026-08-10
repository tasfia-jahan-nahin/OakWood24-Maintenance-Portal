import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { User, Image, Save, CheckCircle2, AlertCircle } from 'lucide-react';

export function SettingsPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.user_metadata?.display_name || user.user_metadata?.full_name || '');
      setAvatarUrl(user.user_metadata?.avatar_url || '');
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: displayName,
          avatar_url: avatarUrl,
        },
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Profile updated successfully! Refresh to see full changes across all tabs.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-900">Settings</h1>
        <p className="text-sm text-pink-500">Manage your profile settings</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white/80 backdrop-blur-md rounded-2xl p-6 border border-pink-100 shadow-sm space-y-5">
        <h2 className="text-lg font-semibold text-pink-900 border-b border-pink-100 pb-3">Profile Information</h2>

        {/* Display Name Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-pink-700 uppercase tracking-wider flex items-center gap-1.5">
            <User size={14} /> Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Tasfia"
            className="w-full px-4 py-2.5 rounded-xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-400/20 focus:border-pink-500 text-sm"
          />
        </div>

        {/* Avatar URL Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-pink-700 uppercase tracking-wider flex items-center gap-1.5">
            <Image size={14} /> Avatar Image URL
          </label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://images.unsplash.com/... or any image link"
            className="w-full px-4 py-2.5 rounded-xl border border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-400/20 focus:border-pink-500 text-sm"
          />
        </div>

        {/* Live Preview */}
        {avatarUrl && (
          <div className="flex items-center gap-4 pt-2">
            <span className="text-xs text-pink-500">Avatar Preview:</span>
            <img
              src={avatarUrl}
              alt="Avatar preview"
              className="w-12 h-12 rounded-full object-cover border-2 border-pink-300 shadow-xs"
              onError={(e) => {
                (e.target as HTMLImageElement).alt = 'Invalid Image URL';
              }}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-medium text-sm transition-all shadow-sm disabled:opacity-50"
        >
          <Save size={16} />
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}