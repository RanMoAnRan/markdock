import { setupAiFrameRules } from './aiFrameRules';
import {
  handleExtensionCommand,
  registerSidePanelPort,
} from './commandHandler';
import {
  handleRecycleBinMessage,
  isRecycleBinMessage,
} from './recycleBinHandler';

let panelBehaviorConfigured = false;

const configureSidePanel = async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      panelBehaviorConfigured = true;
    } catch {
      panelBehaviorConfigured = false;
    }
  }
};

chrome.action?.onClicked?.addListener((tab) => {
  if (!panelBehaviorConfigured && tab?.windowId !== undefined && chrome.sidePanel?.open) {
    void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});

const initializeExtension = () => {
  void configureSidePanel();
  void setupAiFrameRules();
};

chrome.runtime.onInstalled.addListener(() => {
  initializeExtension();
});

chrome.runtime.onStartup.addListener(() => {
  initializeExtension();
});

initializeExtension();

chrome.runtime.onConnect.addListener((port) => {
  registerSidePanelPort(port);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isRecycleBinMessage(message)) {
    return undefined;
  }
  void handleRecycleBinMessage(message).then(sendResponse);
  return true;
});

chrome.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.bcp_ai_sites) {
    void setupAiFrameRules();
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  void handleExtensionCommand(command, tab);
});
