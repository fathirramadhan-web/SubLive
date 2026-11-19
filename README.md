# SubLive

Subtitle otomatis untuk video, jalan langsung di browser. Tanpa API key, tanpa server, tanpa biaya. Audio tidak pernah diunggah.

## Fitur

- Transkrip otomatis pakai Whisper (transformers.js) di perangkat sendiri
- Tiga sumber suara:
  - **File** — pilih video/audio dari perangkat, subtitle sinkron saat video diputar
  - **Tab ini** — tangkap audio video yang sedang diputar di tab browser (tanpa mikrofon)
  - Model bahasa: Indonesia, Inggris, Jepang, Korea, Mandarin, Arab, Spanyol, atau deteksi otomatis
- Pilihan model: Tiny (~40 MB, cepat, disarankan HP) atau Base (~80 MB, lebih akurat)
- WebGPU bila tersedia, otomatis fallback ke WASM
- Layar penuh: video (mode file) atau halaman (mode tab)
- Unduh hasil transkrip sebagai `.srt`
- PWA — bisa di-install, kerja offline setelah model terunduh

## Pakai

Buka https://fathirramadhan-web.github.io/SubLive/

1. Pilih bahasa, klik **Muat model** (unduh pertama butuh internet, lalu tersimpan di cache browser)
2. Pilih sumber:
   - **File**: pilih video/audio, klik **Subtitle dari file**, lalu putar videonya
   - **Tab ini**: klik **Subtitle dari tab ini**, saat diminta pilih tab yang diputar dan aktifkan "Bagikan suara"
3. Subtitle muncul di bawah. Klik **Layar penuh** untuk fullscreen.
4. Klik **Unduh .srt** untuk simpan transkrip.

## Dukungan browser

| Mode | Chrome/Edge desktop | Chrome Android | Safari iPhone |
|---|---|---|---|
| File | Ya | Ya | Ya |
| Tab ini | Ya | Ya (versi terbaru, aktifkan "Bagikan suara") | Tidak (batas API) |
| Fullscreen | Ya | Ya | Ya (video) |

Mode tab memakai `getDisplayMedia({audio})`. Video fullscreen di situs lain (Netflix, YouTube app) tak bisa ditempeli overlay dari web — itu batas OS. Untuk itu pakai ekstensi desktop `../` (SubOverlay) di folder induk.

## Jalan lokal

```bash
cd sublive
python -m http.server 8765
```

Lalu buka `http://localhost:8765`. Butuh HTTP (bukan `file://`) karena service worker dan ES module worker.

## Deploy

Static site, tanpa build step. GitHub Pages dari branch `main` folder root. File yang diperlukan:

```
index.html   app.js   worker.js   sw.js   manifest.webmanifest   icon.svg
```

## Arsitektur

- `app.js` — UI, capture audio (file/tab), buffer 8 detik, sinkron subtitle, fullscreen, ekspor SRT
- `worker.js` — module worker, memuat model & menjalankan Whisper (`automatic-speech-recognition`), kirim chunk ber-timestamp ke UI
- `sw.js` — service worker, network-first untuk shell app, cache model ditangani cache HTTP browser
- `sub.js` (folder induk) — parser SRT/VTT untuk ekstensi overlay desktop

Model diunduh dari CDN publik Hugging Face. `env.allowLocalModels = false` di worker memaksa fetch CDN, jadi tidak ada file model di repo.

## Kredit

Model: [OpenAI Whisper](https://github.com/openai/whisper) lewat [transformers.js](https://huggingface.co/docs/transformers.js). Library dari jsdelivr, model dari Hugging Face CDN — keduanya gratis tanpa autentikasi.
