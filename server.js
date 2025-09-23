const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

const isFly = !!process.env.FLY_APP_NAME;

const app = express();
const port = process.env.PORT || 3000;

const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "@password666";

let backupInterval = null;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let submissionsLocked = false; // When true, POST /api/data will reject inserts
const RATE_LIMIT_MAX = 1; // max requests
const RATE_LIMIT_WINDOW_MS = 20 * 1000; // per 20 seconds

// Simple in-memory rate limiter buckets: ip -> [timestamps]
const rateBuckets = new Map();

function dataRateLimiter(req, res, next) {
  try {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const ip =
      req.ip ||
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      (req.connection && req.connection.remoteAddress) ||
      "unknown";

    let bucket = rateBuckets.get(ip) || [];
    // prune old timestamps
    bucket = bucket.filter((ts) => ts > windowStart);

    if (bucket.length >= RATE_LIMIT_MAX) {
      const retryMs = bucket[0] + RATE_LIMIT_WINDOW_MS - now;
      res.set("Retry-After", Math.ceil(Math.max(retryMs, 0) / 1000));
      return res.status(429).json({
        success: false,
        message: `Rate limit exceeded: max ${RATE_LIMIT_MAX} requests in ${Math.floor(
          RATE_LIMIT_WINDOW_MS / 1000
        )}s. Bitte versuchen Sie es später erneut.`,
      });
    }

    bucket.push(now);
    rateBuckets.set(ip, bucket);
    next();
  } catch (e) {
    // On error, allow request but log it
    console.error("dataRateLimiter error:", e);
    next();
  }
}

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
let db = new sqlite3.Database(dbPath, (err) => {
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

// #region receive data

// Endpoint to receive data with name uniqueness check
app.post("/api/data", dataRateLimiter, (req, res) => {
  // Reject inserts when submissions are locked
  if (submissionsLocked) {
    return res.status(423).send("Einsendungen sind derzeit gesperrt.");
  }
  const data = req.body;
  const name = data.name || "Anonymous";

  // Check if the name already exists in the database (case-insensitive)
  db.get(
    "SELECT COUNT(*) as count FROM game_progress WHERE LOWER(name) = LOWER(?)",
    [name],
    (err, result) => {
      if (err) {
        console.error("Database error checking name:", err);
        return res
          .status(500)
          .send("Database error when checking name uniqueness: " + err.message);
      }

      // If name exists, return an error with plain text
      if (result.count > 0) {
        console.log(
          `Name "${name}" already exists in database (case-insensitive). Sending error response.`
        );
        return res
          .status(400)
          .send(
            "Dieser Name wird bereits verwendet. Bitte wählen Sie einen anderen Namen."
          );
      }

      // If name is unique, proceed with insertion
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
        name,
        data.level,
        JSON.stringify(data.functionDetails),
        data.totalFunctions,
        data.completionTimeMs,
        data.completionTimeFormatted,
        data.timestamp,
        function (err) {
          if (err) {
            console.error("Error inserting data:", err);
            return res.status(500).json({
              success: false,
              message: "Failed to save data",
              error: err.message,
            });
          }

          console.log(
            `Successfully inserted data for "${name}" with ID ${this.lastID}`
          );

          res.status(200).json({
            success: true,
            message: "Data saved successfully",
            id: this.lastID,
          });
        }
      );

      stmt.finalize();
    }
  );
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
    console.log("Admin page is running at:");
    console.log(`- http://localhost:${port}/admin`);
    console.log(
      `- http://${localIP}:${port}/admin (accessible on local network)`
    );
  });
}

// Close database connection when app terminates
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

// #endregion

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
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
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
      message: "Beide findName und replaceName werden benötigt.",
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
        message: "Namen konnten nicht aktuallisiert werden!",
        error: err.message,
      });
    }

    // Return the number of rows affected
    if (this.changes === 0) {
      res.status(200).json({
        success: false,
        message: `Keine Name(n) von "${findName}" zu "${replaceName}" ersetzt!`,
        recordsUpdated: 0,
      });
    } else {
      res.status(200).json({
        success: true,
        message: `${this.changes} Name(n) von "${findName}" erfolgreich durch "${replaceName}" ersetzt!`,
        recordsUpdated: this.changes,
      });
    }
  });
});

// Endpoint to clear a specified table
app.delete("/api/clear-table", basicAuth, (req, res) => {
  const { tableName } = req.body;

  if (!tableName) {
    return res.status(400).json({
      success: false,
      message: "Table name is required",
    });
  }

  // Optional: Add a safety check to prevent clearing critical tables
  const restrictedTables = ["users", "critical_data"]; // Add your critical tables here
  if (restrictedTables.includes(tableName)) {
    return res.status(403).json({
      success: false,
      message: "Cannot clear restricted table",
    });
  }

  // Execute the DELETE FROM query
  db.run(`DELETE FROM ${tableName}`, function (err) {
    if (err) {
      return res.status(500).json({
        success: false,
        message: `Failed to clear table: ${tableName}`,
        error: err.message,
      });
    }

    res.status(200).json({
      success: true,
      message: `Table ${tableName} has been cleared successfully`,
    });
  });
});

app.post("/api/restore-db", basicAuth, (req, res) => {
  // Define paths
  const backupDbPath = isFly
    ? path.join("/data", "gamedata_backup.db")
    : path.resolve(process.cwd(), "data", "gamedata_backup.db");

  const targetDbPath = isFly
    ? path.join("/data", "gamedata.db")
    : path.resolve(process.cwd(), "data", "gamedata.db");

  // Check if backup file exists
  if (!fs.existsSync(backupDbPath)) {
    return res.status(404).json({
      success: false,
      message: "Backup-Datei nicht gefunden: " + backupDbPath,
    });
  }

  try {
    // Close the current database connection
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err);
        return res.status(500).json({
          success: false,
          message:
            "Fehler beim Schließen der Datenbankverbindung: " + err.message,
        });
      }

      // Copy the backup file to the target location
      try {
        fs.copyFileSync(backupDbPath, targetDbPath);

        // Reopen the database
        db = new sqlite3.Database(targetDbPath, (err) => {
          if (err) {
            console.error("Error reopening database:", err);
            return res.status(500).json({
              success: false,
              message:
                "Datenbank wurde wiederhergestellt, aber konnte nicht neu geöffnet werden: " +
                err.message,
            });
          }

          // Success response
          res.status(200).json({
            success: true,
            message: "Datenbank wurde erfolgreich wiederhergestellt!",
          });
        });
      } catch (copyErr) {
        console.error("Error copying database file:", copyErr);

        // Try to reopen the original database
        db = new sqlite3.Database(targetDbPath);

        return res.status(500).json({
          success: false,
          message: "Fehler beim Kopieren der Backup-Datei: " + copyErr.message,
        });
      }
    });
  } catch (error) {
    console.error("Unexpected error during database restore:", error);
    return res.status(500).json({
      success: false,
      message: "Unerwarteter Fehler: " + error.message,
    });
  }
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

app.post("/api/backup-service/start", basicAuth, (req, res) => {
  if (backupInterval) {
    return res.status(400).json({
      success: false,
      message: "Backup-Service läuft bereits",
    });
  }

  try {
    // Start the backup service
    backupInterval = setInterval(() => {
      const sourceDbPath = isFly
        ? path.join("/data", "gamedata.db")
        : path.resolve(process.cwd(), "data", "gamedata.db");

      const backupDbPath = isFly
        ? path.join("/data", "gamedata_backup.db")
        : path.resolve(process.cwd(), "data", "gamedata_backup.db");

      try {
        fs.copyFileSync(sourceDbPath, backupDbPath);
        console.log(`Backup created at ${new Date().toISOString()}`);
      } catch (err) {
        console.error("Error creating backup:", err);
      }
    }, BACKUP_INTERVAL_MS);

    // Create an immediate backup when service starts
    const sourceDbPath = isFly
      ? path.join("/data", "gamedata.db")
      : path.resolve(process.cwd(), "data", "gamedata.db");

    const backupDbPath = isFly
      ? path.join("/data", "gamedata_backup.db")
      : path.resolve(process.cwd(), "data", "gamedata_backup.db");

    fs.copyFileSync(sourceDbPath, backupDbPath);

    res.status(200).json({
      success: true,
      message: "Backup-Service wurde gestartet",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Fehler beim Starten des Backup-Service: " + error.message,
    });
  }
});

app.post("/api/backup-service/stop", basicAuth, (req, res) => {
  if (!backupInterval) {
    return res.status(400).json({
      success: false,
      message: "Backup-Service läuft nicht",
    });
  }

  try {
    clearInterval(backupInterval);
    backupInterval = null;
    res.status(200).json({
      success: true,
      message: "Backup-Service wurde gestoppt",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Fehler beim Stoppen des Backup-Service: " + error.message,
    });
  }
});

app.get("/api/backup-service/status", basicAuth, (req, res) => {
  res.status(200).json({
    success: true,
    isRunning: backupInterval !== null,
    message:
      backupInterval !== null
        ? "Backup-Service läuft"
        : "Backup-Service ist gestoppt",
  });
});

// Submissions lock endpoints (admin protected)
app.get("/api/submissions-lock/status", basicAuth, (req, res) => {
  res.status(200).json({
    success: true,
    locked: submissionsLocked,
    message: submissionsLocked
      ? "Einsendungen sind GESPERRT"
      : "Einsendungen sind FREIGEGEBEN",
  });
});

app.post("/api/submissions-lock/set", basicAuth, (req, res) => {
  const { locked } = req.body || {};
  if (typeof locked !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "Field 'locked' (boolean) is required",
    });
  }
  submissionsLocked = locked;
  return res.status(200).json({
    success: true,
    message: `Einsendungen wurden ${
      submissionsLocked ? "gesperrt" : "freigegeben"
    }.`,
    locked: submissionsLocked,
  });
});

// #endregion

// #region mock data

// Endpoint to load 30 mock users into the database
app.post("/api/load-mock-data", basicAuth, (req, res) => {
  try {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

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

      const now = Date.now();

      for (let i = 1; i <= 30; i++) {
        const name = `Mock User ${i}`;
        const level = Math.floor(Math.random() * 10) + 1; // 1..10

        // Build function_details as object with counts per function
        const functionDetailsObj = {
          geradeausBewegen: Math.floor(Math.random() * 15), // 0..14
          if: Math.floor(Math.random() * 7), // 0..6
          linksDrehen: Math.floor(Math.random() * 8), // 0..7
          rechtsDrehen: Math.floor(Math.random() * 7), // 0..6
          while: Math.floor(Math.random() * 9), // 0..8
        };

        const totalFunctions = Object.values(functionDetailsObj).reduce(
          (a, b) => a + b,
          0
        );

        // random completion time between 30s and 15min
        const completionTimeMs =
          30_000 + Math.floor(Math.random() * (15 * 60 * 1000 - 30_000));

        const secs = Math.floor(completionTimeMs / 1000);
        const h = String(Math.floor(secs / 3600)).padStart(2, "0");
        const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
        const s = String(secs % 60).padStart(2, "0");
        const completionTimeFormatted = `${h}:${m}:${s}`;

        const dt = new Date(
          now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
        );
        const ts = `${String(dt.getHours()).padStart(2, "0")}:${String(
          dt.getMinutes()
        ).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}`;

        stmt.run(
          name,
          level,
          JSON.stringify(functionDetailsObj),
          totalFunctions,
          completionTimeMs,
          completionTimeFormatted,
          ts
        );
      }

      stmt.finalize((err) => {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: "Fehler beim Einfügen der Mock-Daten",
            error: err.message,
          });
        }

        db.run("COMMIT", (commitErr) => {
          if (commitErr) {
            return res.status(500).json({
              success: false,
              message: "Fehler beim Commit der Mock-Daten",
              error: commitErr.message,
            });
          }
          return res.status(200).json({
            success: true,
            message: "30 Mock-Datensätze wurden eingefügt.",
          });
        });
      });
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unerwarteter Fehler beim Laden der Mock-Daten",
      error: error.message,
    });
  }
});

// #endregion
