import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = process.cwd();
let app, tmp;
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-graph-'));
  const outfile = path.join(tmp, 'graph.cjs');
  await build({
    stdin: { contents: "export { GitGraphRenderer } from './src/features/graph/GitGraphRenderer';", resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', outfile,
    external: ['react'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-graph-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('long branch connections keep one color through their elbow and tail', () => {
  const parents = [[1, 3], [4], [5], [5], [5], []];
  const commits = parents.map((links, index) => ({
    hash: `commit-${index}`, shortHash: `c${index}`, subject: `Commit ${index}`,
    parents: links.map(parent => `commit-${parent}`),
    author: { name: 'Test', email: 'test@example.invalid' },
  }));
  for (const hasWipNode of [false, true]) {
    const svg = renderToStaticMarkup(React.createElement(app.GitGraphRenderer, { commits, selectedIndex: -1, hasWipNode }));
    const paths = [...svg.matchAll(/<path\b[^>]*>/g)].map(match => match[0]);
    assert.equal(paths.length, parents.flat().length + Number(hasWipNode), 'each ancestry edge must be one continuous path');
    const offset = hasWipNode ? 30 : 0;
    const fork = paths.find(edge => edge.includes(`d="M 28 ${15 + offset} C`) && edge.includes(`L 60 ${105 + offset}"`));
    const join = paths.find(edge => edge.includes(`d="M 60 ${105 + offset} L 60 ${135 + offset} C`) && edge.includes(`28 ${165 + offset}"`));
    assert.ok(fork, 'merge-parent curve must continue into its vertical tail');
    assert.ok(join, 'joining branch must stay in its own lane until the last row, avoiding another branch’s line');
    for (const edge of [fork, join]) assert.match(edge, /stroke="hsl\(var\(--graph-lane-2\)\)"/, 'the feature branch keeps its lane color at both ends');
  }
});
