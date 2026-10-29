/**
 * DeepSeek Harness — Available Models
 */

export const mockModels = [
  {
    id: 'v3',
    name: 'DeepSeek-V3',
    tag: 'MoE · 671B',
    description: 'Autonomous reasoning, code generation & multi-turn workflows.',
    contextWindow: '128K',
    speed: 'Fast (65 t/s)',
    specialty: 'Engineering & General Reasoning'
  },
  {
    id: 'r1',
    name: 'DeepSeek-R1',
    tag: 'Reasoning · RL',
    description: 'Deep chain-of-thought verification, mathematics & formal logic.',
    contextWindow: '64K',
    speed: 'Reflective (32 t/s)',
    specialty: 'Complex Analysis & Zero-Shot Verification'
  }
];
