// Pulls the current tag's entry out of docs/RELEASE_NOTES.md and writes
// it to $GITHUB_OUTPUT as `body`, for release.yml's tauri-action step to
// pass as `releaseBody` -- this is what ends up in latest.json's `notes`
// field (read by the desktop app's update.body, offlog-app/src/lib/
// updateChecker.ts) AND the public GitHub Releases page text.
//
// Deliberately reads RELEASE_NOTES.md, not CHANGELOG.md: the latter is
// the technical/maintainer record (file names, root causes, full
// implementation detail) -- real users complained the release notes
// read like raw developer notes with no structure (2026-07-24). This
// file is hand-written per release in plain language with real Markdown
// structure (## New / ## Fixed), so passing it through verbatim (no
// stripping) gives GitHub Releases real headers and bullet lists instead
// of one dense paragraph.
const fs = require('fs');

const version = (process.env.GITHUB_REF_NAME || '').replace(/^v/, '');
const md = fs.readFileSync('docs/RELEASE_NOTES.md', 'utf8');
const heading = `## v${version}`;
// Split on each "## v" heading rather than a regex with a `$`
// end-of-string lookahead -- `$` under the `m` flag (needed for `^` to
// anchor per-line) matches end-of-*line*, not end-of-string, so a
// lookahead like `(?=\n## v|$)` was satisfied right after the entry's
// very first line, silently truncating every entry to one line (caught
// testing this script directly before wiring it into the workflow).
const sections = md.split(/\n(?=## v)/);
const section = sections.find(s => s.trim().startsWith(heading));
const body = section ? section.replace(new RegExp('^' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '').trim() : '';

fs.appendFileSync(process.env.GITHUB_OUTPUT, `body<<EOF\n${body}\nEOF\n`);
