import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '.env');
const envExamplePath = path.resolve(__dirname, '.env.example');
const serverPath = path.resolve(__dirname, 'dist/server.js');

// Ensure the server has been built
if (!fs.existsSync(serverPath)) {
  console.error('\x1b[31mError: Build output not found. Please run "npm run build" first!\x1b[0m');
  process.exit(1);
}

// Ensure .env file exists
if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('\x1b[33m⚠️ Created .env file from .env.example template.\x1b[0m');
  } else {
    fs.writeFileSync(envPath, `UBERSUGGEST_BASE_URL=https://app.neilpatel.com\nPORT=8787\nUBERSUGGEST_DB_FILE=ubersuggest.db\n`);
    console.log('\x1b[33m⚠️ Created basic .env file.\x1b[0m');
  }
}

async function installClaudeDesktop() {
  let configPath = '';
  const home = os.homedir();
  if (process.platform === 'win32') {
    configPath = path.join(process.env.APPDATA || path.join(home, 'AppData/Roaming'), 'Claude/claude_desktop_config.json');
  } else if (process.platform === 'darwin') {
    configPath = path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json');
  } else {
    configPath = path.join(home, '.config/Claude/claude_desktop_config.json');
  }

  try {
    let config = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8').trim();
      if (content) {
        config = JSON.parse(content);
      }
    } else {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers['ubersuggest-node'] = {
      command: 'node',
      args: [
        '--experimental-sqlite',
        `--env-file=${envPath}`,
        serverPath,
        '--stdio'
      ]
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`\x1b[32m✅ Berhasil didaftarkan di Claude Desktop!\x1b[0m`);
    console.log(`File konfigurasi diperbarui: ${configPath}\n`);
  } catch (err) {
    console.error('\x1b[31m❌ Gagal mendaftarkan di Claude Desktop:\x1b[0m', err.message);
  }
}

async function installClaudeCode() {
  const home = os.homedir();
  const configPath = path.join(home, '.claude.json');

  try {
    let config = {};
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8').trim();
      if (content) {
        config = JSON.parse(content);
      }
    }

    config.projects = config.projects || {};
    const cwd = process.cwd();
    config.projects[cwd] = config.projects[cwd] || {};
    config.projects[cwd].mcpServers = config.projects[cwd].mcpServers || {};

    config.projects[cwd].mcpServers['ubersuggest-node'] = {
      type: 'stdio',
      command: 'node',
      args: [
        '--experimental-sqlite',
        `--env-file=${envPath}`,
        serverPath,
        '--stdio'
      ]
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`\x1b[32m✅ Berhasil didaftarkan di Claude Code CLI untuk project ini!\x1b[0m`);
    console.log(`File konfigurasi diperbarui: ${configPath}\n`);
  } catch (err) {
    console.error('\x1b[31m❌ Gagal mendaftarkan di Claude Code CLI:\x1b[0m', err.message);
  }
}

function printCursorGuide() {
  console.log('\x1b[36m=== Petunjuk Setup untuk Cursor / Codex ===\x1b[0m');
  console.log('1. Buka Cursor Settings -> Features -> MCP.');
  console.log('2. Klik "+ Add New MCP Server".');
  console.log('3. Isi formulir dengan nilai berikut:');
  console.log(`   - Name: ubersuggest-node`);
  console.log(`   - Type: stdio`);
  console.log(`   - Command: node`);
  console.log(`   - Arguments (Salin seluruh teks di bawah ini):`);
  console.log(`     --experimental-sqlite --env-file="${envPath}" "${serverPath}" --stdio`);
  console.log('4. Klik Save dan restart Cursor.\n');
}

async function main() {
  console.log('\x1b[35m=== Ubersuggest MCP Standalone Node Installer ===\x1b[0m\n');

  const rl = readline.createInterface({ input, output });

  console.log('Pilih client MCP yang ingin Anda konfigurasikan:');
  console.log(' [1] Claude Desktop App (Konfigurasi otomatis)');
  console.log(' [2] Cursor / Codex IDE (Tampilkan petunjuk manual)');
  console.log(' [3] Claude Code CLI (Konfigurasi otomatis project saat ini)');
  console.log(' [4] Semua (Konfigurasikan semua di atas)');
  console.log(' [5] Keluar');

  const choice = await rl.question('\nMasukkan pilihan Anda (1-5): ');
  rl.close();

  console.log('');

  switch (choice.trim()) {
    case '1':
      await installClaudeDesktop();
      break;
    case '2':
      printCursorGuide();
      break;
    case '3':
      await installClaudeCode();
      break;
    case '4':
      await installClaudeDesktop();
      await installClaudeCode();
      printCursorGuide();
      break;
    case '5':
      console.log('Instalasi dibatalkan.');
      process.exit(0);
      break;
    default:
      console.log('\x1b[31mPilihan tidak valid.\x1b[0m');
      process.exit(1);
  }

  console.log('\x1b[32mProses konfigurasi selesai!\x1b[0m');
  console.log('Ingat untuk menjalankan "npm run dev" jika Anda perlu membuka http://127.0.0.1:8787/guide untuk memvalidasi/menyambungkan sesi.');
}

main().catch(err => {
  console.error('Error saat instalasi:', err);
  process.exit(1);
});
