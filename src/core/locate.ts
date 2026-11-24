import { savePendingLocateFolder } from './storage';

export async function locateNodeInSidebar(
  nodeId: string,
  windowId?: number,
): Promise<void> {
  let targetWinId = windowId;
  if (
    targetWinId === undefined &&
    typeof chrome !== 'undefined' &&
    chrome.windows?.getCurrent
  ) {
    try {
      const win = await chrome.windows.getCurrent();
      targetWinId = win.id;
    } catch {
      // Ignore if windows API is unavailable
    }
  }

  const savePromise = savePendingLocateFolder(nodeId, targetWinId);

  if (
    typeof chrome !== 'undefined' &&
    chrome.sidePanel?.open &&
    targetWinId !== undefined
  ) {
    try {
      void chrome.sidePanel.open({ windowId: targetWinId });
    } catch {
      // Side panel may already be open
    }
  }

  await savePromise;

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      await chrome.runtime.sendMessage({
        type: 'LOCATE_FOLDER',
        folderId: nodeId,
        targetWindowId: targetWinId,
      });
    } catch {
      // Side panel may still be mounting and will consume pending locate on mount
    }
  }
}
