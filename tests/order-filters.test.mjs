import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterOrdersByDateRange,
  filterOrdersByStatuses,
  isOrderCompleted,
  ORDER_STATUS_COLUMNS
} from '../src/lib/cms/order-filters.js';

const mockOrders = [
  {
    id: '1',
    orderNumber: 'GRM-101',
    fulfillmentStatus: 'new',
    createdAt: '2026-11-09T10:00:00Z',
    total: 100
  },
  {
    id: '2',
    orderNumber: 'GRM-102',
    fulfillmentStatus: 'processing',
    createdAt: '2026-11-08T15:00:00Z',
    total: 200
  },
  {
    id: '3',
    orderNumber: 'GRM-103',
    fulfillmentStatus: 'shipped',
    createdAt: '2026-11-02T12:00:00Z',
    total: 300
  },
  {
    id: '4',
    orderNumber: 'GRM-104',
    fulfillmentStatus: 'delivered',
    createdAt: '2026-10-15T09:00:00Z',
    total: 400
  },
  {
    id: '5',
    orderNumber: 'GRM-105',
    fulfillmentStatus: 'canceled',
    createdAt: '2026-08-20T08:00:00Z',
    total: 500
  },
  {
    id: '6',
    orderNumber: 'GRM-106',
    fulfillmentStatus: 'returned',
    createdAt: '2025-12-10T14:00:00Z',
    total: 600
  }
];

test('isOrderCompleted returns true for delivered, canceled, returned', () => {
  assert.equal(isOrderCompleted('delivered'), true);
  assert.equal(isOrderCompleted('canceled'), true);
  assert.equal(isOrderCompleted('returned'), true);
  assert.equal(isOrderCompleted('new'), false);
  assert.equal(isOrderCompleted('processing'), false);
  assert.equal(isOrderCompleted('shipped'), false);
});

test('filterOrdersByStatuses filters orders matching any enabled status', () => {
  const result = filterOrdersByStatuses(mockOrders, ['new', 'processing']);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(o => o.id), ['1', '2']);
});

test('filterOrdersByDateRange handles this week, month, ytd, and custom dates', () => {
  const refDate = new Date('2026-11-09T12:00:00Z'); // Monday
  
  // Week: Nov 8-9 (starts Nov 8 or Nov 2 depending on week def, Nov 8 is Sunday)
  const weekOrders = filterOrdersByDateRange(mockOrders, 'week', undefined, undefined, refDate);
  assert.ok(weekOrders.some(o => o.id === '1'));
  
  // Month: Nov 2026
  const monthOrders = filterOrdersByDateRange(mockOrders, 'month', undefined, undefined, refDate);
  assert.equal(monthOrders.length, 3); // id 1, 2, 3
  
  // YTD: 2026
  const ytdOrders = filterOrdersByDateRange(mockOrders, 'ytd', undefined, undefined, refDate);
  assert.equal(ytdOrders.length, 5); // 1, 2, 3, 4, 5
  
  // Custom range
  const customOrders = filterOrdersByDateRange(mockOrders, 'custom', '2026-10-01', '2026-10-31', refDate);
  assert.equal(customOrders.length, 1);
  assert.equal(customOrders[0].id, '4');
});

test('ORDER_STATUS_COLUMNS defines all 6 standard status columns', () => {
  assert.equal(ORDER_STATUS_COLUMNS.length, 6);
  assert.deepEqual(
    ORDER_STATUS_COLUMNS.map(c => c.id),
    ['new', 'processing', 'shipped', 'delivered', 'canceled', 'returned']
  );
});
