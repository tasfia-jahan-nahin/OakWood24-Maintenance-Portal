import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCircle,
  LogIn,
  LogOut,
  ShieldCheck,
  Zap,
  Database,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { fetchChangeHistory } from '@/lib/api';
import { type ChangeHistoryEntry } from '@/types';

const actionIcons: Record<string, typeof FileText> = {
  'candidate.create': Plus,
  'candidate.update': Pencil,
  'candidate.delete': Trash2,
  'CANDIDATE_ARCHIVED': Trash2,
  'user.signup': Plus,
  'user.signin': LogIn,
  'user.signout': LogOut,
  'batch.import': Database,
  'database.clear_all': Database,
};

function getIcon(action: string): typeof FileText {
  for (const key of Object.keys(actionIcons)) {
    if (action.startsWith(key)) return actionIcons[key];
  }
  if (action.startsWith('field.')) return Pencil;
  if (action.startsWith('chase.')) return Zap;
  return FileText;
}

function getTone(action: string): 'valid' | 'pink' | 'expired' | 'neutral' | 'pending' {
  if (action.includes('create') || action.includes('signup')) return 'valid';
  if (action.includes('delete') || action.includes('clear')) return 'expired';
  if (action.includes('ARCHIVED')) return 'expired';
  if (action.includes('chase')) return 'pending';
  if (action.includes('update') || action.includes('field.')) return 'pink';
  return 'neutral';
}

export function HistoryPage() {
  const [logs, setLogs] = useState<ChangeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchChangeHistory(500);
        setLogs(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const users = useMemo(() => {
    const set = new Set(logs.map((l) => l.user_email).filter(Boolean) as string[]);
    return ['all', ...Array.from(set)];
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (log.user_email ?? '').toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.old_value ?? '').toLowerCase().includes(q) ||
        (log.new_value ?? '').toLowerCase().includes(q);
      const matchesUser = userFilter === 'all' || log.user_email === userFilter;
      return matchesSearch && matchesUser;
    });
  }, [logs, search, userFilter]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Audit History"
        subtitle="A complete, non-deletable record of every change in the portal."
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <Input
            placeholder="Search by action, user, or value..."
            icon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <Select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            {users.map((u) => (
              <option key={u} value={u}>{u === 'all' ? 'All users' : u}</option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Activity Log ({filtered.length})</CardTitle></CardHeader>
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<History size={28} />}
              title="No audit entries yet"
              description="Every change you make will be recorded here automatically."
            />
          ) : (
            <div className="relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-pink-100" />
              <div className="space-y-1">
                {filtered.map((log, i) => {
                  const Icon = getIcon(log.action);
                  const tone = getTone(log.action);
                  const toneClasses = {
                    valid: 'bg-success-100 text-success-600',
                    pink: 'bg-pink-100 text-pink-600',
                    expired: 'bg-danger-100 text-danger-600',
                    pending: 'bg-warning-100 text-warning-600',
                    neutral: 'bg-cream-200 text-pink-600',
                  };
                  return (
                    <div
                      key={log.id}
                      className={`relative flex items-start gap-4 p-3 rounded-xl hover:bg-pink-50 transition-all-soft animate-fade-in stagger-${Math.min((i % 6) + 1, 6)}`}
                    >
                      <div className={`relative z-10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneClasses[tone]} bg-white border border-pink-100`}>
                        <Icon size={17} />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge tone={tone}>{log.action}</Badge>
                          <span className="text-xs text-pink-400">
                            {new Date(log.created_at).toLocaleString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-pink-700 space-y-0.5">
                          {log.old_value && (
                            <p className="text-xs text-pink-400">
                              <span className="font-medium">Previous:</span> {log.old_value}
                            </p>
                          )}
                          {log.new_value && (
                            <p className="text-xs text-pink-600">
                              <span className="font-medium">New:</span> {log.new_value}
                            </p>
                          )}
                          {!log.old_value && !log.new_value && (
                            <p className="text-sm text-pink-600">{log.action}</p>
                          )}
                        </div>
                        <p className="text-xs text-pink-400 mt-0.5 flex items-center gap-1">
                          <UserCircle size={12} /> {log.user_email ?? 'System'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
