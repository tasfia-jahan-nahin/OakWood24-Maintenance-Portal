import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Link2,
  MapPin,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import {
  assignCandidateToSite,
  createSite,
  ensureDiscoveredSites,
  fetchCandidateSiteAssignments,
  fetchSites,
  removeCandidateFromSite,
} from '@/lib/sites';
import { fetchCandidatesStrict, getTrustOptions } from '@/lib/api';
import {
  CANDIDATE_STATUSES,
  STATUS_LABELS,
  type Candidate,
  type CandidateStatus,
  type CandidateSiteAssignment,
  type Site,
} from '@/types';

const STATUS_TONES: Record<CandidateStatus, 'active' | 'inactive' | 'pink' | 'pending' | 'archived'> = {
  active: 'active',
  inactive: 'inactive',
  no_zoho_remark: 'pink',
  pending: 'pending',
  archived: 'archived',
};

function messageForError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return 'Something went wrong. Please try again.';
  }

  const message = typeof error.message === 'string' ? error.message : 'Unknown database error.';
  const code = 'code' in error ? error.code : null;
  const hint = 'hint' in error && typeof error.hint === 'string' ? ` ${error.hint}` : '';

  if (code === 'PGRST205' || code === '42P01') {
    return `Sites database tables are missing. Apply the latest Supabase migration. (${message})`;
  }
  if (code === '42501') {
    return `Supabase denied access to Sites data. Check the Sites row-level security policies. (${message})`;
  }
  return `${message}${hint}`;
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4 pt-6">
        <div className="w-11 h-11 rounded-xl bg-pink-100 flex items-center justify-center text-pink-600">
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-medium text-pink-400">{label}</p>
          <p className="text-2xl font-bold text-pink-900">{value.toLocaleString()}</p>
        </div>
      </CardBody>
    </Card>
  );
}

export function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [assignments, setAssignments] = useState<CandidateSiteAssignment[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteName, setSiteName] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [assignedSearch, setAssignedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all'>('all');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [assignmentSiteIds, setAssignmentSiteIds] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedCandidates = await fetchCandidatesStrict();
      setCandidates(loadedCandidates);
      const discovered = await ensureDiscoveredSites(getTrustOptions(loadedCandidates));
      setSites(discovered);
      const [loadedSites, loadedAssignments] = await Promise.all([
        Promise.resolve(discovered),
        fetchCandidateSiteAssignments(),
      ]);
      setSites(loadedSites);
      setAssignments(loadedAssignments);
      setSelectedSiteId((current) =>
        loadedSites.some((site) => site.id === current) ? current : (loadedSites[0]?.id ?? ''),
      );
    } catch (loadError) {
      console.error('Failed to load sites page:', loadError);
      setError(messageForError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const candidatesById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates],
  );
  const uniqueAssignedCandidates = useMemo(() => {
    const ids = new Set(assignments.map((assignment) => assignment.candidate_id));
    return [...ids].map((id) => candidatesById.get(id)).filter((candidate): candidate is Candidate => !!candidate);
  }, [assignments, candidatesById]);
  const statusCounts = useMemo(() => ({
    active: uniqueAssignedCandidates.filter((candidate) => candidate.status === 'active').length,
    inactive: uniqueAssignedCandidates.filter((candidate) => candidate.status === 'inactive').length,
    noZoho: uniqueAssignedCandidates.filter((candidate) => candidate.status === 'no_zoho_remark').length,
  }), [uniqueAssignedCandidates]);
  const countsBySite = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of assignments) {
      if (candidatesById.has(assignment.candidate_id)) {
        counts.set(assignment.site_id, (counts.get(assignment.site_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [assignments, candidatesById]);

  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const assignedToSelectedSite = useMemo(() => {
    const candidateIds = new Set(
      assignments
        .filter((assignment) => assignment.site_id === selectedSiteId)
        .map((assignment) => assignment.candidate_id),
    );
    return [...candidateIds]
      .map((id) => candidatesById.get(id))
      .filter((candidate): candidate is Candidate => !!candidate);
  }, [assignments, candidatesById, selectedSiteId]);
  const visibleAssignedCandidates = assignedToSelectedSite.filter((candidate) => {
    const matchesSearch = candidate.full_name.toLowerCase().includes(assignedSearch.trim().toLowerCase());
    return matchesSearch && (statusFilter === 'all' || candidate.status === statusFilter);
  });
  const visibleSites = sites.filter((site) =>
    site.name.toLowerCase().includes(siteSearch.trim().toLowerCase()),
  );
  const matchingCandidates = candidates
    .filter((candidate) => candidate.full_name.toLowerCase().includes(candidateSearch.trim().toLowerCase()))
    .slice(0, 8);
  const selectedCandidate = candidatesById.get(selectedCandidateId) ?? null;
  const selectedCandidateSiteIds = new Set(
    assignments
      .filter((assignment) => assignment.candidate_id === selectedCandidateId)
      .map((assignment) => assignment.site_id),
  );

  const handleAddSite = async () => {
    const normalized = siteName.trim().toLocaleLowerCase();
    if (!normalized) {
      setError('Enter a site name.');
      return;
    }
    if (sites.some((site) => site.name.trim().toLocaleLowerCase() === normalized)) {
      setError('A site with this name already exists.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const site = await createSite(siteName);
      setSites((current) => [...current, site].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSiteId(site.id);
      setSiteName('');
    } catch (saveError) {
      setError(messageForError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedCandidate || assignmentSiteIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(
        assignmentSiteIds.map((siteId) => assignCandidateToSite(selectedCandidate.id, siteId)),
      );
      await loadData();
      setAssignmentSiteIds([]);
      setSelectedCandidateId('');
      setCandidateSearch('');
    } catch (saveError) {
      setError(messageForError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (candidate: Candidate) => {
    if (!selectedSite || !window.confirm(`Remove ${candidate.full_name} from ${selectedSite.name}?`)) return;
    setError(null);
    try {
      await removeCandidateFromSite(candidate.id, selectedSite.id);
      setAssignments((current) =>
        current.filter((assignment) =>
          !(assignment.candidate_id === candidate.id && assignment.site_id === selectedSite.id),
        ),
      );
    } catch (removeError) {
      setError(messageForError(removeError));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Sites"
        subtitle="Manage client sites and the candidates assigned to each one."
        action={
          <div className="flex w-full gap-2 sm:w-auto">
            <Input
              aria-label="New site name"
              placeholder="Add a site name"
              value={siteName}
              onChange={(event) => setSiteName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleAddSite();
              }}
              className="min-w-0 sm:w-56"
            />
            <Button onClick={() => void handleAddSite()} loading={saving} className="shrink-0">
              <Plus size={17} /> Add site
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-sm text-danger-600">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>Retry</Button>
        </div>
      )}

      <section aria-label="Site summary" className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total sites" value={sites.length} icon={Building2} />
        <SummaryCard label="Unique candidates" value={uniqueAssignedCandidates.length} icon={Users} />
        <SummaryCard label="Assignments" value={assignments.length} icon={Link2} />
        <SummaryCard label="Active" value={statusCounts.active} icon={Check} />
        <SummaryCard label="Inactive" value={statusCounts.inactive} icon={Users} />
        <SummaryCard label="No Zoho" value={statusCounts.noZoho} icon={MapPin} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Site directory</CardTitle>
              <Badge tone="pink">{sites.length} sites</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <Input
              aria-label="Search sites"
              placeholder="Search sites..."
              value={siteSearch}
              onChange={(event) => setSiteSearch(event.target.value)}
              icon={<Search size={16} />}
            />
            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">
              {visibleSites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => setSelectedSiteId(site.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    site.id === selectedSiteId
                      ? 'border-pink-300 bg-pink-50'
                      : 'border-pink-100 bg-white hover:bg-pink-50/60'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-pink-900">
                      <MapPin size={15} className="shrink-0 text-pink-400" />
                      <span className="truncate">{site.name}</span>
                    </span>
                    <Badge tone="neutral">{countsBySite.get(site.id) ?? 0}</Badge>
                  </span>
                  <span className="mt-1 block pl-6 text-xs text-pink-400">
                    {site.source === 'manual' ? 'Manually added' : 'From candidate import'}
                  </span>
                </button>
              ))}
              {visibleSites.length === 0 && (
                <EmptyState
                  icon={<Building2 size={26} />}
                  title={sites.length ? 'No matching sites' : 'No sites yet'}
                  description={sites.length ? 'Try another search.' : 'Add a site or import candidates with a Trust/Client value.'}
                />
              )}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center gap-3">
              <UserPlus size={18} className="text-pink-600" />
              <CardTitle>Assign candidate to sites</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input
                aria-label="Search candidates to assign"
                placeholder="Search candidates by name..."
                value={candidateSearch}
                onChange={(event) => {
                  setCandidateSearch(event.target.value);
                  setSelectedCandidateId('');
                  setAssignmentSiteIds([]);
                }}
                icon={<Search size={16} />}
              />
              {candidateSearch.trim() && !selectedCandidate && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-pink-100 p-2">
                  {matchingCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        setSelectedCandidateId(candidate.id);
                        setAssignmentSiteIds([]);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-pink-50"
                    >
                      <span className="text-sm font-medium text-pink-900">{candidate.full_name}</span>
                      <Badge tone={STATUS_TONES[candidate.status]}>{STATUS_LABELS[candidate.status]}</Badge>
                    </button>
                  ))}
                  {matchingCandidates.length === 0 && (
                    <p className="px-3 py-2 text-sm text-pink-400">No candidates match that search.</p>
                  )}
                </div>
              )}
              {selectedCandidate && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-pink-50 px-4 py-3">
                    <span className="font-semibold text-pink-900">{selectedCandidate.full_name}</span>
                    <Badge tone={STATUS_TONES[selectedCandidate.status]}>{STATUS_LABELS[selectedCandidate.status]}</Badge>
                  </div>
                  {sites.length === 0 ? (
                    <p className="text-sm text-pink-500">Add a site before assigning candidates.</p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wide text-pink-400">Choose one or more sites</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {sites.map((site) => {
                          const alreadyAssigned = selectedCandidateSiteIds.has(site.id);
                          const checked = assignmentSiteIds.includes(site.id);
                          return (
                            <label
                              key={site.id}
                              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                                alreadyAssigned ? 'border-pink-100 bg-cream-50 text-pink-400' : 'border-pink-100 text-pink-800 hover:bg-pink-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={alreadyAssigned}
                                onChange={(event) => setAssignmentSiteIds((current) =>
                                  event.target.checked
                                    ? [...current, site.id]
                                    : current.filter((id) => id !== site.id),
                                )}
                                className="accent-pink-500"
                              />
                              <span className="min-w-0 flex-1 truncate">{site.name}</span>
                              {alreadyAssigned && <span className="text-xs">Assigned</span>}
                            </label>
                          );
                        })}
                      </div>
                      <Button onClick={() => void handleAssign()} loading={saving} disabled={!assignmentSiteIds.length}>
                        <Link2 size={16} /> Assign to {assignmentSiteIds.length || ''} selected site{assignmentSiteIds.length === 1 ? '' : 's'}
                      </Button>
                    </>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{selectedSite?.name ?? 'Candidates by site'}</CardTitle>
                  <p className="mt-1 text-xs text-pink-400">
                    {assignedToSelectedSite.length} unique candidate{assignedToSelectedSite.length === 1 ? '' : 's'} assigned
                  </p>
                </div>
                {selectedSite && <Badge tone="pink">{countsBySite.get(selectedSite.id) ?? 0} total</Badge>}
              </div>
            </CardHeader>
            <CardBody>
              {selectedSite ? (
                <>
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                    <Input
                      aria-label="Search assigned candidates"
                      placeholder="Search assigned candidates..."
                      value={assignedSearch}
                      onChange={(event) => setAssignedSearch(event.target.value)}
                      icon={<Search size={16} />}
                    />
                    <Select
                      aria-label="Filter candidates by status"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as CandidateStatus | 'all')}
                    >
                      <option value="all">All statuses</option>
                      {CANDIDATE_STATUSES.map((status) => (
                        <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                      ))}
                    </Select>
                  </div>
                  {visibleAssignedCandidates.length ? (
                    <div className="divide-y divide-pink-100">
                      {visibleAssignedCandidates.map((candidate) => (
                        <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-pink-900">{candidate.full_name}</p>
                            {candidate.job_title && <p className="text-xs text-pink-400">{candidate.job_title}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone={STATUS_TONES[candidate.status]}>{STATUS_LABELS[candidate.status]}</Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${candidate.full_name} from ${selectedSite.name}`}
                              onClick={() => void handleRemoveAssignment(candidate)}
                              className="text-danger-600 hover:bg-danger-50"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Users size={26} />}
                      title={assignedToSelectedSite.length ? 'No candidates match these filters' : 'No candidates assigned'}
                      description={assignedToSelectedSite.length ? 'Adjust the search or status filter.' : 'Search for candidates above to assign them to this or another site.'}
                    />
                  )}
                </>
              ) : (
                <EmptyState
                  icon={<Building2 size={26} />}
                  title="Select a site"
                  description="Choose a site from the directory to review its assigned candidates."
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
