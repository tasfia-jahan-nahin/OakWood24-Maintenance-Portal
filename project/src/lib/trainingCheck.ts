export const TRAINING_ROLES = ['RGN', 'RMN', 'HCA', 'Kitchen Assistant'] as const;
export type TrainingRole = (typeof TRAINING_ROLES)[number];
export type SiteTraining = { site_name: string; courses: string[]; role?: TrainingRole };

export function trainingListKey(siteName: string, role?: TrainingRole): string {
  return role ? `${role}:${trainingKey(siteName)}` : trainingKey(siteName);
}

export function trainingListRole(key: string): TrainingRole | undefined {
  return TRAINING_ROLES.find((role) => key.startsWith(role + ':'));
}

export function requirementsForRole(entries: SiteTraining[], role?: TrainingRole): SiteTraining[] {
  const sites = new Map<string, SiteTraining>();
  for (const entry of entries) {
    if (entry.role && entry.role !== role) continue;
    const key = trainingKey(entry.site_name);
    const previous = sites.get(key)?.courses ?? [];
    const courses = [...new Map([...previous, ...entry.courses].map((course) => [trainingKey(course), course])).values()];
    sites.set(key, { site_name: entry.site_name, courses });
  }
  return [...sites.values()];
}

export function trainingKey(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function splitTrustSites(value: string | null): string[] {
  return [...new Set((value ?? '').split(/[,;\n|]+/).map((site) => site.trim()).filter(Boolean))];
}

export function parseCourseLines(text: string): string[] {
  const courses = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const course = line.trim().replace(/^(?:[-*•▪◦□✓]+\s*|\d+[.)]\s+)/u, '').trim();
    const key = trainingKey(course);
    if (key && !courses.has(key)) courses.set(key, course);
  }
  return [...courses.values()];
}

export function findSiteSections(text: string, knownSites: string[]): SiteTraining[] {
  const names = new Map(knownSites.map((name) => [trainingKey(name), name]));
  const sections = new Map<string, { name: string; lines: string[] }>();
  let current: string[] | undefined;
  for (const line of text.split(/\r?\n/)) {
    const explicit = line.match(/^\s*(?:site|trust|client)\s*:\s*(.+?)\s*$/i);
    const heading = (explicit?.[1] ?? line).trim().replace(/\s*(?:[-–:]\s*)?(?:mandatory|required) trainings?\s*:?$/i, '');
    const key = trainingKey(heading);
    const siteName = names.get(key) ?? (explicit ? heading : undefined);
    if (siteName && key) {
      if (!sections.has(key)) sections.set(key, { name: siteName, lines: [] });
      current = sections.get(key)?.lines;
    } else if (!/^(?:mandatory|required)?\s*trainings?\s*:?$/i.test(line.trim())) {
      current?.push(line);
    }
  }
  return [...sections.values()].map(({ name, lines }) => ({
    site_name: name,
    courses: parseCourseLines(lines.join('\n')),
  })).filter(({ courses }) => courses.length > 0);
}

export function compareSiteTraining(
  required: string[],
  candidateSites: string[],
  requirements: SiteTraining[],
  notes: string[],
  trainingExpired: boolean,
) {
  const lists = new Map(requirements.map(({ site_name, courses }) => [trainingKey(site_name), courses]));
  const unknownSites = candidateSites.filter((site) => !lists.has(trainingKey(site)));
  const knownCourses = candidateSites.flatMap((site) => lists.get(trainingKey(site)) ?? []).map(trainingKey);
  const exceptions = notes.flatMap((note) => [...note.matchAll(
    /(?:^|[\n,;.!])\s*(?:no|missing|needs?|pending|expired|outstanding)\s+([^\n,;.!]+)/gi,
  )].map((match) => trainingKey(match[1])).filter(Boolean));
  const rows = required.map((course) => {
    const key = trainingKey(course);
    const sources = candidateSites.filter((site) => lists.get(trainingKey(site))?.some((item) => trainingKey(item) === key));
    const exception = exceptions.some((note) => ` ${key} `.includes(` ${note} `) || ` ${note} `.includes(` ${key} `));
    if (exception) return { course, sources, status: 'review', reason: 'Check the candidate’s notes for an exception.' } as const;
    if (sources.length > 0 && trainingExpired) {
      return { course, sources, status: 'review', reason: 'The candidate’s general training expiry date has passed.' } as const;
    }
    if (sources.length > 0) return { course, sources, status: 'covered', reason: '' } as const;
    if (knownCourses.some((known) => known.startsWith(key + ' ') || key.startsWith(known + ' '))) {
      return { course, sources, status: 'review', reason: 'A listed site has a similar course name. Check whether the courses are equivalent.' } as const;
    }
    if (unknownSites.length > 0) {
      return { course, sources, status: 'review', reason: 'A listed site is missing its requirements.' } as const;
    }
    return { course, sources, status: 'outstanding', reason: '' } as const;
  });
  return { rows, unknownSites };
}
