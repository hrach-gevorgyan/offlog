// The Home hero's colour drifts a few degrees with the season and deepens in
// the evening. Never announced; small enough that the band is always "the
// indigo". Applied on <html> (app.css derives --hero from these), so the
// status-bar strip and every band follow it.

export interface HeroShift { dh: number; dl: number }

// Northern-hemisphere seasons by month; evening is 19:00-05:00.
export function heroShift(now = new Date()): HeroShift {
  const m = now.getMonth(), h = now.getHours();
  const season = m >= 2 && m <= 4 ? { dh: -4, dl: 0.015 }   // spring: fresher
    : m >= 5 && m <= 7 ? { dh: 0, dl: 0 }                    // summer: the base
    : m >= 8 && m <= 10 ? { dh: 10, dl: 0 }                  // autumn: a touch warmer
    : { dh: -8, dl: -0.01 };                                 // winter: a touch cooler
  const evening = h >= 19 || h < 5;
  return { dh: season.dh, dl: +(season.dl - (evening ? 0.06 : 0)).toFixed(3) };
}

export function applyHeroShift(now = new Date()): void {
  const { dh, dl } = heroShift(now);
  const s = document.documentElement.style;
  s.setProperty('--hero-dh', String(dh));
  s.setProperty('--hero-dl', String(dl));
}
