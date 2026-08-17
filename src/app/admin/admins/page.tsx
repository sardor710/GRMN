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
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-[#007cc3]" />
            <span>Administrators & Role Permissions</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Manage team access levels, RBAC security roles, and operational credentials.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 bg-[#007cc3] px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae]"
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
            <div key={roleKey} className="border border-[#262c39] bg-[#141720] p-4">
              <div className="flex items-center justify-between">
                <span className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#8a92a3]">
                  {info.label}
                </span>
                <span className="font-heading font-bold text-white text-xs bg-[#191d28] border border-[#262c39] px-2 py-0.5">
                  {count} USERS
                </span>
              </div>
              <p className="text-[11px] text-[#8a92a3] mt-2 line-clamp-2">
                {info.desc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Admins Table */}
      <div className="border border-[#262c39] bg-[#141720] overflow-hidden">
        <div className="p-3.5 border-b border-[#232732] flex items-center justify-between">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or role..."
              className="h-9 w-full border border-[#262c39] bg-[#101217] pl-9 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none"
            />
          </div>
          <span className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#8a92a3]">
            {filteredAdmins.length} Active Accounts
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#232732] bg-[#0f1117] text-[#737b8c] text-[11px] font-heading uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Admin User</th>
                <th className="py-3 px-4 font-bold">Assigned Role</th>
                <th className="py-3 px-4 font-bold">Account Status</th>
                <th className="py-3 px-4 font-bold">Last Active</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232732] text-[#c0c7d4]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#737b8c]">
                    Loading administrators...
                  </td>
                </tr>
              ) : filteredAdmins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#737b8c]">
                    No admins matched your search.
                  </td>
                </tr>
              ) : (
                filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-[#191d28]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-[#101217] border border-[#262c39] flex items-center justify-center font-heading font-bold text-white text-xs">
                          {admin.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-white">{admin.name}</p>
                          <p className="text-[11px] text-[#8a92a3]">{admin.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 bg-[#142334] text-[#60a5fa] border border-[#60a5fa]/30">
                        {ROLE_INFO[admin.role]?.label || admin.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 ${
                          admin.status === "active"
                            ? "bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30"
                            : "bg-[#2c1919] text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {admin.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[12px] text-[#8a92a3]">
                      {admin.lastLogin
                        ? new Date(admin.lastLogin).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Never"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(admin)}
                          className="p-1.5 text-[#8a92a3] hover:bg-[#1f2430] hover:text-white"
                          title="Edit Admin"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {admin.role !== "super_admin" && (
                          <button
                            type="button"
                            onClick={() => handleDelete(admin.id)}
                            className="p-1.5 text-[#8a92a3] hover:bg-rose-500/10 hover:text-rose-400"
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
        <form onSubmit={handleSubmit} className="space-y-4 font-sans">
          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Marcus Vance"
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="marcus@garmin.com"
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              {editingAdmin ? "Change Password (leave empty to keep current)" : "Password *"}
            </label>
            <input
              type="password"
              required={!editingAdmin}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Role & Permissions
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as AdminRole })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading uppercase font-bold text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="super_admin">Super Admin (Full Access)</option>
                <option value="product_manager">Product Manager</option>
                <option value="editor">Content Editor</option>
                <option value="support">Customer Support</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Account Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as AdminStatus })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading uppercase font-bold text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive / Suspended</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#232732]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-[#8a92a3] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#007cc3] px-5 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white hover:bg-[#006cae]"
            >
              {editingAdmin ? "Save Changes" : "Create Administrator"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
