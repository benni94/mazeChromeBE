let allData = []; // Store all data for filtering
let searchTerm = "";
let userActive = true;
let scrollingActive = false;
let scrollDirection = 1; // 1 for down, -1 for up
let scrollInterval;
let inactivityTimer;
let container;

// Function to start auto-scrolling
function startAutoScroll() {
  if (scrollingActive) return;

  scrollingActive = true;
  scrollInterval = setInterval(() => {
    // Scroll by 1 pixel in the current direction
    container.scrollBy({
      top: scrollDirection,
      behavior: "auto",
    });

    // Check if we've reached the bottom or top
    if (
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 5
    ) {
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

document.addEventListener("DOMContentLoaded", function () {
  container = document.getElementById("tableContainer");

  // Set up event listeners for user activity
  ["mousemove", "mousedown", "keypress", "scroll", "touchstart"].forEach(
    (event) => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    }
  );

  // Initial setup for auto-scroll
  resetInactivityTimer();

  document
    .getElementById("searchInput")
    .addEventListener("input", handleSearch);
  document.getElementById("clearSearch").addEventListener("click", clearSearch);

  // Initial data load
  refreshData();

  // Refresh every second
  setInterval(refreshData, 1000);
});

// Function to handle search input
function handleSearch() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearch");
  
  searchTerm = searchInput.value.trim();

  // Show/hide clear button based on input content
  if (searchInput.value.length > 0) {
    clearButton.classList.remove("hidden");
  } else {
    clearButton.classList.add("hidden");
  }

  // If searching, stop auto-scroll
  if (searchTerm) {
    stopAutoScroll();
    userActive = true; // Prevent auto-scroll from restarting
  } else {
    resetInactivityTimer(); // Resume normal behavior
  }

  updateTable(filterData(allData, searchTerm));
}

// Function to clear search
function clearSearch() {
  const searchInput = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearch");
  
  searchInput.value = "";
  searchTerm = "";
  clearButton.classList.add("hidden");
  resetInactivityTimer();
  updateTable(allData);
}

// Function to filter data based on search term
function filterData(data, term) {
  if (!term) return data;

  term = term.toLowerCase();
  return data.filter((row) => {
    return row.name && row.name.toLowerCase().includes(term);
  });
}

// Function to update the table with provided data
function updateTable(data) {
  // Update the table
  const tableBody = document.getElementById("tableBody");
  tableBody.innerHTML = ""; // Clear existing rows

  data.forEach((row, i) => {
    let functionDetails;
    try {
      const parsed = JSON.parse(row.function_details);
      functionDetails = JSON.stringify(parsed, null, 2);
    } catch (e) {
      functionDetails = row.function_details || "";
    }

    const timeOnly = row.timestamp
      ? row.timestamp.split(", ")[1] || row.timestamp
      : "";

    // Find the original position in the unfiltered data
    const originalPosition = allData.findIndex((item) => item === row) + 1;

    const tr = document.createElement("tr");
    tr.innerHTML = `
          <td class="xxx-large"><span class="platzierung">${originalPosition}</span></td>
          <td class="xx-large">${row.name || ""}</td>
          <td class="function-details"><pre>${functionDetails}</pre></td>
          <td class="x-large">${row.total_functions || 0}</td>
          <td>${row.completion_time_formatted || ""}</td>
          <td>${timeOnly}</td>
        `;

    tableBody.appendChild(tr);
  });
}

// Function to refresh the table data
function refreshData() {
  fetch("/api/gamedata")
    .then((response) => response.json())
    .then((data) => {
      // Sort the data
      data.sort((a, b) => {
        // Put "00:00:00" at the bottom
        if (a.completion_time_formatted === "00:00:00") return 1;
        if (b.completion_time_formatted === "00:00:00") return -1;

        return (
          timeToSeconds(a.completion_time_formatted) -
          timeToSeconds(b.completion_time_formatted)
        );
      });

      // Store all data first (important for search functionality)
      allData = data;

      // If there's an active search, filter the data
      if (searchTerm) {
        updateTable(filterData(allData, searchTerm));
      } else {
        // Otherwise update with all data
        updateTable(allData);
      }
    })
    .catch((error) => {
      console.error("Error fetching data:", error);
    });
}

// Function to convert time to seconds for sorting
function timeToSeconds(timeStr) {
  if (!timeStr || timeStr === "00:00:00") return Number.MAX_SAFE_INTEGER;
  const [hours, minutes, seconds] = timeStr.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}
