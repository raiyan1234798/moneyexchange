"use client";

import { useCallback, useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataTableColumn } from "@/components/shared/page-elements";

export function SortableDataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data",
  mobileTitle,
  onReorder,
  reorderDisabled,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  mobileTitle?: (row: T) => string;
  onReorder: (ordered: T[]) => void;
  reorderDisabled?: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const applyReorder = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= data.length || to >= data.length) return;
      const next = [...data];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
    },
    [data, onReorder],
  );

  const handleDrop = useCallback(
    (dropIndex: number) => {
      if (dragIndex === null) return;
      applyReorder(dragIndex, dropIndex);
      setDragIndex(null);
      setOverIndex(null);
    },
    [applyReorder, dragIndex],
  );

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const dragHandle = (index: number) =>
    reorderDisabled ? null : (
      <button
        type="button"
        draggable
        aria-label="Drag to reorder"
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted/60 active:cursor-grabbing"
        onDragStart={(e) => {
          setDragIndex(index);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
        }}
        onDragEnd={() => {
          setDragIndex(null);
          setOverIndex(null);
        }}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    );

  return (
    <>
      <div className="space-y-3 md:hidden">
        {data.map((row, index) => (
          <div
            key={keyExtractor(row)}
            draggable={!reorderDisabled}
            onDragStart={(e) => {
              // Dragging inside a form control (e.g. the seconds input) must
              // edit the field, not pick up the whole row.
              if ((e.target as HTMLElement).closest("input, textarea, select, button")) {
                e.preventDefault();
                return;
              }
              if (!reorderDisabled) setDragIndex(index);
            }}
            onDragOver={(e) => {
              if (reorderDisabled) return;
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              if (reorderDisabled) return;
              e.preventDefault();
              handleDrop(index);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={cn(
              "glass-panel-soft space-y-2.5 p-4",
              dragIndex === index && "opacity-50",
              overIndex === index && dragIndex !== null && dragIndex !== index && "ring-2 ring-primary/40",
            )}
          >
            <div className="flex items-center gap-2">
              {dragHandle(index)}
              {mobileTitle ? <p className="min-w-0 flex-1 font-semibold">{mobileTitle(row)}</p> : null}
            </div>
            {columns
              .filter((col) => !col.hideOnMobile)
              .map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 text-muted-foreground">{col.header}</span>
                  <span className={cn("text-right", col.className)}>{col.cell(row)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="data-table-scroll hidden md:block">
        <table className="w-full table-fixed caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {!reorderDisabled ? (
                <th className="h-10 w-10 px-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="sr-only">Reorder</span>
                </th>
              ) : null}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-10 px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    col.width,
                    col.headerClassName ?? col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={keyExtractor(row)}
                draggable={!reorderDisabled}
                onDragStart={(e) => {
                  // Text-selection drags inside inputs must not lift the row.
                  if ((e.target as HTMLElement).closest("input, textarea, select, button")) {
                    e.preventDefault();
                    return;
                  }
                  if (!reorderDisabled) setDragIndex(index);
                }}
                onDragOver={(e) => {
                  if (reorderDisabled) return;
                  e.preventDefault();
                  setOverIndex(index);
                }}
                onDrop={(e) => {
                  if (reorderDisabled) return;
                  e.preventDefault();
                  handleDrop(index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={cn(
                  "h-11 border-b border-border/25 transition-colors hover:bg-muted/30",
                  dragIndex === index && "opacity-50",
                  overIndex === index && dragIndex !== null && dragIndex !== index && "bg-primary/5",
                )}
              >
                {!reorderDisabled ? (
                  <td className="w-10 px-2 py-2 align-middle">{dragHandle(index)}</td>
                ) : null}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "overflow-hidden px-3 py-2 align-middle text-sm",
                      col.width,
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
