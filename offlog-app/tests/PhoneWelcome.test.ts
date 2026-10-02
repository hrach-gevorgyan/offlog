import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/svelte';

const release = vi.fn();
vi.mock('../src/lib/theme', async (orig) => ({ ...(await orig<typeof import('../src/lib/theme')>()), claimStatusBar: () => ({ set: vi.fn(), release }) }));

import Welcome from '../src/lib/phone/Welcome.svelte';

function renderWelcome() {
  const start = vi.fn(), connect = vi.fn();
  const utils = render(Welcome, { events: { start, connect } } as any);
  return { ...utils, start, connect };
}

afterEach(cleanup);

describe('phone Welcome (first launch)', () => {
  it('says what Offlog is and asks nothing', async () => {
    const { findByText, container } = renderWelcome();
    expect(await findByText('Welcome to Offlog')).toBeTruthy();
    expect(container.querySelector('input, select')).toBeNull();
  });

  it('Start leaves for the app', async () => {
    const { findByText, start, connect } = renderWelcome();
    await fireEvent.click(await findByText('Start'));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(connect).not.toHaveBeenCalled();
  });

  it('Connect to Offlog on my computer leaves for pairing', async () => {
    const { findByText, start, connect } = renderWelcome();
    await fireEvent.click(await findByText('Connect to Offlog on my computer'));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(start).not.toHaveBeenCalled();
  });

  it('Back is the same as Start', async () => {
    const { findByText, start } = renderWelcome();
    await findByText('Start');
    history.back();
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });
});
