'use strict';
/**
 * Shax Store — Image Upload Middleware
 * Handles category & product image uploads from the Admin Panel
 * (works from both desktop file pickers and mobile camera/gallery).
 *
 * Files are written to  public/uploads/  and served statically by
 * server.js, so an uploaded file is reachable at /uploads/<filename>.
 */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

/* Make sure the upload directory exists (fresh deploys won't have it yet) */
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png' : '.png',
  'image/webp': '.webp',
  'image/gif' : '.gif'
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext  = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname) || '';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  }
});

function fileFilter(_req, file, cb) {
  // Check file type
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed.'));
  }
  
  // Check file size (additional check to be safe)
  if (file.size > 5 * 1024 * 1024) {
    return cb(new Error('File size exceeds 5MB limit.'));
  }
  
  // Check file extension as additional validation
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return cb(new Error('Invalid file extension.'));
  }
  
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

module.exports = upload;
