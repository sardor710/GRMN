"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CMSProduct } from "@/lib/cms/types";
import type { TaxonomyNode } from "@/contracts/admin-catalog";
import {
  applyImportedDraft,
  blankForm,
  buildCommand,
  describeSaveError,
  formFromPayload,
  formSignature,
  shouldLoadProduct,
  type EditorForm,
  type RawPayload,
  type SaveError,
} from "./editor-state";
import { newId } from "./shared";

// One hook owns the whole editor state; every tab receives `editor` and edits through `update`.
export type EditorTab = "general" | "media" | "variants" | "specs" | "overview" | "box" | "accessories" | "seo";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

export function useProductEditorState(productKey: string | null) {
  const [load, setLoad] = useState<LoadState>(productKey ? { status: "loading" } : { status: "ready" });
  const [base, setBase] = useState<RawPayload>({});
  const [form, setForm] = useState<EditorForm>(blankForm);
  const [snapshot, setSnapshot] = useState(() => formSignature(blankForm()));
  const [key, setKey] = useState<string | null>(productKey);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  // The key a create just adopted from its response (no refetch for it), and a guard against a second
  // save request while one is in flight (the create API has no idempotency key).
  const adoptedKey = useRef<string | null>(null);
  const saveInFlight = useRef(false);
  useEffect(() => {
    if (!key || !shouldLoadProduct(key, adoptedKey.current)) { adoptedKey.current = null; return; }
    let active = true;
    setLoad({ status: "loading" });
    fetch(`/api/admin/catalog/products/${encodeURIComponent(key)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { product?: RawPayload } | null;
        if (!response.ok || !body?.product) throw new Error(response.status === 404 ? "This product no longer exists." : response.status === 401 ? "Your admin session expired. Sign in again." : `The product could not be loaded (HTTP ${response.status}).`);
        if (!active) return;
        const next = formFromPayload(body.product, newId);
        setBase(body.product);
        setForm(next);
        setSnapshot(formSignature(next));
        setSaveError(null);
        setLoad({ status: "ready" });
      })
      .catch((error: unknown) => { if (active) setLoad({ status: "error", message: error instanceof Error ? error.message : "The product could not be loaded." }); });
    return () => { active = false; };
  }, [key, revision]);

  const update = useCallback((patch: Partial<EditorForm> | ((previous: EditorForm) => EditorForm)) => {
    setForm((previous) => (typeof patch === "function" ? patch(previous) : { ...previous, ...patch }));
  }, []);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  const importDraft = useCallback((draft: Partial<CMSProduct>, taxonomy: readonly TaxonomyNode[] | null) => {
    setForm((previous) => applyImportedDraft(previous, draft, taxonomy));
    setSaveError(null);
  }, []);

  const save = useCallback(async (): Promise<RawPayload | null> => {
    if (saveInFlight.current) return null; // a double click or second shortcut press while saving
    saveInFlight.current = true;
    const isNew = !key;
    const command = buildCommand(base, form, isNew);
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(isNew ? "/api/admin/catalog/products" : `/api/admin/catalog/products/${encodeURIComponent(key)}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = (await response.json().catch(() => null)) as { product?: RawPayload } | null;
      if (!response.ok || !body?.product) {
        setSaveError(describeSaveError(response.status, body));
        return null;
      }
      const next = formFromPayload(body.product, newId);
      setBase(body.product);
      setForm(next);
      setSnapshot(formSignature(next));
      setSavedAt(Date.now());
      // The response is the stored payload (now the base): adopt its key without refetching it.
      if (isNew && typeof body.product.id === "string") { adoptedKey.current = body.product.id; setKey(body.product.id); }
      return body.product;
    } catch {
      setSaveError(describeSaveError(0, null));
      return null;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [base, form, key]);

  const signature = useMemo(() => formSignature(form), [form]);
  const dirty = load.status === "ready" && signature !== snapshot;

  return {
    productKey: key,
    isNew: !key,
    load,
    base,
    form,
    update,
    dirty,
    saving,
    saveError,
    setSaveError,
    savedAt,
    save,
    reload,
    importDraft,
    version: typeof base.version === "number" ? base.version : null,
  };
}

export type ProductEditorState = ReturnType<typeof useProductEditorState>;
