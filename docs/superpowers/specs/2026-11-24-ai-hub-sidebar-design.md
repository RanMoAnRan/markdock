# MarkDock 侧边栏 AI 聚合入口设计文档

- **日期**：2026-11-24
- **状态**：待评审
- **目标范围**：在 MarkDock 浏览器侧边栏（`sidepanel.html`）新增类似 Cherry Studio 的左侧 Dock 图标栏与 AI 网页内嵌工作区，支持边看网页边在侧边栏切换不同 AI 对话，并提供完整的 AI 站点管理能力。

---

## 1. 背景与意图

用户希望在日常浏览文档和网页的同时，能在 MarkDock 侧边栏中直接打开并切换多个常用 AI 网站（类似 Cherry Studio 的侧边切换体验），无需在主浏览器窗口频繁来回切标签页。

本阶段明确聚焦于 **「AI 网页的快捷切换与管理」**，保持扩展轻量、纯本地运行，暂不引入网页正文抓取或 API Key 对话客户端。

---

## 2. 目标、非目标与反目标

### 目标（Goals）
1. **一步直达切换**：通过左侧 44px 极窄 Dock 图标栏，在「书签」与任意已启用的 AI 站点之间单次点击切换。
2. **窄屏友好**：Dock 栏支持一键折叠/展开，折叠后书签或 AI 网页占据侧边栏 100% 宽度。
3. **侧边栏直接内嵌对话**：通过仅作用于 MarkDock 自身的响应头规则移除防嵌入限制，使主流 AI 网站可在侧边栏 `<iframe>` 内正常加载与交互。
4. **懒加载 + 切换保活**：AI 页面在首次点击时才加载；切换到其他 AI 或切回书签时保留已加载的 iframe 实例（隐藏而非卸载），切回不丢对话上下文与输入框内容；同时提供手动刷新与卸载释放内存按钮。
5. **内置主流预设 + 自定义管理**：内置常见国内外 AI 网站预设，支持开关显示、新增自定义网址、编辑名称/链接、删除自定义站点、调整排序及恢复默认预设。
6. **无缝兼容现有书签体验**：不影响现有书签搜索、拖拽排序、深浅主题；触发 `Alt+K`（搜索快捷键）或清理工作台的「在侧边栏定位文件夹」时，自动切回书签视图并完成对应动作。

### 非目标（Non-Goals）
- 不实现网页内容抓取、划词提问、一键发送当前页正文（不引入 `content_scripts` 或 `scripting` 权限）。
- 不实现 LLM API Key 配置、自研聊天界面或提示词库。
- 不新增独立全屏 AI 工作台标签页（AI 聚合仅运行于侧边栏）。
- 不做云端同步（全部配置保存在本地 `chrome.storage.local`）。

### 反目标（Anti-Goals）
- **绝不全局削弱浏览器安全头**：移除 `X-Frame-Options` / `CSP` 的规则必须严格限定在 `tabIds: [-1]`（仅限侧边栏等非标签页扩展上下文）且仅限 `sub_frame`，绝不能影响普通网页标签页（`tabId >= 0`）。
- **绝不在打开侧边栏时预加载全部 AI**：避免白白占用数百 MB 内存并拖慢书签首屏启动。
- **绝不破坏现有书签快捷键与定位流**：用户在 AI 视图下按 `Alt+K` 仍能立刻回到书签并聚焦搜索框。

---

## 3. 技术与平台约束

1. **Manifest V3 权限与升级兼容性（已定方案）**：
   - `public/manifest.json` 在 `permissions` 中新增 `"declarativeNetRequestWithHostAccess"`（而非 `"declarativeNetRequest"`）。由于现有 `host_permissions` 已声明 `http://*/*` 与 `https://*/*`，使用 `declarativeNetRequestWithHostAccess` 同样支持 `modifyHeaders`，且**不会触发新的高危权限弹窗，不会导致已安装用户在自动更新时扩展被禁用**。
   - 在 `src/background/service-worker.ts` 中通过 `chrome.declarativeNetRequest.updateSessionRules` 注册固定 ID 的会话级规则（如 `AI_IFRAME_RULE_ID = 1001`，Chrome MV3 仅在 session 规则中支持 `tabIds` 条件）：
     - `condition`: `tabIds: [-1]`（即 `chrome.tabs.TAB_ID_NONE`，仅命中侧边栏等非标签页扩展上下文，**对所有普通浏览器标签页 `tabId >= 0` 零影响**），`resourceTypes: ['sub_frame']`。相比仅限定 `initiatorDomains: [chrome.runtime.id]`，采用 `tabIds: [-1]` 还能覆盖 AI 页面内部嵌套的子 iframe（如验证组件、内嵌预览），同时严格守住「不影响正常网页安全头」的反目标。
     - `action`: `type: 'modifyHeaders'`，移除 `responseHeaders` 中的 `x-frame-options`、`content-security-policy`、`frame-options`。
   - 保留对开发预览（非扩展环境）的降级容错（检查 `chrome.declarativeNetRequest` 存在后再注册）。
2. **第三方登录、SameSite Cookie 与人机验证边界**：
   - Chrome MV3 的 `declarativeNetRequest` 无法对 `Set-Cookie` 头做正则改写（不能强行把 `SameSite=Lax` 改为 `SameSite=None`），因此个别严格依赖 `SameSite=Lax` 会话 Cookie 或阻止 iframe 内 OAuth/Turnstile 的站点，在侧边栏内可能仍会要求登录或无法直接内嵌保持登录态。
   - 应对策略：遵循最小安全面，不引入破坏性全局规则；在 AI 顶部工具栏提供醒目的「在新标签页打开」（`↗`）与「刷新」（`↻`）按钮，并在管理页/首次提示中说明——支持标准 Cookie/Token 的站点可在新标签页登录后回侧栏刷新使用，极少数强制拒绝 iframe 的站点可一键跳新标签页。
3. **纯本地存储**：
   - 延续 `src/core/storage.ts` 模式，使用 `chrome.storage.local` 并保留 `localStorage` 降级，便于 `npm run dev` 和 Vitest 测试。

---

## 4. 方案对比与选型（Approaches）

| 方案 | 布局与交互 | 权衡 | 结论 |
| --- | --- | --- | --- |
| **方案 A：左侧极窄 Dock 图标栏（可折叠）** | 左侧常驻 44px 纵向图标栏：顶部「书签」、中部各启用 AI 图标、底部「管理 AI」；支持一键折叠。 | 优点：最接近 Cherry Studio，书签与任意 AI 一步直达，纵向排布轻松容纳 10+ 站点。<br>权衡：展开时占 44px 宽，可通过折叠按钮或拉宽侧边栏化解。 | **已选定** |
| **方案 B：顶部模式切换 + AI 横向标签条** | 顶部栏放 `书签 \| AI` 分段按钮；进入 AI 模式后顶部显示横向 AI 图标条。 | 优点：书签与 AI 均占 100% 宽度，对原书签区零宽度占用。<br>权衡：AI 超过 5 个需横向滚动/下拉；从书签切到指定 AI 需要两步。 | 未选用 |

---

## 5. 界面与交互设计

### 5.1 整体布局（方案 A）

```text
+----+------------------------------------+
| 🔖 |  DeepSeek         [↻] [↗] [⏻] [⇔] |  ← AI 视图顶部紧凑栏 (36px)
|----|------------------------------------|
| 🟢 |                                    |
| 🟠 |                                    |
| 🔵 |          内嵌 AI 网页 iframe        |
| 🟣 |         (其余已打开 AI 隐藏保活)     |
| ⚪ |                                    |
|----|                                    |
| ⚙  |                                    |
+----+------------------------------------+
 44px              剩余全部宽度
```

- **左侧 Dock 栏（44px 宽）**：
  - **顶部固定**：「书签」图标（选中态高亮指示条 + 背景色）。
  - **中部可滚动区**：按用户排序展示所有已启用的 AI 站点图标：
    - **内置 10 个预设站点**：使用内置专属配色的简洁字母/符号徽章（如 `G`、`C`、`DS`、`K`、`豆` 等），避免新用户从未访问过某站点时 Chrome `/_favicon/` 返回一排难以区分的默认灰色地球图标。
    - **用户自定义站点**：优先使用 Chrome `/_favicon/`，加载失败回退为站点首字彩色徽章。
    - 已在后台保活加载的 AI 图标右下角显示一个极小的状态圆点（便于用户感知哪些 AI 正在占内存）。
    - 鼠标悬停显示站点名称（native `title`）。
    - 右键菜单（或点击管理）：可快速「刷新此 AI」「在新标签页打开」「休眠释放内存」（以下由实现者决定是否做右键，顶栏操作已覆盖全部核心功能）。
  - **底部固定**：「AI 站点管理」按钮（打开管理弹窗）+ 「折叠左栏」按钮。
- **折叠态交互**：
  - 点击折叠后，左侧 44px 栏收起，内容区占满 100% 宽度。
  - 在「书签视图」顶部栏左侧（MarkDock Logo 旁）和「AI 视图」顶部栏左侧均显示一个紧凑的「展开侧栏」图标按钮，随时一键恢复。
  - 折叠状态持久化到本地存储。

### 5.2 AI 视图顶部工具栏（约 36px 高）
尽量压低高度，把最大垂直空间留给对话区域：
- **左侧**：（折叠态时的展开 Dock 按钮）+ 当前 AI 图标与名称。
- **右侧**：
  - **刷新（`↻`）**：重新加载当前 AI 的 iframe（通过递增该站点的 `reloadKey` 强制重建 iframe）。
  - **在新标签页打开（`↗`）**：使用 `chrome.tabs.create({ url })` 打开当前 AI 官网（方便首次登录或大屏查看）。
  - **休眠/卸载（`×` / `Power`）**：卸载当前 AI 的 iframe 实例以释放内存，并切回书签视图（或下一个已加载 AI；默认切回书签视图，简单可预期）。
  - **管理 AI（`⚙`）**：快速打开 AI 站点管理弹窗（折叠 Dock 时也能直接管理）。

### 5.3 内置 AI 预设列表（我们的建议配置）

内置 10 个主流 AI 网站，**默认启用前 6 个**，其余 4 个默认关闭可在管理面板一键开启：

| ID | 名称 | URL | 默认启用 |
| --- | --- | --- | --- |
| `chatgpt` | ChatGPT | `https://chatgpt.com` | ✅ |
| `claude` | Claude | `https://claude.ai` | ✅ |
| `gemini` | Gemini | `https://gemini.google.com` | ✅ |
| `deepseek` | DeepSeek | `https://chat.deepseek.com` | ✅ |
| `kimi` | Kimi | `https://www.kimi.com` | ✅ |
| `doubao` | 豆包 | `https://www.doubao.com/chat/` | ✅ |
| `qwen` | 通义千问 | `https://chat.qwen.ai` | ⬜ |
| `perplexity` | Perplexity | `https://www.perplexity.ai` | ⬜ |
| `grok` | Grok | `https://grok.com` | ⬜ |
| `yuanbao` | 腾讯元宝 | `https://yuanbao.tencent.com` | ⬜ |

### 5.4 AI 站点管理弹窗（`AiManagerModal`）
点击 Dock 底部 `⚙` 或 AI 顶栏 `⚙` 打开，支持：
1. **站点列表**：显示所有预设与自定义站点，每项支持：
   - 启用/停用开关（停用时若该站点当前已加载，则自动卸载其 iframe；若正处于该站点，则自动切回书签）。
   - 上移 / 下移（或拖拽排序）调整在 Dock 中的展示顺序。
   - 编辑名称与 URL。
   - 删除（仅自定义站点可彻底删除；内置预设可停用，避免误删找不回）。
2. **新增自定义 AI**：输入名称与 URL（自动校验 `http://` / `https://`，若用户未输入协议头自动补全 `https://`），提交后默认启用并排在列表末尾。
3. **恢复默认预设**：将内置预设的名称、URL 与启用状态恢复默认，**保留用户自己添加的自定义站点**。
4. **使用提示**：底部一行轻量说明——"若个别 AI 网站首次打开提示登录或验证，请先点击顶栏「在新标签页打开」完成登录，再回到侧边栏刷新即可。"

### 5.5 状态持久化与快捷键联动（我们的建议配置）
- **记忆上次停留视图**：本地保存 `activeDockId`（`'bookmarks'` 或某个 `aiSite.id`），下次打开侧边栏直接恢复上次停留的位置；若该 AI 已被停用/删除，则安全回退到 `'bookmarks'`。
- **快捷键联动**：
  - `Alt+K`（`FOCUS_SEARCH`）：无论当前在哪个 AI 页面，立刻切回 `'bookmarks'` 并聚焦书签搜索框。
  - 清理工作台「在侧边栏定位文件夹」（`pendingLocateFolder`）：自动切回 `'bookmarks'` 并展开定位目标目录。
  - 在 AI 视图下不拦截 `/` 或 `Ctrl/Cmd+K`（避免干扰 AI 网页内部快捷键；`Ctrl/Cmd+K` 仅在书签视图激活时聚焦书签搜索框）。

---

## 6. 数据模型与模块规划

- **`src/types/ai.ts`**：
  ```ts
  export interface AiSite {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    builtIn: boolean;
    badgeText?: string;   // 内置预设或回退徽章显示文字（如 DS / K / 豆）
    accentColor?: string; // 徽章背景色
  }

  export type DockTarget = 'bookmarks' | string;
  ```
- **`src/core/aiSites.ts`**（纯函数逻辑，完整单元测试覆盖）：
  - `DEFAULT_AI_SITES`：内置预设列表。
  - `normalizeAiUrl(raw: string): string | null`：规范化并校验 URL（仅允许 `http:` / `https:`）。
  - `mergeStoredAiSites(stored: AiSite[] | null): AiSite[]`：合并历史存储与新增预设（确保后续版本新增内置预设时老用户也能看到，同时保留老用户自定义配置和排序）。
  - `addCustomAiSite`、`updateAiSite`、`deleteCustomAiSite`、`toggleAiSite`、`reorderAiSites`、`resetBuiltInAiSites`、`resolveActiveDockTarget`。
- **`src/core/storage.ts`**：
  - 新增 `bcp_ai_sites`、`bcp_dock_collapsed`、`bcp_active_dock_id` 读写方法。
- **`src/background/service-worker.ts`**：
  - 注册并维护 `declarativeNetRequest` 动态规则（`setupAiFrameRules()`），在 `onInstalled`、`onStartup` 和模块顶层执行。
- **UI 组件**：
  - `src/components/DockRail.tsx`
  - `src/components/AiWorkspace.tsx`
  - `src/components/AiManagerModal.tsx`
  - `src/sidepanel/SidePanelApp.tsx` 集成接入。

---

## 7. 留给实现者决定的细节

以下实现细节可由开发阶段按代码库现有风格自行决定，无需再次确认：
- 站点排序交互具体采用 HTML5 拖拽还是上移/下移按钮（或两者兼备）。
- iframe 首次加载时的轻量加载态样式（loading spinner 或骨架提示）。
- `AiManagerModal` 的具体 Tailwind 视觉细节（复用现有 `SidePanelApp` 的圆角、边框与深浅色规范）。
- 是否在 Dock 图标上补充右键快捷菜单（刷新/新标签打开/休眠）。
