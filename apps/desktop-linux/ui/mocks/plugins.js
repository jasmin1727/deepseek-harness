/**
 * DeepSeek Harness — Mock Plugins Data
 */

export const mockPlugins = [
  {
    id: 'cordis-core',
    name: 'Cordis Core Engine',
    version: 'v1.4.0',
    author: 'DeepSeek Research',
    description: 'Autonomous execution kernel managing life cycles of sub-agent processes.',
    status: 'active'
  },
  {
    id: 'tree-sitter-pack',
    name: 'Tree-Sitter Syntax Engine',
    version: 'v0.22.6',
    author: 'Community',
    description: 'High-speed AST parser for Rust, TypeScript, Python, and C/C++.',
    status: 'active'
  },
  {
    id: 'terminal-mux',
    name: 'PTY Terminal Multiplexer',
    version: 'v2.1.0',
    author: 'DeepSeek Infrastructure',
    description: 'Provides pseudo-terminal emulation with ANSI color support inside sandboxes.',
    status: 'active'
  },
  {
    id: 'bwrap-sandbox',
    name: 'Bubblewrap Linux Isolation',
    version: 'v0.9.1',
    author: 'Linux Foundation',
    description: 'Unprivileged sandboxing backend using user namespaces and seccomp filters.',
    status: 'active'
  }
];
