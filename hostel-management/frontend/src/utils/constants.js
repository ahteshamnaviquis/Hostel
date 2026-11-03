/** Shared constants used across the frontend. */

export const APP_NAME = 'Hostel Management System';
export const APP_SHORT_NAME = 'HostelMS';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HOSTEL_ADMIN: 'hostel_admin',
};

export const PAKISTAN_PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
];

export const MAJOR_CITIES = [
  'Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Gujranwala',
  'Sialkot', 'Bahawalpur', 'Sargodha', 'Abbottabad', 'Mardan', 'Sukkur', 'Larkana', 'Muzaffarabad', 'Gilgit', 'Mirpur',
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'other', label: 'Other' },
];

export const HOSTEL_TYPES = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'mixed', label: 'Mixed' },
];

export const ROOM_TYPES = [
  { value: 'single', label: 'Single', beds: 1 },
  { value: 'double', label: 'Double', beds: 2 },
  { value: 'triple', label: 'Triple', beds: 3 },
  { value: 'four_seater', label: 'Four-Seater', beds: 4 },
  { value: 'dormitory', label: 'Dormitory', beds: 8 },
  { value: 'custom', label: 'Custom', beds: 1 },
];

export const ROOM_FACILITIES = ['Attached Bath', 'AC', 'Fan', 'Wi-Fi', 'Cupboard', 'Study Table', 'Balcony', 'Geyser', 'UPS Backup', 'Cooler'];

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const RELATIONSHIPS = ['Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Guardian', 'Spouse', 'Friend', 'Other'];

export const DOCUMENT_TYPES = [
  { value: 'cnic', label: 'CNIC copy' },
  { value: 'b_form', label: 'B-Form copy' },
  { value: 'student_card', label: 'Student / Employee Card' },
  { value: 'photo', label: 'Passport-size Photo' },
  { value: 'other', label: 'Other Document' },
];

export const COMPLAINT_CATEGORIES = [
  { value: 'room_maintenance', label: 'Room Maintenance' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'internet', label: 'Internet' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'food_quality', label: 'Food Quality' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other' },
];

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const REFUND_TYPES = [
  { value: 'security_deposit', label: 'Security Deposit' },
  { value: 'advance', label: 'Advance / Credit' },
  { value: 'overpayment', label: 'Overpayment' },
  { value: 'other', label: 'Other' },
];

export const toOptions = (list) => list.map((v) => (typeof v === 'string' ? { value: v, label: v } : v));
export const labelOf = (list, value) => list.find((o) => o.value === value)?.label || value || '-';
