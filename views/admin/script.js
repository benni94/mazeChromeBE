document
  .getElementById("updateNameForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const findName = document.getElementById("findName").value;
    const replaceName = document.getElementById("replaceName").value;

    try {
      const response = await fetch("/api/replace-name", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ findName, replaceName }),
      });

      const data = await response.json();
      showMessage(data.success, data.message);
    } catch (error) {
      showMessage(false, "Fehler: " + error.message);
    }
  });

document
  .getElementById("clearTableForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    if (
      !confirm(
        "Sind Sie sicher, dass Sie diese Tabelle löschen wollen? Dieser Vorgang kann nicht rückgesetzt werden!"
      )
    ) {
      return;
    }

    const tableName = document.getElementById("tableName").value;

    try {
      const response = await fetch("/api/clear-table", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tableName }),
      });

      const data = await response.json();
      showMessage(data.success, data.message);
    } catch (error) {
      showMessage(false, "Fehler: " + error.message);
    }
  });

document
  .getElementById("restoreDbForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    if (
      !confirm(
        "Sind Sie sicher, dass Sie die Datenbank wiederherstellen möchten? Alle aktuellen Daten werden überschrieben!"
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/restore-db", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      showMessage(data.success, data.message);
    } catch (error) {
      showMessage(false, "Fehler: " + error.message);
    }
  });

function showMessage(isSuccess, message) {
  const messageDiv = document.getElementById("message");
  messageDiv.textContent = message;
  messageDiv.className = isSuccess ? "success" : "error";
  messageDiv.style.display = "block";

  // Scroll to message
  messageDiv.scrollIntoView({ behavior: "smooth" });
}

// Function to update the service status display
function updateServiceStatus() {
  const statusElement = document.getElementById("serviceStatus");

  fetch("/api/backup-service/status", {
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      statusElement.textContent = data.message;
      statusElement.className = data.isRunning
        ? "status-running"
        : "status-stopped";

      // Update button states
      document.getElementById("startServiceBtn").disabled = data.isRunning;
      document.getElementById("stopServiceBtn").disabled = !data.isRunning;
    })
    .catch((error) => {
      statusElement.textContent =
        "Fehler beim Abrufen des Status: " + error.message;
      statusElement.className = "status-error";
    });
}

// Add event listeners for the service buttons
document
  .getElementById("startServiceBtn")
  .addEventListener("click", async function () {
    try {
      const response = await fetch("/api/backup-service/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      showMessage(data.success, data.message);
      updateServiceStatus();
    } catch (error) {
      showMessage(false, "Fehler: " + error.message);
    }
  });

document
  .getElementById("stopServiceBtn")
  .addEventListener("click", async function () {
    try {
      const response = await fetch("/api/backup-service/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      showMessage(data.success, data.message);
      updateServiceStatus();
    } catch (error) {
      showMessage(false, "Fehler: " + error.message);
    }
  });

// Check status when page loads
document.addEventListener("DOMContentLoaded", function () {
  updateServiceStatus();
});
