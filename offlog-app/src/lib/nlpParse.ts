// Local, offline, regex-based natural-language parsing for Quick Add --
// no network call, no bundled model. This stays rule-based rather than
// reaching for an LLM API, matching the project's no-AI/no-backend mission.
//
// Scope is deliberately small: a handful of date/time phrases, #tags,
// !priority, and an @project mention. Ambiguous or unrecognized text is left
// alone in the title rather than guessed at — for a task manager, a wrong
// silent guess is worse than no parse, since the due date is only useful if
// it can be trusted.
//
// Escape hatches for text that legitimately needs a sigil character or a
// date-like word:
//   - `\#`, `\@`, `\!` keep that one character literal (e.g. "Reply to
//     ticket \#42") while the rest of the title still gets parsed.
//   - A backslash right before any other recognised token keeps that whole
//     token as text: `\friday`, `\at 5pm`, `\aug 3`. The backslash itself
//     leaves the title; a backslash before anything unrecognised stays.
//   - Wrapping the WHOLE title in double quotes turns off parsing
//     entirely, for a title that happens to contain a real date/time
//     word ("Tomorrow Land festival budget") rather than just a sigil.

import type { ProjectDoc } from './types';

export type ParsedSpanKind = 'date' | 'time' | 'priority' | 'tag' | 'project';
// Offsets into the input exactly as passed in (untrimmed), end exclusive.
// Spans never overlap and come back sorted by start.
export interface ParsedSpan { start: number; end: number; kind: ParsedSpanKind }

export interface ParsedQuickAdd {
  title: string;
  due_date: string | null;      // YYYY-MM-DD, local
  reminder_at: string | null;   // ISO instant, local wall-clock converted
  priority: 1 | 2 | 3 | null;   // null = not mentioned, caller decides the default
  tags: string[];
  projectId: string | null;
  matchedProjectLabel: string | null; // for showing what matched, e.g. "Fitness Tracker"
  raw: boolean; // true when the whole-title quote escape was used -- caller can show "parsing off" instead of chips
  spans: ParsedSpan[]; // what was recognised, for highlighting it in the input
}

const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_ALIASES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function isoDate(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// Escaped sigils become `\` + a sentinel (same length, so offsets keep
// matching the typed text) and no sigil regex can see them. Private-use
// code points never occur in ordinary typed text.
const HASH_SENTINEL = String.fromCharCode(0xE000);
const AT_SENTINEL = String.fromCharCode(0xE001);
const BANG_SENTINEL = String.fromCharCode(0xE002);
const SIGIL_ESCAPE: Record<string, string> = { '#': HASH_SENTINEL, '@': AT_SENTINEL, '!': BANG_SENTINEL };
const SIGIL_UNESCAPE: Record<string, string> = { [HASH_SENTINEL]: '#', [AT_SENTINEL]: '@', [BANG_SENTINEL]: '!' };
const ESCAPED_SIGIL_RE = new RegExp(`\\\\([${HASH_SENTINEL}${AT_SENTINEL}${BANG_SENTINEL}])`, 'g');

// Masks text that later patterns must not see but that stays in the title:
// an unmatched @mention (a typo stays visible, yet "@friday" must not read as
// a date once the "@" is out of the way) and a backslash-escaped token.
// Non-word and non-space, so it gives no \b or \s boundary to match against.
const HIDE = String.fromCharCode(0xE003);

// Every extractor matches against `text`, a same-length copy of the input:
// a recognised token is blanked to spaces and a hidden one to HIDE, so match
// offsets are always offsets into the typed text.
interface Work { text: string; spans: ParsedSpan[]; dropBackslash: Set<number> }

function blank(w: Work, start: number, end: number, ch: string) {
  w.text = w.text.slice(0, start) + ch.repeat(end - start) + w.text.slice(end);
}
// `(?:^|\s)` and trailing `\s*` belong to the match, not to the token.
function bounds(m: RegExpExecArray): [number, number] {
  const lead = m[0].length - m[0].trimStart().length;
  return [m.index + lead, m.index + m[0].trimEnd().length];
}
// First match not escaped by a backslash right before it. An escaped one is
// hidden from every later pattern and its backslash marked for removal.
function find(w: Work, re: RegExp): RegExpExecArray | null {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(w.text))) {
    const [s, e] = bounds(m);
    // A possessive ("Tomorrow's plan", "Friday’s meeting") is a noun in the
    // title, not a date or keyword to pull out.
    if (/^['’]s\b/i.test(w.text.slice(e))) continue;
    // Only a backslash that starts a word escapes (\friday); one inside a
    // word, like a path (C:\today), is ordinary text.
    if (w.text[s - 1] !== '\\' || (s > 1 && !/\s/.test(w.text[s - 2]))) return m;
    w.dropBackslash.add(s - 1);
    blank(w, s, e, HIDE);
  }
  return null;
}
function take(w: Work, m: RegExpExecArray, kind: ParsedSpanKind) {
  const [s, e] = bounds(m);
  w.spans.push({ start: s, end: e, kind });
  blank(w, s, e, ' ');
}

// A real calendar date, or null: new Date() silently rolls "Sep 31" into
// Oct 1, so the parts are checked after building.
function real(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month, day);
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
}

// A month/day typed without a year means its next real occurrence, never a
// date already behind today ("Feb 29" waits for the next leap year).
function upcoming(year: number | null, month: number, day: number, today: Date): Date | null {
  if (year !== null) return real(year, month, day);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let y = today.getFullYear(); y <= today.getFullYear() + 8; y++) {
    const d = real(y, month, day);
    if (d && d >= start) return d;
  }
  return null;
}

// Tries each date pattern in order, first hit wins -- explicit dates before
// relative ones so "next friday" doesn't get shadowed by a coincidental
// weekday match inside a longer phrase.
function extractDate(w: Work, today: Date): Date | null {
  // ISO: 2026-07-25
  let m = find(w, /\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const d = real(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d) { take(w, m, 'date'); return d; }
  }

  // Slash: 7/25 or 7/25/2026. Known ambiguity, accepted deliberately
  // rather than guessed around: "went 8/10 today" (a fraction/ratio) also
  // matches this and gets misread as Aug 10 -- same tradeoff every
  // Todoist-style quick-add parser makes for this syntax. A backslash before
  // it, or the whole-title quote escape, is the fix for a title that hits this.
  m = find(w, /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    const d = upcoming(year, Number(m[1]) - 1, Number(m[2]), today);
    if (d) { take(w, m, 'date'); return d; }
  }

  // "Jul 25", "July 25th", "July 25, 2026"
  const monthNames = Object.keys(MONTH_ALIASES).sort((a, b) => b.length - a.length).join('|');
  m = find(w, new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'));
  if (m) {
    const d = upcoming(m[3] ? Number(m[3]) : null, MONTH_ALIASES[m[1].toLowerCase()], Number(m[2]), today);
    if (d) { take(w, m, 'date'); return d; }
  }

  // today / tonight
  m = find(w, /\b(today|tonight|tod)\b/i);
  if (m) { take(w, m, 'date'); return new Date(today); }

  // tomorrow
  m = find(w, /\b(tomorrow|tmrw|tmr)\b/i);
  if (m) {
    take(w, m, 'date');
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d;
  }

  // "in N day(s)" / "in N week(s)"
  m = find(w, /\bin\s+(\d+)\s+(day|days|week|weeks)\b/i);
  if (m) {
    take(w, m, 'date');
    const n = Number(m[1]);
    const days = /week/i.test(m[2]) ? n * 7 : n;
    const d = new Date(today); d.setDate(d.getDate() + days);
    return d;
  }

  // "next week"
  m = find(w, /\bnext\s+week\b/i);
  if (m) {
    take(w, m, 'date');
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return d;
  }

  // "next <weekday>" / bare "<weekday>"
  const weekdayNames = Object.keys(WEEKDAY_ALIASES).sort((a, b) => b.length - a.length).join('|');
  m = find(w, new RegExp(`\\b(next\\s+)?(${weekdayNames})\\b`, 'i'));
  if (m) {
    take(w, m, 'date');
    const target = WEEKDAY_ALIASES[m[2].toLowerCase()];
    const skipThisWeek = !!m[1];
    let delta = (target - today.getDay() + 7) % 7;
    if (delta === 0 && skipThisWeek) delta = 7; // bare weekday matching today means today; "next" always pushes ahead
    else if (delta === 0) delta = 0;
    else if (skipThisWeek) delta += 7;
    const d = new Date(today); d.setDate(d.getDate() + delta);
    return d;
  }

  return null;
}

// Only parses a time when the text unambiguously signals one (an "at "
// prefix, an am/pm suffix, or a colon) -- otherwise a plain number in the
// title ("buy 5 apples") would get misread as a time.
function extractTime(w: Work): { hours: number; minutes: number } | null {
  const m = find(w, /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
    ?? find(w, /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    ?? find(w, /\b(\d{1,2}):(\d{2})\b/);
  if (!m) return null;

  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  take(w, m, 'time');
  return { hours, minutes };
}

const PRIORITY_WORDS: Record<string, 1 | 2 | 3> = {
  low: 1, l: 1, p3: 1,
  medium: 2, med: 2, m: 2, p2: 2,
  high: 3, h: 3, p1: 3, urgent: 3, important: 3, asap: 3,
};

function extractPriority(w: Work): 1 | 2 | 3 | null {
  const words = Object.keys(PRIORITY_WORDS).sort((a, b) => b.length - a.length).join('|');
  let m = find(w, new RegExp(`(?:^|\\s)!(${words})(?=\\s|$)`, 'i'));
  if (m) { take(w, m, 'priority'); return PRIORITY_WORDS[m[1].toLowerCase()]; }
  // Bare "!!"/"!!!" as an isolated token -- a single "!" is too common in
  // ordinary text ("done!") to treat as a priority marker.
  m = find(w, /(?:^|\s)(!{2,3})(?=\s|$)/);
  if (m) { take(w, m, 'priority'); return m[1].length === 3 ? 3 : 2; }
  return null;
}

function extractTags(w: Work): string[] {
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = find(w, /(?:^|\s)#([a-z0-9_-]+)/i))) { tags.push(m[1]); take(w, m, 'tag'); }
  return tags;
}

function extractProject(w: Work, projects: ProjectDoc[]): ProjectDoc | null {
  const m = find(w, /(?:^|\s)@([a-z0-9_-]+)/i);
  if (!m) return null;
  const needle = m[1].toLowerCase();
  // Whole-name match first, then "starts with a word in the name" -- lets
  // "@fitness" hit "Fitness Tracker" without requiring the full name.
  const hit = projects.find(p => p.name.toLowerCase().replace(/\s+/g, '') === needle)
    ?? projects.find(p => p.name.toLowerCase().split(/\s+/).some(x => x.startsWith(needle)));
  if (hit) { take(w, m, 'project'); return hit; }
  const [s, e] = bounds(m);
  blank(w, s, e, HIDE);
  return null;
}

// baseDay: the day Quick add was opened for (an Agenda day), which a bare
// time lands on instead of today.
export function parseQuickAdd(input: string, projects: ProjectDoc[], now: Date = new Date(), baseDay?: Date): ParsedQuickAdd {
  const trimmed = input.trim();

  // Whole-title escape: wrap the entire text in double quotes to skip
  // parsing completely.
  const quoteMatch = /^"([\s\S]*)"$/.exec(trimmed);
  if (quoteMatch) {
    return {
      title: quoteMatch[1].trim(),
      due_date: null, reminder_at: null, priority: null, tags: [],
      projectId: null, matchedProjectLabel: null, raw: true, spans: [],
    };
  }

  const escaped = input.replace(/\\([#@!])/g, (_, ch: string) => '\\' + SIGIL_ESCAPE[ch]);
  const w: Work = { text: escaped, spans: [], dropBackslash: new Set() };

  const tags = extractTags(w);
  const priority = extractPriority(w);
  const project = extractProject(w, projects);
  const time = extractTime(w);
  const date = extractDate(w, now);

  let due_date: string | null = date ? isoDate(date) : null;
  let reminder_at: string | null = null;
  if (time) {
    // A bare time already past today means tomorrow; a typed date is kept.
    let base = date ?? baseDay ?? now;
    let d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), time.hours, time.minutes);
    if (!date && d.getTime() <= now.getTime()) {
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), time.hours, time.minutes);
    }
    reminder_at = d.toISOString();
    if (!due_date) due_date = isoDate(base);
  }

  const spans = w.spans.sort((a, b) => a.start - b.start);
  let title = '', i = 0;
  const keep = (from: number, to: number) => {
    for (let j = from; j < to; j++) if (!w.dropBackslash.has(j)) title += escaped[j];
  };
  for (const s of spans) { keep(i, s.start); title += ' '; i = s.end; }
  keep(i, escaped.length);

  return {
    title: title.replace(ESCAPED_SIGIL_RE, (_, s: string) => SIGIL_UNESCAPE[s]).replace(/\s+/g, ' ').trim(),
    due_date,
    reminder_at,
    priority,
    tags,
    projectId: project?._id ?? null,
    matchedProjectLabel: project?.name ?? null,
    raw: false,
    spans,
  };
}
