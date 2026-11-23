const configureSidePanel = async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch {
      // Fallback handled by action.onClicked below if needed
    }
  }
};

chrome.runtime.onInstalled.addListener(() => {
  void configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidePanel();
});

void configureSidePanel();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'focus-search') return;

  try {
    const win = await chrome.windows.getLastFocused();
    if (win.id !== undefined && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: win.id });
    }
  } catch {
    // Ignore if sidePanel.open cannot be invoked in current window
  }

  // Notify an already-open side panel to immediately focus & select the search input
  try {
    await chrome.runtime.sendMessage({ type: 'FOCUS_SEARCH' });
  } catch {
    // Panel may just be mounting and will auto-focus on mount
  }
});
