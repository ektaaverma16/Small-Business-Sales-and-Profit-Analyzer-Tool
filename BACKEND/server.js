const express = require("express");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");
const verifyToken = require("./middleware/auth");
const path = require("path");


const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));


const SECRET_KEY = "mysecretkey";
const USERS_FILE = "users.json";
const EXPENSES_FILE = path.join(__dirname, "expenses.json");


// ================= EXPIRY RULES =================
const PRODUCT_EXPIRY_DAYS = {
  "Plain Sponge Cake": 5,
  "Chocolate Cake": 5,
  "Vanilla Cake": 5,
  "Black Forest Cake": 3,
  "White Bread": 3,
  "Milk Bread": 3,
  "Brown Bread": 3,
  "Pav Bread": 2,
  "Veg Puff": 1,
  "Paneer Puff": 1,
  "Butter Cookies": 30
};


// Load users
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

// Save users
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/***************Generate Business ID*******************/
function generateBusinessId(businessType) {
  const prefix = businessType.split(" ")[0].toUpperCase().slice(0, 3);
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}


/* ----------------- REGISTER-------------------  */
app.post("/register", (req, res) => {
  const { username, password, role, businessType, businessId } = req.body;
  let users = loadUsers();

  // Duplicate username not allowed
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: "User already exists" });
  }

  let finalBusinessId = businessId;

  // ================= OWNER =================
  if (role === "Owner") {
    if (!businessType) {
      return res.status(400).json({ message: "Business type is required" });
    }

    // Generate Business ID: RE-1023
    const prefix = businessType.substring(0, 2).toUpperCase();
    const unique = Date.now().toString().slice(-4);
    finalBusinessId = `${prefix}-${unique}`;
  }

  // ================= NON-OWNER =================
  else {
    if (!businessId) {
      return res.status(400).json({ message: "Business ID required" });
    }

    const businessExists = users.find(
      u =>
        u.businessId === businessId &&
        u.businessType === businessType &&
        u.role === "Owner"
    );

    if (!businessExists) {
      return res.status(400).json({ message: "Invalid Business ID" });
    }
  }

  // ================= SAVE USER =================
  const newUser = {
    username,
    password,
    role,
    businessType,
    businessId: finalBusinessId
  };

  users.push(newUser);
  saveUsers(users);

  // ================= TOKEN =================
  const token = jwt.sign(
    {
      username,
      role,
      businessType,
      businessId: finalBusinessId
    },
    SECRET_KEY,
    { expiresIn: "1h" }
  );

  res.json({
    message: "Registration successful",
    token,
    businessType,
    businessId: finalBusinessId
  });
});



/* ----------------- LOGIN --------------- */
app.post("/login", (req, res) => {
  const { username, password, role, businessId } = req.body;
  const users = loadUsers();

  let user;

  if (role === "Owner") {
    // OWNER LOGIN (NO BUSINESS ID)
    user = users.find(
      u =>
        u.username === username &&
        u.password === password &&
        u.role === "Owner"
    );
  } else {
    // EMPLOYEE / MANAGER LOGIN (BUSINESS ID REQUIRED)
    user = users.find(
      u =>
        u.username === username &&
        u.password === password &&
        u.role === role &&
        u.businessId === businessId
    );
  }

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      username: user.username,
      role: user.role,
      businessType: user.businessType,
      businessId: user.businessId
    },
    SECRET_KEY,
    { expiresIn: "1h" }
  );

  res.json({ token });
});



/*----------------------SIGNUP-------------------------*/
// app.post("/signup", (req, res) => {
//   const { username, password, role, business } = req.body;

// Save in JSON file or DB
//   const users = require("./users.json");

//   const userExists = users.find(u => u.username === username);
//   if (userExists) {
//     return res.json({ success: false, message: "User already exists" });
//   }

//   users.push({ username, password, role, business });

//   const fs = require("fs");
//   fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));

//   res.json({ success: true });
// });


/* ----------------- ROLE PROTECTION ------------------ */
function verifyRole(role) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      if (user.role !== role) {
        return res.status(403).json({ message: "Access denied" });
      }

      req.user = user;
      next();
    });
  };
}



app.get("/dashboard", verifyToken, (req, res) => {
  const inventory = loadInventory();
  const lowStockItems = inventory.filter(i =>
    i.business === req.user.businessId &&
    i.minStock !== undefined && i.minStock !== null &&
    Number(i.stock) <= Number(i.minStock) &&
    Number(i.minStock) > 0
  );

  res.json({
    message: "Dashboard access granted ",
    user: req.user,
    lowStockItems: (req.user.role === "Owner" || req.user.role === "Accountant") ? lowStockItems : []
  });
});

/* ---------------- ADD SALES ---------------- */


const SALES_FILE = path.join(__dirname, "sales.json");


// Load sales
function loadSales() {
  if (!fs.existsSync(SALES_FILE)) {
    fs.writeFileSync(SALES_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(SALES_FILE, "utf-8"));
}


// Save sales

function saveSales(sales) {
  fs.writeFileSync(SALES_FILE, JSON.stringify(sales, null, 2));
}

app.post("/sales/add", verifyToken, (req, res) => {
  console.log("Sales add API hit");
  console.log("Request body:", req.body);

  const {
    itemType,
    product,
    quantity,
    unitPrice,
    total,
    saleType,
    paymentMode,
    saleDate
  } = req.body;

  // VALIDATION
  if (!product || !quantity || !unitPrice) {
    return res.status(400).json({ message: "Invalid sale data" });
  }

  const sales = loadSales();


  const newSale = {
    id: Date.now(),
    itemType,
    product,
    quantity: Number(quantity),
    unitPrice: Number(unitPrice),
    total: Number(total),              // already auto-calculated on frontend
    saleType,
    paymentMode,
    status: "Completed",
    addedBy: req.user.username,
    business: req.user.businessId,
    date: new Date().toISOString(),

  };

  sales.push(newSale);
  saveSales(sales);

  // DEDUCT FROM INVENTORY
  const inventory = loadInventory();
  const finishedItem = inventory.find(i =>
    i.product.toLowerCase().trim() === product.toLowerCase().trim() &&
    i.business === req.user.businessId
  );

  if (finishedItem) {
    finishedItem.stock = Math.max(0, Number(finishedItem.stock) - Number(quantity));
    saveInventory(inventory);
  }

  res.json({
    message: "Sale added successfully",
    sale: newSale
  });
});

/* ---------------- VIEW SALES ---------------- */
app.get("/sales", verifyToken, (req, res) => {
  const { date, month } = req.query;
  const sales = loadSales();

  // Role-based filtering
  let filteredSales = sales;

  if (req.user.role === "Employee") {
    filteredSales = sales.filter(
      sale => sale.addedBy === req.user.username
    );
  }

  // Date/Month filtering
  if (date) {
    filteredSales = filteredSales.filter(sale => {
      // sale.date is stored as ISO string
      return new Date(sale.date).toISOString().split('T')[0] === date;
    });
  } else if (month) {
    // month format YYYY-MM
    filteredSales = filteredSales.filter(sale => {
      return new Date(sale.date).toISOString().slice(0, 7) === month;
    });
  }

  res.json(filteredSales);
});


/*-------------------DELETE SALES-----------------*/

app.delete("/sales/:id", verifyToken, (req, res) => {
  console.log("DELETE /sales/:id hit");
  console.log("Token user:", req.user);
  console.log("Sale ID param:", req.params.id);

  const saleId = Number(req.params.id);
  if (isNaN(saleId)) {
    console.log("Invalid ID");
    return res.status(400).json({ message: "Invalid sale ID" });
  }

  const sales = loadSales();

  const saleIndex = sales.findIndex(s => s.id === saleId);
  if (saleIndex === -1) {
    console.log("Sale not found");
    return res.status(404).json({ message: "Sale not found" });
  }

  const sale = sales[saleIndex];

  // Only allow Owner, Manager, or the user who added the sale
  if (req.user.role === "Employee" && sale.addedBy !== req.user.username) {
    console.log("Access denied");
    return res.status(403).json({ message: "Access denied" });
  }

  sales.splice(saleIndex, 1);
  saveSales(sales);

  // RESTORE INVENTORY
  const inventory = loadInventory();
  const finishedItem = inventory.find(i =>
    i.product.toLowerCase().trim() === sale.product.toLowerCase().trim() &&
    i.business === req.user.businessId
  );

  if (finishedItem) {
    finishedItem.stock = Number(finishedItem.stock) + Number(sale.quantity);
    saveInventory(inventory);
  }

  console.log("Sale deleted:", sale);
  res.json({ message: "Sale deleted successfully" });
});

// ================= EXPENSES =================

function loadExpenses() {
  if (!fs.existsSync(EXPENSES_FILE)) {
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(EXPENSES_FILE, "utf-8"));
}

function saveExpenses(expenses) {
  fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 2));
}

app.post("/expenses/add", verifyToken, (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  console.log("Adding expense:", req.body, "User:", req.user);
  const { category, name, amount, date, paymentMethod, materialType, itemType, qty, unit, minStock } = req.body;

  if (!category || !name || amount === "" || amount === undefined || !date || !paymentMethod) {
    console.log("Validation failed:", { category, name, amount, date, paymentMethod });
    return res.status(400).json({ message: "Invalid expense data" });
  }

  const expenses = loadExpenses();

  const newExpense = {
    id: Date.now(),
    category,
    name,
    amount: Number(amount),
    date,
    paymentMethod,
    materialType: materialType || null,
    itemType: itemType || null,
    qty: qty || null,
    unit: unit || null,
    minStock: minStock || null,
    paidBy: req.user.role,
    addedBy: req.user.username,
    business: req.user.businessId
  };

  expenses.push(newExpense);
  saveExpenses(expenses);

  res.json({ message: "Expense added successfully", expense: newExpense });
});

app.get("/expenses", verifyToken, (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { category } = req.query;
  const expenses = loadExpenses();
  let businessExpenses = expenses.filter(e => e.business === req.user.businessId);

  if (category) {
    businessExpenses = businessExpenses.filter(e => e.category === category);
  }

  res.json(businessExpenses);
});

app.put("/expenses/:id", verifyToken, (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const id = Number(req.params.id);
  const expenses = loadExpenses();
  const index = expenses.findIndex(e => e.id === id && e.business === req.user.businessId);

  if (index === -1) {
    return res.status(404).json({ message: "Expense not found" });
  }

  // Update expense but protect identity/business fields
  expenses[index] = {
    ...expenses[index],
    ...req.body,
    id,
    business: req.user.businessId,
    paidBy: req.user.role, // Update role to current editor's role
    addedBy: req.user.username // Update username to current editor
  };
  saveExpenses(expenses);

  res.json({ message: "Expense updated successfully" });
});

app.delete("/expenses/:id", verifyToken, (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const id = Number(req.params.id);
  let expenses = loadExpenses();
  const initialLength = expenses.length;

  expenses = expenses.filter(e => !(e.id === id && e.business === req.user.businessId));

  if (expenses.length === initialLength) {
    return res.status(404).json({ message: "Expense not found" });
  }

  saveExpenses(expenses);
  res.json({ message: "Expense deleted successfully" });
});

app.get("/expenses/invoice/:id",
  // Inject token from query for downloads
  (req, res, next) => {
    if (!req.headers.authorization && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  },
  verifyToken,
  (req, res) => {
    const id = Number(req.params.id);
    const expenses = loadExpenses();
    const expense = expenses.find(e => e.id === id && e.business === req.user.businessId);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=expense-${id}.pdf`);

    doc.pipe(res);

    // Header
    doc.fontSize(22).text("EXPENSE VOUCHER", { align: "center", underline: true });
    doc.moveDown();

    doc.fontSize(10);
    doc.text(`Voucher No: EXP-${expense.id}`, { align: "right" });
    doc.text(`Date: ${new Date(expense.date).toLocaleDateString("en-IN")}`, { align: "right" });
    doc.moveDown();

    doc.fontSize(12);
    // Utility to clean strings for PDF (removes Emojis)
    const pdfSafe = (text) => (text || "").toString().replace(/[^\x00-\x7F]/g, "").trim();

    const catClean = pdfSafe(expense.category);
    doc.text(`Category: ${catClean}`);
    doc.moveDown(0.5);
    doc.text("----------------------------------------------------------------", { color: "#cccccc" });
    doc.moveDown(0.5);

    if (expense.category.includes("Raw Materials")) {
      const name = expense.name || "";
      let item = name, type = "-", qty = "-", min = "-";

      const detailedMatch = name.match(/Purchase:\s*(.*?)\s*\|\s*Type:\s*(.*?)\s*\|\s*Qty:\s*(.*?)\s*\|\s*Min:\s*(.*)$/);
      const legacyMatch = name.match(/Purchase:\s*(.*?)\s*\((.*?)\)$/);

      if (detailedMatch) {
        item = pdfSafe(detailedMatch[1]);
        type = pdfSafe(detailedMatch[2]);
        qty = pdfSafe(detailedMatch[3]);
        min = pdfSafe(detailedMatch[4]);
      } else if (legacyMatch) {
        item = pdfSafe(legacyMatch[1]);
        qty = pdfSafe(legacyMatch[2]);
      } else {
        item = pdfSafe(name.replace("Purchase: ", ""));
      }

      doc.text(`Expense Name: ${item}`);
      doc.text(`Material Type: ${type}`);
      doc.text(`Quantity: ${qty}`);
      doc.text(`Min Stock Level: ${min}`);
    } else {
      // General categories: "Description (Detail)"
      const nameMatch = (expense.name || "").match(/^(.*?) \((.*?)\)$/);
      const mainName = nameMatch ? nameMatch[1] : expense.name;
      const detail = nameMatch ? nameMatch[2] : "";

      const dynamicLabels = {
        "💰 Salary": "Staff Name",
        "🏠 Rent": "Month/Period",
        "🔧 Maintenance": "Service Details"
      };

      const label = dynamicLabels[expense.category] || "Details";

      doc.text(`Category: ${expense.category}`);
      doc.text(`Expense Name: ${mainName}`);
      if (detail) doc.text(`${label}: ${detail}`);
    }

    doc.moveDown(0.5);
    doc.text(`Paid By: ${expense.paidBy}`);
    doc.text(`Payment Mode: ${expense.paymentMethod}`);

    doc.moveDown();
    doc.text("----------------------------------------------------------------", { color: "#cccccc" });
    doc.moveDown();

    const amtStr = Number(expense.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 });
    doc.fontSize(14).text(`TOTAL AMOUNT: Rs. ${amtStr}`, { bold: true });

    // Footer
    doc.moveDown(5);
    doc.fontSize(11);
    const safeY = doc.y > 600 ? doc.y : 650;
    doc.text("_______________________", 350, safeY);
    doc.text("Authorized Signature", 370, safeY + 15);

    doc.end();
  });

// ================= INVENTORY =================

const INVENTORY_FILE = path.join(__dirname, "inventory.json");

function loadInventory() {
  if (!fs.existsSync(INVENTORY_FILE)) {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf-8"));
}

function saveInventory(data) {
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data, null, 2));
}

// ================= ADD / UPDATE INVENTORY =================
app.post("/inventory/add", verifyToken, (req, res) => {
  const { materialType, product, stock, unitPrice, costPrice, unit, minStock } = req.body;
  const allowedUnits = ["kg", "grams", "litre", "pcs"];

  if (unit && !allowedUnits.includes(unit)) {
    return res.status(400).json({
      message: "Invalid unit. Allowed units: kg, grams, litre, pcs"
    });
  }

  let inventory = loadInventory();
  const normalizedProduct = product.trim();

  const existing = inventory.find(
    i =>
      i.product.toLowerCase() === normalizedProduct.toLowerCase() &&
      i.business === req.user.businessId
  );

  if (existing) {
    existing.stock += Number(stock);
    if (materialType) existing.materialType = materialType;
    if (unitPrice !== undefined) existing.unitPrice = Number(unitPrice);
    if (costPrice !== undefined) existing.costPrice = Number(costPrice);
    if (unit) existing.unit = unit;
    if (minStock !== undefined) existing.minStock = Number(minStock);
  } else {
    inventory.push({
      id: Date.now(),
      materialType,
      product: normalizedProduct,
      stock: Number(stock),
      unitPrice: Number(unitPrice),
      costPrice: Number(costPrice),
      unit,
      minStock: Number(minStock),
      business: req.user.businessId
    });
  }

  saveInventory(inventory);
  res.json({ message: "Inventory updated successfully" });
});


/* -------- VIEW INVENTORY -------- */
app.get("/inventory", verifyToken, (req, res) => {

  const inventory = loadInventory();

  const businessInventory = inventory.filter(
    i => i.business === req.user.businessId
  );

  res.json(businessInventory);
});

//============== DAILY PRODUCTION===========//
const PRODUCTION_FILE = path.join(__dirname, "production.json");
const RECIPES_FILE = path.join(__dirname, "recipes.json");

function loadProduction() {
  if (!fs.existsSync(PRODUCTION_FILE)) {
    fs.writeFileSync(PRODUCTION_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(PRODUCTION_FILE));
}

function saveProduction(data) {
  fs.writeFileSync(PRODUCTION_FILE, JSON.stringify(data, null, 2));
}

function loadRecipes() {
  return JSON.parse(fs.readFileSync(RECIPES_FILE));
}



// ================= ADD PRODUCTION =================
app.post("/production/add", verifyToken, (req, res) => {

  // Only EMPLOYEE
  if (req.user.role !== "Employee") {
    return res.status(403).json({ message: "Only employees can add production" });
  }

  const { product, quantity, production_date, notes } = req.body;

  if (!product || !quantity || quantity <= 0) {
    return res.status(400).json({ message: "Invalid production data" });
  }

  // ================= EXPIRY DATE CALCULATION =================
  const prodDate = production_date ? new Date(production_date) : new Date();

  // Get expiry days or use a sensible default (3 days)
  const shelfLifeDays = PRODUCT_EXPIRY_DAYS[product] || 3;

  const expiryDate = new Date(prodDate);
  expiryDate.setDate(expiryDate.getDate() + shelfLifeDays);

  // ================= LOAD INVENTORY & RECIPES =================
  const inventory = loadInventory();
  const recipes = loadRecipes();
  const recipe = recipes.find(r => r.product === product);

  if (!recipe) {
    // If no recipe, we create a temporary batch but skip deduction
    // This prevents the "Recipe not found" error from blocking production
    console.warn(`No recipe found for ${product}. Skipping ingredient deduction.`);
  } else {
    // ================= CHECK RAW MATERIAL AVAILABILITY =================
    for (let mat in recipe.materials) {
      const requiredQty = recipe.materials[mat] * quantity;

      const invItem = inventory.find(
        i =>
          i.product.toLowerCase() === mat.toLowerCase() &&
          i.business === req.user.businessId
      );

      if (!invItem || invItem.stock < requiredQty) {
        return res.status(400).json({
          message: `Insufficient ${mat} stock`
        });
      }
    }

    // ================= DEDUCT RAW MATERIALS (DEFERRED TO APPROVAL) =================
    // Logic moved to approval endpoint to ensure stock is only adjusted when approved.

    /* 
    for (let mat in recipe.materials) {
      const requiredQty = recipe.materials[mat] * quantity;
      const invItem = inventory.find(i => i.product.toLowerCase() === mat.toLowerCase() && i.business === req.user.businessId);
      if (invItem) invItem.stock -= requiredQty;
    } 
    */
  }

  // ================= ADD FINISHED GOODS (DEFERRED TO APPROVAL) =================
  /*
  const finishedItem = inventory.find(i => i.product.toLowerCase() === product.toLowerCase() && i.business === req.user.businessId);
  if (finishedItem) {
    finishedItem.stock += Number(quantity);
  } else {
    inventory.push({
      id: Date.now(),
      product,
      stock: Number(quantity),
      unit: "pcs",
      minStock: 0,
      costPrice: 0,
      business: req.user.businessId
    });
  }
  saveInventory(inventory);
  */

  // ================= CREATE PRODUCTION BATCH =================
  const production = loadProduction();

  const batchId = "BATCH-" + Date.now();

  production.push({
    batchId,
    product,
    quantity: Number(quantity),
    producedBy: req.user.username,
    production_date: prodDate.toISOString(),
    expiry_date: expiryDate.toISOString(),
    status: "Pending",
    notes: notes || "",
    business: req.user.businessId
  });

  saveProduction(production);

  res.json({
    message: "Production batch created",
    batchId
  });
});

// ================= UPDATE PRODUCTION STATUS (APPROVE/REJECT) =================
app.put("/production/:batchId/status", verifyToken, (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { status } = req.body; // "Approved" or "Rejected"
  const { batchId } = req.params;

  const production = loadProduction();
  const batchIndex = production.findIndex(p => p.batchId === batchId && p.business === req.user.businessId);

  if (batchIndex === -1) {
    return res.status(404).json({ message: "Production batch not found" });
  }

  const batch = production[batchIndex];

  if (batch.status === "Approved") {
    return res.status(400).json({ message: "Batch already approved" });
  }

  if (status === "Approved") {
    // EXECUTE INVENTORY DEDUCTION HERE
    const inventory = loadInventory();
    const recipes = loadRecipes();
    const recipe = recipes.find(r => r.product === batch.product);

    if (recipe) {
      // 1. Check Stock Availability Again
      for (let mat in recipe.materials) {
        const requiredQty = recipe.materials[mat] * batch.quantity;
        const invItem = inventory.find(i => i.product.toLowerCase() === mat.toLowerCase() && i.business === req.user.businessId);

        if (!invItem || invItem.stock < requiredQty) {
          return res.status(400).json({ message: `Insufficient stock for ${mat} to approve production.` });
        }
      }

      // 2. Deduct Stock
      for (let mat in recipe.materials) {
        const requiredQty = recipe.materials[mat] * batch.quantity;
        const invItem = inventory.find(i => i.product.toLowerCase() === mat.toLowerCase() && i.business === req.user.businessId);
        if (invItem) invItem.stock -= requiredQty;
      }
    }

    // 3. Add Finished Goods
    const finishedItem = inventory.find(i => i.product.toLowerCase() === batch.product.toLowerCase() && i.business === req.user.businessId);
    if (finishedItem) {
      finishedItem.stock += Number(batch.quantity);
    } else {
      inventory.push({
        id: Date.now(),
        product: batch.product,
        stock: Number(batch.quantity),
        unit: "pcs",
        minStock: 0,
        costPrice: 0,
        business: req.user.businessId
      });
    }
    saveInventory(inventory);
  }

  // Update Status
  batch.status = status;
  saveProduction(production);

  res.json({ message: `Production ${status}` });
});


// ================= VIEW ALL USERS (OWNER ONLY) =================
app.get("/users", verifyToken, (req, res) => {
  if (req.user.role !== "Owner") {
    return res.status(403).json({ message: "Access denied" });
  }

  const users = loadUsers();

  res.json(users);
});

// =================== PRODUCTION HISTORY ================== //
app.get("/production/my-history", verifyToken, (req, res) => {
  try {
    if (req.user.role !== "Employee") {
      return res.status(403).json({ message: "Access denied" });
    }

    //  Load production JSON
    const production = loadProduction();

    // 2Auto mark expired
    autoMarkExpired(production);

    // 3️Filter only employee records
    const myHistory = production
      .filter(p => p.producedBy === req.user.username)
      .sort(
        (a, b) =>
          new Date(b.production_date) - new Date(a.production_date)
      );

    res.json(myHistory);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/production/history", verifyToken, (req, res) => {
  // Allow Employees to see history for stock validation
  if (!["Owner", "Manager", "Accountant", "Employee"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const production = loadProduction();

    // Auto mark expired
    autoMarkExpired(production);

    const history = production
      .filter(p => p.business === req.user.businessId)
      .sort((a, b) => new Date(b.production_date) - new Date(a.production_date));

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

function autoMarkExpired(production) {
  const today = new Date();
  let updated = false;

  production.forEach(batch => {
    if (
      batch.status === "APPROVED" &&
      new Date(batch.expiry_date) < today
    ) {
      batch.status = "EXPIRED";
      updated = true;
    }
  });

  if (updated) {
    saveProduction(production);
  }
}
// =================== EDIT PRODUCTION ================== //
app.put("/production/update/:batchId", verifyToken, (req, res) => {
  console.log("PARAM batchId:", req.params.batchId);
  console.log("BODY:", req.body);

  if (req.user.role !== "Employee") {
    return res.status(403).json({ message: "Access denied" });
  }

  const production = loadProduction();
  const batch = production.find(
    b => b.batchId === req.params.batchId
  );

  if (!batch) {
    return res.status(404).json({ message: "Batch not found" });
  }

  if (batch.status !== "PENDING_APPROVAL") {
    return res.status(403).json({
      message: "Only pending batches can be edited"
    });
  }

  if (batch.producedBy !== req.user.username) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  // Allowed edits
  batch.quantity = req.body.quantity ?? batch.quantity;
  batch.notes = req.body.notes ?? batch.notes;

  saveProduction(production);

  res.json({ message: "Batch updated successfully" });
});


//======INVENTORY EDIT AND DELETE=======//

app.put("/inventory/:id", verifyToken, (req, res) => {
  const inventory = loadInventory();
  const id = Number(req.params.id);

  const item = inventory.find(
    i => i.id === id && i.business === req.user.businessId
  );

  if (!item) {
    return res.status(404).json({ message: "Inventory item not found" });
  }

  const { stock, unit, minStock, costPrice } = req.body;

  if (stock !== undefined) item.stock = Number(stock);
  if (unit !== undefined) item.unit = unit;
  if (minStock !== undefined) item.minStock = Number(minStock);
  if (costPrice !== undefined) item.costPrice = Number(costPrice);

  saveInventory(inventory);

  res.json({ message: "Inventory updated successfully" });
});

app.delete("/inventory/:id", verifyToken, (req, res) => {
  const id = Number(req.params.id);
  let inventory = loadInventory();

  const before = inventory.length;

  inventory = inventory.filter(
    i => !(i.id === id && i.business === req.user.businessId)
  );

  if (inventory.length === before) {
    return res.status(404).json({ message: "Inventory item not found" });
  }

  saveInventory(inventory);

  res.json({ message: "Inventory deleted successfully" });
});

// =================PDF Generation========//


app.get(
  "/invoice/:saleId",

  // STEP 1: Inject token from query
  (req, res, next) => {
    if (!req.headers.authorization && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  },

  // STEP 2: Verify JWT
  verifyToken,

  // STEP 3: Generate Invoice PDF
  (req, res) => {

    // ONLY OWNER & ACCOUNTANT
    if (!["Owner", "Accountant"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const saleId = Number(req.params.saleId);
    const sales = loadSales();

    const sale = sales.find(
      s => s.id === saleId && s.business === req.user.businessId
    );

    if (!sale) {
      return res.status(404).json({ message: "Sale not found" });
    }

    // ================= CREATE PDF =================
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${sale.id}.pdf`
    );

    doc.pipe(res);

    // ====== INVOICE CONTENT ======
    doc.fontSize(20).text("BAKERY INVOICE", { align: "center" });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Invoice No: INV-${sale.id}`);
    doc.text(`Date: ${new Date(sale.date).toLocaleDateString()}`);
    doc.text(`Sold By: ${sale.addedBy}`);
    doc.text(`Payment Mode: ${sale.paymentMode}`);
    doc.text(`Sale Type: ${sale.saleType}`);

    doc.moveDown();

    doc.text("Item Details", { underline: true });
    doc.moveDown(0.5);

    doc.text(`Category: ${sale.itemType}`);
    doc.text(`Product: ${sale.product}`);
    doc.text(`Quantity: ${sale.quantity}`);
    doc.text(`Unit Price: ₹${sale.unitPrice}`);
    doc.text(`Total Amount: ₹${sale.total}`);

    doc.moveDown();
    doc.fontSize(14).text(`GRAND TOTAL: ₹${sale.total}`, { bold: true });

    doc.moveDown(2);
    doc.fontSize(10).text(
      "Thank you for your business!",
      { align: "center" }
    );

    doc.end();
  }
);



/* ------------------- OWNER ONLY ------------------- */
app.get("/owner", verifyRole("Owner"), (req, res) => {
  res.json({ message: `Dashboard access granted to ${req.user.username}` });
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));


