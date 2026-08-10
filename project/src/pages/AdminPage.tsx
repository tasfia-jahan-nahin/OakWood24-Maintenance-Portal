import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, User, Activity, ServerCog } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { fetchAuthActivityLogs, fetchTeamSummary } from '@/lib/api';
import type { AuthActivityLog, TeamSummaryRecord } from '@/types';

export function AdminPage() {
  const [teamSummary, setTeamSummary] = useState<TeamSummaryRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuthActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [team, activity] = await Promise.all([fetchTeamSummary(), fetchAuthActivityLogs(100)]);
        setTeamSummary(team);
        setActivityLogs(activity);
      } catch (err) {
        console.error('Failed to load admin dashboard:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activityByUser = useMemo(() => {
    return activityLogs.reduce<Record<string, AuthActivityLog[]>>((acc, item) => {
      const key = item.user_email ?? item.user_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [activityLogs]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Team-level metrics, ownership insights, and login activity."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Card className="animate-fade-in-up">
          <CardHeader className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-pink-600" />
            <CardTitle>Ownership Summary</CardTitle>
          </CardHeader>
          <CardBody>
            {teamSummary.length === 0 ? (
              <EmptyState
                icon={<User size={28} />}
                title="No active users"
                description="No user profiles have been created yet."
              />
            ) : (
              <div className="space-y-3">
                {teamSummary.map((row) => (
                  <div key={row.user_id} className="rounded-2xl border border-pink-100 p-4 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-pink-900">{row.display_name || 'Unnamed user'}</p>
                        <p className="text-xs text-pink-400">{row.total_candidates} candidate(s)</p>
                      </div>
                      <Badge tone="pink">{row.active_candidates} active</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-pink-500">
                      <div className="rounded-xl bg-pink-50 p-2 text-center">Inactive: {row.inactive_candidates}</div>
                      <div className="rounded-xl bg-warning-50 p-2 text-center">No Zoho: {row.no_zoho_candidates}</div>
                      <div className="rounded-xl bg-cream-50 p-2 text-center">Total: {row.total_candidates}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="animate-fade-in-up xl:col-span-2">
          <CardHeader className="flex items-center gap-3">
            <Activity size={18} className="text-pink-600" />
            <CardTitle>Login Activity</CardTitle>
          </CardHeader>
          <CardBody>
            {activityLogs.length === 0 ? (
              <EmptyState
                icon={<ServerCog size={28} />}
                title="No auth activity yet"
                description="Login and logout events are recorded automatically."
              />
            ) : (
              <div className="space-y-4">
                {activityLogs.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-pink-100 p-4 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-pink-900">{entry.display_name || entry.user_email || 'Unknown'}</p>
                        <p className="text-xs text-pink-400">{entry.event_type.toUpperCase()}</p>
                      </div>
                      <span className="text-xs text-pink-500">{new Date(entry.created_at).toLocaleString('en-GB')}</span>
                    </div>
                    {entry.details ? <p className="mt-2 text-xs text-pink-600">{entry.details}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="animate-fade-in-up">
        <CardHeader className="flex items-center gap-3">
          <User size={18} className="text-pink-600" />
          <CardTitle>User Activity by Email</CardTitle>
        </CardHeader>
        <CardBody>
          {Object.keys(activityByUser).length === 0 ? (
            <EmptyState
              icon={<Activity size={28} />}
              title="No user activity"
              description="All auth logs include login and logout events."
            />
          ) : (
            <div className="space-y-4">
              {Object.entries(activityByUser).map(([user, items]) => (
                <div key={user} className="rounded-2xl border border-pink-100 p-4 bg-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-pink-900">{user}</p>
                      <p className="text-xs text-pink-400">{items.length} logged events</p>
                    </div>
                    <Badge tone="valid">Latest {items[0].event_type}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs text-pink-500">
                    {items.slice(0, 4).map((entry) => (
                      <div key={entry.id} className="rounded-xl bg-cream-50 p-2">
                        <p>{entry.event_type}</p>
                        <p className="text-[11px] mt-1">{new Date(entry.created_at).toLocaleString('en-GB')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
