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

const COURSE_LIST_MARKER = /^(?:[-*•▪◦□✓]+\s*|\d+[.)]\s+)/u;

export function parseCourseLines(text: string): string[] {
  const courses = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const course = line.trim().replace(COURSE_LIST_MARKER, '').trim();
    const key = trainingKey(course);
    if (key && !courses.has(key)) courses.set(key, course);
  }
  return [...courses.values()];
}

function parseRoleHeading(value: string): TrainingRole | undefined {
  const heading = trainingKey(value).replace(/^for (?:the )?/, '')
    .replace(/ (?:mandatory |required )?(?:trainings?|courses?|requirements|roles?)(?: only)?$/, '')
    .replace(/ only$/, '');
  if (/^(?:kitchen|kirchen) assistants?(?: s)?$/.test(heading)) return 'Kitchen Assistant';
  return TRAINING_ROLES.find((role) => trainingKey(role) === heading);
}

export function findSiteSections(text: string, knownSites: string[]): SiteTraining[] {
  const names = new Map(knownSites.map((name) => [trainingKey(name), name]));
  const sections = new Map<string, { site_name: string; role: TrainingRole; lines: string[] }>();
  let siteName: string | undefined;
  let role: TrainingRole = 'HCA';
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const addCourse = (line: string) => {
    if (!siteName) return;
    const key = trainingListKey(siteName, role);
    let section = sections.get(key);
    if (!section) {
      section = { site_name: siteName, role, lines: [] };
      sections.set(key, section);
    }
    section.lines.push(line);
  };

  for (const [index, line] of lines.entries()) {
    const text = line.replace(COURSE_LIST_MARKER, '');
    const roleLine = text.match(/^role\s*:\s*(.+)$/i)?.[1] ?? text;
    const [roleHeading, ...roleTail] = roleLine.split(':');
    const labelledRole = parseRoleHeading(roleHeading);
    if (labelledRole) {
      role = labelledRole;
      if (roleTail.length > 0) addCourse(roleTail.join(':').trim());
      continue;
    }
    if (COURSE_LIST_MARKER.test(line)) {
      addCourse(line);
      continue;
    }
    const explicit = line.match(/^(?:site|trust|client)\s*:\s*(.+)$/i);
    const [headingText, ...tail] = (explicit?.[1] ?? line).split(':');
    const inlineCourse = tail.join(':').trim();
    if (/^(?:mandatory|required)?\s*trainings?\s*:?$/i.test(line)) continue;

    const headingWithRole = headingText.trim().match(/^(.+?)\s*(?:\(([^)]+)\)|\s+[-–—]\s+(.+))$/);
    const headingRole = headingWithRole ? parseRoleHeading(headingWithRole[2] ?? headingWithRole[3]) : undefined;
    const heading = (headingRole && headingWithRole ? headingWithRole[1] : headingText).trim()
      .replace(/\s*(?:[-–]\s*)?(?:mandatory|required) trainings?\s*$/i, '');
    const key = trainingKey(heading);
    const knownName = names.get(key);
    const hasListBelow = COURSE_LIST_MARKER.test(lines[index + 1] ?? '');
    const isHeading = explicit || knownName || line.endsWith(':') || hasListBelow;
    if (key && isHeading) {
      siteName = knownName ?? heading;
      role = headingRole ?? 'HCA';
      if (inlineCourse) addCourse(inlineCourse);
    } else {
      addCourse(line);
    }
  }
  return [...sections.values()].map(({ site_name, role, lines }) => ({
    site_name, role,
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
