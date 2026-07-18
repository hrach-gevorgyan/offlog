// Local, offline, regex-based natural-language parsing for Quick Add --
// no network call, no bundled model. See DECISIONS.md for why this stays
// rule-based rather than reaching for an LLM API (matches the project's
// no-AI/no-backend mission — GOAL.md).
//
// Scope is deliberately small: a handful of date/time phrases, #tags,
// !priority, and an @project mention. Ambiguous or unrecognized text is
// left alone in the title rather than guessed at — a wrong silent guess
// is worse than no parse for a task manager (the whole point of the due
// date is trusting it).
//
// Two escape hatches for text that legitimately needs a sigil character
// or a date-like word (owner, 2026-07-19 — "how about escapechars if I
// want to miss this nlp"):
//   - `\#`, `\@`, `\!` keep that one character literal (e.g. "Reply to
//     ticket \#42") while the rest of the title still gets parsed.
//   - Wrapping the WHOLE title in double quotes turns off parsing
//     entirely, for a title that happens to contain a real date/time
//     word ("Tomorrow Land festival budget") rather than just a sigil.

import type { ProjectDoc } from './types';

export interface ParsedQuickAdd {
  title: string;
  due_date: string | null;      // YYYY-MM-DD, local
  reminder_at: string | null;   // ISO instant, local wall-clock converted
  priority: 1 | 2 | 3 | null;   // null = not mentioned, caller decides the default
  tags: string[];
  projectId: string | null;
  matchedProjectLabel: string | null; // for showing what matched, e.g. "Fitness Tracker"
  raw: boolean; // true when the whole-title quote escape was used -- caller can show "parsing off" instead of chips
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
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

function stripMatch(text: string, match: RegExpExecArray): string {
  return (text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length)).replace(/\s+/g, ' ').trim();
}

// `\#`/`\@`/`\!` -> sentinel chars before extraction (so none of the
// sigil regexes below can ever match an escaped one), then back to the
// literal character afterwards. \uXXXX escapes (private-use-area code
// points, never occur in ordinary typed text) keep this file itself
// plain ASCII rather than relying on a pasted-in literal character
// surviving every future edit/diff/encoding round-trip unchanged.
const HASH_SENTINEL = '';
const AT_SENTINEL = '';
const BANG_SENTINEL = '';
const SIGIL_ESCAPE: Record<string, string> = { '#': HASH_SENTINEL, '@': AT_SENTINEL, '!': BANG_SENTINEL };
const SIGIL_UNESCAPE: Record<string, string> = { [HASH_SENTINEL]: '#', [AT_SENTINEL]: '@', [BANG_SENTINEL]: '!' };
const SENTINEL_RE = new RegExp(`[${HASH_SENTINEL}${AT_SENTINEL}${BANG_SENTINEL}]`, 'g');

function protectEscapedSigils(text: string): string {
  return text.replace(/\\([#@!])/g, (_, ch: string) => SIGIL_ESCAPE[ch]);
}
function restoreEscapedSigils(text: string): string {
  return text.replace(SENTINEL_RE, (ch) => SIGIL_UNESCAPE[ch]);
}

// Tries each date pattern in order, first hit wins -- explicit dates before
// relative ones so "next friday" doesn't get shadowed by a coincidental
// weekday match inside a longer phrase.
function extractDate(text: string, today: Date): { date: Date | null; rest: string } {
  // ISO: 2026-07-25
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) return { date: d, rest: stripMatch(text, m) };
  }

  // Slash: 7/25 or 7/25/2026
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
    if (!isNaN(d.getTime())) return { date: d, rest: stripMatch(text, m) };
  }

  // "Jul 25", "July 25th", "July 25, 2026"
  const monthNames = Object.keys(MONTH_ALIASES).sort((a, b) => b.length - a.length).join('|');
  m = new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(text);
  if (m) {
    const month = MONTH_ALIASES[m[1].toLowerCase()];
    const year = m[3] ? Number(m[3]) : today.getFullYear();
    const d = new Date(year, month, Number(m[2]));
    if (!isNaN(d.getTime())) return { date: d, rest: stripMatch(text, m) };
  }

  // today / tonight
  m = /\b(today|tonight|tod)\b/i.exec(text);
  if (m) return { date: new Date(today), rest: stripMatch(text, m) };

  // tomorrow
  m = /\b(tomorrow|tmrw|tmr)\b/i.exec(text);
  if (m) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return { date: d, rest: stripMatch(text, m) };
  }

  // "in N day(s)" / "in N week(s)"
  m = /\bin\s+(\d+)\s+(day|days|week|weeks)\b/i.exec(text);
  if (m) {
    const n = Number(m[1]);
    const days = /week/i.test(m[2]) ? n * 7 : n;
    const d = new Date(today); d.setDate(d.getDate() + days);
    return { date: d, rest: stripMatch(text, m) };
  }

  // "next week"
  m = /\bnext\s+week\b/i.exec(text);
  if (m) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return { date: d, rest: stripMatch(text, m) };
  }

  // "next <weekday>" / bare "<weekday>"
  const weekdayNames = Object.keys(WEEKDAY_ALIASES).sort((a, b) => b.length - a.length).join('|');
  m = new RegExp(`\\b(next\\s+)?(${weekdayNames})\\b`, 'i').exec(text);
  if (m) {
    const target = WEEKDAY_ALIASES[m[2].toLowerCase()];
    const skipThisWeek = !!m[1];
    let delta = (target - today.getDay() + 7) % 7;
    if (delta === 0 && skipThisWeek) delta = 7; // bare weekday matching today means today; "next" always pushes ahead
    else if (delta === 0) delta = 0;
    else if (skipThisWeek) delta += 7;
    const d = new Date(today); d.setDate(d.getDate() + delta);
    return { date: d, rest: stripMatch(text, m) };
  }

  return { date: null, rest: text };
}

// Only parses a time when the text unambiguously signals one (an "at "
// prefix, an am/pm suffix, or a colon) -- otherwise a plain number in the
// title ("buy 5 apples") would get misread as a time.
function extractTime(text: string, today: Date): { hours: number | null; minutes: number; rest: string } {
  let m = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  if (!m) m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text);
  if (!m) m = /\b(\d{1,2}):(\d{2})\b/.exec(text);
  if (!m) return { hours: null, minutes: 0, rest: text };

  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return { hours: null, minutes: 0, rest: text };
  return { hours, minutes, rest: stripMatch(text, m) };
}

const PRIORITY_WORDS: Record<string, 1 | 2 | 3> = {
  low: 1, l: 1, p3: 1,
  medium: 2, med: 2, m: 2, p2: 2,
  high: 3, h: 3, p1: 3, urgent: 3, important: 3, asap: 3,
};

function extractPriority(text: string): { priority: 1 | 2 | 3 | null; rest: string } {
  const words = Object.keys(PRIORITY_WORDS).sort((a, b) => b.length - a.length).join('|');
  let m = new RegExp(`(?:^|\\s)!(${words})(?=\\s|$)`, 'i').exec(text);
  if (m) return { priority: PRIORITY_WORDS[m[1].toLowerCase()], rest: stripMatch(text, m) };
  // Bare "!!"/"!!!" as an isolated token -- a single "!" is too common in
  // ordinary text ("done!") to treat as a priority marker.
  m = /(?:^|\s)(!{2,3})(?=\s|$)/.exec(text);
  if (m) return { priority: m[1].length === 3 ? 3 : 2, rest: stripMatch(text, m) };
  return { priority: null, rest: text };
}

function extractTags(text: string): { tags: string[]; rest: string } {
  const tags: string[] = [];
  let rest = text;
  const re = /(?:^|\s)#([a-z0-9_-]+)/gi;
  let m: RegExpExecArray | null;
  const spans: RegExpExecArray[] = [];
  while ((m = re.exec(text))) spans.push(m);
  for (const span of spans) tags.push(span[1]);
  for (let i = spans.length - 1; i >= 0; i--) rest = stripMatch(rest, spans[i]);
  return { tags, rest };
}

function extractProject(text: string, projects: ProjectDoc[]): { projectId: string | null; label: string | null; rest: string } {
  const m = /(?:^|\s)@([a-z0-9_-]+)/i.exec(text);
  if (!m) return { projectId: null, label: null, rest: text };
  const needle = m[1].toLowerCase();
  // Whole-name match first, then "starts with a word in the name" -- lets
  // "@fitness" hit "Fitness Tracker" without requiring the full name.
  const hit = projects.find(p => p.name.toLowerCase().replace(/\s+/g, '') === needle)
    ?? projects.find(p => p.name.toLowerCase().split(/\s+/).some(w => w.startsWith(needle)));
  if (!hit) return { projectId: null, label: null, rest: text }; // unmatched @word -- leave it in the title untouched
  return { projectId: hit._id, label: hit.name, rest: stripMatch(text, m) };
}

export function parseQuickAdd(input: string, projects: ProjectDoc[], now: Date = new Date()): ParsedQuickAdd {
  const trimmed = input.trim();

  // Whole-title escape: wrap the entire text in double quotes to skip
  // parsing completely (the individual \#/\@/\! escapes below can't help
  // with a real date/time WORD like "tomorrow" appearing legitimately).
  const quoteMatch = /^"([\s\S]*)"$/.exec(trimmed);
  if (quoteMatch) {
    return {
      title: quoteMatch[1].trim(),
      due_date: null, reminder_at: null, priority: null, tags: [],
      projectId: null, matchedProjectLabel: null, raw: true,
    };
  }

  let rest = protectEscapedSigils(input);

  const tagResult = extractTags(rest); rest = tagResult.rest;
  const prioResult = extractPriority(rest); rest = prioResult.rest;
  const projResult = extractProject(rest, projects); rest = projResult.rest;
  const timeResult = extractTime(rest, now); rest = timeResult.rest;
  const dateResult = extractDate(rest, now); rest = dateResult.rest;

  let due_date: string | null = dateResult.date ? isoDate(dateResult.date) : null;
  let reminder_at: string | null = null;
  if (timeResult.hours !== null) {
    const base = dateResult.date ?? now;
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), timeResult.hours, timeResult.minutes);
    reminder_at = d.toISOString();
    if (!due_date) due_date = isoDate(base);
  }

  return {
    title: restoreEscapedSigils(rest.trim()),
    due_date,
    reminder_at,
    priority: prioResult.priority,
    tags: tagResult.tags,
    projectId: projResult.projectId,
    matchedProjectLabel: projResult.label,
    raw: false,
  };
}
