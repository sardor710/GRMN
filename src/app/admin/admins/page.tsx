"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Plus,
  Search,
  Trash2,
  Edit,
} from "lucide-react";
import type { AdminUser, AdminRole, AdminStatus } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";

const ROLE_INFO = {
  super_admin: {
    label: "Super Admin",
    desc: "Unrestricted root permissions across store, products, orders, and system settings.",
  },
  product_manager: {
    label: "Product Manager",
    desc: "Full management of catalog, specifications, stock inventory, and discount codes.",
  },
  editor: {
    label: "Editor",
    desc: "Management of hero banners, marketing pods, and editorial blog articles.",
  },
  support: {
    label: "Customer Support",
    desc: "Order inquiry access, client account management, and customer assistance.",
  },
};

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "editor" as AdminRole,
    status: "active" as AdminStatus,
  });

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/admins");
      const data = await res.json();
      if (data.admins) setAdmins(data.admins);
    } catch (err) {
      console.error("Error loading admins:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleOpenAdd = () => {
    setEditingAdmin(null);
    setFormData({
      name: "",
      email: "",
      password: "admin123",
      role: "editor",
      status: "active",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name,
      email: admin.email,
      password: "",
      role: admin.role,
      status: admin.status,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this administrator's access?")) return;
    try {
      await fetch(`/api/admin/admins?id=${id}`, { method: "DELETE" });
      setAdmins(admins.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete admin:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingAdmin ? { id: editingAdmin.id } : {}),
        ...formData,
      };

      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchAdmins();
      }
    } catch (err) {
      console.error("Failed to save admin:", err);
    }
  };

  const filteredAdmins = admins.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#007cc3]" />
            <h1 className="g-heading text-2xl uppercase tracking-tight text-neutral-900">
              Administrators & Role Permissions
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Manage team access levels, RBAC security roles, and operational credentials.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-black px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Administrator</span>
        </button>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(ROLE_INFO) as AdminRole[]).map((roleKey) => {
          const info = ROLE_INFO[roleKey];
          const count = admins.filter((a) => a.role === roleKey).length;
          return (
            <div key={roleKey} className="border border-neutral-200 bg-white p-4 rounded-none shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  {info.label}
                </span>
                <span className="text-xs font-semibold text-neutral-900 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-none">
                  {count} USERS
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-2 line-clamp-2">
                {info.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Admins Table */}
      <div className="border border-neutral-200 bg-white rounded-none shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or role..."
              className="h-10 w-full border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-black focus:outline-none rounded-none"
            />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {filteredAdmins.length} Active Accounts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4 font-semibold">Admin User</th>
                <th className="py-3.5 px-4 font-semibold">Assigned Role</th>
                <th className="py-3.5 px-4 font-semibold">Account Status</th>
                <th className="py-3.5 px-4 font-semibold">Last Active</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-400">
                    Loading administrators...
                  </td>
                </tr>
              ) : filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-400">
                    No admins matched your search.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-neutral-100 border border-neutral-200 flex items-center justify-center font-heading font-semibold text-neutral-900 text-sm rounded-none">
                          {admin.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900">{admin.name}</p>
                          <p className="text-xs text-neutral-500">{admin.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-neutral-100 text-neutral-800 border border-neutral-200 rounded-none">
                        {ROLE_INFO[admin.role]?.label || admin.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-none ${
                          admin.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {admin.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-neutral-600">
                      {admin.lastLogin
                        ? new Date(admin.lastLogin).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Never"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(admin)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors rounded-none"
                          title="Edit Admin"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {admin.role !== "super_admin" && (
                          <button
                            type="button"
                            onClick={() => handleDelete(admin.id)}
                            className="p-2 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-none"
                            title="Delete Admin"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Admin Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAdmin ? "Edit Administrator Profile" : "Add Administrator Account"}
        subtitle="Manage user role, access permissions, and authentication credentials"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Marcus Vance"
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="marcus@garmin.com"
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              {editingAdmin ? "Change Password (leave empty to keep current)" : "Password *"}
            </label>
            <input
              type="password"
              required={!editingAdmin}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Role & Permissions
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as AdminRole })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              >
                <option value="super_admin">Super Admin (Full Access)</option>
                <option value="product_manager">Product Manager</option>
                <option value="editor">Content Editor</option>
                <option value="support">Customer Support</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Account Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as AdminStatus })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive / Suspended</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 rounded-none transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-black px-6 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
            >
              {editingAdmin ? "Save Changes" : "Create Administrator"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
