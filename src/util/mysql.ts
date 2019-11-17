const url = require("url");
const parsed = url.parse(process.env.JAWSDB_URL);
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: parsed.hostname,
  user: parsed.auth.split(":")[0],
  password: parsed.auth.split(":")[1],
  port: parsed.port,
  database: parsed.path.replace("/", ""),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

setInterval(async () => {
  try {
    await pool.execute("select sleep(0.5)");
  } catch (Err) {
    console.log("keepalive:", Err);
  }
}, 30 * 1000);


module.exports.getPoolConnection = function() { return pool; };
