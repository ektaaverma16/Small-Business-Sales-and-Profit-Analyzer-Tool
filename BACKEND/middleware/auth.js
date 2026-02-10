const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.SECRET_KEY || "mysecretkey";

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  // Handle both "Bearer token" and "token"
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  if (!token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Login expired or invalid token" });
    }

    req.user = decoded;
    next();
  });
};
