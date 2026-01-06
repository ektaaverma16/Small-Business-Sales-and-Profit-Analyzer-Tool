const express = require("express");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const fs = require("fs");
const cors = require("cors");

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

  if (users.find(u => u.username === username)) {
    return res.status(400).json({ message: "User already exists" });
  }

  users.push({ username, password, role, business });
  saveUsers(users);
  res.json({ message: "Registration successful" });
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

/* ----------------- ROLE PROTECTION ------------------ */
function verifyRole(role) {
  return (req, res, next) => {
    const token = req.headers["authorization"];
    if (!token) return res.sendStatus(403);

    jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err || user.role !== role) return res.sendStatus(403);

      req.user = user;
      next();
    });
  };
}

/* ------------------- OWNER ONLY ------------------- */
app.get("/owner", verifyRole("Owner"), (req, res) => {
  res.json({ message: `Dashboard access granted to ${req.user.username}` });
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
