const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

const isFly = !!process.env.FLY_APP_NAME;

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for your extension
app.use(cors());
app.use(express.json());

// Initialize database
const dbDir = isFly ? "/data" : path.join(__dirname, "data");

const dbPath = isFly
  ? path.join("/data", "gamedata.db")
  : path.resolve(process.cwd(), "data", "gamedata.db");

// Ensure the directory exists
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created directory: ${dbDir}`);
  } catch (err) {
    console.error(`Failed to create directory: ${err.message}`);
  }
}

// Set proper permissions for the directory (only needed for certain environments)
if (!isFly && process.platform !== "win32") {
  try {
    fs.chmodSync(dbDir, 0o755);
    console.log(`Set permissions for directory: ${dbDir}`);
  } catch (err) {
    console.error(`Failed to set directory permissions: ${err.message}`);
  }
}

// Open database with more detailed error handling
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to open DB:", err.message);
    console.error("Database path:", dbPath);
    console.error("Directory exists:", fs.existsSync(dbDir));

    if (fs.existsSync(dbDir)) {
      console.error(
        "Directory is writable:",
        fs.accessSync(dbDir, fs.constants.W_OK | fs.constants.R_OK)
      );
    }

    // Try an alternative path as fallback
    const altDbPath = path.join(__dirname, "gamedata.db");
    console.log(`Attempting to use alternative path: ${altDbPath}`);

    db = new sqlite3.Database(altDbPath, (altErr) => {
      if (altErr) {
        console.error("Failed with alternative path too:", altErr.message);
      } else {
        console.log(`DB opened at alternative location: ${altDbPath}`);
      }
    });
  } else {
    console.log(`DB opened at ${dbPath}`);
  }
});

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

  // Create a view that sorts the data with the desired logic
  db.run(`
    CREATE VIEW IF NOT EXISTS sorted_game_progress AS
    SELECT * FROM game_progress
    ORDER BY 
      CASE WHEN completion_time_formatted = '00:00:00' THEN 1 ELSE 0 END,
      completion_time_ms ASC
  `);
});

// Endpoint to receive data
app.post("/api/data", (req, res) => {
  const data = req.body;

  // save to database
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
  // Only use this function when not on Fly.io
  if (isFly) return "0.0.0.0";

  const { networkInterfaces } = require("os");
  const interfaces = networkInterfaces();
  const results = [];
  // Loop through all network interfaces
  for (const name of Object.keys(interfaces)) {
    // Skip over loopback interfaces like 127.0.0.1
    if (name.includes("Loopback") || name.includes("Pseudo")) {
      continue;
    }

    for (const iface of interfaces[name]) {
      // Skip over non-IPv4 and internal interfaces
      if (iface.family === "IPv4" && !iface.internal) {
        results.push({
          name: name,
          address: iface.address,
        });
      }
    }
  }

  // If we found any interfaces, return the first one
  // (or you could modify this to return all and let the user choose)
  if (results.length > 0) {
    console.log("Available network interfaces:");
    results.forEach((iface, index) => {
      console.log(`${index + 1}: ${iface.name} - ${iface.address}`);
    });
    return results[0].address;
  }

  // Fallback to localhost if no network interfaces found
  return "127.0.0.1";
}

if (isFly) {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${port}/`);
  });
} else {
  app.listen(port, "0.0.0.0", () => {
    const localIP = getLocalIP();
    console.log("Server is running at:");
    console.log(`- http://localhost:${port}`);
    console.log(`- http://${localIP}:${port} (accessible on local network)`);
  });
}

// Close database connection when app terminates
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

// #region leaderboard

// Serve static files from the views/leaderboard directory
app.use("/", express.static(path.join(__dirname, "views", "leaderboard")));

// Endpoint to view all data in HTML format
// Replace your existing "/" endpoint with this
app.get("/", (_, res) => {
  const filePath = path.join(
    __dirname,
    "views",
    "leaderboard",
    "leaderboard.html"
  );

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) {
      console.error("Error reading HTML file:", err);
      return res.status(500).send("Error loading page");
    }

    res.send(html);
  });
});

// Add this helper function at the top of your file
function timeToSeconds(timeString) {
  if (!timeString || timeString === "00:00:00") return Number.MAX_SAFE_INTEGER;

  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

// Add this endpoint to provide the data for the table
app.get("/api/gamedata", (_, res) => {
  db.all("SELECT * FROM sorted_game_progress", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    res.json(rows);
  });
});

// #endregion

// #region amin

// Middleware for basic authentication
const basicAuth = (req, res, next) => {
  // Check if Authorization header exists
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.status(401).send("Authentication required");
  }

  // Parse the Authorization header
  const auth = Buffer.from(authHeader.split(" ")[1], "base64")
    .toString()
    .split(":");
  const username = auth[0];
  const password = auth[1];

  // Check credentials (hardcoded admin/password)
  if (username === "admin" && password === "password") {
    next(); // Authentication successful
  } else {
    res.setHeader("WWW-Authenticate", "Basic");
    return res.status(401).send("Invalid credentials");
  }
};

// Endpoint to find and replace a name
app.post("/api/replace-name", basicAuth, (req, res) => {
  const { findName, replaceName } = req.body;

  if (!findName || !replaceName) {
    return res.status(400).json({
      success: false,
      message: "Both findName and replaceName are required",
    });
  }

  // Update records in the database
  const stmt = db.prepare(`
    UPDATE game_progress 
    SET name = ? 
    WHERE name = ?
  `);

  stmt.run(replaceName, findName, function (err) {
    stmt.finalize();

    if (err) {
      return res.status(500).json({
        success: false,
        message: "Failed to update names",
        error: err.message,
      });
    }

    // Return the number of rows affected
    res.status(200).json({
      success: true,
      message: `Successfully replaced ${this.changes} occurrences of "${findName}" with "${replaceName}"`,
      recordsUpdated: this.changes,
    });
  });
});

// Endpoint to drop a specified table
app.delete("/api/drop-table", basicAuth, (req, res) => {
  const { tableName } = req.body;

  if (!tableName) {
    return res.status(400).json({
      success: false,
      message: "Table name is required",
    });
  }

  // Optional: Add a safety check to prevent dropping critical tables
  const restrictedTables = ["users", "critical_data"]; // Add your critical tables here
  if (restrictedTables.includes(tableName)) {
    return res.status(403).json({
      success: false,
      message: "Cannot drop restricted table",
    });
  }

  // Execute the DROP TABLE query
  db.run(`DROP TABLE IF EXISTS ${tableName}`, function (err) {
    if (err) {
      return res.status(500).json({
        success: false,
        message: `Failed to drop table: ${tableName}`,
        error: err.message,
      });
    }

    res.status(200).json({
      success: true,
      message: `Table ${tableName} has been dropped successfully`,
    });
  });
});

// Serve static files from the views/admin directory
app.use("/admin", express.static(path.join(__dirname, "views", "admin")));

// Endpoint to serve the admin dashboard HTML
app.get("/admin", basicAuth, (_, res) => {
  const filePath = path.join(__dirname, "views", "admin", "admin.html");

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) {
      console.error("Error reading admin HTML file:", err);
      return res.status(500).send("Error loading admin page");
    }

    res.send(html);
  });
});

// #endregion
