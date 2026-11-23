import type { CandidateSiteAssignment, Site } from '@/types';

export function countCandidatesByGroup(sites: Site[], assignments: CandidateSiteAssignment[], visibleCandidates: ReadonlySet<string>) {
  const groupsBySite = new Map(sites.map((site) => [site.id, site.group_id]));
  const candidatesByGroup = new Map<string, Set<string>>();
  for (const { site_id, candidate_id } of assignments) {
    const group = groupsBySite.get(site_id);
    if (!group || !visibleCandidates.has(candidate_id)) continue;
    const candidates = candidatesByGroup.get(group) ?? new Set<string>();
    candidates.add(candidate_id);
    candidatesByGroup.set(group, candidates);
  }
  return candidatesByGroup;
}
