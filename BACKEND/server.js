require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");
const verifyToken = require("./middleware/auth");
const nodemailer = require("nodemailer");
const path = require("path");
const ExcelJS = require("exceljs");
const cron = require("node-cron");


// ================= EMAIL CONFIGURATION =================
const emailUser = (process.env.EMAIL_USER || "").trim();
const emailPass = (process.env.EMAIL_PASS || "").replace(/\s/g, ""); 

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: emailUser,
    pass: emailPass
  }
});

console.log("Email Notification Module Initialized");
console.log("-----------------------------------------");
console.log("EMAIL_USER:", emailUser ? `${emailUser.slice(0, 3)}...${emailUser.slice(-8)}` : "MISSING");
console.log("EMAIL_PASS Length:", emailPass.length, "chars");
if (emailPass.length !== 16 && emailPass.length !== 0) {
  console.warn("⚠️ WARNING: Gmail App Passwords should be exactly 16 characters long.");
}
console.log("-----------------------------------------");

// ================= REPORT GENERATION LOGIC =================

// Create reports folder if missing
const reportsDir = path.join(__dirname, "generated_reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir);
}

/**
 * Calculates metrics and generates PDF + Excel reports
 */
/**
 * Helper to calculate report metrics
 */
function getReportData(businessId, period = "Weekly") {
  const sales = loadSales().filter(s => s.business === businessId && s.status === "Completed");
  const expenses = loadExpenses().filter(e => e.business === businessId);

  const now = new Date();
  const filterDate = new Date();
  if (period === "Daily") filterDate.setDate(now.getDate() - 1);
  else if (period === "Weekly") filterDate.setDate(now.getDate() - 7);
  else if (period === "Monthly") filterDate.setMonth(now.getMonth() - 1);

  const filteredSales = sales.filter(s => new Date(s.date) >= filterDate);
  const filteredExpenses = expenses.filter(e => new Date(e.date) >= filterDate);

  const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0);
  const totalCost = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalProfit = totalSales - totalCost;
  const profitMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(2) : 0;

  return {
    totalSales, totalCost, totalProfit, profitMargin,
    filteredSales, filteredExpenses, filterDate, now, period, businessId
  };
}

/**
 * Generates PDF into a file path and returns a promise
 */
function generatePDFReport(data, filePath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      stream.on("finish", () => {
        console.log(`PDF successfully written to ${filePath}`);
        resolve();
      });
      stream.on("error", (err) => {
        console.error("PDF Stream Error:", err);
        reject(err);
      });

      doc.pipe(stream);

      doc.fontSize(20).text(`${data.period} Business Performance Report`, { align: "center" });
      doc.moveDown();
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`);
      doc.text(`Period: ${data.filterDate.toLocaleDateString()} to ${data.now.toLocaleDateString()}`);
      doc.moveDown();

      doc.fontSize(14).text("Financial Summary", { underline: true });
      doc.fontSize(12).text(`Total Sales: ₹${data.totalSales.toLocaleString()}`);
      doc.text(`Total Expenses: ₹${data.totalCost.toLocaleString()}`);
      doc.text(`Net Profit: ₹${data.totalProfit.toLocaleString()}`);
      doc.text(`Profit Margin: ${data.profitMargin}%`);
      doc.moveDown();

      doc.fontSize(14).text("Sales Breakdown", { underline: true });
      data.filteredSales.forEach((s, idx) => {
        doc.fontSize(10).text(`${idx + 1}. ${s.product} - ₹${s.total} (${new Date(s.date).toLocaleDateString()})`);
      });

      doc.end();
    } catch (err) {
      console.error("Critical error in generatePDFReport:", err);
      reject(err);
    }
  });
}

/**
 * Generates Excel Workbook object
 */
async function generateExcelReport(data) {
  const workbook = new ExcelJS.Workbook();

  // 1. Summary Sheet
  const summarySheet = workbook.addWorksheet("Business Summary");
  summarySheet.columns = [
    { header: "Metric Description", key: "metric", width: 30 },
    { header: "Financial Value", key: "value", width: 20 }
  ];

  summarySheet.addRows([
    { metric: "Report Period", value: data.period },
    { metric: "Start Date", value: data.filterDate.toLocaleDateString() },
    { metric: "End Date", value: data.now.toLocaleDateString() },
    { metric: "", value: "" }, // Spacer
    { metric: "Total Gross Sales", value: `₹${data.totalSales.toLocaleString()}` },
    { metric: "Total Expenses", value: `₹${data.totalCost.toLocaleString()}` },
    { metric: "Net Profit", value: `₹${data.totalProfit.toLocaleString()}` },
    { metric: "Profit Margin (%)", value: `${data.profitMargin}%` }
  ]);

  // Style Header
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

  // 2. Detailed Sales Sheet
  const salesSheet = workbook.addWorksheet("Detailed Sales");
  salesSheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Category", key: "itemType", width: 15 },
    { header: "Product Name", key: "product", width: 25 },
    { header: "Qty", key: "quantity", width: 8 },
    { header: "Unit Price", key: "unitPrice", width: 12 },
    { header: "Total (₹)", key: "total", width: 12 },
    { header: "Payment Mode", key: "paymentMode", width: 15 },
    { header: "Sold By", key: "addedBy", width: 15 }
  ];

  data.filteredSales.forEach(s => {
    salesSheet.addRow({
      date: new Date(s.date).toLocaleDateString(),
      itemType: s.itemType,
      product: s.product,
      quantity: s.quantity,
      unitPrice: s.unitPrice,
      total: s.total,
      paymentMode: s.paymentMode,
      addedBy: s.addedBy
    });
  });

  salesSheet.getRow(1).font = { bold: true };
  salesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F6EF' } }; // Light green

  // 3. Detailed Expenses Sheet
  const expSheet = workbook.addWorksheet("Detailed Expenses");
  expSheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Category", key: "category", width: 15 },
    { header: "Item/Type", key: "itemType", width: 20 },
    { header: "Qty", key: "quantity", width: 8 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Amount (₹)", key: "amount", width: 12 },
    { header: "Added By", key: "addedBy", width: 15 }
  ];

  data.filteredExpenses.forEach(e => {
    expSheet.addRow({
      date: new Date(e.date).toLocaleDateString(),
      category: e.category,
      itemType: e.itemType || "-",
      quantity: e.quantity || "-",
      unit: e.unit || "-",
      amount: e.amount,
      addedBy: e.addedBy
    });
  });

  expSheet.getRow(1).font = { bold: true };
  expSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE7E7' } }; // Light red

  return workbook;
}

/**
 * Wrapper for cron/on-demand email
 */
async function generateAndEmailReport(businessId, userEmail, period = "Weekly") {
  console.log(`Generating ${period} report for ${businessId} (${userEmail})...`);

  try {
    const data = getReportData(businessId, period);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const pdfPath = path.join(reportsDir, `Report_${period}_${timestamp}.pdf`);
    const excelPath = path.join(reportsDir, `Report_${period}_${timestamp}.xlsx`);

    console.log("Paths created:", { pdfPath, excelPath });

    // 1. Generate PDF (Await completion)
    try {
      await generatePDFReport(data, pdfPath);
      console.log("PDF generated successfully");
    } catch (pdfError) {
      console.error("PDF Generation Failed:", pdfError);
      throw new Error(`PDF Generation Failed: ${pdfError.message}`);
    }

    // 2. Generate Excel (Await completion)
    try {
      const workbook = await generateExcelReport(data);
      await workbook.xlsx.writeFile(excelPath);
      console.log(`Excel successfully written to ${excelPath}`);
    } catch (excelError) {
      console.error("Excel Generation Failed:", excelError);
      throw new Error(`Excel Generation Failed: ${excelError.message}`);
    }

    // 3. Send Email
    const mailOptions = {
      from: emailUser,
      to: userEmail,
      subject: `📊 ${period} Business Report - ${businessId}`,
      text: `Hello,\n\nPlease find attached the ${period.toLowerCase()} performance report for your business.\n\nSummary:\n- Total Sales: ₹${data.totalSales.toLocaleString()}\n- Net Profit: ₹${data.totalProfit.toLocaleString()}\n- Profit Margin: ${data.profitMargin}%\n\nRegards,\nSales Business Team`,
      attachments: [
        { filename: path.basename(pdfPath), path: pdfPath },
        { filename: path.basename(excelPath), path: excelPath }
      ]
    };

    console.log("Sending email...");
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent info: ${info.messageId}`);
    return { success: true };

  } catch (err) {
    console.error("REPORT ERROR:", err);
    return { success: false, error: err.message };
  }
}

// ================= SCHEDULING (CRON) =================

// 1. Automatic Daily Report: Every day at 9:00 AM
cron.schedule("0 9 * * *", async () => {
  console.log("Running scheduled daily reports...");
  const owners = loadUsers().filter(u => u.role === "Owner" && u.email);
  for (const owner of owners) {
    await generateAndEmailReport(owner.businessId, owner.email, "Daily");
  }
});

// 2. Automatic Weekly Report: Every Monday at 9:00 AM
cron.schedule("0 9 * * 1", async () => {
  console.log("Running scheduled weekly reports...");
  const owners = loadUsers().filter(u => u.role === "Owner" && u.email);
  for (const owner of owners) {
    await generateAndEmailReport(owner.businessId, owner.email, "Weekly");
  }
});

// 3. Automatic Monthly Report: 1st of every month at 9:00 AM
cron.schedule("0 9 1 * *", async () => {
  console.log("Running scheduled monthly reports...");
  const owners = loadUsers().filter(u => u.role === "Owner" && u.email);
  for (const owner of owners) {
    await generateAndEmailReport(owner.businessId, owner.email, "Monthly");
  }
});


const app = express();
app.use(express.json());

// ================= TEST EMAIL ENDPOINT =================
app.get("/test-email", async (req, res) => {
  console.log("Test email endpoint hit");
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER, // Send to yourself
    subject: "Test Email from Business Analyzer",
    text: "If you are reading this, your email configuration is working perfectly!"
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: "Test email sent successfully! Check your inbox." });
  } catch (error) {
    console.error("Test email failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));


const SECRET_KEY = process.env.SECRET_KEY || "mysecretkey";
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
  const { username, fullname, email, password, role, businessType, businessId } = req.body;
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
    fullname,
    email,
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

// ================= EMAIL NOTIFICATION LOGIC =================

function getOwnerEmail(businessId) {
  const users = loadUsers();
  const owner = users.find(u => u.businessId === businessId && u.role === "Owner");
  return owner ? owner.email : null;
}

async function sendLowStockEmail(ownerEmail, item) {
  const mailOptions = {
    from: process.env.EMAIL_USER, 
    to: ownerEmail,
    subject: `⚠️ Low Stock Alert: ${item.product}`,
    text: `Hello,\n\nThis is an automated alert to inform you that the stock for "${item.product}" has reached or fallen below the minimum level.\n\nCurrent Stock: ${item.stock} ${item.unit || ''}\nMinimum Level: ${item.minStock} ${item.unit || ''}\n\nPlease refill the stocks soon.\n\nBest regards,\nAgriConnect System`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Low stock email sent to ${ownerEmail} for ${item.product}`);
  } catch (error) {
    console.error("Error sending low stock email:", error.message);
  }
}

function checkLowStockAndNotify(businessId, item) {
  console.log(`Checking stock for ${item.product}: Stock=${item.stock}, Min=${item.minStock}`);
  if (item.minStock !== undefined && item.minStock !== null &&
    Number(item.stock) <= Number(item.minStock) &&
    Number(item.minStock) > 0) {

    console.log(`Low stock condition met for ${item.product}. Fetching owner email...`);
    const ownerEmail = getOwnerEmail(businessId);
    if (ownerEmail) {
      console.log(`Sending email to owner: ${ownerEmail}`);
      sendLowStockEmail(ownerEmail, item);
    } else {
      console.log(`No owner found for businessId ${businessId}`);
    }
  } else {
    console.log(`Stock for ${item.product} is above minimum or minStock is 0.`);
  }
}


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

    // Check for low stock alert
    checkLowStockAndNotify(req.user.businessId, finishedItem);
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

  // If raw material, check stock levels
  if (expenses[index].category === "🌾 Raw Materials" && expenses[index].itemType) {
    const inventory = loadInventory();
    const item = inventory.find(i => i.product.toLowerCase() === expenses[index].itemType.toLowerCase() && i.business === req.user.businessId);
    if (item) {
      checkLowStockAndNotify(req.user.businessId, item);
    }
  }
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

  // Check for low stock alert if it was a deduction or if it's still low
  const updatedItem = inventory.find(i => i.product === normalizedProduct && i.business === req.user.businessId);
  if (updatedItem) {
    checkLowStockAndNotify(req.user.businessId, updatedItem);
  }

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

    // Check for low stock alert on ingredients
    if (recipe) {
      for (let mat in recipe.materials) {
        const invItem = inventory.find(i => i.product.toLowerCase() === mat.toLowerCase() && i.business === req.user.businessId);
        if (invItem) {
          checkLowStockAndNotify(req.user.businessId, invItem);
        }
      }
    }

  }

  // Update Status
  batch.status = status;
  saveProduction(production);

  res.json({ message: `Production ${status}` });
});


// ================= ON-DEMAND REPORT GENERATION =================
app.post("/reports/generate-on-demand", verifyToken, (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { period } = req.body; // "Daily", "Weekly", or "Monthly"
  const user = loadUsers().find(u => u.username === req.user.username);

  if (!user || !user.email) {
    return res.status(400).json({ message: "User email not found in records" });
  }

  // Run in background to prevent timeout and "false negative" errors on frontend
  generateAndEmailReport(req.user.businessId, user.email, period || "Weekly")
    .then(result => {
      if (result.success) {
        console.log(`Report sent successfully to ${user.email}`);
      } else {
        console.error(`Failed to send report to ${user.email}:`, result.error);
      }
    })
    .catch(err => console.error("Critical background report error:", err));

  // Respond immediately
  res.json({ message: "Report generation initiated. You will receive the email shortly." });
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

  // Check for low stock alert
  checkLowStockAndNotify(req.user.businessId, item);

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


// ================= REPORT EXPORT ENDPOINTS =================

// Helper to inject token from query (for direct browser downloads)
const injectToken = (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
};

app.get("/reports/export/pdf", injectToken, verifyToken, (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { period } = req.query;
  const data = getReportData(req.user.businessId, period || "Weekly");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=Report_${period}_${Date.now()}.pdf`);

  // Direct download doesn't NEED to save a file, but for simplicity we reuse the logic
  // and pipe to res. However, our refactored generatePDFReport takes a path.
  // Let's create a temporary path or refactor back to support stream + path.
  // Actually, we can just use doc directly for direct download to avoid disk I/O.

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).text(`${data.period} Business Performance Report`, { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`);
  doc.text(`Period: ${data.filterDate.toLocaleDateString()} to ${data.now.toLocaleDateString()}`);
  doc.moveDown();

  doc.fontSize(14).text("Financial Summary", { underline: true });
  doc.fontSize(12).text(`Total Sales: ₹${data.totalSales.toLocaleString()}`);
  doc.text(`Total Expenses: ₹${data.totalCost.toLocaleString()}`);
  doc.text(`Net Profit: ₹${data.totalProfit.toLocaleString()}`);
  doc.text(`Profit Margin: ${data.profitMargin}%`);
  doc.moveDown();

  doc.fontSize(14).text("Sales Breakdown", { underline: true });
  data.filteredSales.forEach((s, idx) => {
    doc.fontSize(10).text(`${idx + 1}. ${s.product} - ₹${s.total} (${new Date(s.date).toLocaleDateString()})`);
  });

  doc.end();
});

app.get("/reports/export/excel", injectToken, verifyToken, async (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { period } = req.query;
  const data = getReportData(req.user.businessId, period || "Weekly");

  const workbook = await generateExcelReport(data);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=Report_${period}_${Date.now()}.xlsx`);

  await workbook.xlsx.write(res);
  res.end();
});


app.post("/reports/generate-on-demand", verifyToken, async (req, res) => {
  if (!["Owner", "Accountant"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { period } = req.body;
  const user = loadUsers().find(u => u.username === req.user.username);

  if (!user || !user.email) {
    return res.status(400).json({ message: "User email not found" });
  }

  const success = await generateAndEmailReport(req.user.businessId, user.email, period || "Weekly");

  if (success) {
    res.json({ message: "Report sent to your email successfully" });
  } else {
    res.status(500).json({ message: "Failed to send report email" });
  }
});



/* ------------------- OWNER ONLY ------------------- */
app.get("/owner", verifyRole("Owner"), (req, res) => {
  res.json({ message: `Dashboard access granted to ${req.user.username}` });
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));


