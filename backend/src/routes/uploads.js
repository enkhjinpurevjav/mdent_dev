import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { authenticateJWT } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads/staff-photos");

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || ".jpg";
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return cb(new Error("NO_USER_ID"));
    }
    const ts = Date.now();
    const rand = crypto.randomBytes(6).toString("hex");
    cb(null, `${userId}-${ts}-${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("INVALID_TYPE"));
    }
  },
});

const router = Router();

router.post(
  "/staff-photo",
  authenticateJWT,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err.message === "NO_USER_ID") {
          return res.status(401).json({ error: "Unauthorized." });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ error: "File too large. Maximum size is 2 MB." });
        }
        if (err.message === "INVALID_TYPE") {
          return res.status(400).json({
            error:
              "Invalid file type. Only JPEG, PNG, and WebP images are allowed.",
          });
        }
        return next(err);
      }
      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    const filePath = `/uploads/staff-photos/${req.file.filename}`;
    return res.json({ filePath });
  }
);

export default router;
