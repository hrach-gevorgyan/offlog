// Pulls the current tag's row out of docs/CHANGELOG.md and writes a
// plain-text version to $GITHUB_OUTPUT as `body`, for release.yml's
// tauri-action step to pass as `releaseBody` -- this is what ends up in
// latest.json's `notes` field, which the desktop app's update.body reads
// (offlog-app/src/lib/updateChecker.ts) to show real release notes in
// UpdateModal instead of an empty string.
//
// Table row shape (docs/CHANGELOG.md): `| **5.7.6** | <description> |`
// (single line, no embedded pipes/newlines in the description column so
// far -- if that ever changes, this regex needs to get smarter).
const fs = require('fs');

const version = (process.env.GITHUB_REF_NAME || '').replace(/^v/, '');
const md = fs.readFileSync('docs/CHANGELOG.md', 'utf8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const re = new RegExp('^\\| \\*\\*' + escaped + '\\*\\* \\| (.*) \\|$', 'm');
const match = md.match(re);

let body = match ? match[1] : '';
// Markdown bold/backticks read as literal `**`/`` ` `` in the desktop
// app's plain-text modal -- strip them there; GitHub's own release page
// still gets the raw CHANGELOG.md wording via the "Changes" link, so
// nothing is lost, just de-styled for this one destination.
body = body.replace(/\*\*/g, '').replace(/`/g, '');

fs.appendFileSync(process.env.GITHUB_OUTPUT, `body<<EOF\n${body}\nEOF\n`);
