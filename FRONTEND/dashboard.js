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
    `http://localhost:3000/production/update/${editingBatchId}`,
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
      if (user.role === "Employee") {
        loadMyProductionHistory();
      }
      if (currentUserRole !== "Employee") {
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
  const productionSection = document.getElementById("production");
  if (productionSection) {
    productionSection.style.display =
      role.toLowerCase() === "employee" ? "block" : "none";
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
  let itemsSoldToday = 0;

  sales.forEach(sale => {
    // employee sees ONLY their own sales
    if (sale.addedBy !== loggedInEmployee) return;
    const saleDate = new Date(sale.date).toLocaleDateString();

    if (saleDate === today) {
      salesToday += sale.total;
      itemsSoldToday += Number(sale.quantity);
    }
  });

  document.getElementById("empSalesToday").innerText = `₹${salesToday}`;
  document.getElementById("empItemsSoldToday").innerText = itemsSoldToday;

  fetch("http://localhost:3000/production/my-history", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(batches => {
      const today = new Date().toLocaleDateString();

      let todayProduction = 0;

      batches.forEach(b => {
        const prodDate = new Date(b.production_date).toLocaleDateString();
        if (prodDate === today) {
          todayProduction += Number(b.quantity);
        }
      });

      document.getElementById("empTodayProduction").innerText = todayProduction;
    });

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
    const saleDateObj = new Date(sale.saleDate);
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

    const date = new Date(sale.saleDate);
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

  fetch("http://localhost:3000/sales/add", {
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
    const res = await fetch("http://localhost:3000/production/add", {
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
          <td>${sale.itemType}</td>
<td>${sale.product}</td>
<td>${sale.quantity}</td>
<td>₹${sale.unitPrice}</td>
<td>₹${sale.total}</td>
<td>${sale.saleType}</td>
<td>${sale.paymentMode}</td>
<td>${sale.addedBy}</td>
<td data-label="Date">${formatDate(sale.date)}</td>



            <td>
              ${(currentUserRole === "Owner" || currentUserRole === "Accountant")
            ? `<button onclick="downloadInvoice(${sale.id})">Invoice</button>`
            : ""
          }
              <span class="delete-btn" data-id="${sale.id}">🗑 Delete</span>
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
  if (!currentUserRole) {
    const payload = JSON.parse(atob(token.split(".")[1]));
    currentUserRole = payload.role;
  }

  fetch("http://localhost:3000/inventory", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(items => {
      const tbody = document.getElementById("inventoryTable");
      if (!tbody) return;

      tbody.innerHTML = "";

      // LOW STOCK COLLECTION
      const lowStockItems = [];

      items.forEach(i => {
        let statusText = "In Stock";
        let statusClass = "status-ok";
        let actionBtn = "-";

        if (i.stock === 0) {
          statusText = "Out of Stock";
          statusClass = "status-out";
          lowStockItems.push(i);
        }
        else if (i.stock <= i.minStock) {
          statusText = "Low Stock";
          statusClass = "status-low";
          lowStockItems.push(i);
        }
        //  Show Add Stock button only to allowed roles
        if (
          ["Owner", "Manager", "Accountant"].includes(currentUserRole)
          && i.stock <= i.minStock
        ) {
          actionBtn = `
      <button class="add-stock-btn"
        onclick="openAddStock('${i.product}')">
        + Add Stock
      </button>
    `;
        }

        tbody.innerHTML += `
          <tr>
            <td>${i.product}</td>
    <td>${i.stock}</td>
    <td>${i.unit || "-"}</td>
    <td>${i.minStock ?? "-"}</td>
    <td>₹${i.costPrice ?? "-"}</td>
    <td class="${statusClass}">${statusText}</td>
    <td>
  <button class="edit-btn"
    onclick='openEditInventory(${JSON.stringify(i)})'>
    Edit
  </button>

  <button class="delete-btn"
    onclick="openDeleteInventory(${i.id})">
    Delete
  </button>
</td>

        `;
      });

      //SHOW ALERT ONLY TO PRIVILEGED ROLES
      if (
        lowStockItems.length > 0 &&
        ["Owner", "Manager", "Accountant"].includes(currentUserRole)
      ) {
        showLowStockAlert(lowStockItems);
      }
    })
    .catch(err => {
      console.error("Failed to load inventory", err);
    });
}

// INVENTORY FORM
document.getElementById("inventoryForm")?.addEventListener("submit", e => {
  e.preventDefault();
  const invProduct = document.getElementById("invProduct");
  const invStock = document.getElementById("invStock");
  const invUnit = document.getElementById("invUnit");
  const invMinStock = document.getElementById("invMinStock");
  const invCost = document.getElementById("invCost");

  const invMsg = document.getElementById("invMsg");

  const product = invProduct.value.trim().toLowerCase();
  const stock = Number(invStock.value);
  const unit = invUnit.value;
  const minStock = Number(invMinStock.value);
  const costPrice = Number(invCost.value);

  fetch("http://localhost:3000/inventory/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      product,
      stock,
      unit,
      minStock,
      costPrice
    })
  })
    .then(res => {
      if (!res.ok) throw new Error("Inventory save failed");
      return res.json();
    })
    .then(() => {
      document.getElementById("inventoryFormWrapper").style.display = "none";

      invMsg.innerText = "Inventory updated";
      invMsg.style.color = "green";
      document.getElementById("inventoryForm").reset();
      loadInventory();
    })
    .catch(err => {
      invMsg.innerText = err.message;
      invMsg.style.color = "red";
      console.error(err);
    });
});




document.addEventListener("DOMContentLoaded", () => {
  const prodDateInput = document.getElementById("prodDate");
  if (prodDateInput) {
    prodDateInput.value = new Date().toISOString().split("T")[0];
  }

});

// ===================MY PRODUCTION HISTORY==========//

async function loadMyProductionHistory() {
  const res = await fetch("http://localhost:3000/production/my-history", {
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
        <td>${new Date(batch.production_date).toLocaleDateString()}</td>
        <td>${batch.status}</td>
        <td>${new Date(batch.expiry_date).toLocaleDateString()}</td>
        <td>
          ${canEdit
        // batch.status === "PENDING_APPROVAL"

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
    document.querySelector(".dashboard").prepend(alertBox);
  }

  alertBox.innerHTML = `
    ⚠️ <strong>Low Stock Alert</strong><br>
    ${items.map(i => `• ${i.product} (${i.stock} left)`).join("<br>")}
  `;
}


function openAddStock(product) {
  const wrapper = document.getElementById("inventoryFormWrapper");
  if (!wrapper) return;

  wrapper.style.display = "block";

  document.getElementById("invProduct").value = product;
  document.getElementById("invStock").focus();
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
  fetch("http://localhost:3000/inventory/edit", {
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
  fetch("http://localhost:3000/inventory/delete", {
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
function downloadInvoice(saleId) {
  const token = localStorage.getItem("jwtToken");

 
  const url = `http://localhost:3000/invoice/${saleId}?token=${token}`;
  window.open(url, "_blank");
}


// =============================
// DEFAULT LOAD
// =============================
document.addEventListener("DOMContentLoaded", loadDashboard);
