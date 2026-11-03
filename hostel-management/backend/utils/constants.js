/** Domain constants shared by validators and services. */

const PAKISTAN_PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu and Kashmir',
];

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'other'];

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  other: 'Other',
  deposit_adjustment: 'Security Deposit Adjustment',
};

const ROOM_TYPES = ['single', 'double', 'triple', 'four_seater', 'dormitory', 'custom'];
const COMPLAINT_CATEGORIES = ['room_maintenance', 'electricity', 'water', 'internet', 'cleaning', 'food_quality', 'security', 'other'];

module.exports = { PAKISTAN_PROVINCES, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, ROOM_TYPES, COMPLAINT_CATEGORIES };
