/**
 * DeepSeek Harness — Mock Chat History Data
 * Realistic developer/agent workflows grouped by timeline
 */

export const mockChats = [
  // Sessions in Default Workspace
  {
    id: 'chat-session-1',
    title: 'Generate Q3 data summary',
    group: 'Default workspace',
    model: 'v3',
    pinned: false,
    updatedAt: '1min',
    messagesCount: 6
  },
  {
    id: 'chat-session-2',
    title: 'Prepare for review meeting',
    group: 'Default workspace',
    model: 'v3',
    pinned: false,
    updatedAt: '9min',
    messagesCount: 14
  },
  {
    id: 'chat-session-3',
    title: 'Refactor login validation',
    group: 'Default workspace',
    model: 'v3',
    pinned: false,
    updatedAt: '1h',
    messagesCount: 8
  },
  {
    id: 'chat-session-4',
    title: 'Add columns to sales report',
    group: 'Default workspace',
    model: 'v3',
    pinned: false,
    updatedAt: '4d',
    messagesCount: 22
  },
  {
    id: 'chat-session-5',
    title: 'Organize API documentation...',
    group: 'Default workspace',
    model: 'v3',
    pinned: false,
    updatedAt: '8d',
    messagesCount: 11
  },
  {
    id: 'chat-session-6',
    title: 'Analyze and fix current code...',
    group: 'Default workspace',
    model: 'r1',
    pinned: false,
    updatedAt: '10d',
    messagesCount: 19
  },

  // Additional chats
  {
    id: 'chat-today-1',
    title: 'Linux sandbox permission policy audit',
    group: 'Default workspace',
    model: 'v3',
    pinned: false,
    updatedAt: '12d',
    messagesCount: 8
  },
  {
    id: 'chat-today-2',
    title: 'Benchmark DeepSeek-R1 on SWE-bench',
    group: 'Default workspace',
    model: 'r1',
    pinned: false,
    updatedAt: '14d',
    messagesCount: 14
  }
];
