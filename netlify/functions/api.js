const mysql = require("mysql2/promise");

// 1. BUAT POOL DI LUAR HANDLER (SANGAT PENTING!)
// Ini membuat Netlify me-reuse (daur ulang) koneksi yang sudah ada,
// sehingga TiDB tidak meledak karena kebanjiran request baru.
const pool = mysql.createPool({
  host: "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
  port: 4000,
  user: "4BnDqAzVHobv5Mp.root",
  password: process.env.DB_PASSWORD || "CorqRIhROkr26b7B", // Gunakan Env Var di Netlify nanti
  database: "test",
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  connectionLimit: 5, // Batasi 5 koneksi bersamaan agar aman di tier gratis TiDB
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// 2. SETUP CORS HEADERS
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

exports.handler = async (event) => {
  // 3. TANGANI PREFLIGHT REQUEST DARI BROWSER
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "OK" };
  }

  try {
    const method = event.httpMethod;

    // GET: Fetch the queue
    if (method === "GET") {
      // Gunakan pool.execute, BUKAN connection.execute
      const [rows] = await pool.execute(
        "SELECT * FROM antrian ORDER BY priority DESC, tanggalDaftar ASC",
      );
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ antrian: rows }),
      };
    }

    // POST: Add new customer or update status
    if (method === "POST") {
      const body = JSON.parse(event.body);

      if (body.action === "add") {
        await pool.execute(
          "INSERT INTO antrian (id, youtubeName, memberType, layanan, discord, keterangan, status, priority, tanggalDaftar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            Date.now(),
            body.youtubeName,
            body.memberType,
            body.layanan,
            body.discord,
            body.keterangan,
            "menunggu",
            body.priority,
            new Date(), // Tanggal Daftar otomatis
          ],
        );
      } 
      
      else if (body.action === "updateStatusWithLayanan") {
        await pool.execute(
          "UPDATE antrian SET status = ?, layanan = ? WHERE id = ?",
          [body.status, body.layanan, body.id],
        );
      } 
      
      else if (body.action === "updateStatus" && body.status === "selesai") {
        await pool.execute(
          "UPDATE antrian SET status = ?, tanggalSelesai = NOW() WHERE id = ?",
          ["selesai", body.id],
        );
      } else if (body.action === "updateStatus") {
        await pool.execute("UPDATE antrian SET status = ? WHERE id = ?", [
          body.status,
          body.id,
        ]);
      } else if (body.action === "delete") {
        await pool.execute("DELETE FROM antrian WHERE id = ?", [body.id]);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Success" }),
      };
    }

    // Jika method selain GET, POST, OPTIONS
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  } catch (err) {
    console.error("Database Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
  // 4. HAPUS BLOK FINALLY
  // Kita TIDAK BOLEH melakukan `pool.end()` di sini, karena kita butuh pool
  // tetap hidup untuk request selanjutnya dari penonton yang lain.
};
