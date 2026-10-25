Nto.presett Web Patcher - Vercel

1. Unggah SEMUA isi folder ini ke root repository GitHub.
2. Pastikan index.html berada di root, bukan folder bertingkat.
3. Import repository di Vercel, Framework Preset: Other.
4. Kosongkan Build Command; Output Directory default/root.
5. Deploy.

Catatan HQ METHOD:
Website ini mengirim video ke API pihak ketiga api.kuronaiapp.com. Jika status berhenti di HQ METHOD, penyebabnya dapat berupa server API yang lambat/tidak merespons, CORS, jaringan, atau endpoint /uploaden/ bermasalah. Versi ini memberi batas waktu 15 menit dan pesan yang lebih jelas; ia tidak dapat memperbaiki gangguan pada server API itu sendiri.

Logo dan latar belakang memakai file lokal dalam folder icons/ dan ui-background.mp4; unggah semuanya.

Perbaikan tambahan HQ METHOD:
- Parser stream NDJSON diperbaiki agar baris JSON terakhir tanpa newline tetap diproses. Ini dapat menyebabkan event complete/file_id terlewat sebelumnya.
- Pengenalan ID hasil diperluas untuk file_id, fileId, dan bentuk nested result/data.
- Jika server hanya mengirim status queued dan tidak pernah mengirim ID hasil, kemungkinan backend/API masih perlu diperiksa; frontend tidak dapat menebak endpoint polling yang tidak didokumentasikan.
