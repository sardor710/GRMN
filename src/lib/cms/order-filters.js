export const ORDER_STATUS_COLUMNS = [
  {
    id: 'new',
    label: 'New',
    description: 'Fresh incoming orders pending initial verification',
    badgeBg: 'bg-neutral-100',
    badgeText: 'text-neutral-800',
    borderColor: 'border-neutral-300',
  },
  {
    id: 'processing',
    label: 'Processing',
    description: 'In warehouse pick, packaging, and QA inspection',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    borderColor: 'border-amber-300',
  },
  {
    id: 'shipped',
    label: 'Shipped',
    description: 'Dispatched to carrier with tracking number active',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-800',
    borderColor: 'border-sky-300',
  },
  {
    id: 'delivered',
    label: 'Delivered',
    description: 'Successfully signed and received by customer',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    borderColor: 'border-emerald-300',
  },
  {
    id: 'canceled',
    label: 'Canceled',
    description: 'Voided prior to dispatch or order cancellation requested',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    borderColor: 'border-rose-300',
  },
  {
    id: 'returned',
    label: 'Returned',
    description: 'Package returned to warehouse and refunded/restocked',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    borderColor: 'border-purple-300',
  },
];

export function isOrderCompleted(status) {
  return status === 'delivered' || status === 'canceled' || status === 'cancelled' || status === 'returned';
}

export function filterOrdersByStatuses(orders, activeStatuses) {
  if (!activeStatuses || activeStatuses.length === 0) {
    return orders;
  }
  const set = new Set(activeStatuses);
  return orders.filter((o) => {
    if (set.has(o.fulfillmentStatus)) return true;
    if (o.fulfillmentStatus === 'cancelled' && set.has('canceled')) return true;
    if (o.fulfillmentStatus === 'canceled' && set.has('cancelled')) return true;
    return false;
  });
}

export function filterOrdersByDateRange(orders, rangeType, customStart, customEnd, referenceDate) {
  if (rangeType === 'all') return orders;

  const now = referenceDate ? new Date(referenceDate) : new Date();

  if (rangeType === 'week') {
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setMilliseconds(-1);

    return orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= startOfWeek && d <= endOfWeek;
    });
  }

  if (rangeType === 'month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    return orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= startOfMonth && d <= endOfMonth;
    });
  }

  if (rangeType === 'ytd') {
    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    return orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= startOfYear && d <= endOfYear;
    });
  }

  if (rangeType === 'custom') {
    const start = customStart ? new Date(customStart + 'T00:00:00') : new Date(0);
    const end = customEnd ? new Date(customEnd + 'T23:59:59') : new Date('9999-12-31');

    return orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= start && d <= end;
    });
  }

  return orders;
}
