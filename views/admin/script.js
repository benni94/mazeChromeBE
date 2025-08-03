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
