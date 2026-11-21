"use client";

import { useState } from "react";
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
import { useAdminCollection } from "@/hooks/useAdminCollection";
import { AdminPageControls } from "@/components/admin/AdminPageControls";
import { writeAdminRecord, archiveAdminRecord } from "@/lib/admin-collection";
import { AdminModal } from "@/components/admin/AdminModal";
import { Button, Select } from "@/components/admin/ui";

export default function AdminClientsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const collection = useAdminCollection<Client>("clients", {search, status:statusFilter});
  const {items:clients, loading} = collection;
  const fetchClients = collection.reload;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    country: collection.backend==="postgres"?"":"Singapore",
    status: "active" as ClientStatus,
    notes: "",
  });


  const handleOpenAdd = () => {
    setEditingClient(null);
    setFormData({
      name: "",
      email: "",
      phone: "",
      country: collection.backend==="postgres"?"":"Singapore",
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
    if(!confirm("Suspend this customer profile?")) return;
    try {
      const item=clients.find(item=>item.id===id); if(!item) return;
      await archiveAdminRecord(fetch,"clients",item);
      fetchClients();
    } catch(error) { collection.setError(error instanceof Error ? error.message : "Change failed"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...(editingClient ? { id: editingClient.id, ...(editingClient.version===undefined?{}:{version:editingClient.version}) } : {}),
        ...formData,
      };

      await writeAdminRecord(fetch,"clients",payload);
      setIsModalOpen(false);
      fetchClients();
    } catch (err) {
      collection.setError(err instanceof Error ? err.message : "Change failed");
    }
  };

  const filteredClients = clients;

  return (
    <div className="space-y-6">
      <AdminPageControls page={collection} />
      <p role="status" className="border border-neutral-300 bg-white p-4 text-sm text-neutral-700">{collection.backend==="postgres"?"Profile contact details are unverified. Account contacts and consent use their own workflows.":"Customer changes are unavailable. This directory is read-only."}</p>
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
          <Button variant="primary" size="md"
            type="button"
            disabled={collection.backend!=="postgres"} onClick={handleOpenAdd}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add New Client</span>
          </Button>
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
                      {client.totalSpent===undefined?"":"$"}{client.totalSpent?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? "—"}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-xs bg-neutral-100 border border-neutral-200 px-2 py-0.5 text-neutral-700 rounded-none">
                        {client.ordersCount ?? "—"} ORDERS
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
                          disabled={collection.backend!=="postgres"} onClick={() => handleOpenEdit(client)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 transition-colors rounded-none"
                          title="Edit Client"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={collection.backend!=="postgres"} onClick={() => handleDelete(client.id)}
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
        title={editingClient ? "Edit Client Profile" : "Create Customer Profile"}
        subtitle="Manage customer contact info, status tier, and purchase notes"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {collection.error&&<div role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{collection.error}<button type="button" className="ml-3 underline" onClick={()=>{setIsModalOpen(false);collection.reload();}}>Reload records</button></div>}
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
                Email Address {collection.backend==="postgres"?"(optional)":"*"}
              </label>
              <input
                type="email"
                required={collection.backend!=="postgres"}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="client@example.com"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Phone Number {collection.backend==="postgres"?"*":""}
              </label>
              <input
                type="tel"
                required={collection.backend==="postgres"}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Phone number"
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Country {collection.backend==="postgres"?"code (KZ, UZ, …)":""}
              </label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder={collection.backend==="postgres"?"KZ":"Singapore"}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Status Tier
              </label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ClientStatus })}
              >
                <option value="active">Active</option>
                <option value="vip">VIP Tier</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </Select>
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
            <Button variant="outline" size="md"
              type="button"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md"
              type="submit"
            >
              {editingClient ? "Save Changes" : "Create Profile"}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
