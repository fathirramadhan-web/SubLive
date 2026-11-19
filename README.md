# SubLive

SubLive adalah aplikasi web progresif (PWA) untuk menghasilkan subtitle otomatis pada materi video. Seluruh proses pengenalan suara dilakukan langsung di perangkat pengguna melalui model Whisper yang dijalankan di dalam browser. Aplikasi tidak memerlukan kunci API, tidak memiliki backend, tidak mengenakan biaya, dan tidak mengunggah data audio ke pihak ketiga.

## Ikhtisar

Saat pengguna memuat berkas video atau menangkap audio dari tab browser, SubLive mendekoding sinyal audio menjadi format yang dibutuhkan model: 16.000 sampel per detik, kanal mono. Audio kemudian dibagi menjadi segmen berdurasi delapan detik dan diproses oleh model pengenalan suara di dalam Web Worker. Hasilnya berupa potongan teks berikut cap waktu (timestamp) ditampilkan sebagai subtitle dan dapat diekspor ke berkas SubRip (`.srt`).

Arsitektur ini bersifat sepenuhnya sisi-klien. Akses jaringan hanya terjadi pada unduhan awal pustaka dan bobot model dari CDN publik. Setelah keduanya tersimpan dalam cache browser, aplikasi dapat berjalan tanpa koneksi internet.

## Fitur Utama

### Pengenalan suara di perangkat

Transkripsi memakai model Whisper melalui pustaka transformers.js. Tidak ada data yang dikirim ke server eksternal. Bahasa yang didukung meliputi Indonesia, Inggris, Jepang, Korea, Mandarin, Arab, dan Spanyol, serta opsi deteksi otomatis.

### Dua sumber audio

- **Berkas (File).** Pengguna memilih berkas video atau audio dari perangkat. Subtitle tampil sinkron dengan posisi pemutaran karena setiap potongan teks memiliki cap waktu yang cocok dengan linimasa video.
- **Tab browser (Tab ini).** Aplikasi menangkap audio dari tab yang sedang memutar video melalui `getDisplayMedia({ audio: true })`. Metode ini tidak memakai mikrofon; sinyal diambil langsung dari aliran audio tab. Pengguna diminta memilih tab yang dibagikan dan mengaktifkan "Bagikan suara".

### Pilihan model

| Model | Perkiraan ukuran | Karakteristik |
|---|---|---|
| Tiny | ±40 MB | Paling cepat; direkomendasikan untuk perangkat seluler |
| Base | ±80 MB | Lebih akurat pada aksen dan kondisi bising; pemrosesan lebih lambat |

Akselerasi perangkat keras digunakan bila browser menyediakan WebGPU. Bila tidak tersedia, aplikasi otomatis beralih ke backend WASM.

### Layar penuh

Tombol "Layar penuh" menyesuaikan sumber audio. Pada mode berkas, elemen video menjadi layar penuh dan subtitle ditempatkan di dalamnya. Pada mode tab, halaman aplikasi yang menjadi layar penuh, dengan subtitle tetap di bagian bawah.

### Ekspor dan instalasi

Transkrip dapat diunduh dalam format `.srt` yang kompatibel dengan mayoritas pemutar video. Sebagai PWA, aplikasi dapat dipasang ke layar utama dan beroperasi offline setelah unduhan awal selesai.

## Petunjuk Penggunaan

Alamat aplikasi: `https://fathirramadhan-web.github.io/SubLive/`

1. Pilih bahasa pada bagian "Model", tekan "Muat model". Pada penggunaan pertama, aplikasi mengunduh pustaka dan bobot model dari CDN; proses ini memerlukan internet. Unduhan berikutnya dilayani dari cache browser.
2. Setelah model siap, pilih sumber audio:
   - **File**: pilih berkas video atau audio, tekan "Subtitle dari file", lalu putar berkas. Subtitle mengikuti linimasa.
   - **Tab ini**: tekan "Subtitle dari tab ini". Pada dialog yang muncul, pilih tab yang memutar video dan aktifkan "Bagikan suara". Putar video; subtitle muncul sekitar delapan detik setelah dimulai, ditambah waktu komputasi.
3. Gunakan "Layar penuh" bila diperlukan. Tekan tombol yang sama atau Escape untuk keluar.
4. Tekan "Unduh .srt" untuk menyimpan transkrip.

## Kompatibilitas Browser

| Mode | Chrome/Edge Desktop | Chrome Android | Safari iPhone |
|---|---|---|---|
| Berkas | Didukung | Didukung | Didukung |
| Tab browser | Didukung | Didukung (versi terbaru; aktifkan "Bagikan suara") | Tidak didukung (keterbatasan API) |
| Layar penuh | Didukung | Didukung | Didukung (video) |

Mode "Tab ini" bergantung pada `getDisplayMedia` dengan dukungan audio. Pada Safari iPhone, antarmuka tersebut tidak menyediakan penangkapan audio tab, sehingga disarankan memakai mode berkas.

Aplikasi web tidak dapat menempatkan overlay di atas video yang diputar dalam aplikasi lain atau dalam pemutar layar penuh milik situs pihak ketiga, seperti Netflix atau aplikasi YouTube. Ini keterbatasan pada tingkat sistem operasi dan browser, bukan keterbatasan aplikasi. Untuk kebutuhan tersebut, tersedia ekstensi desktop SubOverlay pada direktori induk (`../`), yang menempatkan teks langsung di atas elemen video pada halaman web.

## Menjalankan Secara Lokal

```bash
cd sublive
python -m http.server 8765
```

Buka `http://localhost:8765`. Protokol HTTP diperlukan karena service worker dan ES module worker tidak dapat dijalankan dari skema `file://`.

## Deployment

Situs statis tanpa tahap kompilasi. Dapat dipublikasikan ke GitHub Pages dari cabang `main` pada direktori akar. Berkas yang diperlukan:

```
index.html
app.js
worker.js
sw.js
manifest.webmanifest
icon.svg
```

Tidak diperlukan variabel lingkungan, konfigurasi rahasia, maupun layanan tambahan. Bobot model tidak disertakan dalam repositori; berkas tersebut diambil dari CDN pada saat runtime.

## Struktur Kode

- **`app.js`** — antarmuka pengguna, penangkapan audio (berkas/tab), buffer delapan detik, sinkronisasi subtitle dengan linimasa, layar penuh, dan ekspor `.srt`.
- **`worker.js`** — modul Web Worker yang memuat model, menjalankan pipeline `automatic-speech-recognition`, dan mengirim potongan teks beserta cap waktu ke antarmuka. Pemrosesan berlangsung di luar thread utama agar antarmuka tetap responsif.
- **`sw.js`** — service worker dengan strategi network-first untuk berkas aplikasi. Cache bobot model dikelola oleh cache HTTP browser.
- **`manifest.webmanifest`** dan **`icon.svg`** — mendefinisikan aplikasi sebagai PWA yang dapat dipasang.
- **`sub.js`** (direktori induk) — parser berkas SRT dan VTT untuk ekstensi SubOverlay pada desktop.

Pada `worker.js`, `env.allowLocalModels = false` menginstruksikan transformers.js untuk mengambil model dari CDN publik. Dengan demikian, tidak ada berkas model yang perlu disimpan dalam repositori.

## Kredit

Pengenalan suara menggunakan [OpenAI Whisper](https://github.com/openai/whisper) melalui [transformers.js](https://huggingface.co/docs/transformers.js). Pustaka didistribusikan melalui jsDelivr; bobot model disajikan melalui CDN Hugging Face. Keduanya layanan publik tanpa autentikasi.
