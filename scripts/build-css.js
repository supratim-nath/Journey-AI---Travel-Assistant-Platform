const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tailwindCli = require.resolve('tailwindcss/lib/cli.js');

const result = spawnSync(process.execPath, [
  tailwindCli,
  '-c',
  'tailwind.config.js',
  '-i',
  './src/styles/tailwind.css',
  '-o',
  './html files/assets/tailwind.css',
  '--minify',
], {
  cwd: root,
  env: {
    ...process.env,
    BROWSERSLIST_IGNORE_OLD_DATA: '1',
  },
  stdio: 'inherit',
});

process.exit(result.status || 0);
