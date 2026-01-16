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

/* ----------------- REGISTER-------------------  */
app.post("/register", (req, res) => {
  const { username, password, role, business } = req.body;
  let users = loadUsers();

  //  Check if user already exists
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: "User already exists" });
  }

  // Save new user
  const newUser = { username, password, role, business };
  users.push(newUser);
  saveUsers(users);

  // Generate JWT token
  const token = jwt.sign(
    { username, role, business },
    SECRET_KEY,
    { expiresIn: "1h" }
  );

  // 📤 Send token back
  res.json({
    message: "Registration successful",
    token
  });
});


/* ----------------- LOGIN --------------- */
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  let users = loadUsers();

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { username: user.username, role: user.role, business: user.business },
    SECRET_KEY,
    { expiresIn: "1h" }
  );

  res.json({ token });
});

/*----------------------SIGNUP-------------------------*/
app.post("/signup", (req, res) => {
  const { username, password, role, business } = req.body;

  // Save in JSON file or DB
  const users = require("./users.json");

  const userExists = users.find(u => u.username === username);
  if (userExists) {
    return res.json({ success: false, message: "User already exists" });
  }

  users.push({ username, password, role, business });

  const fs = require("fs");
  fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));

  res.json({ success: true });
});


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
