import { describe, expect, it } from 'vitest';
import { safeFileName } from '../src/lib/carddetail/helpers';

// An attachment's filename is data, not a path. It rides on the task doc, so
// it can arrive from another device over sync or from a hand-edited backup --
// and openAttachmentFile() turns it into a real path on disk on both Android
// (Filesystem.writeFile) and desktop (join + writeFile). Anything that could
// climb out of the directory has to be stripped before it gets there.
describe('safeFileName', () => {
  const BS = String.fromCharCode(92); // a literal backslash, kept out of the regex soup

  it('keeps an ordinary filename intact', () => {
    expect(safeFileName('holiday photo.jpg')).toBe('holiday photo.jpg');
    expect(safeFileName('Q3 report (final).pdf')).toBe('Q3 report (final).pdf');
  });

  it('drops every directory component, both separators', () => {
    expect(safeFileName('../../evil.txt')).toBe('evil.txt');
    expect(safeFileName(`..${BS}..${BS}evil.txt`)).toBe('evil.txt');
    expect(safeFileName('/etc/passwd')).toBe('passwd');
    expect(safeFileName(`C:${BS}Windows${BS}system32${BS}x.dll`)).toBe('x.dll');
    expect(safeFileName('nested/dir/report.pdf')).toBe('report.pdf');
  });

  it('refuses to produce a dot-leading name', () => {
    // "..", "..." and dotfiles would either climb or hide the file.
    expect(safeFileName('...hidden')).toBe('hidden');
    expect(safeFileName('.bashrc')).toBe('bashrc');
    expect(safeFileName('..')).toBe('attachment');
  });

  it('replaces characters a filesystem will not take', () => {
    expect(safeFileName('a<b>c:d.txt')).toBe('a_b_c_d.txt');
    expect(safeFileName(`pipe|star*.png`)).toBe('pipe_star_.png');
    expect(safeFileName(`null${String.fromCharCode(0)}byte.png`)).toBe('null_byte.png');
  });

  it('always returns something usable', () => {
    expect(safeFileName('')).toBe('attachment');
    expect(safeFileName('   ')).toBe('attachment');
    expect(safeFileName('/')).toBe('attachment');
  });
});
