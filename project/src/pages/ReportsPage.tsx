import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, PieChart, TrendingUp } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import {
  downloadCSV,
  enrichCandidates,
  exportToCSV,
  fetchCandidates,
  fetchReminderSettings,
} from '@/lib/api';
import {
  type CandidateWithExpiry,
  type ComplianceDateField,
  type ReminderSettings,
} from '@/types';
import { COMPLIANCE_DATE_FIELDS, COMPLIANCE_DATE_LABELS, STATUS_LABELS } from '@/types';

export function ReportsPage() {
  const [candidates, setCandidates] = useState<CandidateWithExpiry[]>([]);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [cands, s] = await Promise.all([fetchCandidates(), fetchReminderSettings()]);
      setCandidates(enrichCandidates(cands, s));
      setSettings(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = candidates.length;
    const byStatus: Record<string, number> = {};
    const byExpiry: Record<ComplianceDateField, { valid: number; expiring: number; expired: number; missing: number }> = {
      dbs_expiry_date: { valid: 0, expiring: 0, expired: 0, missing: 0 },
      passport_expiry_date: { valid: 0, expiring: 0, expired: 0, missing: 0 },
      rtw_expiry_date: { valid: 0, expiring: 0, expired: 0, missing: 0 },
      evisa_expiry_date: { valid: 0, expiring: 0, expired: 0, missing: 0 },
      pmva_expiry_date: { valid: 0, expiring: 0, expired: 0, missing: 0 },
      training_expiry_date: { valid: 0, expiring: 0, expired: 0, missing: 0 },
    };

    for (const c of candidates) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      for (const field of COMPLIANCE_DATE_FIELDS) {
        byExpiry[field][c.expiryStatuses[field]]++;
      }
    }

    const complianceRate = total > 0
      ? Math.round((candidates.filter((c) => !c.isDoNotBook && !c.isExpiringSoon).length / total) * 100)
      : 0;

    return { total, byStatus, byExpiry, complianceRate };
  }, [candidates]);

  const handleExport = () => {
    const csv = exportToCSV(candidates);
    downloadCSV(`oakwood24-compliance-report-${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  if (candidates.length === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Reports" subtitle="Compliance analytics and exports." />
        <Card>
          <EmptyState
            icon={<BarChart3 size={28} />}
            title="No data to report yet"
            description="Import candidates to see compliance charts and statistics."
          />
        </Card>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: 'bg-success-500',
    inactive: 'bg-cream-300',
    no_zoho_remark: 'bg-warning-500',
    pending: 'bg-pink-400',
    archived: 'bg-pink-200',
  };

  const expiryColors = {
    valid: 'bg-success-500',
    expiring: 'bg-warning-500',
    expired: 'bg-danger-500',
    missing: 'bg-cream-300',
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reports"
        subtitle="Compliance analytics and data exports."
        action={
          <Button onClick={handleExport}>
            <Download size={16} /> Export to CSV
          </Button>
        }
      />

      {/* Top stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="animate-fade-in-up stagger-1">
          <CardBody className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-success-100 text-success-600 flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-3xl font-bold text-pink-900 tabular-nums">{stats.complianceRate}%</p>
                <p className="text-xs text-pink-400">Compliance Rate</p>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card className="animate-fade-in-up stagger-2">
          <CardBody className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <p className="text-3xl font-bold text-pink-900 tabular-nums">{stats.total}</p>
                <p className="text-xs text-pink-400">Total Candidates</p>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card className="animate-fade-in-up stagger-3">
          <CardBody className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-danger-100 text-danger-600 flex items-center justify-center">
                <PieChart size={20} />
              </div>
              <div>
                <p className="text-3xl font-bold text-pink-900 tabular-nums">{candidates.filter((c) => c.isDoNotBook).length}</p>
                <p className="text-xs text-pink-400">Do Not Book</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status distribution */}
        <Card>
          <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
          <CardBody>
            <div className="space-y-3">
              {Object.entries(stats.byStatus).map(([status, count]) => {
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-pink-700">
                        {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
                      </span>
                      <span className="text-sm text-pink-400 tabular-nums">{count} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-pink-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all-soft ${statusColors[status] ?? 'bg-pink-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Document expiry breakdown */}
        <Card>
          <CardHeader><CardTitle>Document Expiry Breakdown</CardTitle></CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-semibold text-pink-400 uppercase tracking-wider border-b border-pink-100">
                    <th className="pb-2 pr-3">Document</th>
                    <th className="pb-2 pr-3 text-center">Valid</th>
                    <th className="pb-2 pr-3 text-center">Expiring</th>
                    <th className="pb-2 pr-3 text-center">Expired</th>
                    <th className="pb-2 text-center">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPLIANCE_DATE_FIELDS.map((field) => {
                    const e = stats.byExpiry[field];
                    return (
                      <tr key={field} className="border-b border-pink-50">
                        <td className="py-2.5 pr-3 text-sm font-medium text-pink-900">
                          {COMPLIANCE_DATE_LABELS[field]}
                        </td>
                        <td className="py-2.5 pr-3 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-success-100 text-success-600 text-sm font-semibold">{e.valid}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-warning-100 text-warning-600 text-sm font-semibold">{e.expiring}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-danger-100 text-danger-600 text-sm font-semibold">{e.expired}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-cream-200 text-pink-500 text-sm font-semibold">{e.missing}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Visual compliance bars */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Compliance Timeline</CardTitle></CardHeader>
          <CardBody>
            <div className="space-y-4">
              {COMPLIANCE_DATE_FIELDS.map((field) => {
                const e = stats.byExpiry[field];
                const total = e.valid + e.expiring + e.expired + e.missing;
                if (total === 0) return null;
                return (
                  <div key={field}>
                    <p className="text-sm font-medium text-pink-700 mb-2">{COMPLIANCE_DATE_LABELS[field]}</p>
                    <div className="flex h-6 rounded-lg overflow-hidden gap-0.5">
                      <div className={`${expiryColors.valid} transition-all-soft flex items-center justify-center text-xs text-white font-semibold`} style={{ width: `${(e.valid / total) * 100}%` }}>
                        {e.valid > 0 && e.valid}
                      </div>
                      <div className={`${expiryColors.expiring} transition-all-soft flex items-center justify-center text-xs text-white font-semibold`} style={{ width: `${(e.expiring / total) * 100}%` }}>
                        {e.expiring > 0 && e.expiring}
                      </div>
                      <div className={`${expiryColors.expired} transition-all-soft flex items-center justify-center text-xs text-white font-semibold`} style={{ width: `${(e.expired / total) * 100}%` }}>
                        {e.expired > 0 && e.expired}
                      </div>
                      <div className={`${expiryColors.missing} transition-all-soft flex items-center justify-center text-xs text-pink-600 font-semibold`} style={{ width: `${(e.missing / total) * 100}%` }}>
                        {e.missing > 0 && e.missing}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-pink-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-success-500" /> Valid</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-warning-500" /> Expiring</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-danger-500" /> Expired</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cream-300" /> Missing</span>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
