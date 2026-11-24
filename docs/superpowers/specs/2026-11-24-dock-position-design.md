# MarkDock 面板内 AI 切换栏左右位置自定义设计

## 意图与背景
用户希望自定义 MarkDock 在浏览器左侧还是右侧展开（日常同时使用 Chrome 与 Edge，以 Edge 为主）。受限于 Chromium `chrome.sidePanel` API 规范，扩展无法通过代码控制原生侧边栏位于浏览器左侧还是右侧，且 Edge 原生侧边栏目前固定在右侧。

在评估了整栏改用网页注入抽屉、独立贴边弹窗与保持原生 Side Panel 三种方案的利弊后，用户决定**保留原生 Side Panel** 以确保低内存占用、跨标签页不断联、全页面可用及最佳快捷键焦点体验，并顺手增加「面板内 AI 切换栏（`DockRail`）左右位置自定义 + Chrome 外观设置快捷入口」这一轻量优化。

## 目标 / 非目标 / 反目标
- **目标**：
  1. 支持在侧边栏设置中自定义 `DockRail` 位置：`自动（贴外边）` / `左侧` / `右侧`，持久化存储于 `chrome.storage.local`。
  2. `DockRail` 位于右侧时，分割边框、选中指示条、收起/展开图标及提示文案同步镜像适配。
  3. 在设置弹窗中补充浏览器侧边栏位置说明：Chrome 提供一键跳转 `chrome://settings/appearance`，Edge 显示简短提示说明原生栏固定在右侧。
- **非目标**：不注入 Content Script 抽屉、不创建独立 Popup 窗口、不修改 `aiFrameRules.ts` 或 manifest 权限。
- **反目标**：不增加后台常驻开销，不破坏现有快捷键（`Alt+B` / `Alt+V`）与书签右键菜单交互。

## 方案对比（Approaches）
1. **网页内注入悬浮抽屉（未选）**：Chrome/Edge 均可自由切左右，但在新标签页/`edge://` 不可用、切 Tab 会中断 AI 对话或成倍增加内存、容易遮挡网页且放宽 AI iframe 规则与商店审核风险。
2. **独立贴边 Popup 窗口（未选）**：跨 Tab 不断联且全页面可用，但无法系统级置顶（点主窗口即被盖住）、不随主窗口联动、全屏体验割裂。
3. **保持原生 Side Panel + `DockRail` 左右可调与 Chrome 设置引导（已选）**：零额外性能损耗、稳定性最高、维护成本最低，并提升侧边栏在右侧展开时的贴边操作手感。

## 设计细节
- **存储与解析（`src/core/storage.ts` + 纯函数）**：
  - 新增 `DockPosition = 'auto' | 'left' | 'right'`，存储键 `bcp_dock_position`，默认值 `'auto'`（自动贴外边，未调用或不支持 `chrome.sidePanel.getLayout()` 时回退为 `'right'`，贴合 Edge/Chrome 默认右侧展开）。
  - 提供纯函数 `resolveEffectiveDockPosition(pref, browserSide?) => 'left' | 'right'`，便于单元测试。
- **布局与交互（`SidePanelApp.tsx`、`DockRail.tsx`、`AiWorkspace.tsx`）**：
  - 侧边栏初始化时若支持 `chrome.sidePanel?.getLayout?.()`，读取原生侧边栏所在边（`'left' | 'right'`）用于解析 `'auto'`。
  - 外层容器根据生效位置切换 `flex-row` / `flex-row-reverse`。
  - `DockRail` 接收 `position: 'left' | 'right'`：边框切换 `border-r` / `border-l`，激活指示条切换左右边与圆角方向，收起按钮切换 `PanelLeftClose` / `PanelRightClose` 及文案。
  - 收起状态下，书签页顶栏与 `AiWorkspace` 顶栏的展开按钮同步切换 `PanelLeftOpen` / `PanelRightOpen` 并置于对应一侧。
- **设置弹窗（`SidebarSettingsModal.tsx`）**：
  - 新增「AI 切换栏位置」三段式开关（`自动` / `左侧` / `右侧`）。
  - Chrome 环境下提供「调整浏览器侧边栏左右位置」按钮跳转 `chrome://settings/appearance`；Edge 环境下展示一行轻量说明文字。

## 留给实现的决策
- `DockRail` 位置变更后给出轻量 Toast 反馈，与现有主题切换体验一致。
- 补充 `storage` 读写与位置解析纯函数的单元测试。
