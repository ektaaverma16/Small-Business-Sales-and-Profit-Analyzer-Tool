// =============================
// GET TOKEN
// =============================
const token = localStorage.getItem("jwtToken");

if (!token) {
  alert("Session expired. Please login again.");
  window.location.href = "login.html";
  throw new Error("No token");
}

let payload;
try {
  payload = JSON.parse(atob(token.split(".")[1]));
} catch (e) {
  console.error("Invalid token format", e);
  localStorage.removeItem("jwtToken");
  window.location.href = "login.html";
}

if (!payload || !payload.username || !payload.role) {
  alert("Invalid session data. Please login again.");
  localStorage.removeItem("jwtToken");
  window.location.href = "login.html";
}

const loggedInEmployee = payload.username;

// TOP BAR
document.getElementById("userName").innerText = `Welcome, ${payload.username}`;
document.getElementById("userRole").innerText = payload.role;

// TOP BAR BUSINESS INFO
if (document.getElementById("topBusinessType")) {
  document.getElementById("topBusinessType").innerText = payload.businessType || "Business";
}
if (document.getElementById("topBusinessId")) {
  document.getElementById("topBusinessId").innerText = `ID: ${payload.businessId || "N/A"}`;
}




// =============================
// GLOBAL CHART REFERENCES
// =============================
let currentUserRole = null;

let editingBatchId = null;

// Reports Chart Instances
let reportChartInstances = {};

// Cache for expenses to avoid JSON parsing issues in HTML attributes
let currentExpenses = [];

// ================= INVENTORY MODAL DOM REFS =================
const editId = document.getElementById("editId");
const editStock = document.getElementById("editStock");
const editUnit = document.getElementById("editUnit");
const editMinStock = document.getElementById("editMinStock");
const editCostPrice = document.getElementById("editCostPrice");

const deleteId = document.getElementById("deleteId");


// =============================
// HELPER FUNCTIONS
// =============================
function formatDate(date) {
  const options = { month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function openEditModal(batchId, quantity, notes) {
  console.log("Opening edit for:", batchId);
  editingBatchId = batchId;

  document.getElementById("editBatchId").value = batchId;
  document.getElementById("editQuantity").value = quantity;
  document.getElementById("editNotes").value = notes || "";

  document.getElementById("editModal").style.display = "block";
}



function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
}



async function submitEdit() {
  const quantity = document.getElementById("editQuantity").value;
  const notes = document.getElementById("editNotes").value;

  const token = localStorage.getItem("jwtToken");

  const res = await fetch(
    `http://127.0.0.1:3000/production/update/${editingBatchId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      // body: JSON.stringify({ quantity, notes })
      body: JSON.stringify({
        quantity: Number(quantity),
        notes
      })

    }
  );

  const data = await res.json();

  if (!res.ok) {
    alert(data.message);
    return;
  }

  alert("Batch updated successfully");
  closeEditModal();
  loadMyProductionHistory(); // refresh table
}



// add hovered class in selected list item
let list = document.querySelectorAll('.navigation li');

function activeLink() {
  list.forEach((item) =>
    item.classList.remove('hovered'));
  this.classList.add('hovered');
}

list.forEach(item => {
  item.addEventListener('click', function () {
    list.forEach(i => i.classList.remove('hovered'));
    this.classList.add('hovered');
  });
});




// =============================
// LOAD DASHBOARD
// =============================
function loadDashboard() {
  fetch("http://127.0.0.1:3000/dashboard", {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    }
  })
    .then(res => {
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    })
    .then(data => {
      const user = data.user;
      currentUserRole = user.role;

      document.body.classList.remove("role-owner", "role-manager", "role-employee", "role-accountant");

      if (user.role === "Owner") document.body.classList.add("role-owner");
      if (user.role === "Manager") document.body.classList.add("role-manager");
      if (user.role === "Employee") document.body.classList.add("role-employee");
      if (user.role === "Accountant") document.body.classList.add("role-accountant");



      document.getElementById("userName").innerText =
        `Welcome, ${user.username}`;
      document.getElementById("userRole").innerText = user.role;

      applyRoleVisibility(user.role);
      loadSalesForDashboard();
      if (user.role === "Employee") {
        loadMyProductionHistory();
      }
      if (["Owner", "Manager", "Accountant"].includes(user.role)) {
        loadInventory();
      }

      checkLowStock();
    })
    .catch(err => {
      console.error(err);

      if (err.message === "Unauthorized") {
        alert("Session expired. Login again.");
        localStorage.removeItem("jwtToken");
        window.location.href = "login.html";
      }
    });

}

// =============================
// ROLE VISIBILITY
// =============================
function applyRoleVisibility(role) {

  //  Hide ONLY navigation items
  document
    .querySelectorAll(".navigation .owner-only, .navigation .manager-only, .navigation .employee-only, .navigation .accountant-only")
    .forEach(el => el.style.display = "none");

  if (role === "Owner") {
    document.querySelectorAll(".navigation .owner-only")
      .forEach(el => el.style.display = "block");
  }

  if (role === "Manager") {
    document.querySelectorAll(".navigation .manager-only")
      .forEach(el => el.style.display = "block");
  }

  if (role === "Employee") {
    document.querySelectorAll(".navigation .employee-only")
      .forEach(el => el.style.display = "block");
  }

  if (role === "Accountant") {
    document.querySelectorAll(".navigation .accountant-only")
      .forEach(el => el.style.display = "block");
  }

  // ===== EMPLOYEE, OWNER & ACCOUNTANT BACKGROUND =====
  const mainContent = document.querySelector(".main");
  if (mainContent) {
    mainContent.classList.remove("employee-mode", "owner-mode", "accountant-mode");
    if (role === "Employee") {
      mainContent.classList.add("employee-mode");
    } else if (role === "Owner") {
      mainContent.classList.add("owner-mode");
    } else if (role === "Accountant") {
      mainContent.classList.add("accountant-mode");
    }
  }

  // Owner, Manager, & Accountant → show privileged KPI cards
  document.querySelectorAll(".stat-card.owner-only, .stat-card.manager-only, .stat-card.accountant-only").forEach(card => {
    card.style.display = (role === "Owner" || role === "Manager" || role === "Accountant") ? "flex" : "none";
  });

  // Employee → show employee KPI cards
  document.querySelectorAll(".stat-card.employee-only").forEach(card => {
    card.style.display = (role === "Employee") ? "flex" : "none";
  });

  // Hide dashboard charts for Employee ONLY (Targeting the container and cards)
  if (role === "Employee") {
    document
      .querySelectorAll(".charts-grid-container.owner-only, .chart-card.owner-only, .chart-card.manager-only")
      .forEach(el => el.style.display = "none");
  } else {
    // For Non-Employees, ensure they are visible (if they match the role)
    document
      .querySelectorAll(".charts-grid-container.owner-only")
      .forEach(el => el.style.display = "grid"); // Restore grid layout
  }

  // ===== PRODUCTION SECTIONS - EMPLOYEE ONLY =====
  // Hide "My Production History" section from Owner, Manager, and Accountant
  const productionHistorySection = document.querySelector(".production-history.employee-only");
  if (productionHistorySection) {
    productionHistorySection.style.display = (role === "Employee") ? "block" : "none";
  }

  // Handle Employee Charts Container visibility
  const empChartsContainer = document.querySelector(".charts-grid-container.employee-only");
  if (empChartsContainer) {
    empChartsContainer.style.display = (role === "Employee") ? "grid" : "none";
  }

  // Hide the production form itself (legacy code - keeping for compatibility)
  const productionSection = document.getElementById("production");
  if (productionSection) {
    productionSection.style.display =
      role.toLowerCase() === "employee" ? "none" : "none"; // Always hidden initially (toggle button controls it)
  }

  // Section visibility is managed by showSection() or initial load
  if (!document.querySelector(".page-section.active")) {
    document.getElementById("dashboard").classList.add("active");
  }
}



// ================= LOAD USERS (OWNER) =================
function loadUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  const errorEl = document.getElementById("usersError");

  tbody.innerHTML = "";
  errorEl.innerText = "";

  fetch("http://127.0.0.1:3000/users", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then(res => {
      if (!res.ok) {
        throw new Error("Unauthorized or server error");
      }
      return res.json();
    })
    .then(users => {
      users.forEach(user => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${user.username}</td>
          <td>${user.role}</td>
          <td>${user.business || "-"}</td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error(err);
      errorEl.innerText = "Failed to load users";
    });
}


// =============================
// LOAD SALES → KPIs + CHARTS
// =============================
async function loadSalesForDashboard() {
  try {
    const [salesRes, expensesRes] = await Promise.all([
      fetch("http://127.0.0.1:3000/sales", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch("http://127.0.0.1:3000/expenses", {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    const sales = await salesRes.json();
    const expenses = await expensesRes.json();

    console.log("Dashboard data loaded:", { salesCount: sales.length, expensesCount: expenses.length });

    // ===== ROLE-BASED KPI SELECTION =====
    if (currentUserRole === "Employee") {
      updateEmployeeKPIs(sales);
    } else {
      updateKPIs(sales, expenses);
    }

    // Charts only for Owner, Manager & Accountant
    if (currentUserRole !== "Employee") {
      buildDashboardCharts(sales, expenses);
      loadReportsCharts(); // Populate the reports charts on the dashboard
    }

    if (currentUserRole !== "Employee") {
      checkLowStock();
    }

  } catch (err) {
    console.error("Failed to load dashboard data:", err);
  }
}

/*------SHOW SECTION-------*/
function showSection(sectionId) {

  // Hide all sections
  document.querySelectorAll(".page-section")
    .forEach(sec => sec.classList.remove("active"));

  const section = document.getElementById(sectionId);
  if (!section) return;

  // Show selected section
  section.classList.add("active");

  // Load data AFTER section is visible
  if (sectionId === "dashboard") {
    loadSalesForDashboard();
  }
  if (sectionId === "viewSales") {
    loadSalesTable();
  }
  if (sectionId === "users") {
    loadUsersTable();
  }
  if (sectionId === "inventory") {
    loadInventory();
  }
  if (sectionId === "expenses") {
    loadExpensesTable();
  }
  if (sectionId === "reports") {
    loadReportsCharts();
  }
  if (sectionId === "aiPrediction") {
    loadAiPredictions();
  }

  // Move Low Stock Alert to the new active section if it exists
  const lowStockAlert = document.getElementById("globalLowStockAlert");
  if (lowStockAlert) {
    section.prepend(lowStockAlert);
  }
}




// =============================
// KPI CALCULATIONS
// =============================
function updateEmployeeKPIs(sales) {
  const today = new Date().toLocaleDateString();

  let salesToday = 0;
  let itemsSoldToday = 0;

  sales.forEach(sale => {
    if (sale.addedBy !== loggedInEmployee) return;
    const saleDate = new Date(sale.date).toLocaleDateString();

    if (saleDate === today) {
      salesToday += sale.total;
      itemsSoldToday += Number(sale.quantity);
    }
  });

  document.getElementById("empSalesToday").innerText = `₹${salesToday.toLocaleString()}`;
  document.getElementById("empItemsSoldToday").innerText = itemsSoldToday.toLocaleString();

  // Refresh production stats
  fetch("http://127.0.0.1:3000/production/my-history", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(batches => {
      const today = new Date().toLocaleDateString();
      let todayProduction = 0;
      let pendingApprovals = 0;

      batches.forEach(b => {
        const prodDate = new Date(b.production_date).toLocaleDateString();
        if (prodDate === today) {
          todayProduction += Number(b.quantity);
        }
        if (b.status === "Pending") {
          pendingApprovals++;
        }
      });

      document.getElementById("empTodayProduction").innerText = todayProduction;
      document.getElementById("empPendingApprovals").innerText = pendingApprovals;

      // Update Trends
      setTrend("empSalesTodayTrend", salesToday > 0);
      setTrend("empItemsSoldTrend", itemsSoldToday > 0);
      setTrend("empTodayProductionTrend", todayProduction > 0);
      setTrend("empPendingApprovalsTrend", pendingApprovals <= 0, true); // Red down if pending exists
    });

  // Render Charts
  renderEmployeeCharts(sales);
}

// Global store for Employee Chart Instances
let empChartInstances = {};

function renderEmployeeCharts(allSales) {
  // Filter for THIS employee
  const mySales = allSales.filter(s => s.addedBy === loggedInEmployee);

  if (mySales.length === 0) return; // No data to chart

  const today = new Date().toLocaleDateString();

  // --- DATA PREP ---

  // 1. Today's Category Breakdown
  const catStats = {};
  mySales.forEach(s => {
    if (new Date(s.date).toLocaleDateString() === today) {
      catStats[s.itemType] = (catStats[s.itemType] || 0) + s.total;
    }
  });

  // 2. Weekly Sales Trend (Last 7 Days)
  const weeklyLabels = [];
  const weeklyData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString(); // Keep this for logic matching if needed, or better normalize
    weeklyLabels.push(formatDate(d)); // Use formatted date for display

    // Sum sales for this date
    const dayTotal = mySales
      .filter(s => new Date(s.date).toLocaleDateString() === dateStr)
      .reduce((sum, s) => sum + s.total, 0);

    weeklyData.push(dayTotal);
  }

  // 3. Revenue vs Quantity (Performance - "P&L Proxy")
  // We'll show this for the same weekly period to give context
  const weeklyQty = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString();

    const dayQty = mySales
      .filter(s => new Date(s.date).toLocaleDateString() === dateStr)
      .reduce((sum, s) => sum + Number(s.quantity), 0);

    weeklyQty.push(dayQty);
  }


  // --- RENDER FUNCTIONS ---

  // Helper to safely destroy old charts
  const destroyChart = (id) => {
    if (empChartInstances[id]) {
      empChartInstances[id].destroy();
    }
  };

  // Chart 1: Category (Doughnut)
  destroyChart('empCategoryChart');
  const ctxCat = document.getElementById('empCategoryChart')?.getContext('2d');
  if (ctxCat) {
    empChartInstances['empCategoryChart'] = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catStats).length ? Object.keys(catStats) : ["No Sales"],
        datasets: [{
          data: Object.keys(catStats).length ? Object.values(catStats) : [1],
          backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10 } },
          title: { display: true, text: `Total: ₹${Object.values(catStats).reduce((a, b) => a + b, 0)}` }
        },
        maintainAspectRatio: false
      }
    });
  }


  // Chart 2: Weekly Trend (Line)
  destroyChart('empWeeklyChart');
  const ctxWeek = document.getElementById('empWeeklyChart')?.getContext('2d');
  if (ctxWeek) {
    empChartInstances['empWeeklyChart'] = new Chart(ctxWeek, {
      type: 'line',
      data: {
        labels: weeklyLabels,
        datasets: [{
          label: 'Sales (₹)',
          data: weeklyData,
          borderColor: '#d35400',
          backgroundColor: 'rgba(211, 84, 0, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
        maintainAspectRatio: false
      }
    });
  }

  // Chart 3: Revenue vs Quantity (Dual Axis Bar/Line)
  // This serves as the "Performance / P&L" view requested
  destroyChart('empRevenueChart');
  const ctxRev = document.getElementById('empRevenueChart')?.getContext('2d');
  if (ctxRev) {
    empChartInstances['empRevenueChart'] = new Chart(ctxRev, {
      type: 'bar',
      data: {
        labels: weeklyLabels,
        datasets: [
          {
            label: 'Revenue (₹)',
            data: weeklyData,
            backgroundColor: '#27ae60',
            yAxisID: 'y',
            order: 2
          },
          {
            label: 'Items Sold',
            data: weeklyQty,
            borderColor: '#2980b9',
            backgroundColor: '#2980b9',
            type: 'line',
            yAxisID: 'y1',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Revenue (₹)' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false }, // only want the grid lines for one axis to show up
            title: { display: true, text: 'Qty Sold' }
          },
        }
      }
    });
  }

  // Chart 4: Monthly Sales Trend
  // Calculate daily sales for the current month
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthlyLabels = Array.from({ length: daysInMonth }, (_, i) => {
    return formatDate(new Date(currentYear, currentMonth, i + 1));
  });
  const monthlyData = new Array(daysInMonth).fill(0);

  mySales.forEach(s => {
    const d = new Date(s.date);
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      const day = d.getDate();
      monthlyData[day - 1] += s.total;
    }
  });

  destroyChart('empMonthlyChart');
  const ctxMonth = document.getElementById('empMonthlyChart')?.getContext('2d');
  if (ctxMonth) {
    empChartInstances['empMonthlyChart'] = new Chart(ctxMonth, {
      type: 'line',
      data: {
        labels: monthlyLabels,
        datasets: [{
          label: 'Daily Sales (₹)',
          data: monthlyData,
          borderColor: '#8e44ad',
          backgroundColor: 'rgba(142, 68, 173, 0.1)',
          tension: 0.1,
          fill: true,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: `Month Total: ₹${monthlyData.reduce((a, b) => a + b, 0)}` }
        },
        scales: {
          x: { title: { display: true, text: 'Date' } },
          y: { beginAtZero: true }
        }
      }
    });
  }
}



//***************OWNER+ MANAGER ONLY************//
function updateKPIs(sales, expenses = []) {
  const today = new Date().toLocaleDateString();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let salesToday = 0;
  let monthlySales = 0;
  let totalRevenue = 0;
  let completedOrders = 0;

  sales.forEach(sale => {
    const saleDateObj = new Date(sale.date);
    const saleDate = saleDateObj.toLocaleDateString();

    if (sale.status === "Completed") {
      totalRevenue += Number(sale.total);
      completedOrders++;

      if (saleDate === today) {
        salesToday += Number(sale.total);
      }

      if (
        saleDateObj.getMonth() === currentMonth &&
        saleDateObj.getFullYear() === currentYear
      ) {
        monthlySales += Number(sale.total);
      }
    }
  });

  // Calculate Expenses
  let totalExpenses = 0;
  expenses.forEach(exp => {
    totalExpenses += Number(exp.amount);
  });

  const avgOrderValue = completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0;
  const netProfit = totalRevenue - totalExpenses;

  // Update values
  document.getElementById("salesToday").innerText = `₹${salesToday.toLocaleString()}`;
  document.getElementById("monthlySales").innerText = `₹${monthlySales.toLocaleString()}`;
  document.getElementById("totalExpenses").innerText = `₹${totalExpenses.toLocaleString()}`;
  document.getElementById("netProfit").innerText = `₹${netProfit.toLocaleString()}`;
  document.getElementById("avgOrderValue").innerText = `₹${avgOrderValue.toLocaleString()}`;
  document.getElementById("totalRevenue").innerText = `₹${totalRevenue.toLocaleString()}`;

  // Update Trends (Arrows)
  setTrend("salesTodayTrend", salesToday > 0);
  setTrend("monthlySalesTrend", monthlySales > 0);
  setTrend("totalExpensesTrend", totalExpenses <= 0, true); // Red down if > 0
  setTrend("netProfitTrend", netProfit > 0);
  setTrend("avgOrderTrend", avgOrderValue > 0);
  setTrend("totalRevenueTrend", totalRevenue > 0);
}

/**
 * Update trend arrow and color
 * @param {string} elementId 
 * @param {boolean} isPositive 
 * @param {boolean} isExpense 
 */
function setTrend(elementId, isPositive, isExpense = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (isExpense) {
    // For expenses: positive (0) is good, >0 is cost (red down)
    el.className = isPositive ? "trend-indicator trend-up" : "trend-indicator trend-down";
  } else {
    el.className = isPositive ? "trend-indicator trend-up" : "trend-indicator trend-down";
  }
}


// =============================
// PROFIT & LOSS BAR GRAPH
// =============================


// =============================
// MONTHLY PROFIT TREND (BAR)
// =============================


// =============================
// DASHBOARD CHARTS (BELOW KPIs)
// =============================
let dashboardChartInstances = {};

function buildDashboardCharts(sales, expenses = []) {
  const today = new Date().toLocaleDateString();

  // Helper to destroy old charts
  const destroyChart = (id) => {
    if (dashboardChartInstances[id]) {
      dashboardChartInstances[id].destroy();
    }
  };

  // ===== TODAY'S SALES BREAKDOWN =====
  const categoryStats = {};
  sales.forEach(s => {
    if (s.status === "Completed" && new Date(s.date).toLocaleDateString() === today) {
      categoryStats[s.itemType] = (categoryStats[s.itemType] || 0) + s.total;
    }
  });

  destroyChart('dashboardTodaySalesChart');
  const ctxToday = document.getElementById('dashboardTodaySalesChart')?.getContext('2d');
  if (ctxToday) {
    dashboardChartInstances['dashboardTodaySalesChart'] = new Chart(ctxToday, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categoryStats).length ? Object.keys(categoryStats) : ["No Sales Today"],
        datasets: [{
          data: Object.keys(categoryStats).length ? Object.values(categoryStats) : [1],
          backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10 } },
          title: {
            display: true,
            text: `Total: ₹${Object.values(categoryStats).reduce((a, b) => a + b, 0).toLocaleString()}`
          },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.label}: ₹${ctx.raw.toLocaleString()}`
            }
          }
        }
      }
    });
  }

  // ===== WEEKLY SALES TREND =====
  const weeklyLabels = [];
  const weeklyData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString();
    weeklyLabels.push(formatDate(d));

    const dayTotal = sales
      .filter(s => s.status === "Completed" && new Date(s.date).toLocaleDateString() === dateStr)
      .reduce((sum, s) => sum + s.total, 0);

    weeklyData.push(dayTotal);
  }

  destroyChart('dashboardWeeklySalesChart');
  const ctxWeekly = document.getElementById('dashboardWeeklySalesChart')?.getContext('2d');
  if (ctxWeekly) {
    dashboardChartInstances['dashboardWeeklySalesChart'] = new Chart(ctxWeekly, {
      type: 'line',
      data: {
        labels: weeklyLabels,
        datasets: [{
          label: 'Sales (₹)',
          data: weeklyData,
          borderColor: '#d35400',
          backgroundColor: 'rgba(211, 84, 0, 0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `₹${ctx.raw.toLocaleString()}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => `₹${value.toLocaleString()}`
            }
          }
        }
      }
    });
  }

  // ===== NEW: MONTHLY PROFIT ANALYSIS (WEEKLY GROUPED) =====
  const weeklyRevenue = [];
  const weeklyExpenses = [];
  const weeklyProfit = [];
  const weekL = [];

  for (let weekNum = 3; weekNum >= 0; weekNum--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - (weekNum * 7 + 6));
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - (weekNum * 7));
    weekEnd.setHours(23, 59, 59, 999);

    weekL.push(`Week ${4 - weekNum}`);

    let weekRev = 0;
    let weekExp = 0;

    sales.forEach(sale => {
      if (sale.status === "Completed") {
        const sDate = new Date(sale.date);
        if (sDate >= weekStart && sDate <= weekEnd) {
          weekRev += Number(sale.total);
        }
      }
    });

    expenses.forEach(exp => {
      const eDate = new Date(exp.date);
      if (eDate >= weekStart && eDate <= weekEnd) {
        weekExp += Number(exp.amount);
      }
    });

    weeklyRevenue.push(weekRev);
    weeklyExpenses.push(weekExp);
    weeklyProfit.push(weekRev - weekExp);
  }


}

// =============================
// LOAD REPORTS CHARTS
// =============================
async function loadReportsCharts() {
  try {
    // Fetch sales and expenses data
    const [salesRes, expensesRes] = await Promise.all([
      fetch("http://127.0.0.1:3000/sales", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch("http://127.0.0.1:3000/expenses", {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    const sales = await salesRes.json();
    const expenses = await expensesRes.json();

    // Helper to destroy old charts
    const destroyChart = (id) => {
      if (reportChartInstances[id]) {
        reportChartInstances[id].destroy();
      }
    };

    const today = new Date().toLocaleDateString();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // ===== CHART 1: MONTHLY PROFIT ANALYSIS (WEEKLY GROUPED) =====
    const weeklyRevenue = [];
    const weeklyExpenses = [];
    const weeklyProfit = [];
    const weekLabels = [];

    // Last 4 weeks calculation logic
    for (let weekNum = 3; weekNum >= 0; weekNum--) {
      // Calculate start and end of week (7 day windows)
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (weekNum * 7 + 6));
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - (weekNum * 7));
      weekEnd.setHours(23, 59, 59, 999);

      weekLabels.push(`Week ${4 - weekNum}`);

      let weekRev = 0;
      let weekExp = 0;

      // Group Sales
      sales.forEach(sale => {
        if (sale.status === "Completed") {
          const sDate = new Date(sale.date);
          if (sDate >= weekStart && sDate <= weekEnd) {
            weekRev += Number(sale.total);
          }
        }
      });

      // Group Expenses
      expenses.forEach(exp => {
        const eDate = new Date(exp.date);
        if (eDate >= weekStart && eDate <= weekEnd) {
          weekExp += Number(exp.amount);
        }
      });

      weeklyRevenue.push(weekRev);
      weeklyExpenses.push(weekExp);
      weeklyProfit.push(weekRev - weekExp);
    }

    destroyChart('reportProfitAnalysisChart');
    const ctxPA = document.getElementById('reportProfitAnalysisChart')?.getContext('2d');
    if (ctxPA) {
      reportChartInstances['reportProfitAnalysisChart'] = new Chart(ctxPA, {
        type: 'bar',
        data: {
          labels: weekLabels,
          datasets: [
            {
              label: 'Revenue',
              data: weeklyRevenue,
              backgroundColor: '#5DADE2', // Blue
              borderRadius: 4
            },
            {
              label: 'Expenses',
              data: weeklyExpenses,
              backgroundColor: '#EC7063', // Pink
              borderRadius: 4
            },
            {
              label: 'Profit',
              data: weeklyProfit,
              backgroundColor: '#48C9B0', // Teal
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { boxWidth: 15, font: { size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.dataset.label}: ₹${ctx.raw.toLocaleString()}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: value => `₹${value.toLocaleString()}`
              }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    }





    // ===== CHART 4: TODAY'S SALES BREAKDOWN =====
    const categoryStats = {};
    sales.forEach(s => {
      if (s.status === "Completed" && new Date(s.date).toLocaleDateString() === today) {
        categoryStats[s.itemType] = (categoryStats[s.itemType] || 0) + s.total;
      }
    });

    destroyChart('reportTodaySalesChart');
    const ctxToday = document.getElementById('reportTodaySalesChart')?.getContext('2d');
    if (ctxToday) {
      reportChartInstances['reportTodaySalesChart'] = new Chart(ctxToday, {
        type: 'doughnut',
        data: {
          labels: Object.keys(categoryStats).length ? Object.keys(categoryStats) : ["No Sales Today"],
          datasets: [{
            data: Object.keys(categoryStats).length ? Object.values(categoryStats) : [1],
            backgroundColor: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40"],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12 } },
            title: {
              display: true,
              text: `Total: ₹${Object.values(categoryStats).reduce((a, b) => a + b, 0).toLocaleString()}`
            },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.label}: ₹${ctx.raw.toLocaleString()}`
              }
            }
          }
        }
      });
    }

    // ===== CHART 5: EXPENSES BY CATEGORY =====
    const expensesByCategory = {};
    expenses.forEach(exp => {
      const category = exp.category || "Other";
      expensesByCategory[category] = (expensesByCategory[category] || 0) + Number(exp.amount);
    });

    destroyChart('reportExpensesCategoryChart');
    const ctxExpenses = document.getElementById('reportExpensesCategoryChart')?.getContext('2d');
    if (ctxExpenses) {
      reportChartInstances['reportExpensesCategoryChart'] = new Chart(ctxExpenses, {
        type: 'pie',
        data: {
          labels: Object.keys(expensesByCategory).length ? Object.keys(expensesByCategory) : ["No Expenses"],
          datasets: [{
            data: Object.keys(expensesByCategory).length ? Object.values(expensesByCategory) : [0],
            backgroundColor: ['#e74c3c', '#e67e22', '#f39c12', '#16a085', '#2980b9', '#8e44ad', '#c0392b'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                boxWidth: 12,
                padding: 15
              }
            },
            tooltip: {
              callbacks: {
                label: ctx => ` ${ctx.label}: ₹${ctx.raw.toLocaleString()}`
              }
            }
          }
        }
      });
    }

    // ===== CHART 6: YEARLY SALES TREND (Multi-Year) =====
    // Aggregate sales by Year
    const yearlyStats = {};
    sales.forEach(s => {
      if (s.status === "Completed") {
        const d = new Date(s.date);
        const y = d.getFullYear();
        yearlyStats[y] = (yearlyStats[y] || 0) + s.total;
      }
    });

    const yearLabels = Object.keys(yearlyStats).sort();
    const yearData = yearLabels.map(y => yearlyStats[y]);

    destroyChart('reportYearlySalesChart');
    const ctxYearly = document.getElementById('reportYearlySalesChart')?.getContext('2d');
    if (ctxYearly) {
      reportChartInstances['reportYearlySalesChart'] = new Chart(ctxYearly, {
        type: 'bar',
        data: {
          labels: yearLabels,
          datasets: [{
            label: `Total Sales (₹)`,
            data: yearData,
            backgroundColor: '#3498db',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: `Total Revenue by Year`
            },
            tooltip: {
              callbacks: {
                label: ctx => `₹${ctx.raw.toLocaleString()}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: value => `₹${value.toLocaleString()}`
              }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    }

    // ===== CHART 3: MONTHLY SALES TREND (All Time) =====
    // Aggregate by "Month-Year" to show full history trend
    const monthlyTrendStats = {}; // Key: "2016-10", Value: 15000

    sales.forEach(s => {
      if (s.status === "Completed") {
        const d = new Date(s.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
        monthlyTrendStats[key] = (monthlyTrendStats[key] || 0) + s.total;
      }
    });

    // Sort chronologically
    const sortedMonthKeys = Object.keys(monthlyTrendStats).sort();
    const monthlyTrendLabels = sortedMonthKeys.map(k => {
      const [y, m] = k.split('-');
      const dateObj = new Date(y, m - 1);
      return dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });
    const monthlyTrendData = sortedMonthKeys.map(k => monthlyTrendStats[k]);

    destroyChart('reportMonthlySalesChart');
    const ctxMonthly = document.getElementById('reportMonthlySalesChart')?.getContext('2d');
    if (ctxMonthly) {
      reportChartInstances['reportMonthlySalesChart'] = new Chart(ctxMonthly, {
        type: 'line',
        data: {
          labels: monthlyTrendLabels,
          datasets: [{
            label: 'Total Sales (₹)',
            data: monthlyTrendData,
            borderColor: '#8e44ad',
            backgroundColor: 'rgba(142, 68, 173, 0.1)',
            tension: 0.1,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: `Monthly Sales Trend (All Time)`
            },
            tooltip: {
              callbacks: {
                label: ctx => `₹${ctx.raw.toLocaleString()}`
              }
            }
          },
          scales: {
            x: { title: { display: true, text: 'Month' } },
            y: {
              beginAtZero: true,
              ticks: {
                callback: value => `₹${value.toLocaleString()}`
              }
            }
          }
        }
      });
    }

    // ===== NEW: FINANCIAL SUMMARY TABLE POPULATION =====
    const prevMonth = (currentMonth === 0) ? 11 : currentMonth - 1;
    const prevYear = (currentMonth === 0) ? currentYear - 1 : currentYear;

    let currRev = 0, prevRev = 0;
    let currExp = 0, prevExp = 0;

    sales.forEach(s => {
      if (s.status === "Completed") {
        const d = new Date(s.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) currRev += s.total;
        else if (d.getMonth() === prevMonth && d.getFullYear() === prevYear) prevRev += s.total;
      }
    });

    expenses.forEach(e => {
      const d = new Date(e.date);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) currExp += Number(e.amount);
      else if (d.getMonth() === prevMonth && d.getFullYear() === prevYear) prevExp += Number(e.amount);
    });

    const currProfit = currRev - currExp;
    const prevProfit = prevRev - prevExp;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerText = `₹${val.toLocaleString()}`;
    };

    setVal("currMonthRev", currRev);
    setVal("prevMonthRev", prevRev);
    setVal("currMonthExp", currExp);
    setVal("prevMonthExp", prevExp);
    setVal("currMonthProfit", currProfit);
    setVal("prevMonthProfit", prevProfit);

    const setTrend = (id, curr, prev) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (prev === 0) { el.innerText = "-"; return; }
      const pct = (((curr - prev) / Math.abs(prev || 1)) * 100).toFixed(1);
      if (pct > 0) el.innerHTML = `<span style="color:green">↑ ${pct}%</span>`;
      else if (pct < 0) el.innerHTML = `<span style="color:red">↓ ${Math.abs(pct)}%</span>`;
      else el.innerText = "0%";
    };

    setTrend("revTrend", currRev, prevRev);
    setTrend("expTrend", currExp, prevExp);
    setTrend("profitTrend", currProfit, prevProfit);
  } catch (error) {
    console.error("Failed to load reports charts:", error);
  }
}

// =============================
// ADD SALES
// =============================
document.getElementById("addSalesForm")?.addEventListener("submit", e => {
  e.preventDefault();

  const itemType = document.getElementById("itemType").value;
  const product = document.getElementById("productName").value.trim();
  const quantity = Number(document.getElementById("quantity").value);
  const unitPrice = Number(document.getElementById("unitPrice").value);
  const totalAmount = Number(document.getElementById("totalAmount").value);
  const saleType = document.getElementById("saleType").value;
  const paymentMode = document.getElementById("paymentMode").value;
  const saleDate = new Date().toISOString();


  if (!itemType || !product || quantity <= 0 || unitPrice <= 0) {
    alert("Please fill all required fields correctly");
    return;
  }

  fetch("http://127.0.0.1:3000/sales/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      itemType,
      product,
      quantity,
      unitPrice,
      total: totalAmount,
      saleType,
      paymentMode,
      // soldBy is NOT sent → backend gets it from JWT
      // saleDate
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.message) {
        document.getElementById("salesMsg").innerText = data.message;
        document.getElementById("salesMsg").style.color = "green";
      }

      document.getElementById("addSalesForm").reset();

      // reset auto fields
      document.getElementById("totalAmount").value = "";
      document.getElementById("soldBy").value = loggedInEmployee;
      document.getElementById("saleDate").value = new Date().toISOString().split("T")[0];

      loadSalesTable();
      refreshKPIsOnly();
    })
    .catch(() => {
      document.getElementById("salesMsg").innerText = "Failed to add sale";
      document.getElementById("salesMsg").style.color = "red";
    });
});



// =============================
// ADD PRODUCTION (EMPLOYEE)
// =============================
document.getElementById("productionForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const token = localStorage.getItem("jwtToken");

  const product = document.getElementById("prodProduct").value;
  const quantity = document.getElementById("prodQuantity").value;
  const production_date = document.getElementById("prodDate").value;
  const notes = document.getElementById("prodNotes").value;

  try {
    const res = await fetch("http://127.0.0.1:3000/production/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        product,
        quantity,
        production_date,
        notes
      })
    });

    const data = await res.json();

    if (!res.ok) {
      document.getElementById("prodMsg").innerText = data.message;
      document.getElementById("prodMsg").style.color = "red";
      return;
    }

    document.getElementById("prodMsg").innerText = "Production added successfully";
    document.getElementById("prodMsg").style.color = "green";

    document.getElementById("productionForm").reset();
    loadMyProductionHistory();
    refreshKPIsOnly();

  } catch (err) {
    console.error(err);
    document.getElementById("prodMsg").innerText = "Server error";
  }
});

// ================= MATERIAL ITEM MAPPING =================
const materialItems = {
  "🌾 Base Flours & Starches": ["All-purpose flour (Maida)", "Whole wheat flour", "Semolina", "Cornflour", "Bread flour"],
  "🍬 Sweeteners": ["White sugar", "Brown sugar", "Powdered sugar (Icing sugar)", "Jaggery powder", "Glucose syrup"],
  "🧈 Fats & Dairy": ["Butter", "Margarine", "Vegetable oil", "Milk", "Fresh cream", "Whipping cream", "Condensed milk", "Cheese"],
  "🧪 Leavening & Baking Agents": ["Baking powder", "Baking soda", "Yeast (Instant or Dry)", "Cake improver", "Bread improver"],
  "🍫 Flavours & Enhancers": ["Vanilla essence", "Cocoa powder", "Chocolate chips", "Coffee powder", "Custard powder", "Baking Chocolate"],
  "🌰 Nuts & Dry Fruits": ["Cashews", "Almonds", "Raisins", "Pistachios", "Walnuts"],
  "🧂 Savory Basics & Seasoning": ["Salt", "Black pepper", "Oregano", "Chili flakes", "Mixed herbs"],
  "🎨 Additives & Decorations": ["Food color", "Sprinklers", "Veg gelatin", "Baking chocolate", "Compound chocolate"]
};

// ================= SALES ITEM MAPPING =================
const salesItems = {
  "Cakes": [
    "Plain Sponge Cake", "Chocolate Cake", "Vanilla Cake", "Black Forest Cake",
    "Pineapple Cake", "Red Velvet Cake", "Fruit Cake", "Coffee Cake",
    "Marble Cake", "Eggless Cake"
  ],
  "Pastries and Desserts": [
    "Chocolate Pastry", "Vanilla Pastry", "Pineapple Pastry", "Strawberry Pastry",
    "Cupcake", "Chocolate Cupcake", "Choco Lava Cake", "Brownie",
    "Swiss Roll", "Chocolate Mousse", "Mango Mousse"
  ],
  "Breads and Buns": [
    "White Bread", "Brown Bread", "Whole Wheat Bread", "Multigrain Bread",
    "Milk Bread", "Pav Bread", "Sandwich Bread", "Burger Buns",
    "Hot Dog Buns", "Garlic Bread"
  ],
  "Savory Veg Items": [
    "Veg Puff", "Paneer Puff", "Cheese Puff", "Veg Roll", "Bread Roll",
    "Veg Patty", "Veg Samosa", "Cheese Croissant", "Veg Calzone", "Stuffed Bun"
  ],
  "Cookies and Tea Time": [
    "Butter Cookies", "Chocolate Chip Cookies", "Oat Cookies", "Jeera Biscuits",
    "Oatmeal Cookies", "Khari Biscuit", "Rusk Toast", "Coconut Cookies",
    "Sugar-free Biscuits", "Digestive Biscuits"
  ]
};

// ================= DYNAMIC INVENTORY DROPDOWN =================
document.getElementById("invMaterialType")?.addEventListener("change", function () {
  const type = this.value;
  const productSelect = document.getElementById("invProduct");
  productSelect.innerHTML = '<option value="">Select Item</option>';

  if (type && materialItems[type]) {
    materialItems[type].forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      productSelect.appendChild(opt);
    });
    productSelect.disabled = false;
  } else {
    productSelect.disabled = true;
  }
});

// ================= DYNAMIC SALES DROPDOWN =================
// ================= DYNAMIC SALES DROPDOWN (VALIDATED AGAINST TODAY'S PRODUCTION) =================
document.getElementById("itemType")?.addEventListener("change", async function () {
  const type = this.value;
  const productSelect = document.getElementById("productName");
  productSelect.innerHTML = '<option value="">Loading...</option>';
  productSelect.disabled = true;

  if (!type || !salesItems[type]) {
    productSelect.innerHTML = '<option value="">Select Item</option>';
    return;
  }

  try {
    // Fetch actual Inventory stock levels
    const res = await fetch("http://127.0.0.1:3000/inventory", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const inventory = await res.json();

    // 2. Populate Dropdown
    productSelect.innerHTML = '<option value="">Select Item</option>';

    salesItems[type].forEach(item => {
      // Find the item in current inventory
      const invItem = inventory.find(i => i.product.toLowerCase().trim() === item.toLowerCase().trim());
      const availableQty = invItem ? Number(invItem.stock) : 0;

      const opt = document.createElement("option");
      opt.value = item;

      if (availableQty > 0) {
        // Available
        opt.textContent = `${item} (Stock: ${availableQty})`;
        opt.style.color = "#27ae60"; // Green
        opt.style.fontWeight = "bold";
      } else {
        // Unavailable
        opt.textContent = `${item} (Out of Stock)`;
        opt.style.color = "#999";
        opt.disabled = true;
      }

      productSelect.appendChild(opt);
    });

    productSelect.disabled = false;

  } catch (err) {
    console.error("Failed to validate stock", err);
    productSelect.innerHTML = '<option value="">Error loading stock</option>';
  }
});

// ================= DYNAMIC PRODUCTION DROPDOWN =================
document.getElementById("prodCategory")?.addEventListener("change", function () {
  const type = this.value;
  const productSelect = document.getElementById("prodProduct");
  productSelect.innerHTML = '<option value="">Select Product</option>';

  if (type && salesItems[type]) {
    salesItems[type].forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      productSelect.appendChild(opt);
    });
    productSelect.disabled = false;
  } else {
    productSelect.disabled = true;
  }
});

// ================= INVENTORY COST CALCULATION =================
const invStockInput = document.getElementById("invStock");
const invUnitPriceInput = document.getElementById("invUnitPrice");
const invCostInput = document.getElementById("invCost");

function calculateInventoryCost() {
  const stock = Number(invStockInput.value) || 0;
  const unitPrice = Number(invUnitPriceInput.value) || 0;
  const cost = (stock * unitPrice).toFixed(2);
  invCostInput.value = cost;

  // Auto-sync with Expense Amount if in Raw Materials category
  const expenseCategory = document.getElementById("expenseCategory")?.value;
  if (expenseCategory === "🌾 Raw Materials") {
    const expenseAmountInput = document.getElementById("expenseAmount");
    if (expenseAmountInput) {
      expenseAmountInput.value = cost;
    }
  }
}

invStockInput?.addEventListener("input", calculateInventoryCost);
invUnitPriceInput?.addEventListener("input", calculateInventoryCost);

//***************LOAD SALES*************/
function formatDate(dateValue) {
  if (!dateValue) return "—";

  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function loadSalesTable(queryParams = "") {
  const section = document.getElementById("viewSales");
  if (!section.classList.contains("active")) return;

  fetch(`http://127.0.0.1:3000/sales${queryParams}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(sales => {
      const tbody = document.getElementById("salesTableBody");
      if (!tbody) return;

      tbody.innerHTML = "";

      const isPrivileged = (currentUserRole === "Owner" || currentUserRole === "Accountant");

      // Handle Action Header Visibility
      const actionHeader = document.getElementById("actionHeader");
      if (actionHeader) {
        actionHeader.style.display = isPrivileged ? "table-cell" : "none";
      }

      if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isPrivileged ? 10 : 9}">No sales found</td></tr>`;
        return;
      }

      // PERFORMANCE FIX: Only show last 100 records to prevent browser crash
      // Kaggle dataset has 20,000+ records. Rendering all freezes the DOM.
      const recentSales = sales.slice(-100).reverse();

      recentSales.forEach(sale => {
        let actionCell = "";
        if (isPrivileged) {
          actionCell = `
            <td>
              <button onclick="downloadInvoice(${sale.id})">Invoice</button>
              <span class="delete-btn" data-id="${sale.id}">🗑 Delete</span>
            </td>`;
        }

        tbody.innerHTML += `
          <tr>
            <td>${sale.itemType}</td>
            <td>${sale.product}</td>
            <td>${sale.quantity}</td>
            <td>₹${Number(sale.unitPrice).toLocaleString()}</td>
            <td>₹${Number(sale.total).toLocaleString()}</td>
            <td>${sale.saleType}</td>
            <td>${sale.paymentMode}</td>
            <td>${sale.addedBy}</td>
            <td data-label="Date">${formatDate(sale.date)}</td>
            ${actionCell}
          </tr>
        `;
      });

      if (sales.length > 100) {
        const infoRow = document.createElement("tr");
        infoRow.innerHTML = `<td colspan="${isPrivileged ? 10 : 9}" style="text-align:center; color:#888; padding:10px;">
          Showing recent 100 of ${sales.length} records. Filter by date to see historical data.
        </td>`;
        tbody.appendChild(infoRow);
      }
    });
}

function applySalesFilter() {
  const date = document.getElementById("saleFilterDate").value;
  const month = document.getElementById("saleFilterMonth").value;

  let query = "";
  if (date) {
    query = `?date=${date}`;
  } else if (month) {
    query = `?month=${month}`;
  }

  loadSalesTable(query);
}

function resetSalesFilter() {
  const dateInput = document.getElementById("saleFilterDate");
  const monthInput = document.getElementById("saleFilterMonth");
  if (dateInput) dateInput.value = "";
  if (monthInput) monthInput.value = "";
  loadSalesTable();
}


/// REFRESH ALL DASHBOARD DATA ///
async function refreshKPIsOnly() {
  try {
    const salesRes = await fetch("http://127.0.0.1:3000/sales", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const sales = await salesRes.json();

    if (currentUserRole === "Employee") {
      updateEmployeeKPIs(sales);
    } else {
      // For Owner/Manager/Accountant, fetch expenses too
      const expRes = await fetch("http://127.0.0.1:3000/expenses", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const expenses = await expRes.json();
      updateKPIs(sales, expenses);

      // Refresh Charts
      buildProfitLossBarChart(sales);
      buildMonthlyProfitChart(sales);
    }

    // Always check for low stock on refresh (if not employee)
    if (currentUserRole !== "Employee") {
      checkLowStock();
    }
  } catch (err) {
    console.error("Dashboard refresh failed:", err);
  }
}

async function checkLowStock() {
  try {
    const res = await fetch("http://127.0.0.1:3000/dashboard", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.lowStockItems && (currentUserRole === "Owner" || currentUserRole === "Accountant")) {
      showLowStockAlert(data.lowStockItems);
    } else {
      const existingAlert = document.getElementById("globalLowStockAlert");
      if (existingAlert) existingAlert.remove();
    }
  } catch (err) {
    console.error("Failed to check low stock:", err);
  }
}

// event handler//
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("delete-btn")) {

    e.preventDefault();        // stop default
    e.stopPropagation();       // stop bubbling (VERY IMPORTANT)

    const saleId = e.target.dataset.id;
    if (!saleId) return;

    if (!confirm("Delete this sale?")) return;

    fetch(`http://127.0.0.1:3000/sales/${saleId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(() => {

        // FORCE stay on View Sales
        showSection("viewSales");

        // wait for DOM to be visible, THEN load table
        setTimeout(() => {
          loadSalesTable();
          refreshKPIsOnly();
        }, 0);
      });
  }
});


/*----------------LOG OUT---------*/
function logout() {
  localStorage.removeItem("jwtToken");
  window.location.href = "login.html";
}



// ================= INVENTORY =================
// ================= INVENTORY (PRODUCTION APPROVALS & HISTORY) =================
let currentInventoryView = 'approvals'; // 'approvals' or 'history'

function switchInventoryView(view) {
  currentInventoryView = view;

  // Update Buttons
  document.getElementById("btnShowApprovals")?.classList.toggle("active", view === 'approvals');
  document.getElementById("btnShowToday")?.classList.toggle("active", view === 'today');
  document.getElementById("btnShowHistory")?.classList.toggle("active", view === 'history');

  // Show/Hide Date Filter
  const filter = document.getElementById("productionHistoryFilter");
  if (filter) filter.style.display = (view === 'history') ? "flex" : "none";

  // Load Content
  if (view === 'approvals') {
    loadInventoryApprovals();
  } else if (view === 'today') {
    loadTodaysApprovedProduction();
  } else {
    loadInventoryHistory();
  }
}


function loadTodaysApprovedProduction() {
  const tbody = document.getElementById("productionApprovalTable");
  const thead = tbody?.parentElement.querySelector("thead");
  if (!tbody || !thead) return;

  thead.innerHTML = `
    <tr>
      <th>Product</th>
      <th>Produced Qty</th>
      <th>Produced By</th>
      <th>Time</th>
      <th>Status</th>
    </tr>
  `;

  tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>Loading today's production...</td></tr>";

  fetch("http://127.0.0.1:3000/production/history", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(batches => {
      const today = new Date().toLocaleDateString();
      // Filter: Today AND Approved
      const dailyApproved = batches.filter(b =>
        new Date(b.production_date).toLocaleDateString() === today &&
        b.status === "Approved"
      );

      if (dailyApproved.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>No approved production for today.</td></tr>";
        return;
      }

      tbody.innerHTML = "";
      dailyApproved.forEach(b => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td style="font-weight:bold; color:var(--bakery-accent);">${b.product}</td>
          <td>${b.quantity}</td>
          <td>${b.producedBy}</td>
          <td>${new Date(b.production_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td><span class="success">Ready for Sale</span></td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error(err);
      tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:red;'>Error loading data</td></tr>";
    });
}

function loadInventory() {
  if (!currentUserRole) {
    const payload = JSON.parse(atob(token.split(".")[1]));
    currentUserRole = payload.role;
  }

  if (!["Owner", "Manager", "Accountant"].includes(currentUserRole)) return;
  loadExpensesTable();

  switchInventoryView(currentInventoryView);
}

function loadInventoryApprovals() {
  const tbody = document.getElementById("productionApprovalTable");
  const thead = tbody?.parentElement.querySelector("thead");
  if (!tbody || !thead) return;

  // Set Headers for Approvals
  thead.innerHTML = `
    <tr>
      <th>Batch ID</th>
      <th>Product</th>
      <th>Quantity</th>
      <th>Produced By</th>
      <th>Date</th>
      <th>Status</th>
      <th>Action</th>
    </tr>
  `;

  tbody.innerHTML = "<tr><td colspan='7' style='text-align:center'>Loading approvals...</td></tr>";

  fetch("http://127.0.0.1:3000/production/history", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(batches => {
      const pendingBatches = batches.filter(b =>
        b.status === "Pending" || b.status === "PENDING_APPROVAL"
      );

      if (pendingBatches.length === 0) {
        tbody.innerHTML = "<tr><td colspan='7' style='text-align:center'>No pending approvals.</td></tr>";
        return;
      }

      tbody.innerHTML = "";
      pendingBatches.forEach(b => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${b.batchId}</td>
          <td>${b.product}</td>
          <td>${b.quantity}</td>
          <td>${b.producedBy}</td>
          <td>${formatDate(b.production_date)}</td>
          <td><span class="pending">Pending Approval</span></td>
          <td>
            <button class="btn-xs success" onclick="updateProductionStatus('${b.batchId}', 'Approved')">Approve</button>
            <button class="btn-xs delete" onclick="updateProductionStatus('${b.batchId}', 'Rejected')">Reject</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error("Failed to load approvals", err);
      tbody.innerHTML = "<tr><td colspan='7' style='text-align:center; color:red;'>Error loading data</td></tr>";
    });
}

function loadInventoryHistory() {
  const tbody = document.getElementById("productionApprovalTable");
  const thead = tbody?.parentElement.querySelector("thead"); // Reuse same table
  if (!tbody || !thead) return;

  // Set Headers for History
  thead.innerHTML = `
    <tr>
      <th>Product</th>
      <th>Qty</th>
      <th>Produced By</th>
      <th>Date</th>
      <th>Status</th>
      <th>Expiry</th>
    </tr>
  `;

  tbody.innerHTML = "<tr><td colspan='6' style='text-align:center'>Loading history...</td></tr>";

  const dateFilter = document.getElementById("historyDateFilter")?.value;

  fetch("http://127.0.0.1:3000/production/history", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(batches => {
      // Filter by Date if set
      let filtered = batches;
      if (dateFilter) {
        filtered = batches.filter(b => b.production_date.startsWith(dateFilter));
      }

      if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='6' style='text-align:center'>No production history found.</td></tr>";
        return;
      }

      tbody.innerHTML = "";
      filtered.forEach(b => {
        let statusBadge = `<span class="pending">Pending</span>`;
        if (b.status === "Approved") statusBadge = `<span class="success">Approved</span>`;
        if (b.status === "Rejected") statusBadge = `<span class="status-out">Rejected</span>`;

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${b.product}</td>
          <td>${b.quantity}</td>
          <td>${b.producedBy}</td>
          <td>${formatDate(b.production_date)}</td>
          <td>${statusBadge}</td>
           <td>${formatDate(b.expiry_date)}</td>
        `;
        tbody.appendChild(row);
      });
    })
    .catch(err => {
      console.error("Failed to load history", err);
      tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; color:red;'>Error loading data</td></tr>";
    });
}


function updateProductionStatus(batchId, status) {
  if (!confirm(`Are you sure you want to ${status} this batch ? `)) return;

  fetch(`http://127.0.0.1:3000/production/${batchId}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status })
  })
    .then(res => res.json())
    .then(data => {
      if (data.message.includes("Insufficient stock")) {
        alert("Error: " + data.message);
      } else {
        showSection("inventory"); // Force stay on inventory
        loadInventory();
        refreshKPIsOnly(); // Update all dashboard metrics
      }
    })
    .catch(err => {
      console.error(err);
      alert("Request failed");
    });
}





document.addEventListener("DOMContentLoaded", () => {
  const prodDateInput = document.getElementById("prodDate");
  if (prodDateInput) {
    prodDateInput.value = new Date().toISOString().split("T")[0];
  }

});

// ===================MY PRODUCTION HISTORY==========//

async function loadMyProductionHistory() {
  const res = await fetch("http://127.0.0.1:3000/production/my-history", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();

  const tbody = document.querySelector("#productionHistoryTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  // Get today's date in local time YYYY-MM-DD
  const today = new Date().toLocaleDateString('en-CA');

  // Filter for today only and sort
  const filteredData = data.filter(batch => {
    const batchDate = new Date(batch.production_date).toLocaleDateString('en-CA');
    return batchDate === today;
  });

  // Sort descending (latest on top)
  // Since backend already sorts by date, we just need to ensure we don't reverse it incorrectly
  // and maintain a secondary sort by batchId if dates are identical
  filteredData.sort((a, b) => {
    const dateB = new Date(b.production_date);
    const dateA = new Date(a.production_date);
    if (dateB - dateA !== 0) return dateB - dateA;
    return b.batchId.localeCompare(a.batchId);
  });

  if (filteredData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #777;">No production entries for today</td></tr>`;
    return;
  }

  filteredData.forEach(batch => {
    // Map backend status to CSS classes
    let statusClass = "pending";
    if (batch.status === "Approved") statusClass = "approved";
    if (batch.status === "Rejected") statusClass = "rejected";
    if (batch.status === "Pending") statusClass = "pending_approval";

    const statusBadge = `<span class="status-badge ${statusClass}">${batch.status}</span>`;
    const isDisabled = (batch.status === 'Approved' || batch.status === 'Rejected') ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';

    tbody.innerHTML += `
      <tr>
        <td>${batch.batchId}</td>
        <td>${batch.product}</td>
        <td>${batch.quantity}</td>
        <td>${formatDate(batch.production_date)}</td>
        <td>${statusBadge}</td>
        <td>${formatDate(batch.expiry_date)}</td>
        <td>
          <button class="btn-xs edit" onclick="openEditModal('${batch.batchId}', ${batch.quantity}, '${(batch.notes || "").replace(/'/g, "\\'")}')" ${isDisabled}>Edit</button>
        </td>
      </tr>
    `;
  });
}


//Add production toggle
const showBtn = document.getElementById("showProductionFormBtn");
const formDiv = document.getElementById("production");

showBtn.addEventListener("click", () => {
  formDiv.style.display =
    formDiv.style.display === "none" ? "block" : "none";

  showBtn.textContent =
    formDiv.style.display === "block"
      ? "❌ Cancel Production Entry"
      : "➕ Add New Production";
});

// ===============ALERT BOX=============//
function showLowStockAlert(items) {
  let alertBox = document.getElementById("globalLowStockAlert");

  if (!items || items.length === 0) {
    if (alertBox) alertBox.remove();
    return;
  }

  if (!alertBox) {
    alertBox = document.createElement("div");
    alertBox.id = "globalLowStockAlert";
    alertBox.className = "low-stock-alert";
  }

  // Always prepend to the currently active section
  const activeSection = document.querySelector(".page-section.active");
  if (activeSection && alertBox.parentElement !== activeSection) {
    activeSection.prepend(alertBox);
  }

  alertBox.innerHTML = `
    <strong>⚠️ Low Stock Alert</strong><br>
    ${items.map(i => `• ${i.product}: Only ${Number(i.stock).toFixed(2).replace(/\.?0+$/, '')} ${i.unit || ''} remaining (Minimum: ${i.minStock})`).join("<br>")}
  `;
}


function openAddStock(product) {
  // Redirect to Expenses section as requested
  showSection('expenses');

  const catSelect = document.getElementById("expenseCategory");
  if (catSelect) {
    catSelect.value = "🌾 Raw Materials";
    const event = new Event('change');
    catSelect.dispatchEvent(event);
  }

  if (product) {
    // Material type change will be needed here to populate products
    // For now we just focus the form
    document.getElementById("invMaterialType").focus();
  }
}


//========inventory edit modal=======//


function openEditInventory(item) {
  document.getElementById("editId").value = item.id;
  document.getElementById("editStock").value = item.stock;
  document.getElementById("editUnit").value = item.unit;
  document.getElementById("editMinStock").value = item.minStock;
  document.getElementById("editCostPrice").value = item.costPrice;

  document.getElementById("editInventoryModal").classList.remove("hidden");
}


function saveEditInventory() {
  const id = Number(document.getElementById("editId").value);
  fetch(`http://127.0.0.1:3000/inventory/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      stock: Number(document.getElementById("editStock").value),
      unit: document.getElementById("editUnit").value,
      minStock: Number(document.getElementById("editMinStock").value),
      costPrice: Number(document.getElementById("editCostPrice").value)
    })
  })
    .then(res => res.json())
    .then(() => {
      document.getElementById("editInventoryModal").classList.add("hidden");
      loadInventory();
      refreshKPIsOnly();
    })
    .catch(err => console.error(err));
}

function closeEditInventory() {
  document
    .getElementById("editInventoryModal")
    .classList.add("hidden");
}


// ===================inventory delete modal=============//
function openDeleteInventory(id) {
  document.getElementById("deleteId").value = id;
  document.getElementById("deleteInventoryModal").classList.remove("hidden");
}


function confirmDelete() {
  fetch("http://127.0.0.1:3000/inventory/delete", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      id: Number(document.getElementById("deleteId").value)
    })
  })
    .then(res => res.json())

    .then(() => {
      document.getElementById("deleteInventoryModal").classList.add("hidden");
      loadInventory();
    })
    .catch(err => console.error(err));
}


function closeDeleteInventory() {
  document
    .getElementById("deleteInventoryModal")
    .classList.add("hidden");
}

// ============== A) AUTO-CALCULATE TOTAL AMOUNT sales===========//
const qtyInput = document.getElementById("quantity");
const priceInput = document.getElementById("unitPrice");
const totalInput = document.getElementById("totalAmount");

function calculateTotal() {
  const qty = Number(qtyInput.value) || 0;
  const price = Number(priceInput.value) || 0;
  totalInput.value = (qty * price).toFixed(2);
}

qtyInput.addEventListener("input", calculateTotal);
priceInput.addEventListener("input", calculateTotal);
// ============ B) AUTO-FILL SOLD BY (FROM JWT)========//

if (token) {
  const payload = JSON.parse(atob(token.split(".")[1]));
  document.getElementById("soldBy").value =
    payload.username || payload.userId || "Employee";
}

// ===========INVOICE DOWNLOAD=====//
// ================= EXPENSES LOGIC =================
const expenseItems = {
  "🌾 Raw Materials": ["Raw Material Purchase"],
  "💰 Salary": [
    "Baker's salary", "Counter Staff Salary", "Manager salary",
    "Daily wage workers", "Overtime Payments"
  ],
  "⚡ Utilities": [
    "Electricity bill", "Water bill", "Gas (LPG/PNG)", "Internet"
  ],
  "🏠 Rent": [
    "Shop rent", "Store area or godown rent"
  ],
  "🚚 Transport": [
    "Fuel for delivery", "Transport charges for raw materials",
    "Courier services", "Vehicle maintenance linked to delivery"
  ],
  "🔧 Maintenance": [
    "Oven repair", "Mixer/Grinder servicing", "Electrical repairs",
    "Plumbing fixes", "Small Tool Replacement (Trays, Moulds)"
  ],
  "📦 Packaging": [
    "Bread bags", "Boxes", "Wrappers", "Stickers & labels", "Paper bags"
  ]
};

document.getElementById("expenseCategory")?.addEventListener("change", function () {
  const cat = this.value;
  const nameSelect = document.getElementById("expenseName");
  nameSelect.innerHTML = '<option value="">Select Expense</option>';

  if (cat && expenseItems[cat]) {
    expenseItems[cat].forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      nameSelect.appendChild(opt);
    });
    nameSelect.disabled = false;
  } else {
    nameSelect.disabled = true;
  }

  // Toggle Integrated Inventory Fields & Dynamic Fields
  const rmFields = document.getElementById("rawMaterialFields");
  const nameGroup = document.getElementById("expenseNameGroup");
  const amountGroup = document.getElementById("expenseAmountGroup");
  const dynamicRow = document.getElementById("expenseDynamicRow");
  const dynamicLabel = document.getElementById("dynamicLabel");
  const dynamicInput = document.getElementById("dynamicInput");

  // Toggle REQUIRED attributes to prevent hidden fields from blocking submission
  const standardName = document.getElementById("expenseName");
  const standardAmount = document.getElementById("expenseAmount");
  const isRawMaterial = (cat === "🌾 Raw Materials");

  if (standardName) standardName.required = !isRawMaterial;
  if (standardAmount) standardAmount.required = !isRawMaterial;

  const invInputs = ["invMaterialType", "invProduct", "invStock", "invMinStock", "invUnitPrice"];
  invInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.required = isRawMaterial;
  });

  if (isRawMaterial) {
    if (rmFields) rmFields.style.display = "block";
    if (nameGroup) nameGroup.style.display = "none";
    if (amountGroup) amountGroup.style.display = "none";
    if (dynamicRow) dynamicRow.style.display = "none";
    if (dynamicInput) dynamicInput.value = "";

    if (!document.getElementById("expenseDate").value) {
      document.getElementById("expenseDate").value = new Date().toISOString().split('T')[0];
    }
  } else {
    if (rmFields) rmFields.style.display = "none";
    if (nameGroup) nameGroup.style.display = "contents";
    if (amountGroup) amountGroup.style.display = "contents";

    if (dynamicRow) {
      const config = {
        "💰 Salary": { label: "Staff Name", placeholder: "John Doe" },
        "🏠 Rent": { label: "Month/Period", placeholder: "Jan 2026" },
        "🔧 Maintenance": { label: "Service Details", placeholder: "Repair" }
      };

      if (config[cat]) {
        dynamicRow.style.display = "flex";
        dynamicLabel.innerText = config[cat].label;
        dynamicInput.placeholder = config[cat].placeholder;
      } else {
        dynamicRow.style.display = "none";
        dynamicInput.value = "";
      }
    }

    // Clear inventory fields
    invInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const invProd = document.getElementById("invProduct");
    if (invProd) {
      invProd.innerHTML = '<option value="">Select Item</option>';
      invProd.disabled = true;
    }
  }
});

document.getElementById("expenseForm")?.addEventListener("submit", async function (e) {
  e.preventDefault();

  const expenseId = document.getElementById("expenseId").value;
  const category = document.getElementById("expenseCategory").value;
  const msgEl = document.getElementById("expenseMsg");

  let name = "";
  let amount = 0;

  if (category === "🌾 Raw Materials") {
    const materialType = document.getElementById("invMaterialType").value;
    const product = document.getElementById("invProduct").value;
    const stock = Number(document.getElementById("invStock").value);
    const unit = document.getElementById("invUnit").value;
    const minStock = Number(document.getElementById("invMinStock").value);
    const unitPrice = Number(document.getElementById("invUnitPrice").value);
    const costPrice = (stock * unitPrice).toFixed(2);

    if (!product || product === "Select Item") {
      alert("Please select a specific material.");
      return;
    }

    try {
      if (!expenseId) {
        const invRes = await fetch("http://127.0.0.1:3000/inventory/add", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ materialType, product, stock, unitPrice, costPrice, unit, minStock })
        });
        if (!invRes.ok) throw new Error("Failed to update inventory stock");
        loadInventory();
      }
      name = `Purchase: ${product} | Type: ${materialType} | Qty: ${stock}${unit} | Min: ${minStock}`;
      amount = costPrice;
    } catch (err) {
      msgEl.innerText = "❌ " + err.message;
      msgEl.style.color = "red";
      return;
    }
  } else {
    name = document.getElementById("expenseName").value;
    const extra = document.getElementById("dynamicInput").value;

    if (!name || name === "Select Expense") {
      alert("Please select an expense name.");
      return;
    }

    if (extra) name += ` (${extra})`;
    amount = document.getElementById("expenseAmount").value;
  }

  const payload = {
    category,
    name,
    amount,
    date: document.getElementById("expenseDate").value,
    paymentMethod: document.getElementById("expensePaymentMethod").value,
    // Include specific fields for Raw Materials
    materialType: category === "🌾 Raw Materials" ? document.getElementById("invMaterialType").value : null,
    itemType: category === "🌾 Raw Materials" ? document.getElementById("invProduct").value : null,
    qty: category === "🌾 Raw Materials" ? Number(document.getElementById("invStock").value) : null,
    unit: category === "🌾 Raw Materials" ? document.getElementById("invUnit").value : null,
    minStock: category === "🌾 Raw Materials" ? Number(document.getElementById("invMinStock").value) : null
  };

  const url = expenseId ? `http://127.0.0.1:3000/expenses/${expenseId}` : "http://127.0.0.1:3000/expenses/add";
  const method = expenseId ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });

    let data = {};
    const text = await res.text();
    try { data = JSON.parse(text); } catch (err) { }

    if (res.ok) {
      msgEl.innerText = expenseId ? "Expense updated! ✅" : "Expense recorded! ✅";
      msgEl.style.color = "#27ae60";

      // Delay reset so user can see success message
      setTimeout(() => {
        resetExpenseForm(true); // true means preserve the message
        loadExpensesTable();
        refreshKPIsOnly();

        // Ensure form is visible for more entries
        if (expenseFormDiv) expenseFormDiv.style.display = "block";
        if (toggleExpenseBtn) toggleExpenseBtn.textContent = "❌ Cancel Entry";
      }, 1500);
    } else {
      msgEl.innerText = "❌ " + (data.message || "Failed to add expense");
      msgEl.style.color = "red";
    }
  } catch (err) {
    msgEl.innerText = "❌ Connection error: " + err.message;
    msgEl.style.color = "red";
  }
});

// EXPENSE FORM TOGGLE
const toggleExpenseBtn = document.getElementById("toggleExpenseFormBtn");
const expenseFormDiv = document.getElementById("expenseFormContainer");

toggleExpenseBtn?.addEventListener("click", () => {
  expenseFormDiv.style.display = (expenseFormDiv.style.display === "none") ? "block" : "none";
  toggleExpenseBtn.textContent = (expenseFormDiv.style.display === "block") ? "❌ Cancel Entry" : "➕ Add New Expense";
  if (expenseFormDiv.style.display === "block") {
    // Scroll to form
    expenseFormDiv.scrollIntoView({ behavior: 'smooth' });
  }
});

function resetExpenseForm(preserveMsg = false) {
  document.getElementById("expenseForm").reset();
  document.getElementById("expenseId").value = "";
  document.getElementById("expenseNameGroup").style.display = "contents";
  document.getElementById("expenseAmountGroup").style.display = "contents";
  document.getElementById("rawMaterialFields").style.display = "none";
  document.getElementById("expenseDynamicRow").style.display = "none";
  document.getElementById("expenseName").disabled = true;
  document.getElementById("expenseSubmitBtn").innerText = "Add Expense";
  document.getElementById("expenseCancelBtn").style.display = "none";

  const msgEl = document.getElementById("expenseMsg");
  if (!preserveMsg && msgEl) msgEl.innerText = "";

  // Do NOT hide form here so user can add more items consecutively
  // expenseFormDiv.style.display = "none";
  // toggleExpenseBtn.textContent = "➕ Add New Expense";
}

// Helpers for parsing expense names
const parseNameDetails = (fullName) => {
  const match = fullName.match(/^(.*?) \((.*?)\)$/);
  if (match) return { main: match[1], detail: match[2] };
  return { main: fullName, detail: "" };
};

const parseRawMaterialDetails = (fullName) => {
  if (!fullName) return { itemType: "-", materialType: "-", qty: "-", unit: "-", minStock: "-" };
  const match = fullName.match(/Purchase:\s*(.*?)\s*\|\s*Type:\s*(.*?)\s*\|\s*Qty:\s*((\d+)(.*?))\s*\|\s*Min:\s*(.*)$/);
  if (match) {
    return {
      itemType: match[1],
      materialType: match[2],
      qty: match[4],
      unit: match[5],
      minStock: match[6]
    };
  }
  const legacyMatch = fullName.match(/Purchase:\s*(.*?)\s*\(((\d+)(.*?))\)$/);
  if (legacyMatch) {
    return {
      itemType: legacyMatch[1],
      materialType: "-",
      qty: legacyMatch[3],
      unit: legacyMatch[4],
      minStock: "-"
    };
  }
  const clean = fullName.replace("Purchase: ", "");
  return { itemType: clean || "-", materialType: "-", qty: "-", unit: "-", minStock: "-" };
};

async function loadExpensesTable() {
  const tbody = document.getElementById("expensesTableBody");
  const tableHead = document.getElementById("expenseTableHead");
  if (!tbody || !tableHead) return;

  const categoryFilter = document.getElementById("expenseFilterCategory")?.value || "";


  // Define dynamic labels for categories
  const dynamicLabels = {
    "💰 Salary": "Staff Name",
    "🏠 Rent": "Month/Period",
    "🔧 Maintenance": "Service Details",
    "🌾 Raw Materials": "Quantity/Detail"
  };

  if (categoryFilter === "🌾 Raw Materials") {
    // Particular category chosen -> Show VERY detailed headers for Raw Materials
    tableHead.innerHTML = `
      <tr>
        <th style="font-size:11px;">Material Type</th>
        <th style="font-size:11px;">Item Type</th>
        <th style="font-size:11px;">Purchased</th>
        <th style="font-size:11px;">Unit</th>
        <th style="font-size:11px;">Min Stock</th>
        <th style="font-size:11px;">Total Live Stock</th>
        <th style="font-size:11px;">Stock Status</th>
        <th style="font-size:11px;">Total Amount</th>
        <th style="font-size:11px;">Payment</th>
        <th style="font-size:11px;">Paid By</th>
        <th style="font-size:11px;">Date</th>
        <th style="font-size:11px;">Action</th>
      </tr>
    `;

    try {
      const [expRes, invRes] = await Promise.all([
        fetch(`http://127.0.0.1:3000/expenses?category=${encodeURIComponent(categoryFilter)}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`http://127.0.0.1:3000/inventory`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      const expenses = await expRes.json();
      currentExpenses = expenses; // Store globally
      const inventory = await invRes.json();
      tbody.innerHTML = "";

      if (!Array.isArray(expenses) || expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan='11' style='text-align:center;'>No raw material purchases found.</td></tr>`;
        return;
      }

      [...expenses].reverse().forEach(exp => {
        // Prefer explicit fields if available (New Schema), else parse name (Old Schema)
        const details = parseRawMaterialDetails(exp.name);

        const materialType = exp.materialType || details.materialType;
        const itemType = exp.itemType || details.itemType;
        const qty = exp.qty || details.qty;
        const unit = exp.unit || details.unit;
        // Fix: Properly handle 0 or missing minStock to avoid 'undefined'
        const minStock = (exp.minStock !== undefined && exp.minStock !== null) ? exp.minStock : details.minStock;

        const invItem = inventory.find(i => i.product.toLowerCase().trim() === itemType.toLowerCase().trim());
        let stockStatus = '<span class="status-out" style="font-size:10px;">Unknown</span>';
        if (invItem) {
          const currentStock = Number(invItem.stock);
          const minStockLimit = Number(invItem.minStock);
          if (currentStock <= 0) {
            stockStatus = '<span class="status-out" style="padding:2px 8px; font-size:10px; border-radius:10px; font-weight:600;">Out of Stock</span>';
          } else if (currentStock <= minStockLimit) {
            stockStatus = '<span class="pending" style="padding:2px 8px; font-size:10px; border-radius:10px; font-weight:600;">Low Stock</span>';
          } else {
            stockStatus = '<span class="success" style="padding:2px 8px; font-size:10px; border-radius:10px; font-weight:600;">In Stock</span>';
          }
        }

        const row = document.createElement("tr");
        const liveStock = invItem ? `<span style="font-weight:700; color:${Number(invItem.stock) <= Number(invItem.minStock) ? 'var(--bakery-accent)' : 'var(--success-color)'};">${Number(invItem.stock).toFixed(2).replace(/\.?0+$/, '')} ${unit}</span>` : "-";

        row.innerHTML = `
          <td style="font-size:12px;">${materialType}</td>
          <td style="font-size:12px; font-weight:600;">${itemType}</td>
          <td style="font-size:12px;">${qty}</td>
          <td style="font-size:12px;">${unit}</td>
          <td style="font-size:12px;">${minStock}</td>
          <td style="font-size:12px;">${liveStock}</td>
          <td style="font-size:12px;">${stockStatus}</td>
          <td style="font-size:12px;">₹${Number(exp.amount).toFixed(2)}</td>
          <td style="font-size:12px;">${exp.paymentMethod}</td>
          <td style="font-size:12px;"><span class="role-badge" style="padding:2px 6px; font-size:10px;">${exp.paidBy}</span></td>
          <td style="font-size:12px;">${formatDate(exp.date)}</td>
          <td>
            <div style="display:flex; gap:2px;">
              <button class="btn-xs edit" style="padding:4px 6px;" onclick="editExpense(${exp.id})">✏️</button>
              <button class="btn-xs delete" style="padding:4px 6px;" onclick="deleteExpense(${exp.id})">🗑</button>
              <button class="btn-xs download" style="padding:4px 6px;" onclick="downloadExpenseInvoice(${exp.id})">📄</button>
            </div>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load raw material expenses:", err);
    }
  } else if (categoryFilter && categoryFilter !== "") {
    // Particular category chosen -> Show detailed headers
    const detailLabel = dynamicLabels[categoryFilter];
    const hasDetailCol = !!detailLabel;

    tableHead.innerHTML = `
      <tr>
        <th>Category</th>
        ${hasDetailCol ? `<th>${detailLabel}</th>` : ""}
        <th>Description</th>
        <th>Amount</th>
        <th>Date</th>
        <th>Action</th>
      </tr>
    `;

    const queryStr = `?category=${encodeURIComponent(categoryFilter)}`;
    try {
      const res = await fetch(`http://127.0.0.1:3000/expenses${queryStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const expenses = await res.json();
      currentExpenses = expenses; // Cache
      tbody.innerHTML = "";

      if (!Array.isArray(expenses) || expenses.length === 0) {
        tbody.innerHTML = `<tr><td colspan='5' style='text-align:center;'>No expenses found for ${categoryFilter}.</td></tr>`;
        return;
      }

      [...expenses].reverse().forEach(exp => {
        const { main, detail } = parseNameDetails(exp.name);

        // Strip "Purchase: " prefix for cleaner look in Raw Materials (though this block is not for Raw Materials)
        // if (categoryFilter === "🌾 Raw Materials") {
        //   displayMain = main.replace("Purchase: ", "");
        // }

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${exp.category}</td>
          ${hasDetailCol ? `<td style="font-weight:600; color:var(--bakery-accent);">${detail || "-"}</td>` : ""}
          <td>${main}</td>
          <td>₹${Number(exp.amount).toFixed(2)}</td>
          <td>${formatDate(exp.date)}</td>
          <td>
            <button class="btn-xs edit" onclick="editExpense(${exp.id})">Edit</button>
            <button class="btn-xs delete" onclick="deleteExpense(${exp.id})">Del</button>
            <button class="btn-xs download" onclick="downloadExpenseInvoice(${exp.id})">Invoice</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load filtered expenses:", err);
    }
  } else {
    // Overall view -> Main common headers only
    tableHead.innerHTML = `
      <tr>
        <th>Category</th>
        <th>Expense Name</th>
        <th>Amount</th>
        <th>Date</th>
        <th>Action</th>
      </tr>
    `;

    try {
      const res = await fetch(`http://127.0.0.1:3000/expenses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const expenses = await res.json();
      currentExpenses = expenses; // Cache
      tbody.innerHTML = "";

      if (!Array.isArray(expenses) || expenses.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No expenses found.</td></tr>";
        return;
      }

      [...expenses].reverse().forEach(exp => {
        let cleanName = exp.name;

        if (exp.category === "🌾 Raw Materials") {
          // Extract just the item type to avoid long messy string in general view
          const details = parseRawMaterialDetails(exp.name);
          cleanName = `Purchase: ${details.itemType}`;
        } else {
          // For other categories, use parseNameDetails to remove the bracketed details
          const { main } = parseNameDetails(exp.name);
          cleanName = main;
        }

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${exp.category}</td>
          <td>${cleanName}</td>
          <td>₹${Number(exp.amount).toFixed(2)}</td>
          <td>${formatDate(exp.date)}</td>
          <td>
            <button class="btn-xs edit" onclick="editExpense(${exp.id})">Edit</button>
            <button class="btn-xs delete" onclick="deleteExpense(${exp.id})">Del</button>
            <button class="btn-xs download" onclick="downloadExpenseInvoice(${exp.id})">Invoice</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load overall expenses:", err);
    }
  }
}

document.getElementById("expenseFilterCategory")?.addEventListener("change", loadExpensesTable);

window.editExpense = function (id) {
  const exp = currentExpenses.find(e => e.id === id);
  if (!exp) {
    console.error("Expense not found in cache:", id);
    return;
  }
  document.getElementById("expenseId").value = exp.id;
  document.getElementById("expenseCategory").value = exp.category;

  // Trigger sub-cat dropdown & field toggles
  const catEvent = new Event('change');
  document.getElementById("expenseCategory").dispatchEvent(catEvent);

  if (exp.category === "🌾 Raw Materials") {
    const details = parseRawMaterialDetails(exp.name);

    // Set inventory fields
    const matTypeInput = document.getElementById("invMaterialType");
    if (matTypeInput) matTypeInput.value = details.materialType !== "-" ? details.materialType : "";

    // Trigger material type change to populate items
    const matEvent = new Event('change');
    matTypeInput?.dispatchEvent(matEvent);

    // Set product (need small delay for dropdown to populate)
    setTimeout(() => {
      const prodInput = document.getElementById("invProduct");
      if (prodInput) prodInput.value = details.itemType;

      document.getElementById("invStock").value = details.qty !== "-" ? details.qty : "";
      document.getElementById("invUnit").value = details.unit !== "-" ? details.unit : "kg";
      document.getElementById("invMinStock").value = details.minStock !== "-" ? details.minStock : "";
      document.getElementById("invUnitPrice").value = (exp.amount / (Number(details.qty) || 1)).toFixed(2);

      // Calculate total cost display
      const costInput = document.getElementById("invCost");
      if (costInput) costInput.value = Number(exp.amount).toFixed(2);
    }, 100);
  } else {
    document.getElementById("expenseName").value = exp.name;
    document.getElementById("expenseAmount").value = exp.amount;
  }

  // Show form if it's hidden
  if (expenseFormDiv) expenseFormDiv.style.display = "block";
  if (toggleExpenseBtn) toggleExpenseBtn.textContent = "❌ Cancel Edit";

  document.getElementById("expenseDate").value = exp.date;
  document.getElementById("expensePaymentMethod").value = exp.paymentMethod;

  document.getElementById("expenseSubmitBtn").innerText = "Update Expense";
  document.getElementById("expenseCancelBtn").style.display = "inline-block";
};

window.deleteExpense = async function (id) {
  if (!confirm("Are you sure you want to delete this expense?")) return;

  try {
    const res = await fetch(`http://127.0.0.1:3000/expenses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      loadExpensesTable();
    } else {
      alert("Failed to delete expense");
    }
  } catch (err) {
    console.error(err);
  }
};

window.downloadExpenseInvoice = function (id) {
  const url = `http://127.0.0.1:3000/expenses/invoice/${id}?token=${token}`;
  window.open(url, "_blank");
};


function downloadInvoice(saleId) {
  const token = localStorage.getItem("jwtToken");


  const url = `http://127.0.0.1:3000/invoice/${saleId}?token=${token}`;
  window.open(url, "_blank");
}


// =============================
// DOWNLOAD REPORT (PDF/EXCEL)
// =============================
window.downloadReport = function (type, period) {
  const url = `http://127.0.0.1:3000/reports/export/${type}?period=${period}&token=${token}`;

  // Create a temporary link to trigger the download
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Business_Report_${period}_${Date.now()}.${type === 'excel' ? 'xlsx' : 'pdf'}`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


// =============================
// TRIGGER EMAIL REPORT (ON-DEMAND)
// =============================
window.triggerEmailReport = async function (period) {
  if (!confirm(`Generate and send ${period} report to your registered email?`)) return;

  try {
    const res = await fetch("http://127.0.0.1:3000/reports/generate-on-demand", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ period })
    });

    const data = await res.json();
    alert(data.message);
  } catch (err) {
    console.error(err);
    alert("Failed to request report generation.");
  }
};


// =============================
// DEFAULT LOAD
// =============================
document.addEventListener("DOMContentLoaded", loadDashboard);

// =============================
// AI PREDICTION (Weighted Regression + Gap Handling)
// =============================
let predictionChartInstance = null;

async function loadAiPredictions() {
  try {
    const [salesRes, expensesRes] = await Promise.all([
      fetch("http://127.0.0.1:3000/sales", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch("http://127.0.0.1:3000/expenses", {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    const sales = await salesRes.json();
    const expenses = await expensesRes.json();

    if (!Array.isArray(sales) || !Array.isArray(expenses)) {
      console.error("Invalid data format received");
      document.getElementById("predSalesNextMonth").innerText = "Error";
      document.getElementById("predProfitNextMonth").innerText = "Error";
      return;
    }

    // 1. Prepare Data - Monthly Aggregation
    const monthlyStats = {};

    // Helper: Parse YYYY-MM and get Absolute Month Index (Year*12 + Month)
    const getAbsMonth = (dateObj) => dateObj.getFullYear() * 12 + dateObj.getMonth();
    const getLabel = (dateObj) => dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Sales Aggregation
    sales.forEach(s => {
      if (s.status !== "Completed") return;
      const d = new Date(s.date);
      const key = getAbsMonth(d);
      // Store using AbsMonth as key to naturally handle sorting
      if (!monthlyStats[key]) monthlyStats[key] = { absMonth: key, date: d, sales: 0, expenses: 0 };
      monthlyStats[key].sales += Number(s.total);
    });

    // Expenses Aggregation
    expenses.forEach(e => {
      const d = new Date(e.date);
      const key = getAbsMonth(d);
      if (!monthlyStats[key]) monthlyStats[key] = { absMonth: key, date: d, sales: 0, expenses: 0 };
      monthlyStats[key].expenses += Number(e.amount);
    });

    // Convert to Array and Sort by Time
    const sortedData = Object.values(monthlyStats).sort((a, b) => a.absMonth - b.absMonth);

    if (sortedData.length === 0) {
      document.getElementById("predSalesNextMonth").innerText = "No Data";
      document.getElementById("predProfitNextMonth").innerText = "No Data";
      return;
    }

    // Extract X and Y vectors
    const xValues = sortedData.map(d => d.absMonth); // 24204, 24205...
    const ySales = sortedData.map(d => d.sales);
    const yProfit = sortedData.map(d => d.sales - d.expenses);
    const labels = sortedData.map(d => getLabel(d.date));

    // Next Target Month
    const lastAbsMonth = xValues[xValues.length - 1];
    const nextAbsMonth = lastAbsMonth + 1;

    // Formatting Next Month Label
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + 1); // rough approx for display if needed, but we use math for value
    // Precise next month label from ID
    const nextYear = Math.floor(nextAbsMonth / 12);
    const nextMonthIndex = nextAbsMonth % 12;
    const nextMonthLabel = new Date(nextYear, nextMonthIndex).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) + " (Forecast)";


    let nextSales, nextProfit;

    // ALGORITHM SELECTION
    if (sortedData.length === 1) {
      // Not enough for regression, assume steady state
      nextSales = ySales[0];
      nextProfit = yProfit[0];
    } else {
      // k-Nearest Neighbors (k-NN) Regressor
      // We use k=3 to average the behavior of the most recent 3 months
      const salesModel = new KNNRegressor(3);
      salesModel.train(xValues, ySales);

      const profitModel = new KNNRegressor(3);
      profitModel.train(xValues, yProfit);

      // Predict next month
      nextSales = Math.round(salesModel.predict(nextAbsMonth));
      nextProfit = Math.round(profitModel.predict(nextAbsMonth));
    }

    // Update DOM
    document.getElementById("predSalesNextMonth").innerText = "₹" + nextSales.toLocaleString();
    document.getElementById("predProfitNextMonth").innerText = "₹" + nextProfit.toLocaleString();
    if (document.getElementById("predSalesNextMonthHighlight")) {
      document.getElementById("predSalesNextMonthHighlight").innerText = "₹" + nextSales.toLocaleString();
    }

    // Chart
    if (predictionChartInstance) predictionChartInstance.destroy();

    const ctx = document.getElementById("predictionChart").getContext("2d");

    // Prepare chart data for Line Chart with Forecast and CI
    const chartLabels = [...labels, nextMonthLabel];

    // Dataset 1: Actual Sales (null for the last point)
    const chartActual = [...ySales, null];

    // Dataset 2: Forecast Sales (null for all but last two points)
    const chartForecast = new Array(chartLabels.length).fill(null);
    chartForecast[ySales.length - 1] = ySales[ySales.length - 1]; // Start from last actual
    chartForecast[chartLabels.length - 1] = nextSales; // End at forecast

    // Dataset 3 & 4: Confidence Interval area
    const upperCI = new Array(chartLabels.length).fill(null);
    const lowerCI = new Array(chartLabels.length).fill(null);

    // We only show CI for the forecast part
    upperCI[ySales.length - 1] = ySales[ySales.length - 1];
    lowerCI[ySales.length - 1] = ySales[ySales.length - 1];
    upperCI[chartLabels.length - 1] = nextSales * 1.15; // +15%
    lowerCI[chartLabels.length - 1] = nextSales * 0.85; // -15%

    predictionChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Historical Sales',
            data: chartActual,
            borderColor: '#3498db',
            backgroundColor: '#3498db',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: '#3498db',
            tension: 0.3,
            fill: false,
            order: 1
          },
          {
            label: 'Forecasted Sales',
            data: chartForecast,
            borderColor: '#f39c12',
            backgroundColor: '#f39c12',
            borderWidth: 3,
            borderDash: [5, 5],
            pointRadius: 6,
            pointBackgroundColor: '#f39c12',
            tension: 0.3,
            fill: false,
            order: 2
          },
          {
            label: 'Confidence Interval',
            data: upperCI,
            borderColor: 'rgba(52, 152, 219, 0)',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            fill: {
              target: 'lowerCI',
              above: 'rgba(52, 152, 219, 0.1)'
            },
            pointRadius: 0,
            tension: 0.3,
            order: 4
          },
          {
            label: 'Lower Bound',
            id: 'lowerCI',
            data: lowerCI,
            borderColor: 'rgba(52, 152, 219, 0)',
            backgroundColor: 'transparent',
            pointRadius: 0,
            fill: false,
            tension: 0.3,
            order: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false // We use our custom legend in HTML
          },
          tooltip: {
            padding: 12,
            backgroundColor: 'rgba(26, 42, 68, 0.9)',
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13 },
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label === 'Lower Bound' || label === 'Confidence Interval') return null;
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed.y);
                }
                return label;
              }
            },
            filter: function (tooltipItem) {
              return tooltipItem.datasetIndex < 2; // Only show Actual and Forecast
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
              drawBorder: false
            },
            ticks: {
              font: { size: 11 },
              color: '#999',
              callback: v => '₹' + v.toLocaleString()
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { size: 11 },
              color: '#999'
            }
          }
        }
      }
    });

  } catch (e) {
    console.error("AI Prediction Error", e);
    document.getElementById("predSalesNextMonth").innerText = "Error";
    document.getElementById("predProfitNextMonth").innerText = "Error";
  }
}

/**
 * k-Nearest Neighbors (k-NN) Regressor
 * Finds the 'k' closest historical data points in time and averages them.
 * Highly responsive to the most recent behavior.
 */
class KNNRegressor {
  constructor(k = 3) {
    this.k = k;
    this.data = [];
  }

  train(x, y) {
    this.data = x.map((val, i) => ({ x: val, y: y[i] }));
  }

  predict(targetX) {
    if (this.data.length === 0) return 0;

    // Calculate distances (absolute difference in time)
    const distances = this.data.map(d => ({
      y: d.y,
      dist: Math.abs(d.x - targetX)
    }));

    // Sort by distance (closest first)
    distances.sort((a, b) => a.dist - b.dist);

    // Take top K and average
    const kClosest = distances.slice(0, Math.min(this.k, distances.length));
    const sum = kClosest.reduce((acc, d) => acc + d.y, 0);

    return sum / kClosest.length;
  }
}

/**
 * Simple Decision Tree Regressor
 * Splits data into segments based on time to find patterns.
 * Note: Trees are excellent for non-linear patterns but don't extrapolate trends.
 */
class DecisionTreeRegressor {
  constructor(maxDepth = 4) {
    this.maxDepth = maxDepth;
    this.tree = null;
  }

  train(x, y) {
    const data = x.map((val, i) => ({ x: val, y: y[i] }));
    this.tree = this._build(data, 0);
  }

  _build(data, depth) {
    if (data.length === 0) return null;
    const meanY = data.reduce((sum, d) => sum + d.y, 0) / data.length;

    if (depth >= this.maxDepth || data.length <= 2) {
      return { value: meanY };
    }

    let bestSplit = null;
    let minMSE = Infinity;

    // Try splitting at every point to find best MSE reduction
    for (let i = 0; i < data.length - 1; i++) {
      const split = (data[i].x + data[i + 1].x) / 2;
      const left = data.filter(d => d.x <= split);
      const right = data.filter(d => d.x > split);

      if (left.length === 0 || right.length === 0) continue;

      const mse = this._getMSE(left) + this._getMSE(right);
      if (mse < minMSE) {
        minMSE = mse;
        bestSplit = { split, left, right };
      }
    }

    if (!bestSplit) return { value: meanY };

    return {
      split: bestSplit.split,
      left: this._build(bestSplit.left, depth + 1),
      right: this._build(bestSplit.right, depth + 1)
    };
  }

  _getMSE(data) {
    const mean = data.reduce((sum, d) => sum + d.y, 0) / data.length;
    return data.reduce((sum, d) => sum + Math.pow(d.y - mean, 2), 0);
  }

  predict(x) {
    let node = this.tree;
    while (node && node.value === undefined) {
      node = x <= node.split ? node.left : node.right;
    }
    return node ? node.value : 0;
  }
}
