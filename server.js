const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const isFly = !!process.env.FLY_APP_NAME;

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for your extension
app.use(cors());
app.use(express.json());

// Initialize database
const dbPath = isFly
  ? path.join("/data", "gamedata.db")
  : path.join(__dirname, "data", "gamedata.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to open DB:", err.message);
  } else {
    console.log("DB opened at", dbPath);
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
if (!isFly) {
  function getLocalIP() {
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

// #region view

// Endpoint to view all data in HTML format
// Replace your existing /view endpoint with this one
app.get("/", (_, res) => {
  db.all("SELECT * FROM sorted_game_progress", [], (err, rows) => {
    if (err) {
      res.status(500).send(`Error retrieving data: ${err.message}`);
      return;
    }

    // Sort rows by completion time
    rows.sort((a, b) => {
      // Put "00:00:00" at the bottom
      if (a.completion_time_formatted === "00:00:00") return 1;
      if (b.completion_time_formatted === "00:00:00") return -1;

      const aSeconds = timeToSeconds(a.completion_time_formatted);
      const bSeconds = timeToSeconds(b.completion_time_formatted);

      return aSeconds - bSeconds; // Shortest times at the top
    });

    // Generate HTML with table
    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Game Progress Data</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          overflow: hidden; /* Prevent double scrollbars */
          font-size: larger;
        }
        table {
          border-collapse: collapse;
          width: 100%;
        }
         th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: center; 
        }
        td.function-details {
          text-align: left; 
        }
        td.xxx-large{
          font-size: xxx-large;
        }
        td.xx-large{
          font-size: xx-large;
        }
        td.x-large{
          font-size: x-large;
        }
        th {
          background-color: #f2f2f2;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        tr:hover {
          background-color: #f1f1f1;
        }
        .container {
          margin: 0 auto;
          height: 95vh; 
          overflow-y: auto;
          overflow-x: auto;
          scroll-behavior: smooth;
          position: relative;
        }
        h1 {
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="container" id="tableContainer">
        <table>
          <thead>
            <tr>
              <th>Platzierung</th>
              <th>Name</th>
              <th>verw. Funktionen</th>
              <th>Funktionen ges.</th>
              <th>Spielzeit</th>
              <th>Uhrzeit</th>
            </tr>
          </thead>
          <tbody id="tableBody">
    `;

    // Add rows for each data entry
    rows.forEach((row, i) => {
      let functionDetails;
      try {
        // Try to parse JSON and make it pretty
        const parsed = JSON.parse(row.function_details);
        functionDetails = JSON.stringify(parsed, null, 2);
      } catch (e) {
        functionDetails = row.function_details;
      }

      // Extract only the time part from the timestamp (assuming format like "25.7.2025, 19:41:57")
      const timeOnly = row.timestamp.split(", ")[1] || row.timestamp;

      html += `
        <tr>
          <td class="xxx-large">${i + 1 + "."}</td>
          <td class="xx-large">${row.name}</td>
          <td class="function-details"><pre>${functionDetails}</pre></td>
          <td class="x-large">${row.total_functions}</td>
          <td>${row.completion_time_formatted}</td>
          <td>${timeOnly}</td>
        </tr>
      `;
    });

    // Close the HTML and add JavaScript for auto-scrolling and auto-refresh
    html += `
          </tbody>
        </table>
      </div>
      
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          const container = document.getElementById('tableContainer');
          let userActive = true;
          let scrollingActive = false;
          let scrollDirection = 1; // 1 for down, -1 for up
          let scrollInterval;
          let inactivityTimer;
          
          // Function to start auto-scrolling
          function startAutoScroll() {
            if (scrollingActive) return;
            
            scrollingActive = true;
            scrollInterval = setInterval(() => {
              // Scroll by 1 pixel in the current direction
              container.scrollBy({
                top: scrollDirection,
                behavior: 'auto'
              });
              
              // Check if we've reached the bottom or top
              if (container.scrollTop + container.clientHeight >= container.scrollHeight - 5) {
                scrollDirection = -1; // Switch to scrolling up
              } else if (container.scrollTop <= 5) {
                scrollDirection = 1; // Switch to scrolling down
              }
            }, 30); // Adjust speed by changing this value
          }
          
          // Function to stop auto-scrolling
          function stopAutoScroll() {
            if (!scrollingActive) return;
            
            scrollingActive = false;
            if (scrollInterval) {
              clearInterval(scrollInterval);
              scrollInterval = null;
            }
          }
          
          // Reset inactivity timer when user interacts
          function resetInactivityTimer() {
            userActive = true;
            stopAutoScroll();
            
            if (inactivityTimer) {
              clearTimeout(inactivityTimer);
            }
            
            inactivityTimer = setTimeout(() => {
              userActive = false;
              startAutoScroll();
            }, 5000); // 5 seconds of inactivity
          }
          
          // Set up event listeners for user activity
          ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetInactivityTimer, { passive: true });
          });
          
          // Initial setup for auto-scroll
          resetInactivityTimer();
          
          // Function to convert time to seconds for sorting
          function timeToSeconds(timeStr) {
            if (!timeStr || timeStr === '00:00:00') return Number.MAX_SAFE_INTEGER;
            const [hours, minutes, seconds] = timeStr.split(':').map(Number);
            return hours * 3600 + minutes * 60 + seconds;
          }

          // Function to refresh the table data
          function refreshData() {
            fetch('/api/gamedata')
              .then(response => response.json())
              .then(data => {
                // Sort the data
                data.sort((a, b) => {
                  // Put "00:00:00" at the bottom
                  if (a.completion_time_formatted === '00:00:00') return 1;
                  if (b.completion_time_formatted === '00:00:00') return -1;
                  
                  return timeToSeconds(a.completion_time_formatted) - timeToSeconds(b.completion_time_formatted);
                });
                
                // Update the table
                const tableBody = document.getElementById('tableBody');
                tableBody.innerHTML = ''; // Clear existing rows
                
                data.forEach((row, i) => {
                  let functionDetails;
                  try {
                    const parsed = JSON.parse(row.function_details);
                    functionDetails = JSON.stringify(parsed, null, 2);
                  } catch (e) {
                    functionDetails = row.function_details || '';
                                   }
                  
                  const timeOnly = row.timestamp ? (row.timestamp.split(', ')[1] || row.timestamp) : '';
                  
                  const tr = document.createElement('tr');
                  tr.innerHTML = \`
                    <td class="xxx-large">\${i + 1}.</td>
                    <td class="xx-large">\${row.name || ''}</td>
                    <td class="function-details"><pre>\${functionDetails}</pre></td>
                    <td class="x-large">\${row.total_functions || 0}</td>
                    <td>\${row.completion_time_formatted || ''}</td>
                    <td>\${timeOnly}</td>
                  \`;
                  
                  tableBody.appendChild(tr);
                });
              })
              .catch(error => console.error('Error refreshing data:', error));
          }
          
          // Initial data load
          refreshData();
          
          // Refresh every second
          setInterval(refreshData, 1000);
        });
      </script>
    </body>
    </html>
    `;

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

// Endpoint to serve the admin dashboard HTML
app.get("/admin", basicAuth, (_, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Admin Dashboard</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .container {
            display: flex;
            gap: 20px;
        }
        .card {
            flex: 1;
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        }
        h2 {
            color: #333;
            margin-top: 0;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 15px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background-color: #45a049;
        }
        .danger {
            background-color: #f44336;
        }
        .danger:hover {
            background-color: #d32f2f;
        }
        input, select {
            width: 100%;
            padding: 8px;
            margin: 8px 0;
            box-sizing: border-box;
        }
        #message {
            margin-top: 20px;
            padding: 10px;
            border-radius: 4px;
        }
        .success {
            background-color: #dff0d8;
            color: #3c763d;
        }
        .error {
            background-color: #f2dede;
            color: #a94442;
        }
    </style>
</head>
<body>
    <h1>Database Admin Dashboard</h1>
    
    <div class="container">
        <div class="card">
            <h2>Update Name</h2>
            <form id="updateNameForm">
                <div>
                    <label for="findName">Find Name:</label>
                    <input type="text" id="findName" name="findName" required>
                </div>
                <div>
                    <label for="replaceName">Replace With:</label>
                    <input type="text" id="replaceName" name="replaceName" required>
                </div>
                <button type="submit">Update Names</button>
            </form>
        </div>
        
        <div class="card">
            <h2>Drop Table</h2>
            <form id="dropTableForm">
                <div>
                    <label for="tableName">Table Name:</label>
                    <input type="text" id="tableName" name="tableName" required>
                </div>
                <button type="submit" class="danger">Drop Table</button>
            </form>
        </div>
    </div>
    
    <div id="message" style="display: none;"></div>
    
    <script>
        document.getElementById('updateNameForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const findName = document.getElementById('findName').value;
            const replaceName = document.getElementById('replaceName').value;
            
            try {
                const response = await fetch('/api/replace-name', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ findName, replaceName }),
                });
                
                const data = await response.json();
                showMessage(data.success, data.message);
            } catch (error) {
                showMessage(false, 'Error: ' + error.message);
            }
        });
        
        document.getElementById('dropTableForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!confirm('Are you sure you want to drop this table? This action cannot be undone!')) {
                return;
            }
            
            const tableName = document.getElementById('tableName').value;
            
            try {
                const response = await fetch('/api/drop-table', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ tableName }),
                });
                
                const data = await response.json();
                showMessage(data.success, data.message);
            } catch (error) {
                showMessage(false, 'Error: ' + error.message);
            }
        });
        
        function showMessage(isSuccess, message) {
            const messageDiv = document.getElementById('message');
            messageDiv.textContent = message;
            messageDiv.className = isSuccess ? 'success' : 'error';
            messageDiv.style.display = 'block';
            
            // Scroll to message
            messageDiv.scrollIntoView({ behavior: 'smooth' });
        }
    </script>
</body>
</html>
  `;

  res.send(html);
});

// #endregion
