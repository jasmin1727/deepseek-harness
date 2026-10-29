/**
 * DeepSeek Harness — Mock Connectors Data
 */

export const mockConnectors = [
  {
    id: 'github',
    name: 'GitHub Enterprise / Cloud',
    description: 'Pull request reviews, commit automation, issue indexing, and actions dispatch.',
    status: 'connected',
    account: 'deepseek-ai / jasmin-eng'
  },
  {
    id: 'slack',
    name: 'Slack Workspace',
    description: 'Send deployment notifications and stream task completions to #runtime-ops.',
    status: 'connected',
    account: 'deepseek.slack.com'
  },
  {
    id: 'figma',
    name: 'Figma Dev Mode',
    description: 'Inspect design tokens, frame dimensions, and asset exports directly in prompts.',
    status: 'disconnected',
    account: null
  },
  {
    id: 'linear',
    name: 'Linear Workspaces',
    description: 'Sync issue status, automatically reference cycles, and branch names.',
    status: 'connected',
    account: 'deepseek-team'
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Index documentation, specs, and engineering architecture RFCs.',
    status: 'disconnected',
    account: null
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Database',
    description: 'Query database schemas, run read-only EXPLAIN ANALYZE queries.',
    status: 'disconnected',
    account: null
  }
];
