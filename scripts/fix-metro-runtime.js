const fs = require('fs');
const path = require('path');

const dependencyGraphPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'metro',
  'src',
  'node-haste',
  'DependencyGraph.js',
);

const bundlerPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'metro',
  'src',
  'Bundler.js',
);

function patchFile(filePath, applyPatch, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`[fix-metro] ${label} target not found, skipping`);
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const updated = applyPatch(original);

  if (updated === original) {
    console.log(`[fix-metro] ${label} already applied or pattern not found`);
    return;
  }

  fs.writeFileSync(filePath, updated);
  console.log(`[fix-metro] ${label} applied`);
}

function patchDependencyGraph(content) {
  let updated = content;

  const marker = '    this._config = config;\n';
  const injection = '    this._config = config;\n    this._resolutionCache = new Map();\n';

  if (!updated.includes(injection)) {
    updated = updated.replace(marker, injection);
  }

  const cacheRead = '    const mapByResolverOptions = this._resolutionCache;\n';
  const guardedCacheRead =
    '    const mapByResolverOptions =\n' +
    '      this._resolutionCache ?? (this._resolutionCache = new Map());\n';

  if (!updated.includes(guardedCacheRead)) {
    updated = updated.replace(cacheRead, guardedCacheRead);
  }

  return updated;
}

function patchBundler(content) {
  const search = `  async end() {\n    await this.ready();\n    await this._transformer.end();\n    await this._depGraph.end();\n  }\n`;
  const replace = `  async end() {\n    await this.ready();\n    if (this._transformer) {\n      await this._transformer.end();\n    }\n    await this._depGraph.end();\n  }\n`;

  if (content.includes(replace)) {
    return content;
  }

  return content.replace(search, replace);
}

patchFile(dependencyGraphPath, patchDependencyGraph, 'DependencyGraph cache init');
patchFile(bundlerPath, patchBundler, 'Bundler shutdown guard');
