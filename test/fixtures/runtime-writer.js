'use strict';
// usage: node runtime-writer.js <root> <sessionKey> <n>
const { StateStore } = require('../../runtime/state/store');
(async () => {
  const [root, key, n] = process.argv.slice(2);
  const s = new StateStore(root, key);
  for (let i = 0; i < Number(n); i++) await s.update('frames', (c) => ({ ...c, counter: (c.counter || 0) + 1 }));
})().catch((e) => { console.error(e); process.exit(1); });
