"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  Globe,
  Trash2,
  Edit,
  Star,
} from "lucide-react";
import type { Client, ClientStatus } from "@/lib/cms/types";
import { AdminModal } from "@/components/admin/AdminModal";

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    country: "Singapore",
    status: "active" as ClientStatus,
    notes: "",
  });

  const fetchClients = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/clients");
      const data = await res.json();
      if (data.clients) setClients(data.clients);
    } catch (err) {
      console.error("Error loading clients:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleOpenAdd = () => {
    setEditingClient(null);
    setFormData({
      name: "",
      email: "",
      phone: "",
      country: "Singapore",
      status: "active",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      email: client.email,
      phone: client.phone,
      country: client.country,
      status: client.status,
      notes: client.notes || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this client?")) return;
    try {
      await fetch(`/api/admin/clients?id=${id}`, { method: "DELETE" });
      setClients(clients.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete client:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingClient ? { id: editingClient.id } : {}),
        ...formData,
      };

      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchClients();
      }
    } catch (err) {
      console.error("Failed to save client:", err);
    }
  };

  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.country.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <Users className="h-6 w-6 text-[#007cc3]" />
            <span>Clients & Customer Accounts</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Manage customer directories, VIP status tiers, purchase records, and personal preferences.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 bg-[#007cc3] px-4 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add New Client</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 border border-[#262c39] bg-[#141720] p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, country..."
            className="h-9 w-full border border-[#262c39] bg-[#101217] pl-9 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-heading uppercase tracking-wider font-bold text-[#737b8c] mr-1">Filter:</span>
          {["all", "vip", "active", "pending", "suspended"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 text-[11px] font-heading uppercase tracking-wider font-bold transition-colors ${
                statusFilter === st
                  ? "bg-[#007cc3] text-white"
                  : "bg-[#101217] border border-[#262c39] text-[#8a92a3] hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Table */}
      <div className="border border-[#262c39] bg-[#141720] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#232732] bg-[#0f1117] text-[#737b8c] text-[11px] font-heading uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Client Profile</th>
                <th className="py-3 px-4 font-bold">Contact Info</th>
                <th className="py-3 px-4 font-bold">Country</th>
                <th className="py-3 px-4 font-bold">Total Spent</th>
                <th className="py-3 px-4 font-bold">Orders</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232732] text-[#c0c7d4]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#737b8c]">
                    Loading clients...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#737b8c]">
                    No clients found matching your search.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-[#191d28]">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-[#101217] border border-[#262c39] flex items-center justify-center font-heading font-bold text-white text-xs">
                          {client.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-white flex items-center gap-1.5">
                            {client.name}
                            {client.status === "vip" && (
                              <Star className="h-3.5 w-3.5 text-[#fbbf24] fill-[#fbbf24]" />
                            )}
                          </p>
                          <p className="text-[11px] font-mono text-[#737b8c]">ID: {client.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5 text-[12px]">
                        <p className="flex items-center gap-1.5 text-white">
                          <Mail className="h-3 w-3 text-[#737b8c]" /> {client.email}
                        </p>
                        <p className="flex items-center gap-1.5 text-[#8a92a3]">
                          <Phone className="h-3 w-3 text-[#737b8c]" /> {client.phone}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5 text-[#c0c7d4]">
                        <Globe className="h-3.5 w-3.5 text-[#737b8c]" /> {client.country}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-heading font-bold text-white text-[14px]">
                      ${client.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-heading font-bold text-[11px] bg-[#101217] border border-[#262c39] px-2 py-0.5 text-[#c0c7d4]">
                        {client.ordersCount} ORDERS
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-heading uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 ${
                          client.status === "vip"
                            ? "bg-[#2c2519] text-[#fbbf24] border border-[#fbbf24]/30"
                            : client.status === "active"
                            ? "bg-[#1e2a22] text-[#4ade80] border border-[#4ade80]/30"
                            : client.status === "pending"
                            ? "bg-[#142334] text-[#60a5fa] border border-[#60a5fa]/30"
                            : "bg-[#2c1919] text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(client)}
                          className="p-1.5 text-[#8a92a3] hover:bg-[#1f2430] hover:text-white"
                          title="Edit Client"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(client.id)}
                          className="p-1.5 text-[#8a92a3] hover:bg-rose-500/10 hover:text-rose-400"
                          title="Delete Client"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Client Modal */}
      <AdminModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClient ? "Edit Client Profile" : "Register Client Account"}
        subtitle="Manage customer contact info, status tier, and purchase notes"
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
              placeholder="e.g. Alexander Hayes"
              className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="client@example.com"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+65 9123 4567"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Country
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="Singapore"
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Status Tier
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ClientStatus })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading uppercase font-bold text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="vip">VIP Tier</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Watch Preferences & Client Notes
            </label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. MARQ Captain Gen 2 owner, prefers express shipping."
              className="mt-1 w-full border border-[#262c39] bg-[#101217] p-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
            />
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
              {editingClient ? "Save Changes" : "Register Client"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
