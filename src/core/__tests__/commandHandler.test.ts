import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSidePanelPortsForTest,
  handleExtensionCommand,
  registerSidePanelPort,
} from '../../background/commandHandler';

describe('handleExtensionCommand', () => {
  afterEach(() => {
    clearSidePanelPortsForTest();
    vi.unstubAllGlobals();
  });

  it('calls chrome.sidePanel.open synchronously BEFORE awaiting storage on focus-search', async () => {
    const callOrder: string[] = [];
    const resolvers: Array<() => void> = [];

    const sidePanelOpen = vi.fn(() => {
      callOrder.push('sidePanel.open');
      return Promise.resolve();
    });
    const storageSet = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          callOrder.push('storage.set');
          resolvers.push(resolve);
        }),
    );
    const sendMessage = vi.fn(async () => {
      callOrder.push('sendMessage');
    });

    vi.stubGlobal('chrome', {
      sidePanel: { open: sidePanelOpen },
      storage: { local: { set: storageSet, get: vi.fn(async () => ({})) } },
      runtime: { sendMessage },
      windows: { getLastFocused: vi.fn(async () => ({ id: 99 })) },
    });

    const promise = handleExtensionCommand('focus-search', {
      windowId: 42,
    } as chrome.tabs.Tab);

    // Must be called synchronously in the same tick to preserve Chrome user gesture
    expect(sidePanelOpen).toHaveBeenCalledTimes(1);
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 42 });
    expect(callOrder[0]).toBe('sidePanel.open');

    for (const resolve of resolvers) resolve();
    await promise;
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'FOCUS_SEARCH',
      targetWindowId: 42,
    });
  });

  it('calls chrome.sidePanel.open synchronously BEFORE awaiting storage on open-ai', async () => {
    const callOrder: string[] = [];
    const sidePanelOpen = vi.fn(() => {
      callOrder.push('sidePanel.open');
      return Promise.resolve();
    });
    const storageGet = vi.fn(async (key: string) => {
      callOrder.push(`storage.get:${key}`);
      if (key === 'bcp_last_ai_id') return { [key]: 'deepseek' };
      return {};
    });
    const storageSet = vi.fn(async () => {
      callOrder.push('storage.set');
    });
    const sendMessage = vi.fn(async () => {
      callOrder.push('sendMessage');
    });

    vi.stubGlobal('chrome', {
      sidePanel: { open: sidePanelOpen },
      storage: { local: { get: storageGet, set: storageSet } },
      runtime: { sendMessage },
      windows: { getLastFocused: vi.fn(async () => ({ id: 99 })) },
    });

    const promise = handleExtensionCommand('open-ai', {
      windowId: 7,
    } as chrome.tabs.Tab);

    // Must be called synchronously BEFORE any storage.get/set await
    expect(sidePanelOpen).toHaveBeenCalledTimes(1);
    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 7 });
    expect(callOrder[0]).toBe('sidePanel.open');

    await promise;
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'OPEN_AI',
      targetWindowId: 7,
    });
  });

  it('posts directly to the matching window port without broadcasting to other windows', async () => {
    const sidePanelOpen = vi.fn(async () => {});
    const sendMessage = vi.fn(async () => {});
    const port42Post = vi.fn();
    const port99Post = vi.fn();

    vi.stubGlobal('chrome', {
      sidePanel: { open: sidePanelOpen },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { sendMessage },
      windows: { getLastFocused: vi.fn(async () => ({ id: 42 })) },
    });

    const makeMockPort = (postMessage: ReturnType<typeof vi.fn>) => {
      const listeners: Array<(msg: { type?: string; windowId?: number }) => void> = [];
      const port = {
        name: 'sidepanel',
        postMessage,
        onMessage: {
          addListener: (fn: (msg: { type?: string; windowId?: number }) => void) => {
            listeners.push(fn);
          },
        },
        onDisconnect: {
          addListener: vi.fn(),
        },
      } as unknown as chrome.runtime.Port;
      return { port, emit: (msg: { type?: string; windowId?: number }) => listeners.forEach((fn) => fn(msg)) };
    };

    const p42 = makeMockPort(port42Post);
    const p99 = makeMockPort(port99Post);
    registerSidePanelPort(p42.port);
    registerSidePanelPort(p99.port);
    p42.emit({ type: 'PANEL_READY', windowId: 42 });
    p99.emit({ type: 'PANEL_READY', windowId: 99 });

    await handleExtensionCommand('focus-search', {
      windowId: 42,
    } as chrome.tabs.Tab);

    expect(sidePanelOpen).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(port42Post).toHaveBeenCalledWith({
      type: 'FOCUS_SEARCH',
      targetWindowId: 42,
    });
    expect(port99Post).not.toHaveBeenCalled();
  });

  it('delivers pending command immediately on PANEL_READY when panel opens from closed state', async () => {
    const sidePanelOpen = vi.fn(() => Promise.resolve());
    const sendMessage = vi.fn(() => Promise.reject(new Error('not ready')));
    const portPost = vi.fn();

    vi.stubGlobal('chrome', {
      sidePanel: { open: sidePanelOpen },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } },
      runtime: { sendMessage },
      windows: { getLastFocused: vi.fn(async () => ({ id: 42 })) },
    });

    const listeners: Array<(msg: { type?: string; windowId?: number }) => void> = [];
    const port = {
      name: 'sidepanel',
      postMessage: portPost,
      onMessage: {
        addListener: (fn: (msg: { type?: string; windowId?: number }) => void) => {
          listeners.push(fn);
        },
      },
      onDisconnect: { addListener: vi.fn() },
    } as unknown as chrome.runtime.Port;

    const cmdPromise = handleExtensionCommand('focus-search', {
      windowId: 42,
    } as chrome.tabs.Tab);

    // Panel mounts and connects immediately while command is still in flight
    registerSidePanelPort(port);
    listeners.forEach((fn) => fn({ type: 'PANEL_READY', windowId: 42 }));

    // Must be delivered synchronously on PANEL_READY without waiting for 150ms retry
    expect(portPost).toHaveBeenCalledTimes(1);
    expect(portPost).toHaveBeenCalledWith({
      type: 'FOCUS_SEARCH',
      targetWindowId: 42,
    });

    await cmdPromise;
    // Should not send duplicate message after pending command was already delivered
    expect(portPost).toHaveBeenCalledTimes(1);
  });
});
