#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';

const REPO_URL = 'https://github.com/muizzahabibi/ubersuggest-mcp-node.git';

async function main() {
  console.log('\x1b[35m=== Ubersuggest MCP Node Remote Installer ===\x1b[0m\n');

  const rl = readline.createInterface({ input, output });
  const defaultDir = path.join(os.homedir(), 'ubersuggest-mcp-node');

  const targetInput = await rl.question(`Tentukan lokasi instalasi (Default: ${defaultDir}): `);
  rl.close();

  const targetDir = targetInput.trim() ? path.resolve(targetInput.trim().replace(/^~/, os.homedir())) : defaultDir;

  if (fs.existsSync(targetDir)) {
    console.log(`\n\x1b[33mFolder tujuan sudah ada di: ${targetDir}\x1b[0m`);
    console.log('Menggunakan folder yang ada untuk memperbarui/mengonfigurasi ulang...');
  } else {
    console.log(`\nMembuat folder instalasi di: ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });

    console.log(`Mengkloning repository dari ${REPO_URL}...`);
    const gitClone = spawnSync('git', ['clone', REPO_URL, targetDir], { stdio: 'inherit' });
    if (gitClone.status !== 0) {
      console.error('\x1b[31m❌ Gagal melakukan git clone. Pastikan git terinstal dan URL repo valid.\x1b[0m');
      process.exit(1);
    }
  }

  // Navigate to target directory and execute setup steps
  try {
    console.log('\nMemasang dependensi (npm install)...');
    const npmInstall = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], { cwd: targetDir, stdio: 'inherit' });
    if (npmInstall.status !== 0) throw new Error('npm install failed');

    console.log('\nMemasang Chromium untuk Playwright...');
    const playwrightInstall = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], { cwd: targetDir, stdio: 'inherit' });
    if (playwrightInstall.status !== 0) throw new Error('playwright install failed');

    console.log('\nMelakukan build program (npm run build)...');
    const npmBuild = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: targetDir, stdio: 'inherit' });
    if (npmBuild.status !== 0) throw new Error('npm run build failed');

    console.log('\nMenjalankan konfigurasi interaktif (install.js)...');
    const nodeSetup = spawnSync('node', ['install.js'], { cwd: targetDir, stdio: 'inherit' });
    if (nodeSetup.status !== 0) throw new Error('install.js failed');

  } catch (err) {
    console.error('\x1b[31m❌ Terjadi kesalahan selama proses instalasi/setup:\x1b[0m', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
