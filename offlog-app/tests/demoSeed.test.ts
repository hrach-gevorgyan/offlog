import { describe, expect, it } from 'vitest';
import { seedIfEmpty, getSpaces, getProjects, getDashboardData, getAllDeletedTasks, getArchivedProjects } from '../src/lib/db';
import { seedDemo } from '../src/lib/demoSeed';

// The demo workspace behind `npm run build:demo`, run against a real
// (in-memory) database on top of the first-run seed, as a test install does.
describe('demo workspace seed', () => {
  it('fills a fresh install with the demo persona', async () => {
    await seedIfEmpty();
    await seedDemo();
    const names = (await getSpaces()).map(s => s.name);
    for (const n of ['Work', 'New House', 'Family', 'Personal']) expect(names).toContain(n);
    const projects = (await getProjects()).map(p => p.name);
    expect(projects).toEqual(expect.arrayContaining(['Q4 Product Sprint', 'New House Build', "Emma's School Year", 'Recipe App']));
    expect((await getArchivedProjects()).map(p => p.name)).toContain('Old Apartment Move-Out');
    const d = await getDashboardData();
    expect(d.totalTasks).toBeGreaterThan(40);
    expect(d.pinnedAll.length).toBe(4);
    expect(d.todayOpenCount).toBeGreaterThan(0);
    expect(d.overdueTasks.length).toBeGreaterThan(0);
    expect((await getAllDeletedTasks()).length).toBe(4);
    // Custom statuses landed (positional done = last).
    const house = (await getProjects()).find(p => p.name === 'New House Build')!;
    expect(house.columns.map(c => c.name)).toEqual(['Planning', 'Foundation', 'Framing', 'Finishing', 'Done']);
  });
});
