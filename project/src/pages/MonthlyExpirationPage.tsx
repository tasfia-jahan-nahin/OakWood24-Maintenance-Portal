import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Input';
import { fetchCandidatesStrict } from '@/lib/api';
import { candidateExpirations, portalToday } from '@/lib/monthlyExpirations';
import { CandidateDetailPage } from '@/pages/CandidateDetailPage';
import { DOCUMENT_TYPE_LABELS, STATUS_LABELS, type Candidate, type CandidateStatus } from '@/types';

const statusTones = {
  active: 'active', inactive: 'inactive', no_zoho_remark: 'pink', pending: 'pending', archived: 'archived',
} as const satisfies Record<CandidateStatus, string>;
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const months = Array.from({ length: 12 }, (_, index) => monthFormat.format(new Date(Date.UTC(2026, index, 1))));

export function MonthlyExpirationPage({ onEdit }: { onEdit: (id: string) => void }) {
  const today = portalToday();
  const currentYear = Number(today.slice(0, 4));
  const [month, setMonth] = useState(today.slice(5, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setCandidates(await fetchCandidatesStrict());
    } catch (error) {
      console.error('Monthly expiration load failed:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const expirations = useMemo(() => candidateExpirations(candidates), [candidates]);
  const years = [...new Set([
    currentYear - 1, currentYear, currentYear + 1, Number(year),
    ...expirations.map(({ date }) => Number(date.slice(0, 4))),
  ])].sort((a, b) => a - b);
  const rows = expirations.filter(({ date }) => date.startsWith(`${year}-${month}-`));

  if (selected) {
    return <CandidateDetailPage candidateId={selected} onEdit={onEdit} onBack={() => {
      setSelected(null);
      void load();
    }} />;
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Monthly Expiration" subtitle="See which candidate documents expire in the selected month." />
      <div className="mb-6 grid max-w-2xl grid-cols-2 gap-3 sm:gap-4">
        <Select id="expiration-month" label="Month" value={month} onChange={(event) => setMonth(event.target.value)}>
          {months.map((label, index) => <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>)}
        </Select>
        <Select id="expiration-year" label="Year" value={year} onChange={(event) => setYear(event.target.value)}>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-16" role="status" aria-label="Loading monthly expirations"><Spinner className="h-8 w-8" /></div>
        ) : error ? (
          <EmptyState icon={<CalendarDays size={28} />} title="Could not load monthly expirations"
            action={<Button onClick={load} size="sm">Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<CalendarDays size={28} />} title={`No document expirations in ${months[Number(month) - 1]} ${year}`} />
        ) : (
          <div className="overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <caption className="sr-only">Candidate document expirations for {months[Number(month) - 1]} {year}</caption>
              <thead className="bg-pink-50 text-pink-900">
                <tr>
                  {['Candidate', 'Document', 'Expiry date', 'Expiry', 'Status'].map((heading) => (
                    <th key={heading} scope="col" className="px-4 py-3 font-semibold sm:px-6">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-pink-100">
                {rows.map(({ candidate, document, date }) => {
                  const expired = date < today;
                  const dueToday = date === today;
                  return (
                    <tr key={`${candidate.id}:${document}`} className="hover:bg-pink-50/60">
                      <td className="px-4 py-3 sm:px-6">
                        <button type="button" onClick={() => setSelected(candidate.id)}
                          className="text-left font-semibold text-pink-700 hover:underline">{candidate.full_name}</button>
                      </td>
                      <td className="px-4 py-3 text-pink-900 sm:px-6">{document === 'rtw' ? 'Right to Work' : DOCUMENT_TYPE_LABELS[document]}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-pink-900 sm:px-6">
                        <time dateTime={date}>{dateFormat.format(new Date(date))}</time>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                        <Badge tone={expired ? 'expired' : 'expiring'}>{expired ? 'Expired' : dueToday ? 'Due today' : 'Upcoming'}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                        <Badge tone={statusTones[candidate.status]}>{STATUS_LABELS[candidate.status]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
