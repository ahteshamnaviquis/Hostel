-- =====================================================================
-- Migration 002
--  * complaint_updates: resolution / status history for complaints (CHUNK 12)
--  * payments.payment_method gains 'deposit_adjustment' so that adjusting a
--    security deposit against dues at checkout is recorded as a non-cash
--    payment (CHUNK 9). Cash-collection reports exclude this method.
-- =====================================================================

CREATE TABLE complaint_updates (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  complaint_id INT UNSIGNED NOT NULL,
  status_from  ENUM('open','in_progress','resolved','rejected') NULL,
  status_to    ENUM('open','in_progress','resolved','rejected') NOT NULL,
  assigned_to  VARCHAR(150) NULL,
  remarks      VARCHAR(500) NULL,
  updated_by   INT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cu_complaint (complaint_id),
  CONSTRAINT fk_cu_complaint  FOREIGN KEY (complaint_id) REFERENCES complaints (id),
  CONSTRAINT fk_cu_updated_by FOREIGN KEY (updated_by)   REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payments
  MODIFY payment_method ENUM('cash','bank_transfer','jazzcash','easypaisa','other','deposit_adjustment') NOT NULL;
