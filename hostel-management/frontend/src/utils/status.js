/** Status -> badge tone + label, shared by every list. */
const TONES = {
  active: 'green', available: 'green', paid: 'green', resolved: 'green', present: 'green', posted: 'green', occupied: 'blue',
  partially_occupied: 'blue', partially_paid: 'amber', pending: 'amber', in_progress: 'blue', open: 'amber', late: 'amber', leave: 'blue',
  maintenance: 'amber', fully_occupied: 'slate', unpaid: 'red', overdue: 'red', absent: 'red', suspended: 'red', cancelled: 'slate',
  inactive: 'slate', checked_out: 'slate', rejected: 'slate', reversed: 'slate', void: 'slate', transferred: 'slate', released: 'slate',
  urgent: 'red', high: 'red', medium: 'amber', low: 'slate',
};

const LABELS = {
  partially_occupied: 'Partially Occupied', fully_occupied: 'Fully Occupied', partially_paid: 'Partially Paid', in_progress: 'In Progress',
  checked_out: 'Checked Out', four_seater: 'Four-Seater', bank_transfer: 'Bank Transfer', jazzcash: 'JazzCash', easypaisa: 'Easypaisa',
  deposit_adjustment: 'Deposit Adjustment', security_deposit: 'Security Deposit', super_admin: 'Super Admin', hostel_admin: 'Hostel Admin',
};

export const statusTone = (status) => TONES[status] || 'slate';
export const statusLabel = (status) =>
  LABELS[status] || (status ? String(status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-');
