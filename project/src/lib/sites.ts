import { supabase } from '@/lib/supabase';
import type { CandidateSiteAssignment, Site, SiteGroup } from '@/types';

export async function fetchSiteGroups(): Promise<SiteGroup[]> {
  const { data, error } = await supabase.from('site_groups').select('id,name').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createSiteGroup(name: string): Promise<SiteGroup> {
  const { data, error } = await supabase.from('site_groups').insert({ name: name.trim() }).select('id,name').single();
  if (error?.code === '23505') throw new Error('You already have a group with that name.');
  if (error) throw error;
  return data;
}

export async function updateSiteLocation(id: string, name: string, groupId: string | null): Promise<Site> {
  const { data, error } = await supabase.from('sites').update({ name: name.trim(), group_id: groupId }).eq('id', id).select().single();
  if (error?.code === '23505') throw new Error('You already have a site with that name.');
  if (error) throw error;
  return data;
}

export async function deleteSiteLocation(id: string, moveTo: string | null): Promise<void> {
  const { error } = await supabase.rpc('remove_site_location', { location_id: id, move_to_id: moveTo });
  if (error) throw error;
}

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
  const assignments: CandidateSiteAssignment[] = [];
  while (true) {
    const { data, error } = await supabase.from('candidate_site_assignments').select('site_id,candidate_id')
      .order('site_id').order('candidate_id').range(assignments.length, assignments.length + 499);
    if (error) throw error;
    if (!data?.length) return assignments;
    assignments.push(...data);
  }
}

export async function createSites(names: string[], groupId: string | null = null): Promise<Site[]> {
  if (!names.length) return [];
  const { data, error } = await supabase
    .from('sites')
    .insert(names.map((name) => ({ name: name.trim(), source: 'manual', group_id: groupId })))
    .select();
  if (!error) return data;
  if (error.code === '23505') throw new Error('A site with this name already exists.');
  throw error;
}

export async function groupSiteLocations(ids: string[], groupId: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('sites').update({ group_id: groupId }).in('id', ids);
  if (error) throw error;
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
