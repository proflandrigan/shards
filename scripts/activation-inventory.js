#!/usr/bin/env node
'use strict';
// Thin CLI wrapper; the logic lives in build/activation-inventory.js (shipped with the package).
const { inventory } = require('../build/activation-inventory.js');
module.exports = { inventory };
if (require.main === module) require('../build/activation-inventory.js').main();
