import { supabase } from '@/lib/supabase';
import type { CandidateSiteAssignment, Site } from '@/types';

export async function fetchSites(): Promise<Site[]> {
  const { data, error } = await supabase.from('sites').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function ensureDiscoveredSites(names: string[]): Promise<Site[]> {
  const existing = await fetchSites();
  const existingNames = new Set(existing.map((site) => site.name.trim().toLocaleLowerCase()));
  const missingNames = [...new Map(
    names
      .map((name) => name.trim())
      .filter((name) => name && !existingNames.has(name.toLocaleLowerCase()))
      .map((name) => [name.toLocaleLowerCase(), name]),
  ).values()];

  if (missingNames.length > 0) {
    const { error } = await supabase.from('sites').insert(
      missingNames.map((name) => ({ name, source: 'candidate_import' })),
    );
    if (error) {
      // Another import or session may have created the same canonical site concurrently.
      const afterInsert = await fetchSites();
      const namesAfterInsert = new Set(afterInsert.map((site) => site.name.trim().toLocaleLowerCase()));
      if (missingNames.some((name) => !namesAfterInsert.has(name.toLocaleLowerCase()))) throw error;
      return afterInsert;
    }
    return fetchSites();
  }

  return existing;
}

export async function fetchCandidateSiteAssignments(): Promise<CandidateSiteAssignment[]> {
  const { data, error } = await supabase
    .from('candidate_site_assignments')
    .select('site_id,candidate_id');
  if (error) throw error;
  return data ?? [];
}

export async function createSite(name: string): Promise<Site> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('Enter a site name.');

  const { data, error } = await supabase
    .from('sites')
    .insert({ name: normalizedName, source: 'manual' })
    .select()
    .single();
  if (!error) return data;
  if (error.code === '23505') throw new Error('A site with this name already exists.');
  throw error;
}

export async function assignCandidateToSite(candidateId: string, siteId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_site_assignments')
    .insert({ candidate_id: candidateId, site_id: siteId });
  if (error?.code === '23505') return;
  if (error) throw error;
}

export async function removeCandidateFromSite(candidateId: string, siteId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_site_assignments')
    .delete()
    .eq('candidate_id', candidateId)
    .eq('site_id', siteId);
  if (error) throw error;
}
