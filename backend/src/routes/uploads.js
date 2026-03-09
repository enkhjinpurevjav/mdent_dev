import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const MEDIA_UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR || "/data/media";

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

function makeUploader(subDir) {
  const dir = path.resolve(MEDIA_UPLOAD_DIR, subDir);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = MIME_TO_EXT[file.mimetype] || ".jpg";
      const rawUserId = req.query.userId;
      const userId =
        rawUserId && /^\d+$/.test(String(rawUserId))
          ? String(rawUserId)
          : null;
      const ts = Date.now();
      const rand = crypto.randomBytes(6).toString("hex");
      const prefix = userId ? `${userId}-` : "";
      cb(null, `${prefix}${ts}-${rand}${ext}`);
    },
  });

  return multer({
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
}

function uploadHandler(uploader, urlPrefix) {
  return [
    (req, res, next) => {
      uploader.single("file")(req, res, (err) => {
        if (err) {
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
      const filePath = `${urlPrefix}/${req.file.filename}`;
      return res.json({ filePath });
    },
  ];
}

const staffPhotoUploader = makeUploader("staff-photos");
const stampUploader = makeUploader("stamps");
const signatureUploader = makeUploader("signatures");

const router = Router();

router.post(
  "/staff-photo",
  ...uploadHandler(staffPhotoUploader, "/media/staff-photos")
);

router.post(
  "/stamp",
  ...uploadHandler(stampUploader, "/media/stamps")
);

router.post(
  "/signature",
  ...uploadHandler(signatureUploader, "/media/signatures")
);

export default router;
