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

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'other', label: 'Other' },
];
