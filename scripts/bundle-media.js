#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const root  = path.join(__dirname, '..');
const media = path.join(root, 'media');
const nm    = path.join(root, 'node_modules');

const copies = [
  [path.join(nm, 'd3',           'dist', 'd3.min.js'),              path.join(media, 'd3.min.js')],
  [path.join(nm, 'markmap-view', 'dist', 'browser', 'index.js'),    path.join(media, 'markmap-view.js')],
  [path.join(nm, 'markmap-lib',  'dist', 'browser', 'index.iife.js'), path.join(media, 'markmap-lib.js')],
];

for (const [src, dst] of copies) {
  fs.copyFileSync(src, dst);
  const kb = (fs.statSync(dst).size / 1024).toFixed(1);
  console.log(`  copied  ${path.relative(root, dst)}  (${kb} kB)`);
}
