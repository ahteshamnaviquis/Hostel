-- =====================================================================
-- Base lookup data. Safe to run repeatedly (idempotent).
-- NOTE: The Super Admin login account is created in CHUNK 2 (needs bcrypt).
-- =====================================================================

-- Roles
INSERT INTO roles (name, display_name, description) VALUES
  ('super_admin',  'Super Admin',  'Full access to the whole platform and all hostels'),
  ('hostel_admin', 'Hostel Admin', 'Manages day-to-day operations of assigned hostels only')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), description = VALUES(description);

-- Permissions (Super Admin implicitly has all of them)
INSERT INTO permissions (code, name, module, description) VALUES
  ('dashboard.view',      'View Dashboard',              'dashboard',   'Access the dashboard'),
  ('buildings.manage',    'Manage Buildings & Floors',   'rooms',       'Create and edit buildings and floors'),
  ('rooms.manage',        'Manage Rooms',                'rooms',       'Create and edit rooms and beds'),
  ('residents.manage',    'Manage Residents',            'residents',   'Register and edit residents and documents'),
  ('admissions.manage',   'Manage Admissions',           'admissions',  'Admissions, room allocation, transfers, check-in/out'),
  ('payments.manage',     'Manage Fees & Payments',      'fees',        'Invoices, payment collection, receipts, refunds'),
  ('expenses.manage',     'Manage Expenses',             'expenses',    'Record and edit hostel expenses'),
  ('attendance.manage',   'Manage Attendance',           'attendance',  'Mark and edit daily attendance'),
  ('visitors.manage',     'Manage Visitors',             'visitors',    'Visitor entry and exit'),
  ('complaints.manage',   'Manage Complaints',           'complaints',  'Register and resolve complaints'),
  ('reports.view',        'View Reports',                'reports',     'View, print and export reports')
ON DUPLICATE KEY UPDATE name = VALUES(name), module = VALUES(module), description = VALUES(description);

-- Default permissions for the Hostel Admin role (everything except buildings.manage)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'dashboard.view','rooms.manage','residents.manage','admissions.manage','payments.manage',
  'expenses.manage','attendance.manage','visitors.manage','complaints.manage','reports.view'
)
WHERE r.name = 'hostel_admin';

-- Fee types
INSERT INTO fee_types (code, name, description, is_recurring, is_deduction, is_refundable) VALUES
  ('monthly_rent',     'Monthly Rent',        'Room / bed rent charged every month',   1, 0, 0),
  ('security_deposit', 'Security Deposit',    'Refundable deposit taken at admission', 0, 0, 1),
  ('admission_fee',    'Admission Fee',       'One-time admission charges',            0, 0, 0),
  ('mess_fee',         'Mess Fee',            'Monthly food / mess charges',           1, 0, 0),
  ('electricity',      'Electricity Charges', 'Electricity bill share',                0, 0, 0),
  ('gas',              'Gas Charges',         'Gas bill share',                        0, 0, 0),
  ('laundry',          'Laundry Charges',     'Laundry service charges',               0, 0, 0),
  ('internet',         'Internet Charges',    'Wi-Fi / internet charges',              0, 0, 0),
  ('other',            'Other Charges',       'Miscellaneous charges',                 0, 0, 0),
  ('late_fine',        'Late Payment Fine',   'Fine for late payment',                 0, 0, 0),
  ('discount',         'Discount',            'Concession / discount on fees',         0, 1, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description),
  is_recurring = VALUES(is_recurring), is_deduction = VALUES(is_deduction), is_refundable = VALUES(is_refundable);

-- Expense categories
INSERT INTO expense_categories (name, description) VALUES
  ('Electricity', 'Electricity bills'),
  ('Gas',         'Gas bills'),
  ('Water',       'Water bills / water tanker'),
  ('Internet',    'Internet / Wi-Fi bills'),
  ('Food / Mess', 'Groceries and mess expenses'),
  ('Salaries',    'Staff salaries'),
  ('Maintenance', 'Repairs and maintenance'),
  ('Cleaning',    'Cleaning supplies and services'),
  ('Furniture',   'Furniture and fixtures'),
  ('Security',    'Security guards and equipment'),
  ('Other',       'Miscellaneous expenses')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Global system settings (only inserted if missing - never overwrites admin changes)
INSERT IGNORE INTO system_settings (hostel_id, setting_group, setting_key, setting_value, value_type, description) VALUES
  (NULL, 'general',       'app_name',                 'Hostel Management System', 'string',  'Application name'),
  (NULL, 'general',       'currency',                 'PKR',                      'string',  'Default currency'),
  (NULL, 'general',       'currency_symbol',          'Rs.',                      'string',  'Currency symbol'),
  (NULL, 'general',       'date_format',              'DD/MM/YYYY',               'string',  'Display date format'),
  (NULL, 'general',       'timezone',                 'Asia/Karachi',             'string',  'Application timezone'),
  (NULL, 'receipt',       'receipt_prefix',           'RCP',                      'string',  'Prefix for payment receipt numbers'),
  (NULL, 'receipt',       'invoice_prefix',           'INV',                      'string',  'Prefix for invoice numbers'),
  (NULL, 'receipt',       'receipt_footer',           'Thank you for your payment.', 'string', 'Footer text printed on receipts'),
  (NULL, 'fees',          'fee_due_day',              '10',                       'number',  'Day of month by which monthly fee is due'),
  (NULL, 'fees',          'monthly_generation_day',   '1',                        'number',  'Day of month on which monthly invoices are generated'),
  (NULL, 'fees',          'late_fine_amount',         '0',                        'number',  'Late payment fine (PKR) applied after due date'),
  (NULL, 'notifications', 'notify_fee_due',           'true',                     'boolean', 'Notify about upcoming fee due dates'),
  (NULL, 'notifications', 'notify_overdue',           'true',                     'boolean', 'Notify about overdue payments'),
  (NULL, 'notifications', 'notify_upcoming_checkout', 'true',                     'boolean', 'Notify about residents leaving soon'),
  (NULL, 'notifications', 'checkout_reminder_days',   '7',                        'number',  'Days before expected leaving date to send reminder'),
  (NULL, 'notifications', 'notify_complaints',        'true',                     'boolean', 'Notify about open complaints');
