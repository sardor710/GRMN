import type { FulfillmentStatus, OrderItem, Order } from "./types";

export type OrderRouteStage =
  | "created"
  | "processing"
  | "shipped"
  | "out_for_delivery"
  | "delivered";

export const ORDER_ROUTE_STAGES: OrderRouteStage[] = [
  "created",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
];

export interface OrderMilestone {
  stage: OrderRouteStage;
  label: string;
  date: string; // ISO date string
  description: string;
  completed: boolean;
  current?: boolean;
  location?: string;
}

/**
 * Generates a standard system order number (e.g. GRM-100482)
 * Ensures consistency across admin panel and customer portal.
 */
export function generateOrderNumber(seed?: number): string {
  const randomNum = seed ?? Math.floor(10000 + Math.random() * 90000);
  return `GRM-${randomNum}`;
}

/**
 * Calculates visual progression percentage (0-100%) for order timeline bar
 */
export function calculateOrderRouteProgress(status: FulfillmentStatus | string): number {
  switch (status.toLowerCase()) {
    case "delivered":
      return 100;
    case "out_for_delivery":
      return 85;
    case "shipped":
      return 65;
    case "processing":
      return 40;
    case "new":
    case "created":
      return 20;
    case "canceled":
    case "cancelled":
    case "returned":
    default:
      return 0;
  }
}

/**
 * Calculates sum of price * quantity across all itemized products in order
 */
export function calculateOrderSubtotal(items: OrderItem[] = []): number {
  return items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
}

/**
 * Generates chronological milestones with realistic timestamps based on order creation date
 * and fulfillment status.
 */
export function generateOrderMilestones(order: {
  createdAt?: string;
  fulfillmentStatus?: FulfillmentStatus | string;
  trackingNumber?: string;
  carrier?: string;
  shippingAddress?: string;
  milestones?: OrderMilestone[];
}): OrderMilestone[] {
  // If explicitly populated in the order record, return those
  if (order.milestones && Array.isArray(order.milestones) && order.milestones.length === 5) {
    return order.milestones;
  }

  const baseDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const validBaseTime = isNaN(baseDate.getTime()) ? Date.now() : baseDate.getTime();

  // Helper date offset generator (hours after base)
  const offsetTime = (hours: number) => new Date(validBaseTime + hours * 3600 * 1000).toISOString();

  const status = (order.fulfillmentStatus || "new").toLowerCase();
  const carrier = order.carrier || "Garmin Express Priority";
  const tracking = order.trackingNumber || "GRM-TRK-PENDING";

  const stageConfigs: {
    stage: OrderRouteStage;
    label: string;
    hoursOffset: number;
    description: string;
    location: string;
  }[] = [
    {
      stage: "created",
      label: "Order Placed & Verified",
      hoursOffset: 0,
      description: "Order received by Garmin system and payment verified.",
      location: "Garmin Global Commerce System",
    },
    {
      stage: "processing",
      label: "Processing & Packaging",
      hoursOffset: 6,
      description: "Items picked, inspected, and packed at Regional Fulfillment Center.",
      location: "Garmin Fulfillment Center",
    },
    {
      stage: "shipped",
      label: "Shipped & In Transit",
      hoursOffset: 24,
      description: `Dispatched via ${carrier}. Tracking: ${tracking}`,
      location: "Central Transit Hub",
    },
    {
      stage: "out_for_delivery",
      label: "Out for Final Delivery",
      hoursOffset: 48,
      description: "Courier assigned and en route to the designated delivery address.",
      location: order.shippingAddress?.split(",")[0] || "Local Distribution Depot",
    },
    {
      stage: "delivered",
      label: "Package Delivered",
      hoursOffset: 54,
      description: "Package safely delivered and signed for by recipient.",
      location: order.shippingAddress || "Delivery Address",
    },
  ];

  // Determine stage completion index
  let activeIndex = 0;
  if (status === "delivered") {
    activeIndex = 4;
  } else if (status === "out_for_delivery") {
    activeIndex = 3;
  } else if (status === "shipped") {
    activeIndex = 2;
  } else if (status === "processing") {
    activeIndex = 1;
  } else {
    activeIndex = 0; // new / created
  }

  return stageConfigs.map((cfg, idx) => {
    const isCompleted = idx <= activeIndex && status !== "canceled" && status !== "cancelled";
    const isCurrent = idx === activeIndex && status !== "canceled" && status !== "cancelled";

    return {
      stage: cfg.stage,
      label: cfg.label,
      date: offsetTime(cfg.hoursOffset),
      description: cfg.description,
      location: cfg.location,
      completed: isCompleted,
      current: isCurrent,
    };
  });
}

/**
 * Formats a date string into readable user-friendly e-commerce date format
 */
export function formatOrderDate(dateString?: string): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
