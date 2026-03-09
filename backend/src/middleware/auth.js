import jwt from "jsonwebtoken";

const COOKIE_NAME = "access_token";

/**
 * Reads the JWT from either the httpOnly cookie or the Authorization header.
 * Returns the raw token string, or null if not present.
 */
function extractToken(req) {
  if (req.cookies?.[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

// JWT Authentication Middleware
// Honors DISABLE_AUTH=true to bypass auth (for rollout compatibility).
export function authenticateJWT(req, res, next) {
  if (process.env.DISABLE_AUTH === "true") {
    req.user = null;
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing or invalid token." });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({ error: "Internal server error." });
  }

  if (process.env.NODE_ENV === "development") {
    console.log("JWT_SECRET:", secret);
    console.log("Token received:", token);
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired." });
      }
      console.error("JWT error:", err.message);
      return res.status(401).json({ error: "Invalid token." });
    }
    req.user = user;
    next();
  });
}

// Optional JWT Authentication Middleware - does not require auth but populates req.user if present
export function optionalAuthenticateJWT(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const secret = process.env.JWT_SECRET || "testsecret";
  jwt.verify(token, secret, (err, user) => {
    if (err) {
      console.warn("Invalid JWT token:", err.message);
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}
