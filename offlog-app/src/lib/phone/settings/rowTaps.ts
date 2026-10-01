// The whole settings row toggles its switch, not only the 42px knob. The
// desktop children render label + .toggle-btn rows, so this delegates a tap
// anywhere else on such a row to the switch; keyboard users reach the switch
// itself.
export function rowTaps(node: HTMLElement) {
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea, label, [role="switch"]')) return;
    const sw = t.closest('.setting-row')?.querySelector<HTMLButtonElement>(':scope > .toggle-btn');
    if (sw && !sw.disabled) sw.click();
  };
  node.addEventListener('click', onClick);
  return { destroy: () => node.removeEventListener('click', onClick) };
}
