// =============================
// GET TOKEN
// =============================
const token = localStorage.getItem("jwtToken");

if (!token) {
  alert("Session expired. Please login again.");
  window.location.href = "login.html";
  throw new Error("No token");
}

const payload = JSON.parse(atob(token.split(".")[1]));
const loggedInEmployee = payload.username;

const saleDateInput = document.getElementById("saleDate");
if (saleDateInput) {
  saleDateInput.value = new Date().toISOString().split("T")[0];
}


// TOP BAR
document.getElementById("userName").innerText = payload.username;
document.getElementById("userRole").innerText = payload.role;

// SIDEBAR BUSINESS INFO
document.getElementById("sidebarBusinessType").innerText =
  `businessType: "${payload.businessType}"`;

document.getElementById("sidebarBusinessId").innerText =
  `businessId: "${payload.businessId}"`;




// =============================
// GLOBAL CHART REFERENCES
// =============================
let currentUserRole = null;
let profitLossBarChartInstance = null;
let monthlyProfitChartInstance = null;
let editingBatchId = null;

// ================= INVENTORY MODAL DOM REFS =================
const editId = document.getElementById("editId");
const editStock = document.getElementById("editStock");
const editUnit = document.getElementById("editUnit");
const editMinStock = document.getElementById("editMinStock");
const editCostPrice = document.getElementById("editCostPrice");

const deleteId = document.getElementById("deleteId");



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

  // ===== EMPLOYEE BACKGROUND =====
  const mainContent = document.querySelector(".main");
  if (mainContent) {
    if (role === "Employee") {
      mainContent.classList.add("employee-mode");
    } else {
      mainContent.classList.remove("employee-mode");
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

  // Hide dashboard charts for Employee ONLY
  if (role === "Employee") {
    document
      .querySelectorAll(".dashboard-card.owner-only, .dashboard-card.manager-only")
      .forEach(el => el.style.display = "none");
  }

  // ===== PRODUCTION SECTIONS - EMPLOYEE ONLY =====
  // Hide "My Production History" section from Owner, Manager, and Accountant
  const productionHistorySection = document.querySelector(".production-history.employee-only");
  if (productionHistorySection) {
    productionHistorySection.style.display = (role === "Employee") ? "block" : "none";
  }

  // Hide "Daily Production Entry" section from Owner, Manager, and Accountant
  const productionEntrySection = document.querySelector(".production-entry-section.employee-only");
  if (productionEntrySection) {
    productionEntrySection.style.display = (role === "Employee") ? "block" : "none";
  }

  // Hide the production form itself (legacy code - keeping for compatibility)
  const productionSection = document.getElementById("production");
  if (productionSection) {
    productionSection.style.display =
      role.toLowerCase() === "employee" ? "none" : "none"; // Always hidden initially (toggle button controls it)
  }

  // Section visibility controlled ONLY by active class
  document.querySelectorAll(".page-section")
    .forEach(sec => sec.classList.remove("active"));

  document.getElementById("dashboard").classList.add("active");
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
function loadSalesForDashboard() {
  fetch("http://127.0.0.1:3000/sales", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then(res => res.json())
    .then(sales => {
      console.log("Sales data:", sales);

      // ===== ROLE-BASED KPI SELECTION =====
      if (currentUserRole === "Employee") {
        updateEmployeeKPIs(sales);
      }

      if (currentUserRole === "Manager") {
        updateKPIs(sales);   // managers use general KPIs
      }

      if (currentUserRole === "Owner") {
        updateKPIs(sales);   // owners use general KPIs
      }

      // Charts only for Owner & Manager
      if (currentUserRole !== "Employee") {
        buildProfitLossBarChart(sales);
        buildMonthlyProfitChart(sales);
      }

    })
    .catch(() => {
      console.error("Failed to load dashboard sales data");
    });
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

  document.getElementById("empSalesToday").innerText = `₹${salesToday}`;
  document.getElementById("empItemsSoldToday").innerText = itemsSoldToday;

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
  document.getElementById("salesToday").innerText = `₹${salesToday}`;
  document.getElementById("monthlySales").innerText = `₹${monthlySales}`;
  document.getElementById("totalExpenses").innerText = `₹${totalExpenses}`;
  document.getElementById("netProfit").innerText = `₹${netProfit}`;
  document.getElementById("avgOrderValue").innerText = `₹${avgOrderValue}`;
  document.getElementById("totalRevenue").innerText = `₹${totalRevenue}`;

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
function buildProfitLossBarChart(sales) {
  let profit = 0;
  let loss = 0;

  sales.forEach(sale => {
    if (sale.status === "Completed") {
      profit += sale.total;
    } else {
      loss += sale.total;
    }
  });

  const ctx = document.getElementById("profitLossChart");
  if (!ctx) return;

  if (profitLossBarChartInstance) {
    profitLossBarChartInstance.destroy();
  }

  profitLossBarChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Profit", "Loss"],
      datasets: [{
        label: "Amount (₹)",
        data: [profit, loss],
        backgroundColor: ["#4CAF50", "#F44336"],
        borderRadius: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `₹${ctx.raw}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => `₹${value}`
          }
        }
      }
    }
  });
}

// =============================
// MONTHLY PROFIT TREND (BAR)
// =============================
function buildMonthlyProfitChart(sales) {
  const monthlyProfit = {};

  sales.forEach(sale => {
    if (sale.status !== "Completed") return;

    const date = new Date(sale.date);
    const month = date.toLocaleString("default", { month: "short", year: "numeric" });

    monthlyProfit[month] = (monthlyProfit[month] || 0) + sale.total;
  });

  const labels = Object.keys(monthlyProfit);
  const values = Object.values(monthlyProfit);

  const ctx = document.getElementById("monthlyProfitChart");
  if (!ctx) return;

  if (monthlyProfitChartInstance) {
    monthlyProfitChartInstance.destroy();
  }

  monthlyProfitChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Monthly Profit (₹)",
        data: values,
        backgroundColor: "#2196F3",
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `₹${ctx.raw}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => `₹${value}`
          }
        }
      }
    }
  });
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

      showSection("viewSales");
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
  "🍫 Flavours & Enhancers": ["Vanilla essence", "Cocoa powder", "Chocolate chips", "Coffee powder", "Custard powder"],
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
document.getElementById("itemType")?.addEventListener("change", function () {
  const type = this.value;
  const productSelect = document.getElementById("productName");
  productSelect.innerHTML = '<option value="">Select Item</option>';

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

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
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

      sales.forEach(sale => {
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
            <td>₹${sale.unitPrice}</td>
            <td>₹${sale.total}</td>
            <td>${sale.saleType}</td>
            <td>${sale.paymentMode}</td>
            <td>${sale.addedBy}</td>
            <td data-label="Date">${formatDate(sale.date)}</td>
            ${actionCell}
          </tr>
        `;
      });
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
  } catch (err) {
    console.error("Dashboard refresh failed:", err);
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
  document.getElementById("btnShowHistory")?.classList.toggle("active", view === 'history');

  // Show/Hide Date Filter
  const filter = document.getElementById("productionHistoryFilter");
  if (filter) filter.style.display = (view === 'history') ? "flex" : "none";

  // Load Content
  if (view === 'approvals') {
    loadInventoryApprovals();
  } else {
    loadInventoryHistory();
  }
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
          <td>${new Date(b.production_date).toLocaleDateString()}</td>
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
          <td>${new Date(b.production_date).toLocaleDateString()}</td>
          <td>${statusBadge}</td>
           <td>${new Date(b.expiry_date).toLocaleDateString()}</td>
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

  data.forEach(batch => {
    const canEdit = batch.status === "PENDING_APPROVAL";

    tbody.innerHTML += `
      <tr>
        <td>${batch.batchId}</td>
        <td>${batch.product}</td>
        <td>${batch.quantity}</td>
        <td>${formatDate(batch.production_date)}</td>
        <td><span class="status-badge ${batch.status.toLowerCase()}">${batch.status}</span></td>
        <td>${formatDate(batch.expiry_date)}</td>
        <td>
          ${canEdit
        ? `<button onclick="openEditModal('${batch.batchId}', ${batch.quantity}, '${batch.notes || ""}')">Edit</button>`
        : "-"}
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
  let alertBox = document.getElementById("lowStockAlert");

  if (!alertBox) {
    alertBox = document.createElement("div");
    alertBox.id = "lowStockAlert";
    alertBox.className = "low-stock-alert";
    const dashboardSection = document.getElementById("dashboard");
    if (dashboardSection) {
      dashboardSection.prepend(alertBox);
    }
  }

  alertBox.innerHTML = `
    ⚠️ <strong>Low Stock Alert</strong><br>
    ${items.map(i => `• ${i.product} (${i.stock} left)`).join("<br>")}
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
  fetch("http://127.0.0.1:3000/inventory/edit", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      id: Number(document.getElementById("editId").value),
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
        "⚡ Utilities": { label: "Bill/Ref #", placeholder: "#INV-123" },
        "🏠 Rent": { label: "Month/Period", placeholder: "Jan 2026" },
        "🚚 Transport": { label: "Vehicle/Trip", placeholder: "DL-01-X" },
        "🔧 Maintenance": { label: "Service Details", placeholder: "Repair" },
        "📦 Packaging": { label: "Vendor", placeholder: "PackCo" }
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
      name = `Purchase: ${product} (${stock}${unit})`;
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
    paymentMethod: document.getElementById("expensePaymentMethod").value
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

  // Hide form
  expenseFormDiv.style.display = "none";
  toggleExpenseBtn.textContent = "➕ Add New Expense";
}

async function loadExpensesTable() {
  const tbody = document.getElementById("expensesTableBody");
  const tableHead = document.getElementById("expenseTableHead");
  if (!tbody || !tableHead) return;

  const categoryFilter = document.getElementById("expenseFilterCategory")?.value || "";

  if (categoryFilter === "🌾 Raw Materials") {
    // SWITCH TO INVENTORY VIEW
    tableHead.innerHTML = `
      <tr>
        <th>Type</th>
        <th>Raw Material</th>
        <th>Stock</th>
        <th>Unit</th>
        <th>Min Level</th>
        <th>Unit Price</th>
        <th>Cost Price</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
    `;

    try {
      const res = await fetch("http://127.0.0.1:3000/inventory", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const items = await res.json();
      tbody.innerHTML = "";

      if (!Array.isArray(items) || items.length === 0) {
        tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>No inventory items found.</td></tr>";
        return;
      }

      items.forEach(i => {
        let statusText = "In Stock";
        let statusClass = "status-ok";
        if (i.stock === 0) {
          statusText = "Out of Stock";
          statusClass = "status-out";
        } else if (i.stock <= i.minStock) {
          statusText = "Low Stock";
          statusClass = "status-low";
        }

        const unitPriceNum = i.unitPrice || (i.stock > 0 ? (i.costPrice / i.stock) : 0);

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${i.materialType || "-"}</td>
          <td style="text-transform: capitalize;">${i.product}</td>
          <td>${i.stock}</td>
          <td>${i.unit || "-"}</td>
          <td>${i.minStock ?? "-"}</td>
          <td>₹${Number(unitPriceNum).toFixed(2)}</td>
          <td>₹${Number(i.costPrice || 0).toFixed(2)}</td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn-xs edit" onclick='openEditInventory(${JSON.stringify(i)})'>Edit</button>
            <button class="btn-xs delete" onclick="openDeleteInventory(${i.id})">Del</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load inventory:", err);
    }
  } else {
    // SWITCH TO EXPENSE VIEW
    tableHead.innerHTML = `
      <tr>
        <th>Category</th>
        <th>Expense Name</th>
        <th>Amount</th>
        <th>Method</th>
        <th>Paid By</th>
        <th>Date</th>
        <th>Action</th>
      </tr>
    `;

    const queryStr = categoryFilter ? `?category=${encodeURIComponent(categoryFilter)}` : "";
    try {
      const res = await fetch(`http://127.0.0.1:3000/expenses${queryStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const expenses = await res.json();
      tbody.innerHTML = "";

      if (!Array.isArray(expenses) || expenses.length === 0) {
        tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>No expenses found.</td></tr>";
        return;
      }

      [...expenses].reverse().forEach(exp => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${exp.category}</td>
          <td>${exp.name}</td>
          <td>₹${Number(exp.amount).toFixed(2)}</td>
          <td>${exp.paymentMethod}</td>
          <td>${exp.paidBy}</td>
          <td>${formatDate(exp.date)}</td>
          <td>
            <button class="btn-xs edit" onclick='editExpense(${JSON.stringify(exp)})'>Edit</button>
            <button class="btn-xs delete" onclick="deleteExpense(${exp.id})">Del</button>
            <button class="btn-xs download" onclick="downloadExpenseInvoice(${exp.id})">Invoice</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error("Failed to load expenses:", err);
    }
  }
}

document.getElementById("expenseFilterCategory")?.addEventListener("change", loadExpensesTable);

window.editExpense = function (exp) {
  document.getElementById("expenseId").value = exp.id;
  document.getElementById("expenseCategory").value = exp.category;

  // Trigger sub-cat dropdown & field toggles
  const catEvent = new Event('change');
  document.getElementById("expenseCategory").dispatchEvent(catEvent);

  if (exp.category === "🌾 Raw Materials") {
    // Extract product name and qty from expense name if needed, 
    // but we usually want the user to pick from inventory selectors.
    // For now we just focus the inventory fields
    document.getElementById("invMaterialType").focus();
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
// DEFAULT LOAD
// =============================
document.addEventListener("DOMContentLoaded", loadDashboard);

// ================= OVERRIDE EMPLOYEE PRODUCTION HISTORY =================
window.loadMyProductionHistory = function () {
  const tbody = document.querySelector("#productionHistoryTable tbody");
  if (!tbody) return;

  fetch("http://127.0.0.1:3000/production/my-history", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(batches => {
      tbody.innerHTML = "";

      if (batches.length === 0) {
        tbody.innerHTML = "<tr><td colspan='7' style='text-align:center'>No production history found.</td></tr>";
        return;
      }

      batches.reverse().forEach(b => {
        const row = document.createElement("tr");

        let statusBadge = `<span class="pending">Pending</span>`;
        if (b.status === "Approved") statusBadge = `<span class="success">Approved</span>`;
        if (b.status === "Rejected") statusBadge = `<span class="status-out">Rejected</span>`;

        // Disable Edit if Approved
        const isDisabled = (b.status === 'Approved' || b.status === 'Rejected') ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '';

        row.innerHTML = `
                <td>${b.batchId}</td>
                <td>${b.product}</td>
                <td>${b.quantity}</td>
                <td>${new Date(b.production_date).toLocaleDateString()}</td>
                <td>${statusBadge}</td>
                <td>${new Date(b.expiry_date).toLocaleDateString()}</td>
                <td>
                    <button class="btn-xs edit" onclick="openEditModal('${b.batchId}', ${b.quantity}, '${b.notes}')" ${isDisabled}>Edit</button>
                </td>
            `;
        tbody.appendChild(row);
      });
    })
    .catch(err => console.error(err));
};
