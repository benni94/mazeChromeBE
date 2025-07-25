const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
// Add SQL database package
const sqlite3 = require("sqlite3").verbose(); // For SQLite
// For MySQL you would use: const mysql = require('mysql2');

const app = express();
const PORT = 3000;

// Enable CORS for your extension
app.use(cors());
app.use(express.json());

// Initialize database
const dbPath = path.join(__dirname, "gamedata.db");
const db = new sqlite3.Database(dbPath);

// Create table if it doesn't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS game_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT(20),
    level INTEGER,
    function_details TEXT,
    total_functions INTEGER,
    completion_time_ms INTEGER,
    completion_time_formatted TEXT,
    timestamp TEXT
  )`);
});

// Endpoint to receive data
app.post("/api/data", (req, res) => {
  const data = req.body;

  const berlin = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Berlin",
  });
  const [date, time] = berlin.split(", ");
  const [dd, MM] = date.split("/");
  const [hh, mm, ss] = time.split(":");

  // Create a unique filename based on timestamp
  const filename = `data_${hh}_${mm}_${ss}_${dd}_${MM}.json`;
  const dataDir = path.join(__dirname, "data");
  const filePath = path.join(dataDir, filename);

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // Write data to file
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  // Also save to database
  const stmt = db.prepare(`
    INSERT INTO game_progress (
      name,
      level,
      function_details,
      total_functions,
      completion_time_ms,
      completion_time_formatted,
      timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.name || "Anonymous",
    data.level,
    JSON.stringify(data.functionDetails),
    data.totalFunctions,
    data.completionTimeMs,
    data.completionTimeFormatted,
    data.timestamp
  );

  stmt.finalize();

  res
    .status(200)
    .json({ success: true, message: "Data received and saved to database" });
});

// Get the LAN IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const ifaceList of Object.values(interfaces)) {
    for (const iface of ifaceList) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

app.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIP();
  console.log("Server is running at:");
  console.log(`- http://localhost:${PORT}`);
  console.log(`- http://${localIP}:${PORT} (accessible on local network)`);
});

// Close database connection when app terminates
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
