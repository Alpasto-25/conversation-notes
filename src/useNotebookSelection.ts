import { useEffect, useState } from "react";
import type { NotebookSummary } from "./notebooks";

export function useNotebookSelection(items: NotebookSummary[]) {
  const [managing, setManaging] = useState(false), [ids, setIds] = useState<string[]>([]);
  useEffect(() => { setIds(old => old.filter(id => items.some(note => note.id === id))); }, [items]);
  const selected = items.filter(note => ids.includes(note.id));
  return { managing, selected, checked: (id: string) => ids.includes(id),
    toggle: (id: string) => setIds(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]),
    toggleMode: () => { setManaging(old => !old); setIds([]); },
    selectAll: (notes: NotebookSummary[]) => setIds(notes.map(note => note.id)), clear: () => setIds([]) };
}
