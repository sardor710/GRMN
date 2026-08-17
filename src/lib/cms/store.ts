import type {
  CMSData,
  AdminUser,
  Client,
  CMSProduct,
  Discount,
  Banner,
  CMSBlog,
  Order,
  StoreSettings,
  ActivityLog,
} from "./types";
import dataJson from "./data.json";
import { initialCMSData } from "./seed";

// In-memory cache
let inMemoryData: CMSData = (dataJson as unknown as CMSData) || initialCMSData;

function loadData(): CMSData {
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("path");
      const dataFilePath = path.join(process.cwd(), "src", "lib", "cms", "data.json");
      if (fs.existsSync(dataFilePath)) {
        const raw = fs.readFileSync(dataFilePath, "utf-8");
        inMemoryData = JSON.parse(raw);
        return inMemoryData;
      }
    } catch (err) {
      console.error("Error reading CMS data file:", err);
    }
  }
  return inMemoryData;
}

function saveData(data: CMSData): void {
  inMemoryData = data;
  if (typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("path");
      const dataFilePath = path.join(process.cwd(), "src", "lib", "cms", "data.json");
      const dir = path.dirname(dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Error saving CMS data to file:", err);
    }
  }
}

// ----------------- ADMINS -----------------
export function getAdmins(): AdminUser[] {
  return loadData().admins;
}

export function getAdminByEmail(email: string): AdminUser | undefined {
  const normalized = email.trim().toLowerCase();
  return loadData().admins.find(
    (a) => a.email.toLowerCase() === normalized || (normalized === "admin" && a.email === "admin@garmin.com")
  );
}

export function saveAdmin(admin: Partial<AdminUser> & { email: string; name: string }): AdminUser {
  const data = loadData();
  const existingIdx = data.admins.findIndex((a) => a.id === admin.id);

  let saved: AdminUser;
  if (existingIdx >= 0) {
    saved = {
      ...data.admins[existingIdx],
      ...admin,
      password: admin.password || data.admins[existingIdx].password,
    };
    data.admins[existingIdx] = saved;
  } else {
    saved = {
      id: admin.id || `admin-${Date.now()}`,
      name: admin.name,
      email: admin.email.toLowerCase(),
      password: admin.password || "admin123",
      role: admin.role || "editor",
      status: admin.status || "active",
      avatar: admin.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      createdAt: new Date().toISOString(),
      lastLogin: undefined,
    };
    data.admins.unshift(saved);
  }

  logActivity(saved.name, existingIdx >= 0 ? "Updated admin user" : "Added new admin user", saved.email);
  saveData(data);
  return saved;
}

export function deleteAdmin(id: string): boolean {
  const data = loadData();
  const admin = data.admins.find((a) => a.id === id);
  if (!admin) return false;
  data.admins = data.admins.filter((a) => a.id !== id);
  logActivity("Super Admin", "Deleted admin user", admin.email);
  saveData(data);
  return true;
}

// ----------------- CLIENTS -----------------
export function getClients(): Client[] {
  return loadData().clients;
}

export function saveClient(client: Partial<Client> & { name: string; email: string }): Client {
  const data = loadData();
  const existingIdx = data.clients.findIndex((c) => c.id === client.id);

  let saved: Client;
  if (existingIdx >= 0) {
    saved = { ...data.clients[existingIdx], ...client };
    data.clients[existingIdx] = saved;
  } else {
    saved = {
      id: client.id || `client-${Date.now()}`,
      name: client.name,
      email: client.email.toLowerCase(),
      phone: client.phone || "+65 8000 0000",
      country: client.country || "Singapore",
      status: client.status || "active",
      totalSpent: client.totalSpent || 0,
      ordersCount: client.ordersCount || 0,
      avatar: client.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80",
      notes: client.notes || "",
      createdAt: new Date().toISOString(),
    };
    data.clients.unshift(saved);
  }

  logActivity("Admin", existingIdx >= 0 ? "Updated client profile" : "Registered new client", saved.name);
  saveData(data);
  return saved;
}

export function deleteClient(id: string): boolean {
  const data = loadData();
  const client = data.clients.find((c) => c.id === id);
  if (!client) return false;
  data.clients = data.clients.filter((c) => c.id !== id);
  logActivity("Admin", "Deleted client", client.name);
  saveData(data);
  return true;
}

// ----------------- PRODUCTS -----------------
export function getProducts(): CMSProduct[] {
  return loadData().products;
}

export function saveProduct(product: Partial<CMSProduct> & { name: string; price: number }): CMSProduct {
  const data = loadData();
  const existingIdx = data.products.findIndex((p) => p.id === product.id);

  let saved: CMSProduct;
  if (existingIdx >= 0) {
    saved = { ...data.products[existingIdx], ...product };
    data.products[existingIdx] = saved;
  } else {
    saved = {
      id: product.id || `prod-${Date.now()}`,
      name: product.name,
      sku: product.sku || `GRM-${Date.now().toString().slice(-6)}`,
      price: product.price,
      originalPrice: product.originalPrice || product.price * 1.1,
      priceSuffix: product.priceSuffix,
      description: product.description || "Premium Garmin GPS device.",
      image: product.image || "/images/products/1228429.jpg",
      badge: product.badge || "NONE",
      family: product.family || "Smartwatches",
      category: product.category || "Smartwatches & Wearables",
      subCategory: product.subCategory || "Multisport GPS",
      activities: product.activities || ["Running", "Hiking"],
      level: product.level || "Premium",
      caseSize: product.caseSize || "Medium",
      stock: product.stock ?? 50,
      status: product.status || "published",
      isFeatured: product.isFeatured ?? false,
      specs: product.specs || [
        { label: "Lens Material", value: "Corning® Gorilla® Glass 3" },
        { label: "Bezel Material", value: "Stainless Steel" },
        { label: "Display", value: '1.4" AMOLED' },
        { label: "Battery Life", value: "Up to 14 days" },
      ],
      inTheBox: product.inTheBox || [
        `${product.name}`,
        "USB-C Charging / Data Cable",
        "Documentation",
      ],
      compatibleAccessories: product.compatibleAccessories || [],
      features: product.features || [],
      createdAt: new Date().toISOString(),
    };
    data.products.unshift(saved);
  }

  logActivity("Product Manager", existingIdx >= 0 ? "Updated product" : "Added new product", saved.name);
  saveData(data);
  return saved;
}

export function deleteProduct(id: string): boolean {
  const data = loadData();
  const product = data.products.find((p) => p.id === id);
  if (!product) return false;
  data.products = data.products.filter((p) => p.id !== id);
  logActivity("Product Manager", "Deleted product", product.name);
  saveData(data);
  return true;
}

// ----------------- DISCOUNTS -----------------
export function getDiscounts(): Discount[] {
  return loadData().discounts;
}

export function saveDiscount(discount: Partial<Discount> & { code: string; value: number }): Discount {
  const data = loadData();
  const code = discount.code.trim().toUpperCase();
  const existingIdx = data.discounts.findIndex((d) => d.id === discount.id || d.code.toUpperCase() === code);

  let saved: Discount;
  if (existingIdx >= 0) {
    saved = { ...data.discounts[existingIdx], ...discount, code };
    data.discounts[existingIdx] = saved;
  } else {
    saved = {
      id: discount.id || `disc-${Date.now()}`,
      code,
      description: discount.description || `${discount.value}${discount.type === 'percentage' ? '%' : '$'} discount coupon`,
      type: discount.type || "percentage",
      value: discount.value,
      minSpend: discount.minSpend,
      usageLimit: discount.usageLimit,
      perCustomerLimit: discount.perCustomerLimit || 1,
      usageCount: discount.usageCount || 0,
      applyType: discount.applyType || "all",
      targetCategories: discount.targetCategories || [],
      targetSkus: discount.targetSkus || [],
      startDate: discount.startDate || new Date().toISOString(),
      expiresAt: discount.expiresAt,
      isStackable: discount.isStackable ?? false,
      status: discount.status || "active",
      createdAt: new Date().toISOString(),
    };
    data.discounts.unshift(saved);
  }

  logActivity("Marketing Admin", existingIdx >= 0 ? "Updated promo code" : "Created promo code", saved.code);
  saveData(data);
  return saved;
}

export function deleteDiscount(id: string): boolean {
  const data = loadData();
  const disc = data.discounts.find((d) => d.id === id);
  if (!disc) return false;
  data.discounts = data.discounts.filter((d) => d.id !== id);
  logActivity("Marketing Admin", "Deleted promo code", disc.code);
  saveData(data);
  return true;
}

// ----------------- BANNERS -----------------
export function getBanners(): Banner[] {
  return loadData().banners;
}

export function saveBanner(banner: Partial<Banner> & { title: string }): Banner {
  const data = loadData();
  const existingIdx = data.banners.findIndex((b) => b.id === banner.id);

  let saved: Banner;
  if (existingIdx >= 0) {
    saved = { ...data.banners[existingIdx], ...banner };
    data.banners[existingIdx] = saved;
  } else {
    saved = {
      id: banner.id || `banner-${Date.now()}`,
      title: banner.title,
      subtitle: banner.subtitle,
      ctaLabel: banner.ctaLabel || "Learn More",
      ctaUrl: banner.ctaUrl || "#",
      image: banner.image || "/marq/images/kv-bg.jpg",
      position: banner.position || "hero",
      active: banner.active ?? true,
      order: banner.order ?? data.banners.length + 1,
      createdAt: new Date().toISOString(),
    };
    data.banners.push(saved);
  }

  logActivity("Editor", existingIdx >= 0 ? "Updated banner" : "Added new banner", saved.title);
  saveData(data);
  return saved;
}

export function deleteBanner(id: string): boolean {
  const data = loadData();
  const banner = data.banners.find((b) => b.id === id);
  if (!banner) return false;
  data.banners = data.banners.filter((b) => b.id !== id);
  logActivity("Editor", "Deleted banner", banner.title);
  saveData(data);
  return true;
}

// ----------------- BLOGS -----------------
export function getBlogs(): CMSBlog[] {
  return loadData().blogs;
}

export function saveBlog(blog: Partial<CMSBlog> & { title: string; content: string }): CMSBlog {
  const data = loadData();
  const existingIdx = data.blogs.findIndex((b) => b.id === blog.id);
  const slug = blog.slug || blog.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let saved: CMSBlog;
  if (existingIdx >= 0) {
    saved = { ...data.blogs[existingIdx], ...blog, slug };
    data.blogs[existingIdx] = saved;
  } else {
    saved = {
      id: blog.id || `blog-${Date.now()}`,
      slug,
      title: blog.title,
      excerpt: blog.excerpt || blog.content.slice(0, 150) + "...",
      content: blog.content,
      coverImage: blog.coverImage || "/images/blog/triathlon.jpg",
      category: blog.category || "Smartwatches",
      readingTime: blog.readingTime || "5 min read",
      author: blog.author || "Garmin Editorial Team",
      status: blog.status || "published",
      publishedAt: blog.publishedAt || new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    };
    data.blogs.unshift(saved);
  }

  logActivity("Editor", existingIdx >= 0 ? "Updated blog article" : "Published blog article", saved.title);
  saveData(data);
  return saved;
}

export function deleteBlog(id: string): boolean {
  const data = loadData();
  const blog = data.blogs.find((b) => b.id === id);
  if (!blog) return false;
  data.blogs = data.blogs.filter((b) => b.id !== id);
  logActivity("Editor", "Deleted blog article", blog.title);
  saveData(data);
  return true;
}

// ----------------- ORDERS -----------------
export function getOrders(): Order[] {
  return loadData().orders;
}

export function saveOrder(order: Partial<Order> & { clientName: string; total: number }): Order {
  const data = loadData();
  const existingIdx = data.orders.findIndex((o) => o.id === order.id);

  let saved: Order;
  if (existingIdx >= 0) {
    saved = { ...data.orders[existingIdx], ...order };
    data.orders[existingIdx] = saved;
  } else {
    saved = {
      id: order.id || `ord-${Date.now()}`,
      orderNumber: order.orderNumber || `GRM-${Math.floor(10000 + Math.random() * 90000)}`,
      clientName: order.clientName,
      clientEmail: order.clientEmail || "customer@example.com",
      total: order.total,
      itemsCount: order.itemsCount || (order.items ? order.items.length : 1),
      items: order.items || [],
      paymentStatus: order.paymentStatus || "paid",
      fulfillmentStatus: order.fulfillmentStatus || "processing",
      shippingAddress: order.shippingAddress || "12 Marina Boulevard, Singapore",
      createdAt: new Date().toISOString(),
    };
    data.orders.unshift(saved);
  }

  logActivity("Sales System", existingIdx >= 0 ? "Updated order status" : "Created order", saved.orderNumber);
  saveData(data);
  return saved;
}

// ----------------- SETTINGS -----------------
export function getSettings(): StoreSettings {
  return loadData().settings;
}

export function saveSettings(settings: Partial<StoreSettings>): StoreSettings {
  const data = loadData();
  data.settings = { ...data.settings, ...settings };
  logActivity("Super Admin", "Updated store settings", "Store Configuration");
  saveData(data);
  return data.settings;
}

// ----------------- ACTIVITIES -----------------
export function getActivities(): ActivityLog[] {
  return loadData().activities;
}

export function logActivity(adminName: string, action: string, target: string): void {
  const data = loadData();
  const newActivity: ActivityLog = {
    id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    adminName,
    action,
    target,
    timestamp: new Date().toISOString(),
  };
  data.activities.unshift(newActivity);
  if (data.activities.length > 50) {
    data.activities = data.activities.slice(0, 50);
  }
}

// ----------------- DASHBOARD STATS -----------------
export function getDashboardStats() {
  const data = loadData();
  const totalRevenue = data.orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  const totalClients = data.clients.length;
  const totalProducts = data.products.length;
  const publishedProducts = data.products.filter((p) => p.status === "published").length;
  const activeDiscounts = data.discounts.filter((d) => d.status === "active").length;
  const publishedBlogs = data.blogs.filter((b) => b.status === "published").length;
  const pendingOrders = data.orders.filter((o) => o.fulfillmentStatus === "processing").length;

  return {
    totalRevenue,
    totalClients,
    totalProducts,
    publishedProducts,
    activeDiscounts,
    publishedBlogs,
    totalOrders: data.orders.length,
    pendingOrders,
    recentOrders: data.orders.slice(0, 5),
    recentActivities: data.activities.slice(0, 8),
    recentClients: data.clients.slice(0, 4),
  };
}
