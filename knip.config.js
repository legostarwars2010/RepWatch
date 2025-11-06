/**
 * Knip configuration for RepWatch
 * Analyzes the codebase for unused files, exports, and dependencies
 */

module.exports = {
  entry: [
    'server.js',
    'app.js',
    'seed.js',
    'scripts/ingest_*.js',
    'scripts/run_*.js',
    'scripts/populate_*.js',
    'scripts/resolve_*.js',
    'scripts/master_*.js',
    'scripts/normalize_*.js',
    'scripts/*_full_pipeline.js',
    'tests/**/*.test.js',
    'tests/**/*.spec.js'
  ],
  project: [
    '**/*.js',
    '!attic/**',
    '!node_modules/**',
    '!tmp/**',
    '!data/backups/**',
    '!data/cache/**',
    '!data/derived/**'
  ],
  ignore: [
    'attic/**',
    'tmp/**',
    'data/backups/**',
    'data/cache/**',
    'data/derived/**',
    'node_modules/**',
    '**/*.log',
    '**/*.tmp'
  ],
  ignoreDependencies: [
    // These might be used in scripts dynamically
  ],
  ignoreExportsUsedInFile: true
};
