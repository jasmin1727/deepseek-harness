#!/usr/bin/env bash
# ==============================================================================
# DeepSeek Harness — One-Line Linux Desktop Installer & Auto-Setup
# Usage (Official Upstream):
#   curl -fsSL https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/linux-install.sh | bash
# Pre-merge testing (Fork):
#   curl -fsSL https://raw.githubusercontent.com/jasmin1727/deepseek-harness/master/linux-install.sh | bash
# Or locally:
#   ./linux-install.sh
# ==============================================================================

set -euo pipefail

# Ensure local bin paths are included in installer subshell
export PATH="$HOME/.npm-global/bin:$HOME/.local/share/pnpm/bin:$HOME/.local/share/pnpm:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

# Color palette & text styling
CYAN="\033[1;36m"
BLUE="\033[1;34m"
WHITE="\033[1;37m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
BOLD="\033[1m"
DIM="\033[2m"
RESET="\033[0m"

# Inverted block styling for [HARNESS] pill
BG_INVERT="\033[7m"

print_banner() {
  local CYAN="\033[1;36m"
  local RESET="\033[0m"
  local BOX="\033[48;2;207;227;220m"
  local DARK="\033[38;2;16;24;26m"

  echo ""
  echo -e "${CYAN}  ██████╗ ███████╗███████╗██████╗ ███████╗███████╗███████╗██╗  ██╗${RESET}  ${BOX}${DARK}                                               ${RESET}"
  echo -e "${CYAN}  ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝██║ ██╔╝${RESET}  ${BOX}${DARK}    █   █  ███  ████  █   █ █████  ████  ████  ${RESET}"
  echo -e "${CYAN}  ██║  ██║█████╗  █████╗  ██████╔╝███████╗█████╗  █████╗  █████═╝ ${RESET}  ${BOX}${DARK}    █   █ █   █ █   █ ██  █ █     █     █      ${RESET}"
  echo -e "${CYAN}  ██║  ██║██╔══╝  ██╔══╝  ██╔═══╝ ╚════██║██╔══╝  ██╔══╝  ██╔═██╗ ${RESET}  ${BOX}${DARK}    █████ █████ ████  █ █ █ ████   ███   ███   ${RESET}"
  echo -e "${CYAN}  ██████╔╝███████╗███████╗██║     ███████║███████╗███████╗██║ ╚██╗${RESET}  ${BOX}${DARK}    █   █ █   █ █  █  █  ██ █         █     █  ${RESET}"
  echo -e "${CYAN}  ╚═════╝ ╚══════╝╚══════╝╚═╝     ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝${RESET}  ${BOX}${DARK}    █   █ █   █ █   █ █   █ █████ ████  ████   ${RESET}"
  echo -e "                                                                   ${BOX}${DARK}                                               ${RESET}"
  echo ""
  echo -e "  ${CYAN}Deterministic Autonomous Agent Runtime — Linux Desktop Client${RESET}"
  echo -e "  \033[2m──────────────────────────────────────────────────────────────────────────────────────────────────────────\033[0m"
  echo ""
}

log_info() {
  echo -e "  ${CYAN}[INFO]${RESET} $1"
}

log_success() {
  echo -e "  ${GREEN}[✓]${RESET} $1"
}

log_warn() {
  echo -e "  ${YELLOW}[WARN]${RESET} $1"
}

log_error() {
  echo -e "  ${RED}[ERROR]${RESET} $1"
}

print_banner

# Step 1: Detect Operating System & Package Manager
log_info "Detecting Linux distribution and package manager..."

PKG_MANAGER=""
if command -v pacman &>/dev/null; then
  PKG_MANAGER="pacman"
elif command -v apt-get &>/dev/null; then
  PKG_MANAGER="apt"
elif command -v dnf &>/dev/null; then
  PKG_MANAGER="dnf"
elif command -v zypper &>/dev/null; then
  PKG_MANAGER="zypper"
else
  log_warn "Unknown package manager. Please ensure required GTK3 and WebKit2GTK libraries are installed."
fi
log_success "Detected environment: ${PKG_MANAGER:-generic-linux}"

# Step 2: Ensure System Dependencies
install_sys_deps() {
  case "$PKG_MANAGER" in
    pacman)
      local pkgs=()
      for pkg in webkit2gtk-4.1 gtk3 libappindicator-gtk3 base-devel curl wget openssl librsvg; do
        if ! pacman -Qi "$pkg" &>/dev/null; then
          pkgs+=("$pkg")
        fi
      done
      if [ ${#pkgs[@]} -gt 0 ]; then
        log_info "Installing missing system libraries via pacman: ${pkgs[*]}"
        sudo pacman -S --noconfirm --needed "${pkgs[@]}"
      fi
      ;;
    apt)
      local pkgs=()
      for pkg in libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev build-essential curl wget libssl-dev librsvg2-dev; do
        if ! dpkg -s "$pkg" &>/dev/null; then
          pkgs+=("$pkg")
        fi
      done
      if [ ${#pkgs[@]} -gt 0 ]; then
        log_info "Installing missing system libraries via apt: ${pkgs[*]}"
        sudo apt-get update -y
        sudo apt-get install -y "${pkgs[@]}"
      fi
      ;;
    dnf)
      local pkgs=()
      for pkg in webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel make automake gcc gcc-c++ kernel-devel openssl-devel librsvg2-devel; do
        if ! rpm -q "$pkg" &>/dev/null; then
          pkgs+=("$pkg")
        fi
      done
      if [ ${#pkgs[@]} -gt 0 ]; then
        log_info "Installing missing system libraries via dnf: ${pkgs[*]}"
        sudo dnf install -y "${pkgs[@]}"
      fi
      ;;
    zypper)
      log_info "Verifying dependencies via zypper..."
      sudo zypper install -y webkit2gtk3-devel gtk3-devel libappindicator3-devel
      ;;
  esac
}

install_sys_deps || log_warn "System library check skipped or already satisfied."

# Step 3: Check Rust Toolchain
if ! command -v cargo &>/dev/null; then
  log_info "Rust toolchain not found. Installing via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
log_success "Rust compiler ready: $(cargo --version 2>/dev/null || echo 'cargo installed')"

# Step 4: Check Node.js and pnpm
if ! command -v node &>/dev/null; then
  log_error "Node.js (>= 18) is required. Please install Node.js before running DeepSeek Harness."
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  log_info "pnpm not found. Installing pnpm globally..."
  if command -v npm &>/dev/null; then
    npm install -g pnpm || curl -fsSL https://get.pnpm.io/install.sh | sh -
  else
    curl -fsSL https://get.pnpm.io/install.sh | sh -
  fi
fi
log_success "Node.js & pnpm runtime ready"

# Step 5: Initialize Secure Database & Config Vault
log_info "Configuring ~/.dsh database & secure credential storage..."
DSH_DIR="$HOME/.dsh"
mkdir -p "$DSH_DIR"
mkdir -p "$DSH_DIR/logs"
mkdir -p "$DSH_DIR/profiles"
mkdir -p "$DSH_DIR/sessions"
mkdir -p "$DSH_DIR/storages"
chmod 700 "$DSH_DIR"

CRED_FILE="$DSH_DIR/.credentials.yaml"
if [ ! -f "$CRED_FILE" ]; then
  cat << 'EOF' > "$CRED_FILE"
version: 1
refs:
  DEEPSEEK_API_KEY: ""
EOF
  chmod 600 "$CRED_FILE"
  log_success "Created ~/.dsh/.credentials.yaml with 0600 secure permissions"
else
  chmod 600 "$CRED_FILE"
  log_success "Verified ~/.dsh/.credentials.yaml permissions (0600)"
fi

# Step 6: Resolve Repository Source
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
fi
TARGET_REPO_DIR=""

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/apps/desktop-linux/src-tauri/Cargo.toml" ]; then
  TARGET_REPO_DIR="$SCRIPT_DIR"
  log_info "Running from local repository source: $TARGET_REPO_DIR"
elif [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/../apps/desktop-linux/src-tauri/Cargo.toml" ]; then
  TARGET_REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  log_info "Running from local repository source: $TARGET_REPO_DIR"
elif [ -f "$(pwd)/apps/desktop-linux/src-tauri/Cargo.toml" ]; then
  TARGET_REPO_DIR="$(pwd)"
  log_info "Running from current working directory: $TARGET_REPO_DIR"
else
  TARGET_REPO_DIR="$HOME/.local/share/deepseek-harness"
  log_info "Preparing DeepSeek Harness source in $TARGET_REPO_DIR..."
  if [ -d "$TARGET_REPO_DIR/.git" ]; then
    log_info "Updating existing repository..."
    git -C "$TARGET_REPO_DIR" pull --ff-only || true
  else
    mkdir -p "$(dirname "$TARGET_REPO_DIR")"
    PRIMARY_REPO="${DSH_REPO_URL:-https://github.com/deepseek-ai/deepseek-harness.git}"
    log_info "Cloning repository from $PRIMARY_REPO..."
    if ! git clone --depth 1 "$PRIMARY_REPO" "$TARGET_REPO_DIR" 2>/dev/null || [ ! -d "$TARGET_REPO_DIR/apps/desktop-linux" ]; then
      log_warn "Upstream repository does not contain apps/desktop-linux yet (pre-merge)."
      log_info "Falling back to pull request source (https://github.com/jasmin1727/deepseek-harness.git)..."
      rm -rf "$TARGET_REPO_DIR"
      git clone --depth 1 https://github.com/jasmin1727/deepseek-harness.git "$TARGET_REPO_DIR"
    fi
  fi
fi

# Helper to run pnpm across varied system configurations
run_pnpm() {
  if command -v pnpm &>/dev/null; then
    pnpm "$@"
  elif [ -x "$HOME/.npm-global/bin/pnpm" ]; then
    "$HOME/.npm-global/bin/pnpm" "$@"
  elif [ -x "$HOME/.local/share/pnpm/bin/pnpm" ]; then
    "$HOME/.local/share/pnpm/bin/pnpm" "$@"
  elif command -v corepack &>/dev/null; then
    corepack pnpm "$@"
  elif command -v npx &>/dev/null; then
    npx pnpm "$@"
  else
    log_error "pnpm could not be located"
    exit 1
  fi
}

# Step 7: Build Desktop Release Binary
log_info "Installing workspace packages and compiling release binary..."
cd "$TARGET_REPO_DIR"
run_pnpm install --frozen-lockfile=false

cargo build --manifest-path apps/desktop-linux/src-tauri/Cargo.toml --release

BINARY_SOURCE="$TARGET_REPO_DIR/apps/desktop-linux/src-tauri/target/release/dsh-desktop-linux"
if [ ! -f "$BINARY_SOURCE" ]; then
  log_error "Build failed: binary not found at $BINARY_SOURCE"
  exit 1
fi
log_success "Release binary built successfully ($(du -h "$BINARY_SOURCE" | cut -f1))"

# Step 8: Install Executable to ~/.local/bin
INSTALL_BIN_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_BIN_DIR"
cp "$BINARY_SOURCE" "$INSTALL_BIN_DIR/deepseek-harness"
chmod +x "$INSTALL_BIN_DIR/deepseek-harness"
ln -sf "$INSTALL_BIN_DIR/deepseek-harness" "$INSTALL_BIN_DIR/dsh-desktop"
log_success "Installed binary to $INSTALL_BIN_DIR/deepseek-harness"

# Ensure ~/.local/bin is in PATH across user shells
ensure_path() {
  local rc_file="$1"
  local export_line='export PATH="$HOME/.local/bin:$PATH"'
  if [ -f "$rc_file" ]; then
    if ! grep -q '\.local/bin' "$rc_file"; then
      echo -e "\n# DeepSeek Harness CLI path\n$export_line" >> "$rc_file"
      log_info "Added ~/.local/bin to $rc_file"
    fi
  fi
}
ensure_path "$HOME/.bashrc"
ensure_path "$HOME/.zshrc"

if [ -f "$HOME/.config/fish/config.fish" ]; then
  if ! grep -q '\.local/bin' "$HOME/.config/fish/config.fish"; then
    echo -e "\n# DeepSeek Harness CLI path\nfish_add_path \$HOME/.local/bin" >> "$HOME/.config/fish/config.fish"
    log_info "Added ~/.local/bin to config.fish"
  fi
fi

# Step 9: Desktop Entry & Application Menu Integration (Rofi, Gnome, KDE)
log_info "Registering desktop application icon and .desktop entry..."
ICON_DIR_SCALABLE="$HOME/.local/share/icons/hicolor/scalable/apps"
ICON_DIR_32="$HOME/.local/share/icons/hicolor/32x32/apps"
ICON_DIR_128="$HOME/.local/share/icons/hicolor/128x128/apps"
ICON_DIR_256="$HOME/.local/share/icons/hicolor/256x256/apps"
ICON_DIR_512="$HOME/.local/share/icons/hicolor/512x512/apps"
PIXMAPS_DIR="$HOME/.local/share/pixmaps"
mkdir -p "$ICON_DIR_SCALABLE" "$ICON_DIR_32" "$ICON_DIR_128" "$ICON_DIR_256" "$ICON_DIR_512" "$PIXMAPS_DIR"

ICONS_SOURCE="$TARGET_REPO_DIR/apps/desktop-linux/src-tauri/icons"
if [ -f "$ICONS_SOURCE/deepseek-logo-icon.svg" ]; then
  cp "$ICONS_SOURCE/deepseek-logo-icon.svg" "$ICON_DIR_SCALABLE/deepseek-harness.svg"
fi
if [ -f "$ICONS_SOURCE/32x32.png" ]; then
  cp "$ICONS_SOURCE/32x32.png" "$ICON_DIR_32/deepseek-harness.png"
fi
if [ -f "$ICONS_SOURCE/128x128.png" ]; then
  cp "$ICONS_SOURCE/128x128.png" "$ICON_DIR_128/deepseek-harness.png"
fi
if [ -f "$ICONS_SOURCE/128x128@2x.png" ]; then
  cp "$ICONS_SOURCE/128x128@2x.png" "$ICON_DIR_256/deepseek-harness.png"
fi
if [ -f "$ICONS_SOURCE/icon.png" ]; then
  cp "$ICONS_SOURCE/icon.png" "$ICON_DIR_512/deepseek-harness.png"
  cp "$ICONS_SOURCE/icon.png" "$PIXMAPS_DIR/deepseek-harness.png"
fi

APPLICATIONS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPLICATIONS_DIR"

cat << EOF > "$APPLICATIONS_DIR/deepseek-harness.desktop"
[Desktop Entry]
Name=DeepSeek Harness
GenericName=AI Agent Runtime
Comment=Deterministic autonomous agent runtime designed for high-performance Linux engineering workflows
Exec=$INSTALL_BIN_DIR/deepseek-harness %u
Icon=deepseek-harness
Terminal=false
Type=Application
Categories=Development;IDE;Utility;Network;
MimeType=x-scheme-handler/dsh;
Keywords=deepseek;harness;ai;agent;development;tauri;code;linux;
StartupNotify=true
Actions=NewSession;

[Desktop Action NewSession]
Name=New Session
Exec=$INSTALL_BIN_DIR/deepseek-harness --new-session
EOF

chmod 644 "$APPLICATIONS_DIR/deepseek-harness.desktop"

# Register dsh:// protocol handler
if command -v xdg-mime &>/dev/null; then
  xdg-mime default deepseek-harness.desktop x-scheme-handler/dsh 2>/dev/null || true
fi

# Refresh desktop database & icon cache
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$APPLICATIONS_DIR" 2>/dev/null || true
fi

if command -v gtk-update-icon-cache &>/dev/null; then
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
fi

log_success "Desktop launcher registered in ~/.local/share/applications/deepseek-harness.desktop"

# Completion summary
echo ""
echo -e "  ${GREEN}${BOLD}================================================================${RESET}"
echo -e "  ${GREEN}${BOLD}✓ DeepSeek Harness Linux Installation Complete!${RESET}"
echo -e "  ${GREEN}${BOLD}================================================================${RESET}"
echo ""
echo -e "  • ${BOLD}Application Launcher${RESET}: DeepSeek Harness is now available in your"
echo -e "    system menu / search bar (Rofi, Dmenu, Gnome, KDE, Walker)."
echo -e "  • ${BOLD}Terminal Command${RESET}:    Run ${CYAN}deepseek-harness${RESET} from any terminal."
echo -e "  • ${BOLD}Credential Vault${RESET}:    ${DIM}~/.dsh/.credentials.yaml (mode 0600)${RESET}"
echo -e "  • ${BOLD}Protocol Handler${RESET}:    Registered for ${CYAN}dsh://${RESET} URLs."
echo ""
