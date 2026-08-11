import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  Heart,
  ShieldCheck,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { PinkPixelSpinner, SkeletonCard } from '@/components/PinkPixel';
import { BDTimeShiftAlert } from '@/components/BDTimeShiftAlert';
import { type PageKey } from '@/components/DashboardLayout';
import {
  enrichCandidates,
  fetchCandidates,
  fetchDashboardStats,
  fetchReminderSettings,
  getGreeting,
  getShiftSubHeader,
  type DashboardStats,
} from '@/lib/api';
import { type Candidate, type CandidateWithExpiry, type ReminderSettings } from '@/types';
import { supabase } from '@/lib/supabase';

export function DashboardPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [loginCount, setLoginCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [subHeader, setSubHeader] = useState(getShiftSubHeader());

  // Update sub-header every minute
  useEffect(() => {
    const interval = setInterval(() => setSubHeader(getShiftSubHeader()), 60000);
    return () => clearInterval(interval);
  }, []);

  const load = useCallback(async () => {
    try {
      // Fetch Dashboard Stats, Candidates, Reminder Settings, and Auth Activity Logs with explicit count
      const [s, cands, settingsData] = await Promise.all([
        fetchDashboardStats(),
        fetchCandidates(),
        fetchReminderSettings(),
      ]);

      const { data: logsData, count: logsCount, error: logsError } = await supabase
        .from('auth_activity_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(10);

      setStats(s);
      setCandidates(cands);
      setSettings(settingsData);

      if (logsError) {
        console.error('Auth logs query error:', logsError.message, logsError.details);
      } else {
        setLoginCount(logsCount ?? logsData?.length ?? 0);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Subscribe to real-time database changes for auth_activity_logs
    const channel = supabase
      .channel('public:auth_activity_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'auth_activity_logs' },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const enriched = useMemo(() => enrichCandidates(candidates, settings), [candidates, settings]);
  const recentCandidates = enriched.slice(0, 5);
  const expiringSoon = enriched
    .filter((c) => c.isExpiringSoon && (c.status === 'active' || c.status === 'no_zoho_remark') && !c.goodbye_email_sent)
    .slice(0, 6);

  if (loading) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-pink-900 tracking-tight">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-sm text-pink-500">{subHeader || 'Loading your compliance overview...'}</p>
        </div>
        <BDTimeShiftAlert />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 sm:gap-4 mb-6">
          {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-pink-900 tracking-tight">
          {getGreeting()}
        </h1>
        <p className="mt-1 text-sm text-pink-500">{subHeader || 'Here\u2019s your compliance overview at a glance.'}</p>
      </div>

      <BDTimeShiftAlert />

      {/* Metric cards grid with Active Logins integrated */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 sm:gap-4 mb-6">
        <MetricCard icon={<Users size={18} />} label="Total Candidates" value={stats?.totalCandidates ?? 0} tone="pink" delay="stagger-1" onClick={() => onNavigate('candidates')} />
        <MetricCard icon={<CheckCircle2 size={18} />} label="Active" value={stats?.activeCandidates ?? 0} tone="success" delay="stagger-2" onClick={() => onNavigate('candidates')} />
        <MetricCard icon={<Clock size={18} />} label="Inactive" value={stats?.inactiveCandidates ?? 0} tone="neutral" delay="stagger-3" onClick={() => onNavigate('candidates')} />
        <MetricCard icon={<AlertTriangle size={18} />} label="No Zoho" value={stats?.noZohoCandidates ?? 0} tone="warning" delay="stagger-4" onClick={() => onNavigate('candidates')} />
        <MetricCard icon={<Zap size={18} />} label="Today's Chase" value={stats?.todayChase ?? 0} tone="rose" delay="stagger-5" onClick={() => onNavigate('chase-centre')} />
        <MetricCard icon={<Ban size={18} />} label="Do Not Book" value={stats?.doNotBook ?? 0} tone="danger" delay="stagger-6" onClick={() => onNavigate('do-not-book')} />
        
        {/* Auth Activity Metric Card */}
        <MetricCard icon={<ShieldCheck size={18} />} label="Total Logins" value={loginCount} tone="pink" delay="stagger-7" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent candidates */}
        <Card className="animate-fade-in-up stagger-5">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent Candidates</CardTitle>
            <button
              onClick={() => onNavigate('candidates')}
              className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={14} />
            </button>
          </CardHeader>
          <CardBody>
            {recentCandidates.length === 0 ? (
              <EmptyState
                icon={<Users size={28} />}
                title="No candidates yet"
                description="Import or add your first candidate to get started."
                action={
                  <Button onClick={() => onNavigate('import')} size="sm">
                    Import Data
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {recentCandidates.map((c) => (
                  <CandidateRow key={c.id} candidate={c} onClick={() => onNavigate('candidates')} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Today's Chase */}
        <Card className="animate-fade-in-up stagger-6">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Today's Chase</CardTitle>
            <button
              onClick={() => onNavigate('chase-centre')}
              className="text-sm text-pink-500 hover:text-pink-700 font-medium flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={14} />
            </button>
          </CardHeader>
          <CardBody>
            {expiringSoon.length === 0 ? (
              <EmptyState
                icon={<Heart size={28} />}
                title="All clear!"
                description="No compliance items need chasing today."
              />
            ) : (
              <div className="space-y-2">
                {expiringSoon.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-pink-50 transition-all-soft cursor-pointer"
                    onClick={() => onNavigate('chase-centre')}
                  >
                    <div className="w-10 h-10 rounded-xl bg-warning-100 text-warning-600 flex items-center justify-center shrink-0">
                      <CalendarClock size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-pink-900 truncate">{c.full_name}</p>
                      <p className="text-xs text-pink-400 truncate">
                        {c.job_title ? `${c.job_title} \u00B7 ` : ''}{c.role}
                      </p>
                    </div>
                    <Badge tone="expiring" dot>Chase</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
  delay,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: 'pink' | 'success' | 'neutral' | 'warning' | 'rose' | 'danger';
  delay: string;
  onClick?: () => void;
}) {
  const toneClasses = {
    pink: 'bg-pink-100 text-pink-600',
    success: 'bg-success-100 text-success-600',
    neutral: 'bg-cream-200 text-pink-600',
    warning: 'bg-warning-100 text-warning-600',
    rose: 'bg-rose-100 text-rose-600',
    danger: 'bg-danger-100 text-danger-600',
  };
  return (
    <button onClick={onClick} className="text-left animate-fade-in-up">
      <Card hover className={`${delay} h-full`}>
        <CardBody className="pt-5 pb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${toneClasses[tone]}`}>
            {icon}
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-pink-900 tabular-nums">{value}</p>
          <p className="text-xs sm:text-sm text-pink-400 mt-0.5">{label}</p>
        </CardBody>
      </Card>
    </button>
  );
}

function CandidateRow({ candidate: c, onClick }: { candidate: CandidateWithExpiry; onClick: () => void }) {
  const isGoodbye = c.goodbye_email_sent;
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl hover:bg-pink-50 transition-all-soft cursor-pointer ${isGoodbye ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center text-pink-700 font-semibold text-sm shrink-0">
        {c.full_name[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-pink-900 truncate">{c.full_name}</p>
        <p className="text-xs text-pink-400 truncate">
          {c.job_title ? `${c.job_title} \u00B7 ` : ''}{c.role}
        </p>
      </div>
      {isGoodbye ? (
        <Badge tone="archived">Archived</Badge>
      ) : c.isDoNotBook ? (
        <Badge tone="expired" dot>Do Not Book</Badge>
      ) : c.isExpiringSoon ? (
        <Badge tone="expiring" dot>Chase</Badge>
      ) : c.status === 'active' ? (
        <Badge tone="active">Active</Badge>
      ) : (
        <Badge tone="neutral">{c.status}</Badge>
      )}
    </div>
  );
}