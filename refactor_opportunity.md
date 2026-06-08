# WatchAlong Codebase Architecture Audit & Refactoring Proposal

This document summarizes the architectural audit of the WatchAlong codebase and outlines concrete opportunities to refactor the codebase for a cleaner, more modular architecture. 

A key objective of this refactoring plan is **maximizing reading and execution efficiency for agentic AI coding assistants**, which frequently inspect, read, and write code in this repository.

---

## 1. Executive Summary

WatchAlong is a well-engineered desktop application using Electron, React, and TypeScript. Core domain logic (such as timeline mathematical mapping and video state synchronization via the `VideoAdapter` pattern) is isolated and clean. 

However, two major monolithic files represent significant cognitive overhead and read/write bottlenecks:
1. **`src/renderer/src/App.tsx` (~2,900 lines)**: Orchestrates layout rendering, 30+ reactive states, dozens of references, complex key listeners, IPC event hooks, and defines 10+ major UI components/dialogs inline.
2. **`src/main/index.ts` (~1,100 lines)**: Serves as a single entry point for Electron's main process, directly handling window life-cycles (`mainWindow`, `wizardWindow`, `movieWindow`), protocol routing, and dozens of IPC channel handlers.

### The AI Agent Efficiency Problem
Large monolithic files pollute the context window of LLM-based coding agents, increase token consumption, slow down file retrieval/parsing, and increase the likelihood of search-and-replace edit collisions. Breaking these files down into focused, single-responsibility modules directly enhances AI agent speed, precision, and reliability.

---

## 2. Proposed Architecture Overview

```mermaid
graph TD
    subgraph Renderer Process (UI)
        App[App.tsx - Core Coordinator]
        AppHooks[Custom Hooks - usePlayback, useSubtitles, useDownloads]
        Components[components/ Directory]
        Services[services/api.ts - IPC Wrapper]
        
        App --> AppHooks
        App --> Components
        AppHooks --> Services
    end
    
    subgraph Shared
        SharedTypes[shared/types.ts]
        SharedSession[shared/session.ts]
    end

    subgraph Main Process (Electron Core)
        MainIndex[index.ts - Bootstrap Coordinator]
        WinManager[WindowManager.ts]
        IpcHandlers[ipc/ Handlers]
        ServicesMain[services/ - ToolResolver, DownloadManager, Vault]
        Stores[stores/ - SessionStore, PreferencesStore]
        
        MainIndex --> WinManager
        MainIndex --> IpcHandlers
        IpcHandlers --> Stores
        IpcHandlers --> ServicesMain
    end
    
    AppHooks -.->|IPC Protocol| IpcHandlers
```

---

## 3. High-Priority Refactoring Opportunities

### A. Renderer Process: Decomposing `App.tsx`

`App.tsx` currently functions as a monolith. We can break it down into three distinct layers: UI components, business logic (custom hooks), and API wrappers.

#### 1. Extract Inline Components to `components/`
Currently, 12 helper components are declared at the bottom of `App.tsx`. They should be moved to dedicated files:
*   `src/renderer/src/components/CommandPanel.tsx`
*   `src/renderer/src/components/RenameSessionDialog.tsx`
*   `src/renderer/src/components/DeleteSessionDialog.tsx`
*   `src/renderer/src/components/StartupErrorState.tsx`
*   `src/renderer/src/components/WelcomeOverlay.tsx`
*   `src/renderer/src/components/MissingMediaRecovery.tsx`
*   `src/renderer/src/components/LibraryHome.tsx`
*   `src/renderer/src/components/LibrarySessionCard.tsx`
*   `src/renderer/src/components/StreamVolume.tsx`
*   `src/renderer/src/components/SetupScrubber.tsx`
*   `src/renderer/src/components/DownloadIndicator.tsx`

#### 2. Extract Business Logic into Custom Hooks
Group related states, refs, and side-effects (`useEffect`) into specialized hooks. This prevents `App.tsx` from having to manage 30+ states in a single component function.
*   **`usePlayback`**: Manages play/pause states, scrubbing, seeking, volume controls, mute status, and `SyncController` instantiation.
*   **`useSession`**: Handles active session changes, media url refreshes, metadata completion, and session renaming/deletion dialog triggers.
*   **`useSubtitles`**: Manages cues extraction, subtitle loading, clearing, and popped-out movie subtitle communication.
*   **`useDownloads`**: Tracks active yt-dlp/Patreon downloads, job progress hooks, and download-finish attachments.

#### 3. Create a Service Layer for IPC
Replace direct calls to `window.watchAlong` with a typed service layer (`src/renderer/src/services/api.ts`). This abstracts Electron-specific globals away from React rendering logic, making it easier to mock or transition if the app expands to other platforms (like Web/PWA).

---

### B. Main Process: Decomposing `index.ts`

`src/main/index.ts` mixes application bootstrapping, window setup, custom protocols, and IPC handlers.

#### 1. Separate Window Management (`WindowManager.ts`)
Create a dedicated `WindowManager` class to wrap Electron window configurations, lifecycle events, and inter-window positioning logic (like centering the wizard modal on the main window):
```typescript
export class WindowManager {
  private mainWindow: BrowserWindow | null = null
  private wizardWindow: BrowserWindow | null = null
  private movieWindow: BrowserWindow | null = null

  createMainWindow(): BrowserWindow { ... }
  openWizard(options: ImportWizardLaunchOptions): void { ... }
  openMovieWindow(request: MovieWindowOpenRequest): Promise<MovieWindowOpenResult> { ... }
  closeMovieWindow(options?: MovieWindowCloseOptions): Promise<MovieWindowCloseResult> { ... }
}
```

#### 2. Modularize IPC Handlers (`src/main/ipc/`)
Group IPC handlers by category, exporting registration functions to be invoked at startup:
*   `src/main/ipc/sessionIpc.ts` (Active sessions, metadata, library retrieval)
*   `src/main/ipc/preferencesIpc.ts` (Read/write app preferences)
*   `src/main/ipc/downloadIpc.ts` (Download initiation, cancellation, session storage integration)
*   `src/main/ipc/movieWindowIpc.ts` (Pop-out, geometry tracking, media event proxying)

#### 3. Decompose `mediaServices.ts`
`mediaServices.ts` combines executable path lookups, secure vault storage, OS-level credential managers, and download orchestration. It should be split into a `src/main/services/` sub-package:
*   `services/ToolResolver.ts`: Handles path checks for yt-dlp, FFmpeg, and Node.
*   `services/PatreonSessionVault.ts`: Encryption, decryption, and validation of Patreon tokens.
*   `services/DownloadManager.ts`: Spawns and manages downloading child processes.
*   `services/cookieExtractor.ts`: Browser detection and automated session/cookie parsing.

---

## 4. AI Agent Reading & Writing Efficiency Benefits

When agentic AI tools interact with this codebase, they will benefit significantly from these refactoring choices:

| Current Monolithic Design | Proposed Modular Design | AI Agent Benefit |
| :--- | :--- | :--- |
| **High Context Pollution**: Reading `App.tsx` consumes ~30k tokens per analysis. | **Low Context Footprint**: Reading individual sub-components consumes <3k tokens. | **Lower API costs** and **faster response times** for the user. |
| **Search-and-Replace Fragility**: Edits in a 2,900-line file frequently fail due to similar patterns or duplicate helper blocks. | **Targeted Edits**: Editing modular files reduces block collisions. | **Fewer linting/compilation errors** and more precise modifications. |
| **Hidden Side-Effects**: Overlapping React effects make tracking state flows difficult. | **Domain Isolation**: Custom hooks restrict state triggers to specific contexts. | **Easier bug detection** and reliable code generation. |
| **Tight Coupling**: IPC handlers are directly mixed with main bootstrap functions. | **Declarative IPC Registry**: Clear directories mapping API routes. | **Faster API onboarding** for AI models; they immediately know where to add new IPC features. |

---

## 5. Implementation Roadmap (Phases)

To avoid breaking existing app stability, refactoring should be scheduled sequentially:

1.  **Phase 1 (Renderer UI Extraction)**: Move all dialogs and inline components out of `App.tsx` into a `components/` directory. (Zero runtime logic changes; purely structural).
2.  **Phase 2 (Main Process Services Split)**: Split `mediaServices.ts` into isolated modules (`ToolResolver`, `DownloadManager`, etc.). Update paths and imports in `index.ts`.
3.  **Phase 3 (Main Process Window & IPC Isolation)**: Introduce the `WindowManager` and group IPC registration into modular routers. Slim down `index.ts` to bootstrapper status.
4.  **Phase 4 (Renderer Hook Extraction)**: Extract state groupings from `App.tsx` into hooks (`usePlayback`, `useSession`, etc.) and establish `services/api.ts` to wrap IPC communications.
