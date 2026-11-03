-- =====================================================================
-- Hostel Management System (Pakistan) - Initial schema
-- Migration: 001_initial_schema
-- Target: MySQL 8.0+ (also tested on MariaDB 10.11)
--
-- Conventions
--   * InnoDB + utf8mb4 everywhere
--   * Money: DECIMAL(12,2) in PKR
--   * Every table has created_at / updated_at
--   * Soft delete (deleted_at) on master records that must keep history
--   * Financial tables are NEVER deleted - they are cancelled / reversed / voided
--   * hostel_id is stored on every operational table for hostel-level data isolation
--   * "active_*" STORED generated columns + UNIQUE indexes enforce business rules
--     at database level (e.g. one active resident per bed)
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. Access control
-- ---------------------------------------------------------------------

CREATE TABLE roles (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(50)  NOT NULL,            -- super_admin, hostel_admin
  display_name  VARCHAR(100) NOT NULL,
  description   VARCHAR(255) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(80)  NOT NULL,            -- e.g. residents.manage
  name          VARCHAR(120) NOT NULL,
  module        VARCHAR(60)  NOT NULL,
  description   VARCHAR(255) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default permissions granted to a role
CREATE TABLE role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles (id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id             INT UNSIGNED NOT NULL,
  full_name           VARCHAR(150) NOT NULL,
  email               VARCHAR(150) NOT NULL,
  username            VARCHAR(60)  NULL,
  phone               VARCHAR(20)  NULL,
  password_hash       VARCHAR(255) NOT NULL,
  profile_picture     VARCHAR(255) NULL,
  status              ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  last_login_at       DATETIME NULL,
  password_changed_at DATETIME NULL,
  created_by          INT UNSIGNED NULL,
  deleted_at          DATETIME NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role (role_id),
  KEY idx_users_status (status),
  CONSTRAINT fk_users_role       FOREIGN KEY (role_id)    REFERENCES roles (id),
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-administrator permissions configured by the Super Admin
-- (overrides the role defaults in role_permissions once configured)
CREATE TABLE user_permissions (
  user_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  granted_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user       FOREIGN KEY (user_id)       REFERENCES users (id)       ON DELETE CASCADE,
  CONSTRAINT fk_up_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE,
  CONSTRAINT fk_up_granted_by FOREIGN KEY (granted_by)    REFERENCES users (id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Hostels and administrator assignment
-- ---------------------------------------------------------------------

CREATE TABLE hostels (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(150) NOT NULL,
  code            VARCHAR(30)  NOT NULL,
  hostel_type     ENUM('boys','girls','mixed') NOT NULL,
  description     TEXT NULL,
  address         VARCHAR(255) NOT NULL,
  city            VARCHAR(80)  NOT NULL,
  province        VARCHAR(60)  NOT NULL,       -- validated against Pakistani provinces/territories in the API
  contact_number  VARCHAR(20)  NULL,
  email           VARCHAR(150) NULL,
  warden_name     VARCHAR(150) NULL,
  warden_contact  VARCHAR(20)  NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by      INT UNSIGNED NULL,
  deleted_at      DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hostels_code (code),
  KEY idx_hostels_status (status),
  KEY idx_hostels_city (city),
  CONSTRAINT fk_hostels_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_hostels (
  user_id     INT UNSIGNED NOT NULL,
  hostel_id   INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, hostel_id),
  KEY idx_uh_hostel (hostel_id),
  CONSTRAINT fk_uh_user        FOREIGN KEY (user_id)     REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_uh_hostel      FOREIGN KEY (hostel_id)   REFERENCES hostels (id) ON DELETE CASCADE,
  CONSTRAINT fk_uh_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. Hostel -> Building -> Floor -> Room -> Beds
-- ---------------------------------------------------------------------

CREATE TABLE buildings (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id   INT UNSIGNED NOT NULL,
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(30)  NULL,
  description VARCHAR(255) NULL,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by  INT UNSIGNED NULL,
  deleted_at  DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_buildings_hostel_name (hostel_id, name),
  CONSTRAINT fk_buildings_hostel     FOREIGN KEY (hostel_id)  REFERENCES hostels (id),
  CONSTRAINT fk_buildings_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE floors (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id    INT UNSIGNED NOT NULL,
  building_id  INT UNSIGNED NOT NULL,
  floor_number SMALLINT NOT NULL,              -- 0 = Ground floor, -1 = Basement
  name         VARCHAR(60) NOT NULL,           -- e.g. "Ground Floor", "First Floor"
  status       ENUM('active','inactive') NOT NULL DEFAULT 'active',
  deleted_at   DATETIME NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_floors_building_number (building_id, floor_number),
  KEY idx_floors_hostel (hostel_id),
  CONSTRAINT fk_floors_hostel   FOREIGN KEY (hostel_id)   REFERENCES hostels (id),
  CONSTRAINT fk_floors_building FOREIGN KEY (building_id) REFERENCES buildings (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Occupied / available beds are calculated from room_beds (never stored twice).
CREATE TABLE rooms (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id        INT UNSIGNED NOT NULL,
  building_id      INT UNSIGNED NOT NULL,
  floor_id         INT UNSIGNED NOT NULL,
  room_number      VARCHAR(20)  NOT NULL,
  room_type        ENUM('single','double','triple','four_seater','dormitory','custom') NOT NULL,
  total_beds       SMALLINT UNSIGNED NOT NULL,
  monthly_rent     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  security_deposit DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  facilities       VARCHAR(500) NULL,          -- comma separated: AC, Attached Bath, Wi-Fi ...
  status           ENUM('available','partially_occupied','fully_occupied','maintenance','inactive') NOT NULL DEFAULT 'available',
  created_by       INT UNSIGNED NULL,
  deleted_at       DATETIME NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_building_number (building_id, room_number),
  KEY idx_rooms_hostel_status (hostel_id, status),
  KEY idx_rooms_floor (floor_id),
  CONSTRAINT chk_rooms_total_beds CHECK (total_beds > 0),
  CONSTRAINT chk_rooms_money      CHECK (monthly_rent >= 0 AND security_deposit >= 0),
  CONSTRAINT fk_rooms_hostel     FOREIGN KEY (hostel_id)   REFERENCES hostels (id),
  CONSTRAINT fk_rooms_building   FOREIGN KEY (building_id) REFERENCES buildings (id),
  CONSTRAINT fk_rooms_floor      FOREIGN KEY (floor_id)    REFERENCES floors (id),
  CONSTRAINT fk_rooms_created_by FOREIGN KEY (created_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_beds (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id   INT UNSIGNED NOT NULL,
  room_id     INT UNSIGNED NOT NULL,
  bed_number  VARCHAR(10) NOT NULL,            -- e.g. B1, B2
  status      ENUM('available','occupied','maintenance','inactive') NOT NULL DEFAULT 'available',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_beds_room_number (room_id, bed_number),
  KEY idx_beds_hostel_status (hostel_id, status),
  CONSTRAINT fk_beds_hostel FOREIGN KEY (hostel_id) REFERENCES hostels (id),
  CONSTRAINT fk_beds_room   FOREIGN KEY (room_id)   REFERENCES rooms (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. Residents
-- ---------------------------------------------------------------------

CREATE TABLE residents (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id             INT UNSIGNED NOT NULL,
  registration_no       VARCHAR(30)  NOT NULL,
  -- Personal
  full_name             VARCHAR(150) NOT NULL,
  father_name           VARCHAR(150) NULL,
  cnic                  VARCHAR(15)  NULL,      -- CNIC / B-Form: 12345-1234567-1
  date_of_birth         DATE NULL,
  gender                ENUM('male','female','other') NOT NULL,
  profile_picture       VARCHAR(255) NULL,
  mobile                VARCHAR(20)  NOT NULL,
  whatsapp              VARCHAR(20)  NULL,
  email                 VARCHAR(150) NULL,
  permanent_address     VARCHAR(255) NULL,
  city                  VARCHAR(80)  NULL,
  province              VARCHAR(60)  NULL,
  -- Education / Employment
  institution           VARCHAR(150) NULL,
  department            VARCHAR(100) NULL,
  class_designation     VARCHAR(100) NULL,
  student_employee_id   VARCHAR(50)  NULL,
  -- Emergency contact / guardian
  guardian_name         VARCHAR(150) NULL,
  guardian_relationship VARCHAR(50)  NULL,
  guardian_cnic         VARCHAR(15)  NULL,
  guardian_phone        VARCHAR(20)  NULL,
  guardian_address      VARCHAR(255) NULL,
  -- Status
  status                ENUM('pending','active','checked_out','suspended','cancelled') NOT NULL DEFAULT 'pending',
  created_by            INT UNSIGNED NULL,
  deleted_at            DATETIME NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_residents_registration_no (registration_no),
  UNIQUE KEY uq_residents_hostel_cnic (hostel_id, cnic),
  KEY idx_residents_hostel_status (hostel_id, status),
  KEY idx_residents_name (full_name),
  KEY idx_residents_mobile (mobile),
  CONSTRAINT fk_residents_hostel     FOREIGN KEY (hostel_id)  REFERENCES hostels (id),
  CONSTRAINT fk_residents_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE resident_documents (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id     INT UNSIGNED NOT NULL,
  resident_id   INT UNSIGNED NOT NULL,
  document_type ENUM('cnic','b_form','student_card','photo','other') NOT NULL,
  title         VARCHAR(150) NULL,
  file_path     VARCHAR(255) NOT NULL,         -- path inside the protected uploads folder
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  file_size     INT UNSIGNED NOT NULL,
  uploaded_by   INT UNSIGNED NULL,
  deleted_at    DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_docs_resident (resident_id),
  KEY idx_docs_hostel (hostel_id),
  CONSTRAINT fk_docs_hostel      FOREIGN KEY (hostel_id)   REFERENCES hostels (id),
  CONSTRAINT fk_docs_resident    FOREIGN KEY (resident_id) REFERENCES residents (id),
  CONSTRAINT fk_docs_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Admissions, allocations, transfers, check-in / check-out
-- ---------------------------------------------------------------------

-- One admission = one stay. Check-in / check-out details live on the admission.
CREATE TABLE admissions (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id              INT UNSIGNED NOT NULL,
  resident_id            INT UNSIGNED NOT NULL,
  admission_no           VARCHAR(30) NOT NULL,
  admission_date         DATE NOT NULL,
  expected_leaving_date  DATE NULL,
  check_in_date          DATE NULL,
  monthly_rent           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  security_deposit       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  admission_fee          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status                 ENUM('pending','active','checked_out','cancelled') NOT NULL DEFAULT 'pending',
  -- Check-out settlement
  checkout_date          DATE NULL,
  checkout_reason        VARCHAR(255) NULL,
  outstanding_amount     DECIMAL(12,2) NULL,
  deposit_adjusted       DECIMAL(12,2) NULL,
  refund_amount          DECIMAL(12,2) NULL,
  checked_out_by         INT UNSIGNED NULL,
  remarks                VARCHAR(500) NULL,
  created_by             INT UNSIGNED NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- A resident may only have ONE open (pending/active) admission at a time
  open_resident_id       INT UNSIGNED GENERATED ALWAYS AS (IF(status IN ('pending','active'), resident_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admissions_no (admission_no),
  UNIQUE KEY uq_admissions_open_resident (open_resident_id),
  KEY idx_admissions_hostel_status (hostel_id, status),
  KEY idx_admissions_resident (resident_id),
  KEY idx_admissions_dates (admission_date, expected_leaving_date),
  CONSTRAINT fk_adm_hostel         FOREIGN KEY (hostel_id)      REFERENCES hostels (id),
  CONSTRAINT fk_adm_resident       FOREIGN KEY (resident_id)    REFERENCES residents (id),
  CONSTRAINT fk_adm_checked_out_by FOREIGN KEY (checked_out_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_adm_created_by     FOREIGN KEY (created_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every bed assignment is a row; history is never overwritten.
CREATE TABLE room_allocations (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id      INT UNSIGNED NOT NULL,
  admission_id   INT UNSIGNED NOT NULL,
  resident_id    INT UNSIGNED NOT NULL,
  room_id        INT UNSIGNED NOT NULL,
  bed_id         INT UNSIGNED NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NULL,
  monthly_rent   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status         ENUM('active','transferred','released') NOT NULL DEFAULT 'active',
  release_reason VARCHAR(255) NULL,
  allocated_by   INT UNSIGNED NULL,
  released_by    INT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Business rule: a bed cannot have two active residents; a resident cannot hold two active beds
  active_bed_id      INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', bed_id, NULL)) STORED,
  active_resident_id INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', resident_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alloc_active_bed (active_bed_id),
  UNIQUE KEY uq_alloc_active_resident (active_resident_id),
  KEY idx_alloc_hostel_status (hostel_id, status),
  KEY idx_alloc_admission (admission_id),
  KEY idx_alloc_resident (resident_id),
  KEY idx_alloc_room (room_id),
  CONSTRAINT fk_alloc_hostel       FOREIGN KEY (hostel_id)    REFERENCES hostels (id),
  CONSTRAINT fk_alloc_admission    FOREIGN KEY (admission_id) REFERENCES admissions (id),
  CONSTRAINT fk_alloc_resident     FOREIGN KEY (resident_id)  REFERENCES residents (id),
  CONSTRAINT fk_alloc_room         FOREIGN KEY (room_id)      REFERENCES rooms (id),
  CONSTRAINT fk_alloc_bed          FOREIGN KEY (bed_id)       REFERENCES room_beds (id),
  CONSTRAINT fk_alloc_allocated_by FOREIGN KEY (allocated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_alloc_released_by  FOREIGN KEY (released_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_transfers (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id          INT UNSIGNED NOT NULL,
  resident_id        INT UNSIGNED NOT NULL,
  admission_id       INT UNSIGNED NOT NULL,
  from_allocation_id INT UNSIGNED NOT NULL,
  to_allocation_id   INT UNSIGNED NOT NULL,
  transfer_date      DATE NOT NULL,
  reason             VARCHAR(255) NOT NULL,
  transferred_by     INT UNSIGNED NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transfers_from_alloc (from_allocation_id),
  UNIQUE KEY uq_transfers_to_alloc (to_allocation_id),
  KEY idx_transfers_hostel_date (hostel_id, transfer_date),
  KEY idx_transfers_resident (resident_id),
  CONSTRAINT fk_tr_hostel         FOREIGN KEY (hostel_id)          REFERENCES hostels (id),
  CONSTRAINT fk_tr_resident       FOREIGN KEY (resident_id)        REFERENCES residents (id),
  CONSTRAINT fk_tr_admission      FOREIGN KEY (admission_id)       REFERENCES admissions (id),
  CONSTRAINT fk_tr_from_alloc     FOREIGN KEY (from_allocation_id) REFERENCES room_allocations (id),
  CONSTRAINT fk_tr_to_alloc       FOREIGN KEY (to_allocation_id)   REFERENCES room_allocations (id),
  CONSTRAINT fk_tr_transferred_by FOREIGN KEY (transferred_by)     REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. Fees, invoices, payments, refunds  (never hard-deleted)
-- ---------------------------------------------------------------------

CREATE TABLE fee_types (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(40)  NOT NULL,
  name           VARCHAR(100) NOT NULL,
  description    VARCHAR(255) NULL,
  is_recurring   TINYINT(1) NOT NULL DEFAULT 0,  -- charged every month
  is_deduction   TINYINT(1) NOT NULL DEFAULT 0,  -- reduces the invoice total (e.g. Discount)
  is_refundable  TINYINT(1) NOT NULL DEFAULT 0,  -- e.g. Security Deposit
  status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fee_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The recurring/one-time charges agreed for a resident's admission
CREATE TABLE resident_fee_structures (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id      INT UNSIGNED NOT NULL,
  resident_id    INT UNSIGNED NOT NULL,
  admission_id   INT UNSIGNED NOT NULL,
  fee_type_id    INT UNSIGNED NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  frequency      ENUM('monthly','one_time') NOT NULL DEFAULT 'monthly',
  effective_from DATE NOT NULL,
  effective_to   DATE NULL,
  status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by     INT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rfs_admission (admission_id),
  KEY idx_rfs_hostel_status (hostel_id, status),
  CONSTRAINT chk_rfs_amount CHECK (amount >= 0),
  CONSTRAINT fk_rfs_hostel     FOREIGN KEY (hostel_id)    REFERENCES hostels (id),
  CONSTRAINT fk_rfs_resident   FOREIGN KEY (resident_id)  REFERENCES residents (id),
  CONSTRAINT fk_rfs_admission  FOREIGN KEY (admission_id) REFERENCES admissions (id),
  CONSTRAINT fk_rfs_fee_type   FOREIGN KEY (fee_type_id)  REFERENCES fee_types (id),
  CONSTRAINT fk_rfs_created_by FOREIGN KEY (created_by)   REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoices (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id       INT UNSIGNED NOT NULL,
  resident_id     INT UNSIGNED NOT NULL,
  admission_id    INT UNSIGNED NOT NULL,
  invoice_no      VARCHAR(30) NOT NULL,
  invoice_type    ENUM('admission','monthly','manual','checkout') NOT NULL,
  billing_month   CHAR(7) NULL,                -- 'YYYY-MM' for monthly invoices
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  gross_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- sum of charges
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- sum of deductions
  total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- gross - discount
  paid_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- maintained from payment_allocations
  status          ENUM('unpaid','partially_paid','paid','cancelled') NOT NULL DEFAULT 'unpaid',
  remarks         VARCHAR(500) NULL,
  created_by      INT UNSIGNED NULL,
  cancelled_by    INT UNSIGNED NULL,
  cancelled_at    DATETIME NULL,
  cancel_reason   VARCHAR(255) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Prevents generating the same monthly invoice twice for an admission
  monthly_admission_id INT UNSIGNED GENERATED ALWAYS AS (
    IF(invoice_type = 'monthly' AND status <> 'cancelled', admission_id, NULL)
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_no (invoice_no),
  UNIQUE KEY uq_invoices_monthly (monthly_admission_id, billing_month),
  KEY idx_invoices_hostel_status (hostel_id, status),
  KEY idx_invoices_resident (resident_id),
  KEY idx_invoices_due_date (due_date),
  KEY idx_invoices_billing_month (billing_month),
  CONSTRAINT chk_invoices_amounts CHECK (total_amount >= 0 AND paid_amount >= 0 AND paid_amount <= total_amount),
  CONSTRAINT fk_inv_hostel       FOREIGN KEY (hostel_id)    REFERENCES hostels (id),
  CONSTRAINT fk_inv_resident     FOREIGN KEY (resident_id)  REFERENCES residents (id),
  CONSTRAINT fk_inv_admission    FOREIGN KEY (admission_id) REFERENCES admissions (id),
  CONSTRAINT fk_inv_created_by   FOREIGN KEY (created_by)   REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_items (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id  INT UNSIGNED NOT NULL,
  fee_type_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NULL,
  amount      DECIMAL(12,2) NOT NULL,          -- always positive; fee_types.is_deduction decides the sign
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_invoice (invoice_id),
  CONSTRAINT chk_items_amount CHECK (amount >= 0),
  CONSTRAINT fk_items_invoice  FOREIGN KEY (invoice_id)  REFERENCES invoices (id),
  CONSTRAINT fk_items_fee_type FOREIGN KEY (fee_type_id) REFERENCES fee_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id          INT UNSIGNED NOT NULL,
  resident_id        INT UNSIGNED NOT NULL,
  admission_id       INT UNSIGNED NOT NULL,
  receipt_no         VARCHAR(30) NOT NULL,
  payment_date       DATE NOT NULL,
  amount             DECIMAL(12,2) NOT NULL,
  unallocated_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- advance / credit not yet applied to invoices
  payment_method     ENUM('cash','bank_transfer','jazzcash','easypaisa','other') NOT NULL,
  reference_no       VARCHAR(80) NULL,         -- bank / wallet transaction id
  remarks            VARCHAR(500) NULL,
  status             ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
  received_by        INT UNSIGNED NULL,
  reversed_by        INT UNSIGNED NULL,
  reversed_at        DATETIME NULL,
  reversal_reason    VARCHAR(255) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt_no (receipt_no),
  KEY idx_payments_hostel_date (hostel_id, payment_date),
  KEY idx_payments_resident (resident_id),
  KEY idx_payments_status (status),
  CONSTRAINT chk_payments_amount CHECK (amount > 0 AND unallocated_amount >= 0 AND unallocated_amount <= amount),
  CONSTRAINT fk_pay_hostel      FOREIGN KEY (hostel_id)    REFERENCES hostels (id),
  CONSTRAINT fk_pay_resident    FOREIGN KEY (resident_id)  REFERENCES residents (id),
  CONSTRAINT fk_pay_admission   FOREIGN KEY (admission_id) REFERENCES admissions (id),
  CONSTRAINT fk_pay_received_by FOREIGN KEY (received_by)  REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_pay_reversed_by FOREIGN KEY (reversed_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which invoice(s) a payment was applied to (supports partial payments)
CREATE TABLE payment_allocations (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id INT UNSIGNED NOT NULL,
  invoice_id INT UNSIGNED NOT NULL,
  amount     DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pa_payment_invoice (payment_id, invoice_id),
  KEY idx_pa_invoice (invoice_id),
  CONSTRAINT chk_pa_amount CHECK (amount > 0),
  CONSTRAINT fk_pa_payment FOREIGN KEY (payment_id) REFERENCES payments (id),
  CONSTRAINT fk_pa_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refunds (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id       INT UNSIGNED NOT NULL,
  resident_id     INT UNSIGNED NOT NULL,
  admission_id    INT UNSIGNED NOT NULL,
  payment_id      INT UNSIGNED NULL,           -- source payment when refunding an advance/overpayment
  refund_no       VARCHAR(30) NOT NULL,
  refund_type     ENUM('security_deposit','advance','overpayment','other') NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  refund_date     DATE NOT NULL,
  payment_method  ENUM('cash','bank_transfer','jazzcash','easypaisa','other') NOT NULL,
  reference_no    VARCHAR(80) NULL,
  reason          VARCHAR(255) NULL,
  status          ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
  processed_by    INT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refunds_no (refund_no),
  KEY idx_refunds_hostel_date (hostel_id, refund_date),
  KEY idx_refunds_resident (resident_id),
  CONSTRAINT chk_refunds_amount CHECK (amount > 0),
  CONSTRAINT fk_ref_hostel       FOREIGN KEY (hostel_id)    REFERENCES hostels (id),
  CONSTRAINT fk_ref_resident     FOREIGN KEY (resident_id)  REFERENCES residents (id),
  CONSTRAINT fk_ref_admission    FOREIGN KEY (admission_id) REFERENCES admissions (id),
  CONSTRAINT fk_ref_payment      FOREIGN KEY (payment_id)   REFERENCES payments (id),
  CONSTRAINT fk_ref_processed_by FOREIGN KEY (processed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. Expenses
-- ---------------------------------------------------------------------

CREATE TABLE expense_categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_expense_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id      INT UNSIGNED NOT NULL,
  category_id    INT UNSIGNED NOT NULL,
  title          VARCHAR(150) NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  expense_date   DATE NOT NULL,
  payment_method ENUM('cash','bank_transfer','jazzcash','easypaisa','other') NOT NULL,
  description    VARCHAR(500) NULL,
  receipt_file   VARCHAR(255) NULL,
  status         ENUM('posted','void') NOT NULL DEFAULT 'posted',
  added_by       INT UNSIGNED NULL,
  voided_by      INT UNSIGNED NULL,
  voided_at      DATETIME NULL,
  void_reason    VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_expenses_hostel_date (hostel_id, expense_date),
  KEY idx_expenses_category (category_id),
  CONSTRAINT chk_expenses_amount CHECK (amount > 0),
  CONSTRAINT fk_exp_hostel    FOREIGN KEY (hostel_id)   REFERENCES hostels (id),
  CONSTRAINT fk_exp_category  FOREIGN KEY (category_id) REFERENCES expense_categories (id),
  CONSTRAINT fk_exp_added_by  FOREIGN KEY (added_by)    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_voided_by FOREIGN KEY (voided_by)   REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. Daily operations: attendance, visitors, complaints
-- ---------------------------------------------------------------------

CREATE TABLE attendance (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id       INT UNSIGNED NOT NULL,
  resident_id     INT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  status          ENUM('present','absent','leave','late') NOT NULL,
  entry_time      TIME NULL,                   -- for late entries
  remarks         VARCHAR(255) NULL,
  marked_by       INT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_resident_date (resident_id, attendance_date),
  KEY idx_attendance_hostel_date (hostel_id, attendance_date),
  CONSTRAINT fk_att_hostel    FOREIGN KEY (hostel_id)   REFERENCES hostels (id),
  CONSTRAINT fk_att_resident  FOREIGN KEY (resident_id) REFERENCES residents (id),
  CONSTRAINT fk_att_marked_by FOREIGN KEY (marked_by)   REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE visitors (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id      INT UNSIGNED NOT NULL,
  resident_id    INT UNSIGNED NOT NULL,
  visitor_name   VARCHAR(150) NOT NULL,
  cnic           VARCHAR(15)  NULL,
  contact_number VARCHAR(20)  NULL,
  relationship   VARCHAR(50)  NULL,
  visit_date     DATE NOT NULL,
  entry_time     TIME NOT NULL,
  exit_time      TIME NULL,
  purpose        VARCHAR(255) NULL,
  remarks        VARCHAR(255) NULL,
  created_by     INT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_visitors_hostel_date (hostel_id, visit_date),
  KEY idx_visitors_resident (resident_id),
  KEY idx_visitors_cnic (cnic),
  CONSTRAINT fk_vis_hostel     FOREIGN KEY (hostel_id)   REFERENCES hostels (id),
  CONSTRAINT fk_vis_resident   FOREIGN KEY (resident_id) REFERENCES residents (id),
  CONSTRAINT fk_vis_created_by FOREIGN KEY (created_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE complaints (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id          INT UNSIGNED NOT NULL,
  complaint_no       VARCHAR(30) NOT NULL,
  resident_id        INT UNSIGNED NULL,
  room_id            INT UNSIGNED NULL,
  category           ENUM('room_maintenance','electricity','water','internet','cleaning','food_quality','security','other') NOT NULL,
  subject            VARCHAR(150) NOT NULL,
  description        TEXT NULL,
  priority           ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status             ENUM('open','in_progress','resolved','rejected') NOT NULL DEFAULT 'open',
  assigned_to        VARCHAR(150) NULL,        -- staff member name (plumber, electrician...)
  resolution_date    DATE NULL,
  resolution_remarks VARCHAR(500) NULL,
  created_by         INT UNSIGNED NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_complaints_no (complaint_no),
  KEY idx_complaints_hostel_status (hostel_id, status),
  KEY idx_complaints_resident (resident_id),
  CONSTRAINT fk_cmp_hostel     FOREIGN KEY (hostel_id)   REFERENCES hostels (id),
  CONSTRAINT fk_cmp_resident   FOREIGN KEY (resident_id) REFERENCES residents (id),
  CONSTRAINT fk_cmp_room       FOREIGN KEY (room_id)     REFERENCES rooms (id),
  CONSTRAINT fk_cmp_created_by FOREIGN KEY (created_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. Notifications, audit logs, settings
-- ---------------------------------------------------------------------

CREATE TABLE notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  hostel_id  INT UNSIGNED NULL,
  type       VARCHAR(50)  NOT NULL,            -- fee_due, overdue_payment, upcoming_checkout ...
  title      VARCHAR(150) NOT NULL,
  message    VARCHAR(500) NOT NULL,
  link       VARCHAR(255) NULL,                -- frontend route to open
  dedupe_key VARCHAR(150) NULL,                -- prevents duplicate automatic reminders
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  read_at    DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_user_dedupe (user_id, dedupe_key),
  KEY idx_notifications_user_read (user_id, is_read, created_at),
  CONSTRAINT fk_notif_user   FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_hostel FOREIGN KEY (hostel_id) REFERENCES hostels (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  hostel_id   INT UNSIGNED NULL,
  action      VARCHAR(60)  NOT NULL,           -- login, admission.create, payment.create ...
  entity_type VARCHAR(60)  NULL,
  entity_id   INT UNSIGNED NULL,
  description VARCHAR(500) NULL,
  old_values  JSON NULL,
  new_values  JSON NULL,
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id, created_at),
  KEY idx_audit_hostel (hostel_id, created_at),
  KEY idx_audit_action (action),
  KEY idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE SET NULL,
  CONSTRAINT fk_audit_hostel FOREIGN KEY (hostel_id) REFERENCES hostels (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- hostel_id NULL = global setting; otherwise a per-hostel override
CREATE TABLE system_settings (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hostel_id     INT UNSIGNED NULL,
  setting_group VARCHAR(50)  NOT NULL,         -- general, receipt, fees, notifications
  setting_key   VARCHAR(80)  NOT NULL,
  setting_value TEXT NULL,
  value_type    ENUM('string','number','boolean','json') NOT NULL DEFAULT 'string',
  description   VARCHAR(255) NULL,
  updated_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  scope_hostel_id INT UNSIGNED GENERATED ALWAYS AS (IFNULL(hostel_id, 0)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_scope_key (scope_hostel_id, setting_key),
  CONSTRAINT fk_settings_hostel     FOREIGN KEY (hostel_id)  REFERENCES hostels (id) ON DELETE CASCADE,
  CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
