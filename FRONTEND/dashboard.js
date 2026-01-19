// =============================
// GET TOKEN
// =============================
const token = localStorage.getItem("jwtToken");

if (!token) {
  alert("Session expired. Please login again.");
  window.location.href = "login.html";
    throw new Error("No token"); 

}


// =============================
// GLOBAL CHART REFERENCES
// =============================
let currentUserRole = null;
let profitLossBarChartInstance = null;
let monthlyProfitChartInstance = null;


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
  fetch("http://localhost:3000/dashboard", {
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

      document.body.classList.remove("role-owner", "role-manager", "role-employee");

if (user.role === "Owner") document.body.classList.add("role-owner");
if (user.role === "Manager") document.body.classList.add("role-manager");
if (user.role === "Employee") document.body.classList.add("role-employee");


      document.getElementById("userName").innerText =
        `Welcome, ${user.username}`;
      document.getElementById("userRole").innerText = user.role;

      applyRoleVisibility(user.role);
      loadSalesForDashboard();
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
    .querySelectorAll(".navigation .owner-only, .navigation .manager-only, .navigation .employee-only")
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

   // Owner & Manager → show owner-manager KPI cards
  document.querySelectorAll(".stat-card.owner-only, .stat-card.manager-only").forEach(card => {
    card.style.display = (role === "Owner" || role === "Manager") ? "flex" : "none";
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

  fetch("http://localhost:3000/users", {
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
  fetch("http://localhost:3000/sales", {
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

}



// =============================
// KPI CALCULATIONS
// =============================
function updateEmployeeKPIs(sales) {
  const today = new Date().toLocaleDateString();

  let salesToday = 0;
  let totalOrders = sales.length;
  let pendingAmount = 0;

  sales.forEach(sale => {
    const saleDate = new Date(sale.date).toLocaleDateString();

    if (saleDate === today) {
      salesToday += sale.total;
    }

    if (sale.status !== "Completed") {
      pendingAmount += sale.total;
    }
  });

  document.getElementById("empSalesToday").innerText = `₹${salesToday}`;
  document.getElementById("empTotalOrders").innerText = totalOrders;
  document.getElementById("empPendingAmount").innerText = `₹${pendingAmount}`;
}


//***************OWNER+ MANAGER ONLY************//
function updateKPIs(sales) {
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

      totalRevenue += sale.total;
      completedOrders++;

      if (saleDate === today) {
        salesToday += sale.total;
      }

      if (
        saleDateObj.getMonth() === currentMonth &&
        saleDateObj.getFullYear() === currentYear
      ) {
        monthlySales += sale.total;
      }
    }
  });

  const avgOrderValue =
    completedOrders > 0
      ? Math.round(totalRevenue / completedOrders)
      : 0;

  document.getElementById("salesToday").innerText = `₹${salesToday}`;
  document.getElementById("monthlySales").innerText = `₹${monthlySales}`;
  document.getElementById("avgOrderValue").innerText = `₹${avgOrderValue}`;
  document.getElementById("totalRevenue").innerText = `₹${totalRevenue}`;
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

  const product = document.getElementById("productName").value;
  const quantity = document.getElementById("quantity").value;
  const price = document.getElementById("price").value;
  const status = document.getElementById("paymentStatus").value;

  fetch("http://localhost:3000/sales/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ product, quantity, price, status })
  })
    .then(res => res.json())
    .then(() => {
      document.getElementById("salesMsg").innerText = "Sale added successfully";
      document.getElementById("salesMsg").style.color = "green";
      document.getElementById("addSalesForm").reset();


      showSection("viewSales");   
      loadSalesTable();
      loadSalesForDashboard();
    })
    .catch(() => {
      document.getElementById("salesMsg").innerText = "Failed to add sale";
      document.getElementById("salesMsg").style.color = "red";
    });
});

//***************LOAD SALES*************/
function loadSalesTable() {
  const section = document.getElementById("viewSales");
  if (!section.classList.contains("active")) return; 

  fetch("http://localhost:3000/sales", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(sales => {
      const tbody = document.getElementById("salesTableBody");
      if (!tbody) return;

      tbody.innerHTML = "";

      if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">No sales found</td></tr>`;
        return;
      }

      sales.forEach(sale => {
        tbody.innerHTML += `
          <tr>
            <td>${new Date(sale.date).toLocaleDateString()}</td>
            <td>${sale.product}</td>
            <td>${sale.quantity}</td>
            <td>₹${sale.price}</td>
            <td>₹${sale.total}</td>
            <td>${sale.status}</td>
            <td>${sale.addedBy}</td>
            <td>
              <span class="delete-btn" data-id="${sale.id}">🗑</span>
            </td>
          </tr>
        `;
      });
    });
}


/// REFRESH KPI's///
function refreshKPIsOnly() {
  fetch("http://localhost:3000/sales", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then(res => res.json())
    .then(sales => {

      // KPIs
      if (currentUserRole === "Employee") {
        updateEmployeeKPIs(sales);
      } else {
        updateKPIs(sales);
      }

      // Charts only for Owner / Manager
      if (currentUserRole !== "Employee") {
        buildProfitLossBarChart(sales);
        buildMonthlyProfitChart(sales);
      }
    });
}

// event handler//
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("delete-btn")) {

    e.preventDefault();        // stop default
    e.stopPropagation();       // stop bubbling (VERY IMPORTANT)

    const saleId = e.target.dataset.id;
    if (!saleId) return;

    if (!confirm("Delete this sale?")) return;

    fetch(`http://localhost:3000/sales/${saleId}`, {
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
function loadInventory() {
  fetch("http://localhost:3000/inventory", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(items => {
      const tbody = document.getElementById("inventoryTable");
      if (!tbody) return;

      tbody.innerHTML = "";

      items.forEach(i => {
        const status =
          i.stock === 0
            ? "Out of Stock"
            : i.stock < 5
              ? "Low Stock"
              : "In Stock";

        tbody.innerHTML += `
          <tr>
            <td>${i.product}</td>
            <td>${i.stock}</td>
            <td>₹${i.costPrice}</td>
            <td>${status}</td>
          </tr>
        `;
      });
    });
}

// Add inventory
document.getElementById("inventoryForm")?.addEventListener("submit", e => {
  e.preventDefault();

  fetch("http://localhost:3000/inventory/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      product: invProduct.value,
      stock: invStock.value,
      costPrice: invCost.value
    })
  })
    .then(res => res.json())
    .then(() => {
      invMsg.innerText = "Inventory updated";
      invMsg.style.color = "green";
      inventoryForm.reset();
      loadInventory();
    });
});



// =============================
// DEFAULT LOAD
// =============================
document.addEventListener("DOMContentLoaded", loadDashboard);
