import { NoteMetadata } from "../types";

// Arbre des dossiers et des notes de la barre latérale.

// ─── Tree types ───────────────────────────────────────────────────────────────

export interface TreeFolder {
  name: string;
  path: string;
  children: TreeFolder[];
  notes: NoteMetadata[];
}

export function ensurePath(root: TreeFolder, path: string): TreeFolder {
  const parts = path.split("/").filter(Boolean);
  let cur = root;
  let curPath = "";
  for (const part of parts) {
    curPath = curPath ? `${curPath}/${part}` : part;
    let child = cur.children.find((c) => c.name === part);
    if (!child) {
      child = { name: part, path: curPath, children: [], notes: [] };
      cur.children.push(child);
    }
    cur = child;
  }
  return cur;
}

export function buildTree(
  notes: NoteMetadata[],
  folders: string[],
  query: string
): { root: TreeFolder; rootNotes: NoteMetadata[] } {
  const root: TreeFolder = { name: "", path: "", children: [], notes: [] };

  for (const f of folders) ensurePath(root, f);

  const filtered = query
    ? notes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    : notes;

  const rootNotes: NoteMetadata[] = [];
  for (const note of filtered) {
    if (!note.folder) rootNotes.push(note);
    else ensurePath(root, note.folder).notes.push(note);
  }

  root.children.sort((a, b) => a.name.localeCompare(b.name));
  return { root, rootNotes };
}
