# Folio — PDF Studio

Public app: https://pdf-folio.ryeka.my.id<br />
Source: https://github.com/rochmanryeka/pdf-folio (private repository)

## Annotation tools

The English-language workspace supports added text, lines, arrows, rectangles, circles/ellipses, and highlights, alongside image and signature overlays. Select an object to change its appearance, duplicate it, move it, resize it, or delete it. Added text is exported as searchable PDF text; shapes are vectors rather than screenshots. Standard PDF fonts support Western/Latin characters; unsupported characters produce an explicit export error. Existing PDF text is not rewritten.

## Deployment

Netlify site: `pdffolio-ryeka` (`e40ac12e-0415-4100-ae3d-2d4446af0fa9`). Build command: `npm run build`; publish directory: `dist`; Node 24. DNS CNAME `pdf-folio.ryeka.my.id` points to `pdffolio-ryeka.netlify.app`.

```bash
npm ci
npm test
npm run build
npx --yes netlify-cli@latest deploy --prod --no-build --dir=dist --site=e40ac12e-0415-4100-ae3d-2d4446af0fa9
```

The commands above publish the locally built artifact. GitHub upload and Netlify publication are separate operations; do not assume a Git push automatically deploys unless continuous deployment has been explicitly configured.


Editor PDF browser-local dengan React 19, TypeScript, Vite, Tailwind CSS v4, dan komponen shadcn/ui vendored berbasis Radix. Workspace terinspirasi aplikasi PDF desktop/Acrobat, bukan produk resmi Adobe.

## Jalankan

Prasyarat Node.js >=22.12 dan npm.

```bash
npm ci
npm run dev
```

Buka **http://127.0.0.1:5186**. Untuk build produksi:

```bash
npm run build
npm run preview
```

Preview produksi: **http://127.0.0.1:4186**. `dist/` bisa disajikan oleh static hosting; jangan membuka `index.html` lewat `file://` karena PDF worker memerlukan HTTP.

## Fitur

- Buka PDF lokal lewat file picker atau drag-and-drop (maksimal 50 MB).
- Pratinjau dokumen dan thumbnail halaman menggunakan PDF.js worker lokal.
- Tanda tangan: gambar langsung dengan pointer/touch, ketik nama, atau unggah gambar.
- Tambahkan PNG, JPG, WebP (maksimal 15 MB; 40 megapiksel).
- Pindah objek, resize proporsional dengan sudut, ubah ukuran melalui panel properti, hapus.
- Posisi presisi dengan tombol panah; Shift + panah untuk langkah lebih besar.
- Putar halaman aktif 90° searah jarum jam.
- Undo/redo sampai 50 langkah; Ctrl/⌘+Z dan Ctrl/⌘+Shift+Z.
- Zoom, sesuaikan lebar, navigasi halaman, dan panel objek.
- Unduh PDF hasil edit dengan gambar tertanam; isi PDF asli tidak dirasterisasi.
- Tema gelap default, terang manual, pilihan tema disimpan lokal.
- Dokumen contoh tiga halaman dibuat sebagai PDF nyata di browser.

## Privasi dan batasan

Tidak ada backend, akun, telemetri, upload dokumen, atau API eksternal. Hanya aset aplikasi/worker yang dimuat dari server yang menyajikan aplikasi. Byte dokumen diproses di browser dengan PDF.js dan pdf-lib.

**Perubahan hanya disimpan dalam memori sesi.** Unduh PDF sebelum memuat ulang atau menutup tab. Membuka dokumen baru setelah perubahan meminta konfirmasi. Tanda tangan adalah gambar visual, **bukan tanda tangan digital tersertifikasi**. Mengubah PDF yang telah ditandatangani secara kriptografis dapat membatalkan validitas tanda tangan sebelumnya.

Aplikasi tidak menyediakan OCR, edit teks asli, pengisian formulir khusus, redaksi, enkripsi, atau tanda tangan tersertifikasi. PDF berpassword ditolak. PDF dengan struktur kompleks, formulir dinamis/XFA, atau fitur PDF khusus mungkin tidak sepenuhnya dipertahankan; periksa hasil unduhan sebelum dipakai. File besar dapat memakai RAM tinggi; batas ukuran bukan jaminan batas penggunaan memori.

## Pengujian

```bash
npm test
npm run build
npm audit --omit=dev
```

`build` juga memverifikasi utility Tailwind sungguh terkompilasi dan directive mentah tidak tersisa.

Browser E2E menggunakan Chrome lokal dan production preview yang sudah berjalan:

```bash
npm run preview
# di terminal lain
npm run test:e2e
```

Default Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`. Artefak QA default berada di scratch Hermes; override `QA_OUT` dan `BASE` bila diperlukan. Suite menguji unggah PDF/gambar, tanda tangan ketik/gambar, drag/resize nyata, undo/redo, rotasi, unduhan nyata, buka ulang ekspor, perbandingan piksel pada PDF berotasi/crop, mobile, dan browser errors.

## Struktur

- `src/App.tsx` — workspace dan interaksi editor
- `src/components/ui/` — komponen shadcn/ui vendored
- `src/components/PdfCanvas.tsx` — rendering PDF.js
- `src/components/SignatureDialog.tsx` — input tanda tangan
- `src/lib/pdf-engine.ts` — inspeksi, demo, ekspor PDF
- `src/lib/editor-state.ts` — undo/redo immutable
- `tests/` — unit dan komponen
- `scripts/e2e.mjs` — uji browser produksi
