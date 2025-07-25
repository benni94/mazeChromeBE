const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = 3000;

// Enable CORS for your extension
app.use(cors());
app.use(express.json());

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

  res.status(200).json({ success: true, message: "Data received" });
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
