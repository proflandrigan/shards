import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { convertText } = require('../scripts/codemods/e4-2-ledger-refs.js');

const SRC = `### Knowledge Ledger
- **Entries checked:** <N> | N/A — ledger not found
- **Relevant entries found:** <N>
  - <title> (<type>, <confidence>) — <1-line relevance>
- **Or:** No relevant entries found
- **Check the Knowledge Ledger.** Before beginning Phase 1, check for relevant prior knowledge. {{protocol knowledge_retrieval}} for the protocol.
**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
{{protocol knowledge_harvest}} and follow
the protocol. Present candidates to the user for confirmation before writing.
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
**Knowledge re-check:** {{protocol knowledge_checkpoint}} before building.
(per Knowledge Ledger: x)
`;

describe('e4-2 ledger-ref codemod', () => {
  it('rewrites ledger patterns to sources protocol wording, idempotently', () => {
    const out = convertText(SRC);
    expect(out).toContain('### Sources');
    expect(out).toContain('{{protocol sources}} for the protocol.');
    expect(out).toContain('**Write-back proposal.**');
    expect(out).toContain('- **Write-backs proposed:**');
    expect(out).toContain('(per knowledge source: x)');
    expect(out).not.toMatch(/Knowledge Ledger|\.shards\/knowledge|knowledge_(retrieval|harvest|checkpoint)/);
    expect(convertText(out)).toBe(out);
  });
});
