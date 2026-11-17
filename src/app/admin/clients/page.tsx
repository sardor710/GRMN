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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-[#007cc3]" />
            <h1 className="g-heading text-2xl uppercase tracking-tight text-neutral-900">
              Clients & Customer Accounts
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Manage customer directories, VIP status tiers, purchase records, and personal preferences.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 bg-black px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors rounded-none"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add New Client</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between rounded-none shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, country..."
            className="h-10 w-full border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-black focus:outline-none rounded-none"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mr-1">Filter:</span>
          {["all", "vip", "active", "pending", "suspended"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-none transition-colors ${
                statusFilter === st
                  ? "bg-black text-white"
                  : "bg-white border border-neutral-200 text-neutral-600 hover:text-black hover:border-neutral-400"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Table */}
      <div className="border border-neutral-200 bg-white rounded-none shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Client Profile</th>
                <th className="py-3.5 px-4">Contact Info</th>
                <th className="py-3.5 px-4">Country</th>
                <th className="py-3.5 px-4">Total Spent</th>
                <th className="py-3.5 px-4">Orders</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    Loading clients...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    No clients found matching your search.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-neutral-100 border border-neutral-200 flex items-center justify-center font-heading font-semibold text-neutral-800 text-sm rounded-none">
                          {client.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900 flex items-center gap-1.5">
                            {client.name}
                            {client.status === "vip" && (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                            )}
                          </p>
                          <p className="text-xs font-mono text-neutral-400">ID: {client.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5 text-xs">
                        <p className="flex items-center gap-1.5 text-neutral-800 font-medium">
                          <Mail className="h-3.5 w-3.5 text-neutral-400" /> {client.email}
                        </p>
                        <p className="flex items-center gap-1.5 text-neutral-500">
                          <Phone className="h-3.5 w-3.5 text-neutral-400" /> {client.phone}
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="flex items-center gap-1.5 text-neutral-700 text-xs">
                        <Globe className="h-3.5 w-3.5 text-neutral-400" /> {client.country}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 g-heading text-base font-normal text-neutral-900">
                      ${client.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-xs bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-neutral-700 rounded-none">
                        {client.ordersCount} ORDERS
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-none ${
                          client.status === "vip"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : client.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : client.status === "pending"
                            ? "bg-sky-50 text-sky-700 border border-sky-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(client)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors rounded-none"
                          title="Edit Client"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(client.id)}
                          className="p-2 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-none"
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
              placeholder="e.g. Alexander Hayes"
              className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="client@example.com"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+65 9123 4567"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="Singapore"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Status Tier
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ClientStatus })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold uppercase text-neutral-900 focus:border-black focus:outline-none rounded-none"
              >
                <option value="active">Active</option>
                <option value="vip">VIP Tier</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
              Watch Preferences & Client Notes
            </label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. MARQ Captain Gen 2 owner, prefers express shipping."
              className="w-full border border-neutral-300 bg-white p-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
            />
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
              {editingClient ? "Save Changes" : "Register Client"}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
