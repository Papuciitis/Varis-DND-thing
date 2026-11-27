'use strict';
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(process.env.VARA_MONSTER_TEST_OUTPUT || path.resolve(__dirname, '../../site'));
const read = file => JSON.parse(fs.readFileSync(path.join(output, file), 'utf8'));
module.exports = function builtCatalog() {
  return read('data/catalog-manifest.json').sections.map(section => read(section.url));
};
