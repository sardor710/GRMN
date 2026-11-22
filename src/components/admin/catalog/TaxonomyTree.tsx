"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Star } from "lucide-react";
import type { TaxonomyNode } from "@/contracts/admin-catalog";
import { cn } from "@/lib/utils";
import { filterTaxonomyTree, type TaxonomyTreeNode } from "@/lib/admin/taxonomy-tree";

// One tree renderer for both the editor's multi-select (checkbox + primary star) and the list filter's
// single-select. Rows are dense (32 px) with a real checkbox/button per node for keyboard users.
interface BaseProps {
  roots: TaxonomyTreeNode[];
  query: string;
  /** Keys that start expanded (e.g. ancestors of selected nodes). */
  initiallyExpanded?: ReadonlySet<string>;
}
interface MultiProps extends BaseProps {
  mode: "multi";
  selected: ReadonlyMap<string, boolean>;
  onToggle: (key: string) => void;
  onPrimary: (key: string) => void;
}
interface SingleProps extends BaseProps {
  mode: "single";
  value: string;
  onSelect: (key: string) => void;
}
export type TaxonomyTreeProps = MultiProps | SingleProps;

const DEPTH_PADDING = ["pl-1", "pl-[22px]", "pl-[40px]", "pl-[58px]", "pl-[76px]", "pl-[94px]"];

function countSelected(tree: TaxonomyTreeNode, selected: ReadonlyMap<string, boolean>): number {
  return tree.children.reduce((total, child) => total + (selected.has(child.node.key) ? 1 : 0) + countSelected(child, selected), 0);
}

export function TaxonomyTree(props: TaxonomyTreeProps) {
  const { roots, query, initiallyExpanded } = props;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initiallyExpanded ?? []));
  const filtered = useMemo(() => filterTaxonomyTree(roots, query), [roots, query]);
  const searching = query.trim().length > 0;
  const isOpen = (key: string) => (searching ? filtered.expanded.has(key) || expanded.has(key) : expanded.has(key));
  const toggleOpen = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  if (!filtered.roots.length) return <p className="px-3 py-3 text-[13px] text-[#666]">{searching ? "No category matches." : "No categories."}</p>;

  const renderNode = (tree: TaxonomyTreeNode) => {
    const { node } = tree;
    const open = isOpen(node.key);
    const hasChildren = tree.children.length > 0;
    const pad = DEPTH_PADDING[Math.min(tree.depth, DEPTH_PADDING.length - 1)];
    let control: React.ReactNode;
    let trailing: React.ReactNode = null;
    if (props.mode === "multi") {
      const checked = props.selected.has(node.key);
      const primary = props.selected.get(node.key) === true;
      const inside = !open && hasChildren ? countSelected(tree, props.selected) : 0;
      control = (
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => props.onToggle(node.key)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded-none border-2 border-[#737373] accent-black"
          />
          <span className={cn("truncate text-[13px]", checked ? "font-medium text-black" : "text-[#333]")}>{node.name}</span>
          {inside > 0 && <span className="shrink-0 text-[11px] text-[#666]">{inside} selected inside</span>}
        </label>
      );
      if (checked) {
        trailing = (
          <button
            type="button"
            onClick={() => props.onPrimary(node.key)}
            aria-pressed={primary}
            aria-label={primary ? `${node.name} is the primary category` : `Make ${node.name} the primary category`}
            title={primary ? "Primary category (breadcrumbs follow it)" : "Make primary"}
            className={cn(
              "mr-1 inline-flex h-7 shrink-0 items-center gap-1 px-1.5 text-[11px] uppercase tracking-[0.04em] focus-visible:outline-2 focus-visible:outline-black",
              primary ? "text-black" : "text-[#999] hover:text-black",
            )}
          >
            <Star className={cn("h-3.5 w-3.5", primary && "fill-[#f0b800] text-[#b38900]")} aria-hidden="true" />
            {primary && <span>Primary</span>}
          </button>
        );
      }
    } else {
      const active = props.value === node.key;
      control = (
        <button
          type="button"
          onClick={() => props.onSelect(node.key)}
          aria-current={active || undefined}
          className={cn("min-w-0 flex-1 truncate py-1.5 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-black", active ? "font-bold text-black" : "text-[#333] hover:underline")}
        >
          {node.name}
        </button>
      );
    }
    return (
      <li key={node.key} role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={props.mode === "single" ? props.value === node.key : props.selected.has(node.key)}>
        <div className={cn("flex items-center gap-1 pr-1 hover:bg-[#f5f5f5]", pad)}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleOpen(node.key)}
              aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
              className="grid h-6 w-6 shrink-0 place-items-center text-[#666] hover:text-black focus-visible:outline-2 focus-visible:outline-black"
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} aria-hidden="true" />
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" aria-hidden="true" />
          )}
          {control}
          {trailing}
        </div>
        {hasChildren && open && <ul role="group">{tree.children.map(renderNode)}</ul>}
      </li>
    );
  };

  return <ul role="tree" className="py-1">{filtered.roots.map(renderNode)}</ul>;
}

/** Keys of every ancestor of the given keys, so selected nodes start visible. */
export function expandedForKeys(nodes: readonly TaxonomyNode[], keys: readonly string[]): Set<string> {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const result = new Set<string>();
  for (const key of keys) for (let parent = byKey.get(key)?.parentKey ?? null, depth = 0; parent && depth < 32; depth++) {
    result.add(parent);
    parent = byKey.get(parent)?.parentKey ?? null;
  }
  return result;
}
