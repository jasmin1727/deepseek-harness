# DeepSeek Harness — Linux Desktop Client

> Lightweight, high-performance Linux desktop shell and runtime for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Built with **Tauri v2**, **Rust**, **WebKit2GTK**, and native Linux desktop environment integration.

---

## 1. Overview

While the standard desktop application is distributed as an Electron package for macOS and Windows, `apps/desktop-linux` provides a first-class, resource-efficient native Linux application designed specifically for Linux developers and power users.

### Key Highlights
- **Ultra-Lightweight & Fast**: Powered by Tauri v2 and `WebKit2GTK-4.1`, utilizing less than 80 MB of RAM compared to standard Chromium/Electron overhead.
- **Native Daemon Supervision**: Spawns and manages the `@deepseek-ai/dsh` Node.js daemon as a supervised sidecar with automatic crash recovery, exponential backoff, and login shell environment probing.
- **Zero-Latency Native WebSocket Multiplexer**: Native Rust WebSocket bridge routing messages and turn streams directly between WebKit and the loopback daemon.
- **Desktop & OS Integration**: System tray support, application launcher (`.desktop`) entry, high-DPI icons, and `dsh://` custom protocol deep-linking.
- **Local Native Dialog Locks**: Rust-backed file/directory dialogs with concurrency locks (`PICKER_MUTEX`), seamless file attachments, and context injection (`@"<path>"`).
- **Secure Key Management**: Direct integration with `~/.dsh/.credentials.yaml` using strict `0600` Linux file permissions.

---

## 2. Quickstart

### Automated One-Line Install

#### Option A: Official Upstream (Post-Merge)
Once this contribution is merged into the official repository, install directly via:
```bash
curl -fsSL https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/linux-install.sh | bash
```

#### Option B: Pre-Merge Reviewer Testing (Current Fork)
Upstream maintainers and reviewers can test and verify the complete installation flow immediately before merging:
```bash
curl -fsSL https://raw.githubusercontent.com/jasmin1727/deepseek-harness/master/linux-install.sh | bash
```

> **Note**: Both installer commands automatically detect your Linux distribution (`pacman`, `apt`, `dnf`, `zypper`), install missing system libraries (`webkit2gtk-4.1`, `librsvg`, etc.), build the native release binary, register `~/.local/share/applications/deepseek-harness.desktop`, configure high-DPI desktop icons, and set up the `dsh://` URL scheme handler.

### Manual Installation & Local Build

#### Prerequisites
- **Linux Distribution**: Ubuntu / Debian, Arch Linux / Manjaro, Fedora / RHEL, or openSUSE.
- **Rust toolchain** (1.75+): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** (v18+) and **pnpm** (v9+)
- **System Libraries**:
  - **Debian / Ubuntu**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Arch Linux**: `sudo pacman -S webkit2gtk-4.1 base-devel curl wget openssl libappindicator-gtk3 librsvg`
  - **Fedora**: `sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget libappindicator-gtk3-devel librsvg2-devel`

#### Build & Run
```bash
# 1. Clone official repository (or fork for pre-merge testing)
git clone https://github.com/deepseek-ai/deepseek-harness.git
# Pre-merge testing branch:
# git clone https://github.com/jasmin1727/deepseek-harness.git

cd deepseek-harness

# 2. Install workspace dependencies
pnpm install

# 3. Run in development mode
pnpm run dev:desktop:linux
# or directly with Cargo:
cargo run --manifest-path apps/desktop-linux/src-tauri/Cargo.toml

# 4. Compile optimized release binary
pnpm run build:desktop:linux
# or directly with Cargo:
cargo build --manifest-path apps/desktop-linux/src-tauri/Cargo.toml --release
```

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 DeepSeek Harness Linux App                  │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               WebKit2GTK Frontend (UI)              │   │
│   │   - Modern Chat & Reasoning Chain UI                │   │
│   │   - Workspace & Session History Manager             │   │
│   │   - Model Catalog & Settings Panels                 │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ Tauri IPC                    │
│   ┌──────────────────────────▼──────────────────────────┐   │
│   │                   Rust Core (Tauri v2)              │   │
│   │   - Sidecar Supervisor (Port 3000 / dynamic probe)   │   │
│   │   - Tokio Tungstenite WebSocket Multiplexer          │   │
│   │   - Native Dialogs & PICKER_MUTEX Guard             │   │
│   │   - ~/.dsh/.credentials.yaml Vault (0600)           │   │
│   └──────────────────────────┬──────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────┘
                               │ Loopback RPC / WebSocket
    ┌──────────────────────────▼──────────────────────────┐
    │          Node.js Daemon (@deepseek-ai/dsh web)       │
    │   - Cordis Core Kernel & Plugin Engine              │
    │   - Bubblewrap Sandbox Isolation                    │
    │   - Session Store & Workspace State Persistence      │
    └─────────────────────────────────────────────────────┘
```

---

## 4. Packaging & Distribution

To bundle standalone distribution packages (`.deb` and `.AppImage`):

```bash
cd apps/desktop-linux/src-tauri
cargo tauri build
```

Generated bundles will be located in:
- `apps/desktop-linux/src-tauri/target/release/bundle/deb/`
- `apps/desktop-linux/src-tauri/target/release/bundle/appimage/`

---

## 5. License

MIT Open Source License — DeepSeek AI & Open Source Contributors.
