import { useEffect, useState, type FormEvent } from 'react';
import { CircleAlert, CircleCheck, CircleX, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader, Spinner } from '@/components/ui/EmptyState';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { fetchCandidatesStrict, getTrustValue, isExpired } from '@/lib/api';
import { fetchSites } from '@/lib/sites';
import { supabase, supabaseProjectRef } from '@/lib/supabase';
import {
  compareSiteTraining, findSiteSections, parseCourseLines, requirementsForRole, splitTrustSites,
  trainingKey, trainingListKey, trainingListRole, TRAINING_ROLES, type SiteTraining, type TrainingRole,
} from '@/lib/trainingCheck';
import type { Candidate } from '@/types';

export function TrainingCheckPage() {
  const { isAdmin } = useAuth();
  const localKey = `oakwood-training-requirements:${supabaseProjectRef}`;
  const [requirements, setRequirements] = useState<SiteTraining[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [registeredSites, setRegisteredSites] = useState<string[]>([]);
  const [site, setSite] = useState('');
  const [role, setRole] = useState<TrainingRole | ''>('');
  const [candidateId, setCandidateId] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [siteName, setSiteName] = useState('');
  const [listRole, setListRole] = useState<TrainingRole | ''>('');
  const [coursesText, setCoursesText] = useState('');
  const [sections, setSections] = useState<SiteTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [people, sites, result] = await Promise.all([
          fetchCandidatesStrict(),
          fetchSites().catch(() => []),
          supabase.from('training_site_requirements').select('site_key,site_name,courses').order('site_name'),
        ]);
        if (!active) return;
        setCandidates(people);
        setRegisteredSites(sites.map(({ name }) => name));
        if (result.error?.code === 'PGRST205' || result.error?.code === '42P01') {
          setLocalOnly(true);
          const saved = JSON.parse(localStorage.getItem(localKey) ?? '[]') as SiteTraining[];
          setRequirements(saved);
        } else if (result.error) {
          throw result.error;
        } else {
          setRequirements((result.data ?? []).map(({ site_key, site_name, courses }) => ({
            site_name, courses, role: trainingListRole(site_key),
          })));
        }
      } catch (error) {
        console.error('Training Check load failed:', error);
        if (active) setError('Could not load Training Check. Refresh the page to try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [localKey]);

  const allSites = [...new Map([
    ...registeredSites,
    ...candidates.flatMap((person) => splitTrustSites(getTrustValue(person))),
    ...requirements.map(({ site_name }) => site_name),
  ].map((name) => [trainingKey(name), name])).values()].sort((a, b) => a.localeCompare(b));
  const scopedRequirements = requirementsForRole(requirements, role || undefined);
  const required = scopedRequirements.find(({ site_name }) => trainingKey(site_name) === site)?.courses ?? [];
  const candidate = candidates.find(({ id }) => id === candidateId);
  const filteredCandidates = candidates.filter(({ id, full_name }) =>
    id === candidateId || full_name.toLowerCase().includes(candidateSearch.trim().toLowerCase()),
  ).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const candidateSites = splitTrustSites(candidate ? getTrustValue(candidate) : null);
  const notes = candidate ? [
    candidate.remark,
    candidate.notes,
    ...Object.entries(candidate.extra_data ?? {})
      .filter(([label]) => /^(issues?|pending trainings?|training soon)$/i.test(label.trim()))
      .map(([label, value]) => /^pending trainings?$/i.test(label.trim()) && value && !/^n\/?a$/i.test(value.trim())
        ? `Pending ${value}` : value),
  ].filter((note): note is string => !!note?.trim() && !/^n\/?a$/i.test(note.trim())) : [];
  const comparison = candidate
    ? compareSiteTraining(required, candidateSites, scopedRequirements, notes, isExpired(candidate.training_expiry_date))
    : null;

  const editRequirements = (entry: SiteTraining) => {
    setSiteName(entry.site_name);
    setListRole(entry.role ?? '');
    setCoursesText(entry.courses.join('\n'));
    setNotice('');
    setError('');
  };

  const upload = async (file: File) => {
    setReading(true);
    setError('');
    setNotice('');
    setSections([]);
    try {
      const { readTrainingDocument } = await import('@/lib/readTrainingDocument');
      const text = await readTrainingDocument(file);
      if (!text.trim()) throw new Error('No text found. For a scanned PDF, copy the requirements into the box below.');
      const detected = findSiteSections(text, allSites);
      setSections(detected);
      if (detected.length > 0) {
        editRequirements({ ...detected[0], role: listRole || undefined });
      } else {
        setCoursesText(text);
      }
      setNotice(detected.length > 1
        ? 'Review and save each detected site below.'
        : 'Review the site name and course list before saving.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read the requirements document.');
    } finally {
      setReading(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || saving) return;
    const site_name = siteName.trim();
    const key = trainingListKey(site_name, listRole || undefined);
    const courses = parseCourseLines(coursesText);
    setNotice('');
    if (!trainingKey(site_name) || key.length > 200 || !courses.length || courses.length > 250 || courses.some((course) => course.length > 300)) {
      setError('Enter a site name and 1–250 course names, each no longer than 300 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = { site_name, courses, role: listRole || undefined };
      const next = [...requirements.filter((entry) => trainingListKey(entry.site_name, entry.role) !== key), updated];
      if (localOnly) {
        localStorage.setItem(localKey, JSON.stringify(next));
      } else {
        const { error } = await supabase.from('training_site_requirements').upsert({
          site_key: key, site_name, courses, updated_at: new Date().toISOString(),
        }, { onConflict: 'site_key' });
        if (error) throw error;
      }
      setRequirements(next);
      setSite(trainingKey(site_name));
      setRole(listRole);
      setNotice(`Saved ${courses.length} required courses for ${site_name} · ${listRole || 'All roles'}.`);
    } catch (error) {
      console.error('Training requirements save failed:', error);
      setError('Could not save the site requirements. Your changes are still in the form.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Training Check" subtitle="Compare a site’s required training with the candidate’s Trust/Client sites." />
      {localOnly && <p role="status" className="mb-4 rounded-xl bg-warning-50 p-3 text-sm text-warning-700">
        Shared storage is unavailable. Requirements saved here are available in this browser only.
      </p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
      <div className={isAdmin ? 'grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]' : undefined}>
        <Card>
          <CardHeader><CardTitle>Compare training</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Select id="training-target-site" label="Target site" value={site} onChange={(event) => setSite(event.target.value)}>
              <option value="">Choose a site</option>
              {allSites.map((name) => <option key={trainingKey(name)} value={trainingKey(name)}>{name}</option>)}
            </Select>
            <Select id="training-role" label="Role" value={role} onChange={(event) => setRole(event.target.value as TrainingRole | '')}>
              <option value="">All roles (shared courses)</option>
              {TRAINING_ROLES.map((option) => <option key={option}>{option}</option>)}
            </Select>
            <Input id="training-candidate-search" label="Find a candidate" type="search" placeholder="Search by name"
              value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} />
            <Select id="training-candidate" label="Candidate (optional)" value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}>
              <option value="">Show site requirements only</option>
              {filteredCandidates.map(({ id, full_name }) => <option key={id} value={id}>{full_name}</option>)}
            </Select>
            {candidate && <div className="space-y-2 text-sm text-pink-700">
              <p><strong>Trust/Client:</strong> {candidateSites.join(', ') || 'No compliant sites listed'}</p>
              {comparison && comparison.unknownSites.length > 0 && <p className="text-warning-700">
                Requirements missing for {comparison.unknownSites.join(', ')}.
              </p>}
              {notes.length > 0 && <details open className="rounded-lg bg-warning-50 p-3 text-warning-700">
                <summary className="cursor-pointer font-medium">Candidate notes to check</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
              </details>}
            </div>}
            {site && required.length === 0 && <p className="text-sm text-pink-600">No training requirements are saved for this site and role yet.</p>}
            {required.length > 0 && (
              <ul className="space-y-2" aria-label="Mandatory training">
                {comparison ? comparison.rows.map(({ course, status, sources, reason }) => {
                  const [label, Icon, colors] = status === 'covered'
                    ? ['Covered', CircleCheck, 'bg-emerald-50 text-emerald-800'] as const
                    : status === 'outstanding'
                      ? ['Outstanding', CircleX, 'bg-rose-50 text-rose-800'] as const
                      : ['Check manually', CircleAlert, 'bg-warning-50 text-warning-700'] as const;
                  return <li key={trainingKey(course)} className={`flex gap-3 rounded-xl p-3 text-sm ${colors}`}>
                    <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div><strong>{course}</strong><p>{label}{sources.length > 0 && ` · ${sources.join(', ')}`}</p>
                      {reason && <p>{reason}</p>}
                    </div>
                  </li>;
                }) : required.map((course) => <li key={trainingKey(course)} className="rounded-xl bg-pink-50 p-3 text-sm text-pink-900">{course}</li>)}
              </ul>
            )}
          </CardBody>
        </Card>
        {isAdmin && <Card>
          <CardHeader><CardTitle>Site requirements</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <label className="block rounded-xl border border-dashed border-pink-300 bg-pink-50/60 p-4 text-sm text-pink-800">
              <span className="mb-2 flex items-center gap-2 font-semibold"><Upload size={16} /> {reading ? 'Reading document…' : 'Upload a PDF or Word document'}</span>
              <input aria-label="Upload site requirements" type="file" accept=".pdf,.docx,.txt" disabled={reading || saving}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-pink-100 file:px-3 file:py-2 file:text-pink-800"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void upload(file);
                }} />
              <span className="mt-2 block text-xs text-pink-600">For a multi-site file, use a heading like “Site: Abbeyfield” above each list.</span>
            </label>
            {sections.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Detected sites">
              {sections.map((entry) => <Button key={entry.site_name} type="button" size="sm" variant="outline"
                disabled={saving || reading} onClick={() => editRequirements({ ...entry, role: listRole || undefined })}>{entry.site_name}</Button>)}
            </div>}
            {requirements.length > 0 && <Select id="training-existing-site" label="Edit a saved site"
              value="" disabled={saving || reading} onChange={(event) => {
                const entry = requirements.find(({ site_name, role }) => trainingListKey(site_name, role) === event.target.value);
                if (entry) editRequirements(entry);
              }}>
              <option value="">Choose a saved list</option>
              {requirements.map(({ site_name, role }) => {
                const key = trainingListKey(site_name, role);
                return <option key={key} value={key}>{site_name} · {role ?? 'All roles'}</option>;
              })}
            </Select>}
            <form onSubmit={save} className="space-y-3">
              <Input id="training-site-name" label="Site name" list="training-site-options" value={siteName} maxLength={200}
                disabled={saving || reading} required onChange={(event) => setSiteName(event.target.value)} />
              <datalist id="training-site-options">{allSites.map((name) => <option key={name} value={name} />)}</datalist>
              <Select id="training-list-role" label="Who needs these courses?" value={listRole}
                disabled={saving || reading} onChange={(event) => setListRole(event.target.value as TrainingRole | '')}>
                <option value="">All roles</option>
                {TRAINING_ROLES.map((option) => <option key={option}>{option}</option>)}
              </Select>
              <Textarea id="training-courses" label="Mandatory courses (one per line)" rows={8} value={coursesText}
                disabled={saving || reading} required onChange={(event) => setCoursesText(event.target.value)} />
              <Button type="submit" loading={saving} disabled={reading}>Save site requirements</Button>
              {notice && <p role="status" className="text-sm text-pink-700">{notice}</p>}
            </form>
          </CardBody>
        </Card>}
      </div>
    </div>
  );
}
