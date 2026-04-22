const mysql = require("mysql2/promise");

// Setup koneksi Pool ke TiDB (Sama seperti api.js)
const pool = mysql.createPool({
  host: "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
  port: 4000,
  user: "4BnDqAzVHobv5Mp.root",
  password: process.env.DB_PASSWORD || "CorqRIhROkr26b7B",
  database: "test",
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  connectionLimit: 5,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Fungsi pintar untuk membedah pesan dari penonton
function parseDonationMessage(rawMessage) {
  let layanan = "Saweria"; // Layanan default jika mereka lupa ketik command
  let discord = "-";     // Discord default
  let keterangan = rawMessage || "";

  // 1. Cari command layanan (contoh: !toa, !whiwa, !matrix, !fotg, !event)
  // Case-insensitive (huruf besar/kecil bebas)
  const layananRegex = /!(toa|whiwa|matrix|fotg|event)/i;
  const layananMatch = keterangan.match(layananRegex);
  
  if (layananMatch) {
    layanan = layananMatch[1].toUpperCase(); // Ubah jadi TOA, WHIWA, dll
    keterangan = keterangan.replace(layananRegex, ""); // Hapus command dari pesan
  }

  // 2. Cari command discord (contoh: !dc reiga_moon)
  // Menangkap kata apapun setelah "!dc "
  const dcRegex = /!dc\s+(\S+)/i;
  const dcMatch = keterangan.match(dcRegex);
  
  if (dcMatch) {
    discord = dcMatch[1]; // Ambil nama discord-nya
    keterangan = keterangan.replace(dcMatch[0], ""); // Hapus command dari pesan
  }

  // Bersihkan spasi berlebih di awal/akhir pesan
  keterangan = keterangan.trim();
  
  // Jika pesan kosong (hanya ketik command saja)
  if (!keterangan) {
    keterangan = "Jalur VIP Saweria Auto-Input";
  }

  return { layanan, discord, keterangan };
}

exports.handler = async (event) => {
  // Webhook harus menggunakan metode POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // Tangkap data dari Saweria
    const payload = JSON.parse(event.body);

    // Pastikan ini adalah payload donasi yang valid dari Saweria
    // (Saweria biasanya menaruh data di dalam object "data" atau langsung di root)
    // Format V1 Saweria (payload.data.donator_name), atau root (payload.donator_name)
    const donatorName = payload.data?.donator_name || payload.donator_name;
    const rawMessage = payload.data?.message || payload.message || "";
    
    // Keamanan dasar: Abaikan jika tidak ada nama donatur (mungkin test ping)
    if (!donatorName) {
      return { statusCode: 200, body: "Not a valid donation payload, skipped." };
    }

    // Bedah pesan untuk mencari command
    const { layanan, discord, keterangan } = parseDonationMessage(rawMessage);

    // Input ke Database sebagai VIP Prioritas 4
    await pool.execute(
      "INSERT INTO antrian (id, youtubeName, memberType, layanan, discord, keterangan, status, priority, tanggalDaftar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        Date.now(),           // ID unik (timestamp)
        donatorName,          // youtubeName = Nama Donatur Saweria
        "VIP",                // memberType = Otomatis VIP!
        layanan,              // Hasil parse regex
        discord,              // Hasil parse regex
        keterangan,           // Sisa pesan
        "menunggu",           // status
        4,                    // Priority (VIP = 4)
        new Date()            // Waktu mendaftar
      ]
    );

    console.log(`✅ VIP Terdaftar: ${donatorName} [${layanan}]`);

    // Kembalikan 200 OK agar Saweria tahu webhook-nya berhasil diterima
    return { 
      statusCode: 200, 
      body: JSON.stringify({ message: "Webhook received & stored in TiDB" }) 
    };

  } catch (error) {
    console.error("Webhook Error:", error);
    // Kita harus tetap return 200 ke Saweria jika error syntax, agar Saweria tidak terus-terusan mengulang pengiriman (retry ping)
    return { statusCode: 200, body: "Error processing webhook: " + error.message };
  }
};