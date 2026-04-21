const mysql = require("mysql2/promise");

exports.handler = async (event) => {
  // Database Configuration
  const connection = await mysql.createConnection({
    host: "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
    port: 4000,
    user: "4BnDqAzVHobv5Mp.root",
    password: "CorqRIhROkr26b7B", // Use environment variable
    database: "test",
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  try {
    const method = event.httpMethod;

    // GET: Fetch the queue
    if (method === "GET") {
      const [rows] = await connection.execute(
        "SELECT * FROM antrian ORDER BY priority DESC, tanggalDaftar ASC",
      );
      return { statusCode: 200, body: JSON.stringify({ antrian: rows }) };
    }

    // POST: Add new customer or update status
    if (method === "POST") {
      const body = JSON.parse(event.body);

      if (body.action === "add") {
        await connection.execute(
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
            new Date(),
          ],
        );
      } else if (body.action === "updateStatus" && body.status === "selesai") {
        await connection.execute(
          "UPDATE antrian SET status = ?, tanggalSelesai = NOW() WHERE id = ?",
          ["selesai", body.id],
        );
      } else if (body.action === "updateStatus") {
        // Untuk status 'dikerjakan', kita tidak perlu isi tanggalSelesai
        await connection.execute("UPDATE antrian SET status = ? WHERE id = ?", [
          body.status,
          body.id,
        ]);
      } else if (body.action === "delete") {
        await connection.execute("DELETE FROM antrian WHERE id = ?", [body.id]);
      }

      return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  } finally {
    await connection.end();
  }
};
