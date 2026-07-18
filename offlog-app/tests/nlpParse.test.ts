import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from '../src/lib/nlpParse';
import type { ProjectDoc } from '../src/lib/types';

// Fixed reference instant so date-math assertions don't depend on when the
// suite runs. 2026-07-15 is a Wednesday.
const NOW = new Date(2026, 6, 15, 10, 0, 0);

const projects: ProjectDoc[] = [
  { _id: 'project:1', _rev: '1', type: 'project', space_id: 'space:1', name: 'Fitness Tracker', position: 1, columns: [], default_view: 'kanban', updated_at: '', source: 'pc' },
  { _id: 'project:2', _rev: '1', type: 'project', space_id: 'space:1', name: 'Draft', position: 2, columns: [], default_view: 'kanban', updated_at: '', source: 'pc' },
];

describe('parseQuickAdd() -- dates', () => {
  it('parses "today"', () => {
    expect(parseQuickAdd('Water plants today', [], NOW).due_date).toBe('2026-07-15');
  });

  it('parses "tomorrow"', () => {
    expect(parseQuickAdd('Water plants tomorrow', [], NOW).due_date).toBe('2026-07-16');
  });

  it('parses a bare upcoming weekday as the next occurrence', () => {
    // NOW is Wednesday; "friday" should land two days later, not this week's already-passed days.
    expect(parseQuickAdd('Ship report friday', [], NOW).due_date).toBe('2026-07-17');
  });

  it('parses a bare weekday matching today as today', () => {
    expect(parseQuickAdd('Standup wednesday', [], NOW).due_date).toBe('2026-07-15');
  });

  it('"next <weekday>" skips this week even if today matches', () => {
    expect(parseQuickAdd('Standup next wednesday', [], NOW).due_date).toBe('2026-07-22');
  });

  it('parses "in N days"', () => {
    expect(parseQuickAdd('Follow up in 3 days', [], NOW).due_date).toBe('2026-07-18');
  });

  it('parses "in N weeks"', () => {
    expect(parseQuickAdd('Review in 2 weeks', [], NOW).due_date).toBe('2026-07-29');
  });

  it('parses an explicit ISO date', () => {
    expect(parseQuickAdd('Renew passport 2026-08-01', [], NOW).due_date).toBe('2026-08-01');
  });

  it('parses an explicit slash date without a year', () => {
    expect(parseQuickAdd('Pay rent 8/1', [], NOW).due_date).toBe('2026-08-01');
  });

  it('parses a "Month Day" phrase', () => {
    expect(parseQuickAdd('Dentist Aug 3', [], NOW).due_date).toBe('2026-08-03');
  });

  it('leaves due_date null when nothing matches', () => {
    expect(parseQuickAdd('Buy milk', [], NOW).due_date).toBeNull();
  });
});

describe('parseQuickAdd() -- time / reminders', () => {
  it('parses "at 5pm" combined with a parsed date', () => {
    const r = parseQuickAdd('Call mom tomorrow at 5pm', [], NOW);
    expect(r.due_date).toBe('2026-07-16');
    expect(r.reminder_at).toBe(new Date(2026, 6, 16, 17, 0).toISOString());
  });

  it('parses a bare "5pm" without "at"', () => {
    const r = parseQuickAdd('Call mom 5pm', [], NOW);
    expect(r.reminder_at).toBe(new Date(2026, 6, 15, 17, 0).toISOString());
  });

  it('defaults the reminder date to today when only a time is given', () => {
    const r = parseQuickAdd('Call mom at 9am', [], NOW);
    expect(r.due_date).toBe('2026-07-15');
    expect(r.reminder_at).toBe(new Date(2026, 6, 15, 9, 0).toISOString());
  });

  it('parses 24h colon time without am/pm', () => {
    const r = parseQuickAdd('Call mom 17:30', [], NOW);
    expect(r.reminder_at).toBe(new Date(2026, 6, 15, 17, 30).toISOString());
  });

  it('does not misread a plain number as a time', () => {
    const r = parseQuickAdd('Buy 5 apples', [], NOW);
    expect(r.reminder_at).toBeNull();
    expect(r.title).toBe('Buy 5 apples');
  });
});

describe('parseQuickAdd() -- priority', () => {
  it('parses "!high"', () => {
    expect(parseQuickAdd('Fix bug !high', [], NOW).priority).toBe(3);
  });

  it('parses "!low"', () => {
    expect(parseQuickAdd('Read book !low', [], NOW).priority).toBe(1);
  });

  it('parses bare "!!!" as high', () => {
    expect(parseQuickAdd('Ship it !!!', [], NOW).priority).toBe(3);
  });

  it('parses bare "!!" as medium', () => {
    expect(parseQuickAdd('Ship it !!', [], NOW).priority).toBe(2);
  });

  it('does not treat a single "!" as a priority marker', () => {
    const r = parseQuickAdd('Done!', [], NOW);
    expect(r.priority).toBeNull();
    expect(r.title).toBe('Done!');
  });

  it('is null when unmentioned', () => {
    expect(parseQuickAdd('Buy milk', [], NOW).priority).toBeNull();
  });
});

describe('parseQuickAdd() -- tags', () => {
  it('parses a single tag', () => {
    expect(parseQuickAdd('Buy milk #errand', [], NOW).tags).toEqual(['errand']);
  });

  it('parses multiple tags', () => {
    expect(parseQuickAdd('Buy milk #errand #urgent', [], NOW).tags).toEqual(['errand', 'urgent']);
  });

  it('is empty when unmentioned', () => {
    expect(parseQuickAdd('Buy milk', [], NOW).tags).toEqual([]);
  });
});

describe('parseQuickAdd() -- project matching', () => {
  it('matches a project by a leading substring of its name', () => {
    const r = parseQuickAdd('Log run @fitness', projects, NOW);
    expect(r.projectId).toBe('project:1');
    expect(r.matchedProjectLabel).toBe('Fitness Tracker');
  });

  it('matches a project by its whole name with spaces removed', () => {
    const r = parseQuickAdd('Log run @fitnesstracker', projects, NOW);
    expect(r.projectId).toBe('project:1');
  });

  it('leaves an unmatched @mention untouched in the title', () => {
    const r = parseQuickAdd('Email @bob about launch', projects, NOW);
    expect(r.projectId).toBeNull();
    expect(r.title).toBe('Email @bob about launch');
  });

  it('does not let an unmatched @mention that spells a weekday leak into date parsing', () => {
    // "@friday" doesn't match any project name, so it should stay literal
    // text -- but once extractProject leaves it untouched, extractDate's
    // bare-weekday regex has a clean \b boundary right after "@" and can
    // misread "friday" as a real date if not specifically guarded against.
    const r = parseQuickAdd('Call @friday', projects, NOW);
    expect(r.due_date).toBeNull();
    expect(r.title).toBe('Call @friday');
  });

  it('does not let an unmatched @mention that spells a month leak into date parsing', () => {
    const r = parseQuickAdd('Ping @august about the launch', projects, NOW);
    expect(r.due_date).toBeNull();
    expect(r.title).toBe('Ping @august about the launch');
  });
});

describe('parseQuickAdd() -- title stripping', () => {
  it('strips every recognized token and leaves a clean title', () => {
    const r = parseQuickAdd('Log workout tomorrow at 6am !high #fitness @fitness', projects, NOW);
    expect(r.title).toBe('Log workout');
  });

  it('leaves plain text completely untouched', () => {
    const r = parseQuickAdd('Buy milk and eggs', [], NOW);
    expect(r.title).toBe('Buy milk and eggs');
    expect(r.due_date).toBeNull();
    expect(r.reminder_at).toBeNull();
    expect(r.priority).toBeNull();
    expect(r.tags).toEqual([]);
  });
});

describe('parseQuickAdd() -- escape hatches', () => {
  it('keeps an individually escaped # literal while still parsing the rest', () => {
    const r = parseQuickAdd('Reply to ticket \\#42 tomorrow', [], NOW);
    expect(r.title).toBe('Reply to ticket #42');
    expect(r.due_date).toBe('2026-07-16');
    expect(r.tags).toEqual([]);
  });

  it('keeps an individually escaped @ literal', () => {
    const r = parseQuickAdd('Email \\@bob', projects, NOW);
    expect(r.title).toBe('Email @bob');
    expect(r.projectId).toBeNull();
  });

  it('keeps an individually escaped ! literal', () => {
    const r = parseQuickAdd('Say hi\\!', [], NOW);
    expect(r.title).toBe('Say hi!');
    expect(r.priority).toBeNull();
  });

  it('does not confuse an escaped sigil with an unescaped one elsewhere in the title', () => {
    const r = parseQuickAdd('Ticket \\#42 #urgent', [], NOW);
    expect(r.title).toBe('Ticket #42');
    expect(r.tags).toEqual(['urgent']);
  });

  it('a whole title wrapped in quotes skips parsing entirely', () => {
    const r = parseQuickAdd('"Tomorrow Land festival budget #stage"', projects, NOW);
    expect(r.title).toBe('Tomorrow Land festival budget #stage');
    expect(r.raw).toBe(true);
    expect(r.due_date).toBeNull();
    expect(r.tags).toEqual([]);
  });

  it('raw is false for a normal parse', () => {
    expect(parseQuickAdd('Buy milk tomorrow', [], NOW).raw).toBe(false);
  });
});
