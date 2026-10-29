/**
 * DeepSeek Harness — Conversation Samples & Assistant Responses
 * Demonstrates Agent-Runtime identity with tool calls and terminal execution blocks
 */

export const mockConversations = {
  default: [
    {
      id: 'msg-1',
      role: 'user',
      text: 'Scan the desktop-linux workspace and verify test suite status before building.',
      timestamp: '10:14 AM'
    },
    {
      id: 'msg-2',
      role: 'assistant',
      model: 'DeepSeek-V3',
      timestamp: '10:14 AM',
      thinking: 'Analyzing workspace structure at apps/desktop-linux. Checking src-tauri Cargo.toml and verifying unit test harness integrity...',
      text: `I've inspected the \`apps/desktop-linux\` project. The Tauri v2 client shell is configured with \`libwebkit2gtk-4.1\` and headless GTK integration.

I executed the verification test suite in the local POSIX sandbox:`,
      toolCall: {
        toolName: 'sandbox_exec',
        command: 'cargo test --workspace --no-fail-fast',
        duration: '1.42s',
        status: 'success',
        exitCode: 0,
        output: `   Compiling dsh-desktop-linux v0.2.1 (/home/jasmin/Projects/deepseek-harness/apps/desktop-linux/src-tauri)
    Finished \`test\` profile [unoptimized + debuginfo] target(s) in 0.88s
     Running unittests src/lib.rs (target/debug/deps/dsh_desktop_linux-a719c8f001)

running 4 tests
test sidecar::tests::test_sidecar_ipc_handshake ... ok
test sidecar::tests::test_port_availability ... ok
test tray::tests::test_tray_menu_construction ... ok
test tests::verify_tauri_window_config ... ok

test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.04s`
      },
      conclusion: 'All 4 unit tests passed without regressions. The IPC sidecar daemon interface is ready for active command dispatch.'
    }
  ],

  repoInspection: {
    role: 'assistant',
    model: 'DeepSeek-V3',
    thinking: 'Scanning workspace tree, dependencies in Cargo.lock, and checking UI distribution bundle...',
    text: `Repository scan complete. The architecture is cleanly partitioned into the Rust desktop host and the vanilla ES6 interface distribution.`,
    toolCall: {
      toolName: 'sandbox_exec',
      command: 'find apps/desktop-linux -maxdepth 3 -not -path "*/target/*"',
      duration: '0.12s',
      status: 'success',
      exitCode: 0,
      output: `apps/desktop-linux/
├── Cargo.lock
├── package.json
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── lib.rs
│       ├── main.rs
│       └── sidecar.rs
└── ui/
    ├── index.html
    ├── style.css
    ├── app.js
    └── pond.js`
    },
    conclusion: 'Workspace tree is healthy. Frontend distribution is served from `../ui` with zero packaging overhead.'
  },

  testSuite: {
    role: 'assistant',
    model: 'DeepSeek-V3',
    thinking: 'Invoking test runner with release flags and telemetry capture...',
    text: `Test suite execution finished across all crate modules:`,
    toolCall: {
      toolName: 'sandbox_exec',
      command: 'cargo test --all-targets --quiet',
      duration: '0.94s',
      status: 'success',
      exitCode: 0,
      output: `running 8 tests
........
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out`
    },
    conclusion: 'Verification complete. Zero regressions detected across all test targets.'
  },

  sidecarDiagnostics: {
    role: 'assistant',
    model: 'DeepSeek-R1',
    thinking: 'Probing sidecar IPC loopback on 127.0.0.1:3000 and measuring roundtrip latency...',
    text: `Sidecar diagnostic report for local JSON-RPC socket:`,
    toolCall: {
      toolName: 'sidecar_rpc_probe',
      command: 'curl -s -X POST http://127.0.0.1:3000/rpc -d \'{"jsonrpc":"2.0","method":"system.ping","id":1}\'',
      duration: '0.08s',
      status: 'success',
      exitCode: 0,
      output: `HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 54

{"jsonrpc":"2.0","result":{"status":"ok","ipc_latency_ms":0.74},"id":1}`
    },
    conclusion: 'Sidecar socket is active on port 3000 with sub-millisecond IPC roundtrip latency (0.74ms).'
  }
};
