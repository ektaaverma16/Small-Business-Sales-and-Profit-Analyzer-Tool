const express = require("express");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");
const verifyToken = require("./middleware/auth");
const path = require("path");



const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

const SECRET_KEY = "mysecretkey";
const USERS_FILE = "users.json";

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

  // ❌ Duplicate username not allowed
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
  res.json({
    message: "Dashboard access granted ",
    user: req.user
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
  const { product, quantity, price, status } = req.body;

  if (!product || !quantity || !price) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const sales = loadSales();

  const newSale = {
    id: Date.now(),
    product,
    quantity: Number(quantity),
    price: Number(price),
    total: Number(quantity) * Number(price),
    status: status || "Pending",   // DEFAULT VALUE
    addedBy: req.user.username,
    business: req.user.business,
    date: new Date().toISOString()
  };

  sales.push(newSale);

  // 🔻 Reduce inventory stock
const inventory = loadInventory();
const item = inventory.find(i => i.product === product);

if (item) {
  item.stock -= Number(quantity);
  if (item.stock < 0) item.stock = 0;
  saveInventory(inventory);
}

  saveSales(sales);

    console.log("Sale saved:", newSale);

  res.json({
    message: "Sale added successfully"});
});


/* ---------------- VIEW SALES ---------------- */
app.get("/sales", verifyToken, (req, res) => {
  const sales = loadSales();

  // Role-based filtering
  let filteredSales = sales;

  if (req.user.role === "Employee") {
    filteredSales = sales.filter(
      sale => sale.addedBy === req.user.username
    );
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

  console.log("Sale deleted:", sale);
  res.json({ message: "Sale deleted successfully" });
});

// ================= INVENTORY =================


const INVENTORY_FILE = path.join(__dirname, "inventory.json");

// Load inventory
function loadInventory() {
  if (!fs.existsSync(INVENTORY_FILE)) {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify([], null, 2));
    return [];
  }
  return JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf-8"));
}

// Save inventory
function saveInventory(items) {
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(items, null, 2));
}

/* -------- ADD / UPDATE PRODUCT (Owner & Manager) -------- */
app.post("/inventory/add", verifyToken, (req, res) => {

  console.log("INVENTORY ADD HIT");
  console.log("USER:", req.user);
  console.log("BODY:", req.body);

  if (!["Owner", "Manager"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { product, stock, costPrice } = req.body;

  if (!product || Number(stock) <= 0) {
    return res.status(400).json({ message: "Invalid product or stock" });
  }

  const inventory = loadInventory();

  const existing = inventory.find(
    i => i.product === product && i.business === req.user.business
  );

  if (existing) {
    existing.stock += Number(stock);
    if (costPrice != null) {
      existing.costPrice = Number(costPrice);
    }
  } else {
    inventory.push({
      id: Date.now(),
      product,
      stock: Number(stock),
      costPrice: Number(costPrice || 0),
      business: req.user.business
    });
  }

  saveInventory(inventory);
  res.json({ message: "Inventory updated successfully" });
});

/* -------- VIEW INVENTORY -------- */
app.get("/inventory", verifyToken, (req, res) => {

  const inventory = loadInventory();

  const businessInventory = inventory.filter(
    i => i.business === req.user.business
  );

  res.json(businessInventory);
});


// ================= VIEW ALL USERS (OWNER ONLY) =================
app.get("/users", verifyToken, (req, res) => {
  if (req.user.role !== "Owner") {
    return res.status(403).json({ message: "Access denied" });
  }

  const users = loadUsers();

  res.json(users);
});



/* ------------------- OWNER ONLY ------------------- */
app.get("/owner", verifyRole("Owner"), (req, res) => {
  res.json({ message: `Dashboard access granted to ${req.user.username}` });
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
