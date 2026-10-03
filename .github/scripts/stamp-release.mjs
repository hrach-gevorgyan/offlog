// Writes the latest published release's version, date, installer link and
// file sizes into site/index.html's data-rel elements before Pages deploys.
// The values already in the file are the fallback: any failure here leaves
// them as they are and never fails the deploy.
//   node .github/scripts/stamp-release.mjs [site/index.html]
import fs from 'node:fs';

const file = process.argv[2] || 'site/index.html';
const repo = process.env.GITHUB_REPOSITORY || 'hrach-gevorgyan/offlog';
const headers = { Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

try {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const rel = await res.json();
  const exe = rel.assets.find(a => /_x64-setup\.exe$/.test(a.name));
  const apk = rel.assets.find(a => a.name === 'app-release.apk');
  if (!exe || !apk) throw new Error('release is missing the installer or the APK');
  const version = rel.tag_name.replace(/^v/, '');
  const day = rel.published_at.slice(0, 10);
  const pretty = new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const mb = n => `${(n / 1048576).toFixed(1)} MB`;

  let html = fs.readFileSync(file, 'utf8');
  const text = (key, value) => { html = html.replace(new RegExp(`(data-rel="${key}"[^>]*>)[^<]*`), `$1${value}`); };
  const attr = (key, name, value) => { html = html.replace(new RegExp(`(data-rel="${key}"[^>]*?${name}=")[^"]*`), `$1${value}`).replace(new RegExp(`(${name}=")[^"]*("[^>]*data-rel="${key}")`), `$1${value}$2`); };
  text('version', version);
  text('date', pretty); attr('date', 'datetime', day);
  attr('notes', 'href', rel.html_url);
  attr('exe', 'href', exe.browser_download_url);
  text('exe-name', exe.name);
  text('exe-size', mb(exe.size));
  text('apk-size', mb(apk.size));
  fs.writeFileSync(file, html);
  console.log(`Stamped ${rel.tag_name} (${day}): ${exe.name} ${mb(exe.size)}, APK ${mb(apk.size)}`);
} catch (e) {
  console.log(`::warning::Release info not stamped, keeping the values in ${file}: ${e.message}`);
}
