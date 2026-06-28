# Ubersuggest MCP - Standalone Node.js Runner

Implementasi standalone Model Context Protocol (MCP) server untuk Ubersuggest yang berjalan sepenuhnya di komputer lokal menggunakan database SQLite (`node:sqlite`) dan Playwright lokal, tanpa dependensi cloud.

## Fitur Utama

- **Zero Cloud Infrastructure:** Didesain sepenuhnya untuk dijalankan secara lokal di PC Anda.
- **Fast Local Caching:** Data Site Audit disimpan dalam cache SQLite lokal selama 24 jam. Panggilan berulang selesai dalam < 10ms.
- **Auto-Formatting:** Menyajikan data teknis audit dalam format Markdown ringkas yang ramah terhadap LLM/klien MCP.
- **Playwright Reconnect:** Otomatis memperbarui session/cookie Ubersuggest Anda menggunakan browser Playwright lokal.

---

## Cara Install (One-Line Setup)

Anda dapat menginstal dan mengonfigurasikan server MCP ini secara otomatis langsung dari GitHub menggunakan satu baris perintah berikut:

```bash
npx github:habibi/ubersuggest-mcp-node
```

Perintah ini akan secara otomatis:
1. Meminta lokasi folder instalasi permanen di komputer Anda (default: `~/ubersuggest-mcp-node`).
2. Mengkloning repositori ini secara otomatis.
3. Memasang dependensi Node.js & browser Playwright (Chromium).
4. Melakukan build TypeScript.
5. Membuka wizard interaktif untuk mendaftarkan server ke klien MCP pilihan Anda (**Claude Desktop**, **Cursor (Codex)**, **Claude Code CLI**, atau semuanya!).

Jika Anda sudah mengkloning repositori ini secara manual, Anda bisa menjalankan konfigurasi interaktif langsung dari dalam folder proyek dengan perintah:

```bash
npm install && npx playwright install chromium && npm run build && npm run setup
```

---

## Panduan Penyetelan Manual

### 1. Claude Desktop

Penyetelan manual pada berkas konfigurasi Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ubersuggest-node": {
      "command": "node",
      "args": [
        "--experimental-sqlite",
        "--env-file=/PATH/TO/ubersuggest-mcp-node/.env",
        "/PATH/TO/ubersuggest-mcp-node/dist/server.js",
        "--stdio"
      ]
    }
  }
}
```
*(Ganti `/PATH/TO/` dengan path absolut direktori proyek ini).*

### 2. Cursor (Codex)

1. Buka **Cursor Settings -> Features -> MCP**.
2. Klik **+ Add New MCP Server**.
3. Isi parameter berikut:
   - **Name:** `ubersuggest-node`
   - **Type:** `stdio`
   - **Command:** `node`
   - **Arguments:** `--experimental-sqlite --env-file="/PATH/TO/ubersuggest-mcp-node/.env" "/PATH/TO/ubersuggest-mcp-node/dist/server.js" --stdio`
4. Klik **Save** dan restart Cursor.

---

## Menghubungkan Akun Ubersuggest (Penting)

Sebelum MCP dapat digunakan, Anda harus mengisi sesi login Ubersuggest Anda ke database lokal.

1. Jalankan API server lokal:
   ```bash
   npm run dev
   ```
2. Buka browser dan akses halaman panduan lokal:
   ```
   http://127.0.0.1:8787/guide
   ```
3. Lakukan login menggunakan akun MCP Anda (kredensial default: username `admin`, password `admin-secure-password-123`).
4. Ikuti instruksi di layar untuk menempelkan Cookies browser Anda dari situs [app.neilpatel.com](https://app.neilpatel.com). Sesi akan disimpan di SQLite lokal (`ubersuggest.db`) dengan enkripsi aman.
5. Selesai! Matikan server API (`Ctrl + C`) dan jalankan MCP client Anda.

---

## Daftar Tools MCP yang Tersedia

1. **`ubersuggest_subscription`** — Mengambil status langganan Ubersuggest Anda.
2. **`ubersuggest_projects`** — Mengambil daftar proyek website yang dipantau di akun Anda.
3. **`ubersuggest_domain_overview`** — Mengambil metrik lalu lintas (traffic), organic keywords, backlinks, dan SEO score domain tertentu.
4. **`ubersuggest_domain_top_pages`** — Mengambil halaman dengan kunjungan tertinggi dari suatu domain.
5. **`ubersuggest_traffic_estimation`** — Mengambil riwayat estimasi traffic bulanan.
6. **`ubersuggest_keyword_research`** — Melakukan riset ide kata kunci (volume, SEO difficulty, CPC, paid difficulty).
7. **`ubersuggest_seo_opportunities`** — Mengambil daftar peluang perbaikan SEO spesifik.
8. **`ubersuggest_site_audit`** — Melakukan technical audit website (Core Web Vitals + Crawl Issues).
9. **`ubersuggest_auth_reconnect`** — Melakukan penyambungan ulang sesi Ubersuggest.
10. **`ubersuggest_auth_logout`** — Logout sesi Ubersuggest dari database lokal.
