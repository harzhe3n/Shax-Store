'use strict';
/**
 * Shax Store — Order Status Alerts Service
 *
 * Bridges order status activity to the EXISTING notification + push
 * stack (no new notification system — the in-app notification center
 * remains the source of truth):
 *
 *   logOrderStatus       → appends a row to order_status_log, which
 *                          drives the customer's tracking timeline.
 *   notifyCustomerStatus → in-app notification (type 'order', targeted
 *                          to the order owner) + best-effort native
 *                          push fan-out via services/push.js.
 *
 * Best-effort by design: status logging/notification failures must
 * never roll back or block the order-status change itself.
 */
const db = require('../config/db');
const { createNotification } = require('./notifications');
const pushSvc = require('./push');

const VALID_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

/**
 * Record a status change for an order in order_status_log.
 * Returns the inserted row's id, or null on invalid input / failure.
 */
async function logOrderStatus({ orderId, status, userId = null, userName = null, note = null }) {
  if (!orderId || !VALID_STATUSES.includes(status)) return null;
  try {
    const [result] = await db.execute(
      `INSERT INTO order_status_log (order_id, status, changed_by_id, changed_by_name, note)
       VALUES (?,?,?,?,?)`,
      [orderId, status, userId, userName || null, note || null]
    );
    return { id: result.insertId, orderId, status };
  } catch (err) {
    console.error('Order status log failed:', err.message);
    return null;
  }
}

/**
 * Notify the customer who owns an order about a status change.
 * Creates an in-app notification (type 'order' → box icon, triggers the
 * bell badge) whose link opens the tracking timeline, then fire-and-forget
 * fan-outs the same notification to the customer's devices via native push.
 * Never throws.
 */
async function notifyCustomerStatus({ orderId, status, customerId }) {
  if (!orderId || !customerId || !VALID_STATUSES.includes(status)) return null;
  try {
    const notification = await createNotification({
      type: 'order',
      audience: 'user',
      targetUserId: customerId,
      link: `account.html#order-${orderId}`,
      metadata: { orderId, status },
      title: 'Order update',
      message: `Your order ${orderId} is now marked as ${status}.`
    });

    pushSvc.fanoutPush(notification).catch(err =>
      console.error('Push fan-out error:', err)
    );

    return notification;
  } catch (err) {
    console.error('Order status notification failed:', err.message);
    return null;
  }
}

module.exports = { VALID_STATUSES, logOrderStatus, notifyCustomerStatus };