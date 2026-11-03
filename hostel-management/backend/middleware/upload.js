/**
 * Secure file uploads (multer).
 *  - Only images (jpg, png, webp) and PDF are accepted (extension AND mime type checked)
 *  - Random file names (original names are never used on disk)
 *  - Size limit from MAX_UPLOAD_SIZE_MB
 *  - Stored under backend/uploads/<folder>, which is NOT publicly served -
 *    files are downloaded only through authenticated, hostel-scoped endpoints.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.pdf': ['application/pdf'],
};
const IMAGE_ONLY = ['.jpg', '.jpeg', '.png', '.webp'];

function buildUploader(folder, { imagesOnly = false } = {}) {
  const dir = path.join(env.uploads.dir, folder);
  fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: env.uploads.maxSizeMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExts = imagesOnly ? IMAGE_ONLY : Object.keys(ALLOWED);
      if (!allowedExts.includes(ext) || !ALLOWED[ext].includes(file.mimetype)) {
        return cb(
          ApiError.badRequest(imagesOnly ? 'Only JPG, PNG or WEBP images are allowed' : 'Only JPG, PNG, WEBP or PDF files are allowed')
        );
      }
      return cb(null, true);
    },
  });
}

/** Middleware for a single optional file in `field`, saved under uploads/<folder>. */
function uploadSingle(folder, field = 'file', options) {
  const uploader = buildUploader(folder, options).single(field);
  return (req, res, next) =>
    uploader(req, res, (err) => {
      if (!err) {
        if (req.file) req.file.relativePath = path.join(folder, req.file.filename).split(path.sep).join('/');
        return next();
      }
      if (err instanceof multer.MulterError) {
        const message =
          err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${env.uploads.maxSizeMb} MB)` : 'Invalid file upload';
        return next(ApiError.badRequest(message));
      }
      return next(err);
    });
}

/** Resolves a stored relative path safely inside the uploads directory. */
function resolveUploadPath(relativePath) {
  const full = path.resolve(env.uploads.dir, relativePath || '');
  if (!full.startsWith(path.resolve(env.uploads.dir) + path.sep)) throw ApiError.notFound('File not found');
  if (!fs.existsSync(full)) throw ApiError.notFound('File not found');
  return full;
}

/** Deletes an uploaded file (used when a request fails after upload). */
function removeUpload(file) {
  if (file && file.path) fs.unlink(file.path, () => {});
}

module.exports = { uploadSingle, resolveUploadPath, removeUpload };
