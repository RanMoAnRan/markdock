import { resolvePreferredAiSiteId } from '../core/aiSites';
import {
  loadAiSites,
  loadLastAiId,
  saveActiveDockId,
  saveDockCollapsed,
} from '../core/storage';

const openPanelPorts = new Map<chrome.runtime.Port, number | null>();

interface PendingPanelCommand {
  type: 'FOCUS_SEARCH' | 'OPEN_AI';
  targetWindowId?: number;
  createdAt: number;
}

let pendingPanelCommand: PendingPanelCommand | null = null;
const PENDING_COMMAND_TTL_MS = 2000;

function tryDeliverPendingCommand(
  port: chrome.runtime.Port,
  windowId: number,
): void {
  if (!pendingPanelCommand) return;
  if (Date.now() - pendingPanelCommand.createdAt > PENDING_COMMAND_TTL_MS) {
    pendingPanelCommand = null;
    return;
  }
  if (
    pendingPanelCommand.targetWindowId !== undefined &&
    pendingPanelCommand.targetWindowId !== windowId
  ) {
    return;
  }
  const cmd = pendingPanelCommand;
  pendingPanelCommand = null;
  try {
    port.postMessage({
      type: cmd.type,
      targetWindowId: cmd.targetWindowId ?? windowId,
    });
  } catch {
    openPanelPorts.delete(port);
  }
}

export function registerSidePanelPort(port: chrome.runtime.Port): void {
  if (port.name !== 'sidepanel') return;
  openPanelPorts.set(port, null);

  port.onMessage.addListener((msg: { type?: string; windowId?: number }) => {
    if (msg?.type === 'PANEL_READY' && typeof msg.windowId === 'number') {
      openPanelPorts.set(port, msg.windowId);
      tryDeliverPendingCommand(port, msg.windowId);
    }
  });

  port.onDisconnect.addListener(() => {
    void chrome.runtime?.lastError;
    openPanelPorts.delete(port);
  });
}

export function clearSidePanelPortsForTest(): void {
  openPanelPorts.clear();
  pendingPanelCommand = null;
}

function findOpenPanelPortForWindow(
  windowId?: number,
): chrome.runtime.Port | null {
  if (openPanelPorts.size === 0) return null;
  if (windowId === undefined) {
    return openPanelPorts.keys().next().value ?? null;
  }
  for (const [port, winId] of openPanelPorts.entries()) {
    if (winId === windowId) return port;
  }
  return null;
}

async function sendPanelMessageWithRetry(
  cmd: PendingPanelCommand,
  targetWindowId?: number,
) {
  // Already delivered immediately on PANEL_READY
  if (pendingPanelCommand !== cmd) return;

  const port = findOpenPanelPortForWindow(targetWindowId);
  if (port) {
    pendingPanelCommand = null;
    try {
      port.postMessage({ type: cmd.type, targetWindowId });
      return;
    } catch {
      openPanelPorts.delete(port);
    }
  }

  try {
    await chrome.runtime.sendMessage({ type: cmd.type, targetWindowId });
    if (pendingPanelCommand === cmd) pendingPanelCommand = null;
    return;
  } catch {
    // Panel may still be mounting; retry once shortly after
  }

  await new Promise((resolve) => setTimeout(resolve, 150));

  if (pendingPanelCommand !== cmd) return;

  const retryPort = findOpenPanelPortForWindow(targetWindowId);
  if (retryPort) {
    pendingPanelCommand = null;
    try {
      retryPort.postMessage({ type: cmd.type, targetWindowId });
      return;
    } catch {
      openPanelPorts.delete(retryPort);
    }
  }

  try {
    await chrome.runtime.sendMessage({ type: cmd.type, targetWindowId });
    if (pendingPanelCommand === cmd) pendingPanelCommand = null;
  } catch {
    // Panel will pick up persisted storage state on mount
  }
}

export function handleExtensionCommand(
  command: string,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (command !== 'focus-search' && command !== 'open-ai') {
    return Promise.resolve();
  }

  const messageType = command === 'focus-search' ? 'FOCUS_SEARCH' : 'OPEN_AI';
  const targetWindowId = tab?.windowId;

  // If the panel is already open in this window, post directly to its port so
  // other browser windows are never affected and there is zero re-open flicker.
  const existingPort = findOpenPanelPortForWindow(targetWindowId);
  if (existingPort) {
    try {
      existingPort.postMessage({ type: messageType, targetWindowId });
      return Promise.resolve();
    } catch {
      openPanelPorts.delete(existingPort);
    }
  }

  // CRITICAL: chrome.sidePanel.open() MUST be invoked synchronously inside the
  // user gesture turn (before any `await`), otherwise Chrome/Edge rejects it.
  let openPromise: Promise<void> | undefined;
  if (targetWindowId !== undefined && chrome.sidePanel?.open) {
    openPromise = Promise.resolve(
      chrome.sidePanel.open({ windowId: targetWindowId }),
    ).catch(() => {});
  }

  const pendingCmd: PendingPanelCommand = {
    type: messageType,
    targetWindowId,
    createdAt: Date.now(),
  };
  pendingPanelCommand = pendingCmd;

  return (async () => {
    let resolvedWindowId = targetWindowId;
    if (!openPromise && chrome.sidePanel?.open && chrome.windows?.getLastFocused) {
      try {
        const win = await chrome.windows.getLastFocused();
        if (win.id !== undefined) {
          resolvedWindowId = win.id;
          pendingCmd.targetWindowId = win.id;
          await chrome.sidePanel.open({ windowId: win.id });
        }
      } catch {
        // Ignore if sidePanel.open cannot be invoked
      }
    }

    if (command === 'focus-search') {
      try {
        await Promise.all([
          saveActiveDockId('bookmarks'),
          saveDockCollapsed(true),
        ]);
      } catch {
        // Ignore storage error
      }
      if (openPromise) await openPromise;
      await sendPanelMessageWithRetry(pendingCmd, resolvedWindowId);
      return;
    }

    if (command === 'open-ai') {
      try {
        const [sites, lastAiId] = await Promise.all([
          loadAiSites(),
          loadLastAiId(),
        ]);
        const targetAiId = resolvePreferredAiSiteId(lastAiId, sites);
        await Promise.all([
          saveDockCollapsed(false),
          saveActiveDockId(targetAiId ?? 'bookmarks'),
        ]);
      } catch {
        // Ignore storage error
      }
      if (openPromise) await openPromise;
      await sendPanelMessageWithRetry(pendingCmd, resolvedWindowId);
    }
  })();
}
