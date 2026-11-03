/**
 * Admissions, room allocation, transfers, check-in and check-out.
 * Every operation runs in ONE database transaction and locks the rows it changes.
 *
 * Guarantees (also enforced by unique indexes in the database):
 *  - a bed is never assigned to two active residents
 *  - a resident has at most one open admission and one active bed
 *  - transfers keep the old allocation (status 'transferred') for history
 *  - a resident cannot be checked out twice
 */
const { withTransaction } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { tempNumber, assignNumber, addDays, money, today } = require('../utils/helpers');
const { assertHostelAccess } = require('../utils/scope');
const { refreshRoomStatus } = require('../models/roomModel');
const { logAudit } = require('./auditService');
const { notifyHostel } = require('./notificationService');
const fee = require('./feeService');
const { assertGenderAllowed } = require('../controllers/residentController');

/** Locks a bed + its room and checks that it can receive a resident. */
async function lockFreeBed(conn, bedId, hostelId) {
  const [[bed]] = await conn.query(
    `SELECT bd.id, bd.bed_number, bd.status, bd.room_id, r.hostel_id, r.room_number, r.status AS room_status, r.deleted_at,
            r.monthly_rent, r.security_deposit
     FROM room_beds bd JOIN rooms r ON r.id = bd.room_id WHERE bd.id = ? FOR UPDATE`,
    [bedId]
  );
  if (!bed || bed.deleted_at) throw ApiError.notFound('Bed not found');
  if (bed.hostel_id !== hostelId) throw ApiError.badRequest('The selected bed belongs to a different hostel');
  if (['maintenance', 'inactive'].includes(bed.room_status)) throw ApiError.conflict(`Room ${bed.room_number} is under ${bed.room_status}`);
  if (bed.status !== 'available') {
    throw ApiError.conflict(`Bed ${bed.room_number}/${bed.bed_number} is not available (${bed.status}). Please choose another bed.`);
  }
  return bed;
}

/** Translates unique-index violations into friendly business errors. */
function mapDuplicate(error) {
  if (error.code === 'ER_DUP_ENTRY') {
    if (error.message.includes('uq_alloc_active_bed')) return ApiError.conflict('This bed was just allocated to another resident. Please choose another bed.');
    if (error.message.includes('uq_alloc_active_resident') || error.message.includes('uq_admissions_open_resident')) {
      return ApiError.conflict('This resident already has an active admission / bed');
    }
  }
  return error;
}

async function lockAdmission(conn, req, admissionId) {
  const [[admission]] = await conn.query('SELECT * FROM admissions WHERE id = ? FOR UPDATE', [admissionId]);
  if (!admission) throw ApiError.notFound('Admission not found');
  assertHostelAccess(req, admission.hostel_id);
  return admission;
}

async function activeAllocation(conn, admissionId) {
  const [[alloc]] = await conn.query(`SELECT * FROM room_allocations WHERE admission_id = ? AND status = 'active' FOR UPDATE`, [admissionId]);
  return alloc || null;
}

/**
 * New admission + bed allocation + fee structure + initial invoices.
 * body: resident_id, bed_id, admission_date, expected_leaving_date, monthly_rent, security_deposit, admission_fee,
 *       check_in_now, extra_fees [{fee_type_id, amount}], generate_invoices, discount, remarks
 */
async function createAdmission(req, b) {
  try {
    return await withTransaction(async (conn) => {
      const [[resident]] = await conn.query('SELECT * FROM residents WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [b.resident_id]);
      if (!resident) throw ApiError.notFound('Resident not found');
      assertHostelAccess(req, resident.hostel_id);
      if (!['pending', 'checked_out'].includes(resident.status)) {
        throw ApiError.conflict(`Resident is ${resident.status.replace('_', ' ')} and cannot be admitted`);
      }
      const [[open]] = await conn.query(`SELECT id FROM admissions WHERE resident_id = ? AND status IN ('pending','active')`, [resident.id]);
      if (open) throw ApiError.conflict('This resident already has an open admission');

      const [[hostel]] = await conn.query('SELECT id, name, hostel_type, status FROM hostels WHERE id = ?', [resident.hostel_id]);
      if (hostel.status !== 'active') throw ApiError.conflict('This hostel is inactive');
      assertGenderAllowed(hostel, resident.gender);

      const bed = await lockFreeBed(conn, b.bed_id, resident.hostel_id);
      const rent = b.monthly_rent !== null && b.monthly_rent !== undefined ? b.monthly_rent : Number(bed.monthly_rent);
      const deposit = b.security_deposit !== null && b.security_deposit !== undefined ? b.security_deposit : Number(bed.security_deposit);
      const admissionFee = b.admission_fee || 0;
      const status = b.check_in_now ? 'active' : 'pending';

      const [adm] = await conn.query(
        `INSERT INTO admissions (hostel_id, resident_id, admission_no, admission_date, expected_leaving_date, check_in_date,
           monthly_rent, security_deposit, admission_fee, status, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [resident.hostel_id, resident.id, tempNumber(), b.admission_date, b.expected_leaving_date, b.check_in_now ? b.admission_date : null,
          rent, deposit, admissionFee, status, b.remarks, req.user.id]
      );
      const admissionId = adm.insertId;
      const admissionNo = await assignNumber(conn, 'admissions', 'admission_no', 'ADM', admissionId);

      await conn.query(
        `INSERT INTO room_allocations (hostel_id, admission_id, resident_id, room_id, bed_id, start_date, monthly_rent, status, allocated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [resident.hostel_id, admissionId, resident.id, bed.room_id, bed.id, b.admission_date, rent, req.user.id]
      );
      await conn.query(`UPDATE room_beds SET status = 'occupied' WHERE id = ?`, [bed.id]);
      await refreshRoomStatus(conn, bed.room_id);
      await conn.query('UPDATE residents SET status = ? WHERE id = ?', [b.check_in_now ? 'active' : 'pending', resident.id]);

      // Fee structure
      const rentTypeId = await fee.feeTypeIdByCode(conn, 'monthly_rent');
      const structures = [[rentTypeId, rent, 'monthly']];
      (b.extra_fees || []).forEach((f) => structures.push([f.fee_type_id, f.amount, 'monthly']));
      const depositTypeId = await fee.feeTypeIdByCode(conn, 'security_deposit');
      const admissionFeeTypeId = await fee.feeTypeIdByCode(conn, 'admission_fee');
      if (deposit > 0) structures.push([depositTypeId, deposit, 'one_time']);
      if (admissionFee > 0) structures.push([admissionFeeTypeId, admissionFee, 'one_time']);
      const discountTypeId = await fee.feeTypeIdByCode(conn, 'discount');
      if (b.monthly_discount > 0) structures.push([discountTypeId, b.monthly_discount, 'monthly']);
      await conn.query(
        `INSERT INTO resident_fee_structures (hostel_id, resident_id, admission_id, fee_type_id, amount, frequency, effective_from, status, created_by)
         VALUES ?`,
        [structures.map(([ft, amt, freq]) => [resident.hostel_id, resident.id, admissionId, ft, amt, freq, b.admission_date, 'active', req.user.id])]
      );

      // Initial invoices: one-time charges + first month
      const invoices = [];
      if (b.generate_invoices !== false) {
        const due = addDays(b.admission_date, 7);
        const oneTime = [];
        if (deposit > 0) oneTime.push({ fee_type_id: depositTypeId, amount: deposit, description: 'Security Deposit (refundable)' });
        if (admissionFee > 0) oneTime.push({ fee_type_id: admissionFeeTypeId, amount: admissionFee, description: 'Admission Fee' });
        if (oneTime.length) {
          invoices.push(await fee.createInvoice(conn, req, {
            hostelId: resident.hostel_id, residentId: resident.id, admissionId, type: 'admission',
            invoiceDate: b.admission_date, dueDate: due, items: oneTime, remarks: `Admission ${admissionNo}`,
          }));
        }
        const month = b.admission_date.slice(0, 7);
        const monthly = structures
          .filter(([, , freq]) => freq === 'monthly')
          .map(([ft, amt]) => ({ fee_type_id: ft, amount: amt, description: ft === rentTypeId ? `Room Rent - ${month}` : undefined }));
        if (monthly.some((m) => m.amount > 0)) {
          invoices.push(await fee.createInvoice(conn, req, {
            hostelId: resident.hostel_id, residentId: resident.id, admissionId, type: 'monthly', billingMonth: month,
            invoiceDate: b.admission_date, dueDate: due, items: monthly,
          }));
        }
      }

      await logAudit(conn, req, {
        action: 'admission.create', entityType: 'admission', entityId: admissionId, hostelId: resident.hostel_id,
        description: `Admitted ${resident.full_name} (${admissionNo}) to room ${bed.room_number}, bed ${bed.bed_number}`,
        newValues: { bed_id: bed.id, monthly_rent: rent, security_deposit: deposit, admission_fee: admissionFee },
      });
      await logAudit(conn, req, {
        action: 'allocation.create', entityType: 'admission', entityId: admissionId, hostelId: resident.hostel_id,
        description: `Allocated ${bed.room_number}/${bed.bed_number} to ${resident.full_name}`,
      });
      await notifyHostel(conn, {
        hostelId: resident.hostel_id, type: 'new_admission', title: 'New admission',
        message: `${resident.full_name} admitted to ${hostel.name}, room ${bed.room_number} / ${bed.bed_number}`,
        link: `/admissions/${admissionId}`,
      });
      return { id: admissionId, admission_no: admissionNo, invoices };
    });
  } catch (error) {
    throw mapDuplicate(error);
  }
}

/** Pending admission -> active (resident arrives). */
async function checkIn(req, admissionId, { check_in_date, remarks }) {
  return withTransaction(async (conn) => {
    const admission = await lockAdmission(conn, req, admissionId);
    if (admission.status !== 'pending') throw ApiError.conflict(`Admission is ${admission.status}; only pending admissions can be checked in`);
    await conn.query(`UPDATE admissions SET status = 'active', check_in_date = ?, remarks = COALESCE(?, remarks) WHERE id = ?`, [
      check_in_date, remarks, admission.id,
    ]);
    await conn.query(`UPDATE residents SET status = 'active' WHERE id = ?`, [admission.resident_id]);
    await logAudit(conn, req, {
      action: 'admission.check_in', entityType: 'admission', entityId: admission.id, hostelId: admission.hostel_id,
      description: `Check-in for admission ${admission.admission_no} on ${check_in_date}`,
    });
  });
}

/** Moves a resident to another bed, preserving the previous allocation as history. */
async function transfer(req, admissionId, { to_bed_id, transfer_date, reason, monthly_rent }) {
  try {
    return await withTransaction(async (conn) => {
      const admission = await lockAdmission(conn, req, admissionId);
      if (!['pending', 'active'].includes(admission.status)) throw ApiError.conflict('Only current residents can be transferred');
      const current = await activeAllocation(conn, admission.id);
      if (!current) throw ApiError.conflict('This admission has no active bed');
      if (current.bed_id === to_bed_id) throw ApiError.badRequest('Resident is already in this bed');
      if (transfer_date < current.start_date) throw ApiError.badRequest('Transfer date cannot be before the current allocation start date');

      // Lock both beds in id order (deadlock safe)
      const [lowId, highId] = [current.bed_id, to_bed_id].sort((a, b) => a - b);
      await conn.query('SELECT id FROM room_beds WHERE id IN (?, ?) ORDER BY id FOR UPDATE', [lowId, highId]);
      const newBed = await lockFreeBed(conn, to_bed_id, admission.hostel_id);
      const [[oldBed]] = await conn.query(
        'SELECT bd.bed_number, r.room_number FROM room_beds bd JOIN rooms r ON r.id = bd.room_id WHERE bd.id = ?',
        [current.bed_id]
      );
      const newRent = monthly_rent !== null && monthly_rent !== undefined ? monthly_rent : Number(admission.monthly_rent);

      await conn.query(
        `UPDATE room_allocations SET status = 'transferred', end_date = ?, release_reason = ?, released_by = ? WHERE id = ?`,
        [transfer_date, `Transferred: ${reason}`.slice(0, 255), req.user.id, current.id]
      );
      await conn.query(`UPDATE room_beds SET status = 'available' WHERE id = ?`, [current.bed_id]);
      const [alloc] = await conn.query(
        `INSERT INTO room_allocations (hostel_id, admission_id, resident_id, room_id, bed_id, start_date, monthly_rent, status, allocated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [admission.hostel_id, admission.id, admission.resident_id, newBed.room_id, newBed.id, transfer_date, newRent, req.user.id]
      );
      await conn.query(`UPDATE room_beds SET status = 'occupied' WHERE id = ?`, [newBed.id]);
      await refreshRoomStatus(conn, current.room_id);
      if (newBed.room_id !== current.room_id) await refreshRoomStatus(conn, newBed.room_id);

      const [tr] = await conn.query(
        `INSERT INTO room_transfers (hostel_id, resident_id, admission_id, from_allocation_id, to_allocation_id, transfer_date, reason, transferred_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [admission.hostel_id, admission.resident_id, admission.id, current.id, alloc.insertId, transfer_date, reason, req.user.id]
      );

      // Rent change: close the old monthly-rent structure and start a new one from the transfer date
      if (money(newRent) !== money(admission.monthly_rent)) {
        const rentTypeId = await fee.feeTypeIdByCode(conn, 'monthly_rent');
        await conn.query(
          `UPDATE resident_fee_structures SET status = 'inactive', effective_to = ?
           WHERE admission_id = ? AND fee_type_id = ? AND status = 'active'`,
          [addDays(transfer_date, -1), admission.id, rentTypeId]
        );
        await conn.query(
          `INSERT INTO resident_fee_structures (hostel_id, resident_id, admission_id, fee_type_id, amount, frequency, effective_from, status, created_by)
           VALUES (?, ?, ?, ?, ?, 'monthly', ?, 'active', ?)`,
          [admission.hostel_id, admission.resident_id, admission.id, rentTypeId, newRent, transfer_date, req.user.id]
        );
        await conn.query('UPDATE admissions SET monthly_rent = ? WHERE id = ?', [newRent, admission.id]);
      }

      await logAudit(conn, req, {
        action: 'allocation.transfer', entityType: 'admission', entityId: admission.id, hostelId: admission.hostel_id,
        description: `Transferred ${admission.admission_no} from ${oldBed.room_number}/${oldBed.bed_number} to ${newBed.room_number}/${newBed.bed_number}: ${reason}`,
        oldValues: { bed_id: current.bed_id, monthly_rent: admission.monthly_rent },
        newValues: { bed_id: newBed.id, monthly_rent: newRent },
      });
      return { transfer_id: tr.insertId, allocation_id: alloc.insertId };
    });
  } catch (error) {
    throw mapDuplicate(error);
  }
}

/** Cancels an admission made by mistake (no payments yet). Releases the bed. */
async function cancelAdmission(req, admissionId, reason) {
  return withTransaction(async (conn) => {
    const admission = await lockAdmission(conn, req, admissionId);
    if (!['pending', 'active'].includes(admission.status)) throw ApiError.conflict(`Admission is already ${admission.status}`);
    const [[{ payments }]] = await conn.query(`SELECT COUNT(*) AS payments FROM payments WHERE admission_id = ? AND status = 'posted'`, [admission.id]);
    if (payments) throw ApiError.conflict('Payments exist for this admission. Use check-out instead of cancellation.');
    const alloc = await activeAllocation(conn, admission.id);
    if (alloc) {
      await conn.query(
        `UPDATE room_allocations SET status = 'released', end_date = ?, release_reason = ?, released_by = ? WHERE id = ?`,
        [today(), `Admission cancelled: ${reason}`.slice(0, 255), req.user.id, alloc.id]
      );
      await conn.query(`UPDATE room_beds SET status = 'available' WHERE id = ?`, [alloc.bed_id]);
      await refreshRoomStatus(conn, alloc.room_id);
    }
    await conn.query(
      `UPDATE invoices SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?
       WHERE admission_id = ? AND status IN ('unpaid','partially_paid','paid') AND paid_amount = 0`,
      [req.user.id, 'Admission cancelled', admission.id]
    );
    await conn.query(`UPDATE resident_fee_structures SET status = 'inactive', effective_to = ? WHERE admission_id = ? AND status = 'active'`, [today(), admission.id]);
    await conn.query(`UPDATE admissions SET status = 'cancelled', remarks = ? WHERE id = ?`, [reason, admission.id]);
    const [[{ previous }]] = await conn.query(`SELECT COUNT(*) AS previous FROM admissions WHERE resident_id = ? AND status = 'checked_out'`, [admission.resident_id]);
    await conn.query('UPDATE residents SET status = ? WHERE id = ?', [previous ? 'checked_out' : 'pending', admission.resident_id]);
    await logAudit(conn, req, {
      action: 'admission.cancel', entityType: 'admission', entityId: admission.id, hostelId: admission.hostel_id,
      description: `Cancelled admission ${admission.admission_no}: ${reason}`,
    });
  });
}

/** Figures shown before confirming a checkout. */
async function checkoutPreview(conn, admission, adjustDeposit = true) {
  const balance = await fee.getAdmissionBalance(conn, admission.id);
  const depositApplied = adjustDeposit ? Math.min(balance.depositHeld, balance.outstanding) : 0;
  const remainingOutstanding = money(balance.outstanding - depositApplied);
  const depositRefund = money(balance.depositHeld - depositApplied);
  return {
    ...balance,
    depositApplied: money(depositApplied),
    remainingOutstanding,
    depositRefund,
    advanceRefund: balance.advance,
    totalRefund: money(depositRefund + balance.advance),
  };
}

/**
 * Confirms checkout: settles deposit against dues, records refunds, releases the bed.
 * The bed is released ONLY here (never before confirmation).
 */
async function checkout(req, admissionId, b) {
  return withTransaction(async (conn) => {
    const admission = await lockAdmission(conn, req, admissionId);
    if (admission.status === 'checked_out') throw ApiError.conflict('This resident has already been checked out');
    if (admission.status !== 'active') throw ApiError.conflict(`Only active admissions can be checked out (current: ${admission.status})`);
    const alloc = await activeAllocation(conn, admission.id);
    if (alloc && b.checkout_date < alloc.start_date) throw ApiError.badRequest('Checkout date cannot be before the allocation start date');

    const preview = await checkoutPreview(conn, admission, b.adjust_deposit);
    if (preview.depositApplied > 0) {
      await fee.recordPayment(conn, req, {
        admission, amount: preview.depositApplied, paymentDate: b.checkout_date, method: 'deposit_adjustment',
        remarks: 'Security deposit adjusted against dues at checkout',
      });
    }
    const refunds = [];
    if (b.process_refund) {
      if (preview.depositRefund > 0) {
        refunds.push(await fee.createRefund(conn, req, {
          admission, refundType: 'security_deposit', amount: preview.depositRefund, refundDate: b.checkout_date,
          method: b.refund_method, referenceNo: b.refund_reference, reason: 'Security deposit refund at checkout',
        }));
      }
      if (preview.advanceRefund > 0) {
        refunds.push(await fee.createRefund(conn, req, {
          admission, refundType: 'advance', amount: preview.advanceRefund, refundDate: b.checkout_date,
          method: b.refund_method, referenceNo: b.refund_reference, reason: 'Advance refund at checkout',
        }));
      }
    }

    if (alloc) {
      await conn.query(
        `UPDATE room_allocations SET status = 'released', end_date = ?, release_reason = ?, released_by = ? WHERE id = ?`,
        [b.checkout_date, `Checkout: ${b.checkout_reason}`.slice(0, 255), req.user.id, alloc.id]
      );
      await conn.query(`UPDATE room_beds SET status = 'available' WHERE id = ?`, [alloc.bed_id]);
      await refreshRoomStatus(conn, alloc.room_id);
    }
    await conn.query(
      `UPDATE resident_fee_structures SET status = 'inactive', effective_to = ? WHERE admission_id = ? AND status = 'active'`,
      [b.checkout_date, admission.id]
    );
    const refundTotal = money(refunds.reduce((s, r) => s + r.amount, 0));
    await conn.query(
      `UPDATE admissions SET status = 'checked_out', checkout_date = ?, checkout_reason = ?, outstanding_amount = ?,
         deposit_adjusted = ?, refund_amount = ?, checked_out_by = ?, remarks = COALESCE(?, remarks) WHERE id = ?`,
      [b.checkout_date, b.checkout_reason, preview.remainingOutstanding, preview.depositApplied, refundTotal, req.user.id, b.remarks, admission.id]
    );
    await conn.query(`UPDATE residents SET status = 'checked_out' WHERE id = ?`, [admission.resident_id]);
    const [[resident]] = await conn.query('SELECT full_name FROM residents WHERE id = ?', [admission.resident_id]);
    await logAudit(conn, req, {
      action: 'admission.checkout', entityType: 'admission', entityId: admission.id, hostelId: admission.hostel_id,
      description: `Checked out ${resident.full_name} (${admission.admission_no}). Deposit adjusted Rs. ${preview.depositApplied}, refunded Rs. ${refundTotal}, outstanding Rs. ${preview.remainingOutstanding}`,
      newValues: { ...preview, refunds },
    });
    return { ...preview, refunds, refundTotal };
  });
}

module.exports = { createAdmission, checkIn, transfer, cancelAdmission, checkoutPreview, checkout, lockAdmission };
