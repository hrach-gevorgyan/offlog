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

  it('a month/day without a year already behind today means next year', () => {
    const oct1 = new Date(2026, 9, 1, 9, 0);
    expect(parseQuickAdd('Dentist aug 3', [], oct1).due_date).toBe('2027-08-03');
    expect(parseQuickAdd('Pay rent 7/25', [], oct1).due_date).toBe('2027-07-25');
    // Today itself and later this year stay this year.
    expect(parseQuickAdd('Dentist oct 1', [], oct1).due_date).toBe('2026-10-01');
    expect(parseQuickAdd('Dentist aug 3', [], new Date(2026, 7, 3, 23, 0)).due_date).toBe('2026-08-03');
    // A typed year is taken as typed, even in the past.
    expect(parseQuickAdd('Dentist aug 3, 2026', [], oct1).due_date).toBe('2026-08-03');
    expect(parseQuickAdd('Pay rent 7/25/2026', [], oct1).due_date).toBe('2026-07-25');
  });

  it('leaves due_date null when nothing matches', () => {
    expect(parseQuickAdd('Buy milk', [], NOW).due_date).toBeNull();
  });
});

describe('parseQuickAdd() -- impossible dates', () => {
  const oct1 = new Date(2026, 9, 1, 9, 0);
  it('feb 29 without a year waits for the next leap year', () => {
    expect(parseQuickAdd('Party feb 29', [], oct1).due_date).toBe('2028-02-29');
  });
  it('a day the month does not have is not a date at all', () => {
    for (const t of ['Report sep 31', 'Report 2/30', 'Report 13/45', 'Report 2026-02-30']) {
      const r = parseQuickAdd(t, [], oct1);
      expect(r.due_date).toBeNull();
    }
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

  it('defaults the reminder date to today when only a time still ahead today is given', () => {
    const r = parseQuickAdd('Call mom at 11am', [], NOW);
    expect(r.due_date).toBe('2026-07-15');
    expect(r.reminder_at).toBe(new Date(2026, 6, 15, 11, 0).toISOString());
  });

  it('a bare time already past today rolls to tomorrow', () => {
    const r = parseQuickAdd('Call mom at 9am', [], NOW);
    expect(r.due_date).toBe('2026-07-16');
    expect(r.reminder_at).toBe(new Date(2026, 6, 16, 9, 0).toISOString());
    // The exact current minute has passed too.
    expect(parseQuickAdd('Call mom 10:00', [], NOW).due_date).toBe('2026-07-16');
  });

  it('an explicit "today" keeps a past time on today', () => {
    const r = parseQuickAdd('Call mom today 9am', [], NOW);
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

describe('parseQuickAdd() -- backslash inside a word', () => {
  it('a backslash inside a word (a path) is plain text, not an escape', () => {
    const r = parseQuickAdd('Copy C:\\today notes', [], new Date(2026, 9, 1, 9, 0));
    expect(r.title).toContain('C:\\');
  });
});

describe('parseQuickAdd() -- base day', () => {
  it('a bare time lands on the day Quick add was opened for', () => {
    const r = parseQuickAdd('Dentist 3pm', [], new Date(2026, 9, 1, 9, 0), new Date(2026, 9, 10, 12, 0));
    expect(r.due_date).toBe('2026-10-10');
    expect(r.reminder_at).toBe(new Date(2026, 9, 10, 15, 0).toISOString());
  });
  it('a typed date still beats the base day', () => {
    expect(parseQuickAdd('Dentist tomorrow 3pm', [], new Date(2026, 9, 1, 9, 0), new Date(2026, 9, 10, 12, 0)).due_date).toBe('2026-10-02');
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

describe('parseQuickAdd() -- spans and per-token escape', () => {
  const at = (input: string) => parseQuickAdd(input, projects, NOW).spans.map(s => [input.slice(s.start, s.end), s.kind]);

  it('reports each recognised token as an offset span into the typed text, in order', () => {
    expect(at('  Log workout tomorrow at 6am !high #gym #legs @fitness')).toEqual([
      ['tomorrow', 'date'], ['at 6am', 'time'], ['!high', 'priority'], ['#gym', 'tag'], ['#legs', 'tag'], ['@fitness', 'project'],
    ]);
    expect(at('Ship it !!! aug 3 17:30')).toEqual([['!!!', 'priority'], ['aug 3', 'date'], ['17:30', 'time']]);
  });

  it('has no spans for plain text, an unmatched @mention, an escaped sigil or a quoted title', () => {
    expect(at('Buy milk')).toEqual([]);
    expect(at('Email @bob \\#42')).toEqual([]);
    expect(parseQuickAdd('"Tomorrow #x"', projects, NOW).spans).toEqual([]);
  });

  it('a backslash before a date or time token keeps it as title text', () => {
    const r = parseQuickAdd('\\Friday team lunch notes', [], NOW);
    expect(r.title).toBe('Friday team lunch notes');
    expect(r.due_date).toBeNull();
    expect(r.spans).toEqual([]);
    const t = parseQuickAdd('Meet \\at 5pm tomorrow', [], NOW);
    expect(t.title).toBe('Meet at 5pm');
    expect(t.reminder_at).toBeNull();
    expect(t.due_date).toBe('2026-07-16');
  });

  it('an escaped token hides from later patterns: the next occurrence still parses', () => {
    const r = parseQuickAdd('\\friday prep, due monday', [], NOW);
    expect(r.title).toBe('friday prep, due');
    expect(r.due_date).toBe('2026-07-20');
  });

  it('a backslash before unrecognised text stays', () => {
    expect(parseQuickAdd('Clean C:\\temp folder', [], NOW).title).toBe('Clean C:\\temp folder');
  });
});
