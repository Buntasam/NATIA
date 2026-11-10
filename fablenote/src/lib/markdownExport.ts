import { invoke } from "@tauri-apps/api/core";
import { htmlToMarkdown } from "./noteExport";
import type { Note, NoteMetadata } from "../types";

// Export de toutes les notes en Markdown (src-tauri/src/md_export.rs) : un fichier .md par
// note dans ses dossiers, les images dans « _images », les fichiers joints dans « _fichiers ».

interface Entry { path: string; text?: string; base64?: string; attachment_id?: string }

/** Nom de fichier lisible et autorisé sous Windows. */
export function fileName(title: string, fallback: string): string {
  const clean = title.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  return (clean || fallback).slice(0, 120);
}

/** `name` s'il est libre dans `used`, sinon « name (2) », « name (3) »… (comparaison sans casse). */
export function uniqueName(name: string, ext: string, used: Set<string>): string {
  let candidate = `${name}${ext}`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

const MIME_EXT: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg", "image/bmp": ".bmp",
};

/** En-tête YAML lu par Obsidian (tags, dates). */
export function frontMatter(note: Pick<NoteMetadata, "tags" | "created_at" | "updated_at">): string {
  const lines = ["---"];
  if (note.tags.length) lines.push(`tags: [${note.tags.map((t) => JSON.stringify(t)).join(", ")}]`);
  lines.push(`created: ${note.created_at}`, `updated: ${note.updated_at}`, "---", "");
  return lines.join("\n");
}

/** Fichiers d'une note : le .md, ses images et ses fichiers joints. */
export function noteEntries(note: Note, used: Map<string, Set<string>>, untitled: string): Entry[] {
  const folder = (note.folder ?? "").split("/").filter(Boolean).map((p) => fileName(p, "_")).join("/");
  const inFolder = (sub: string) => {
    const key = `${folder}/${sub}`.toLowerCase();
    if (!used.has(key)) used.set(key, new Set());
    return used.get(key)!;
  };
  const prefix = folder ? `${folder}/` : "";
  const base = fileName(note.title, untitled);
  const md = uniqueName(base, ".md", inFolder(""));
  const extra: Entry[] = [];
  let imageN = 0;

  const body = htmlToMarkdown(note.content, {
    image: (src) => {
      const m = src.match(/^data:([^;,]+);base64,(.*)$/s);
      if (!m) return null;
      imageN += 1;
      const name = uniqueName(`${base}-${imageN}`, MIME_EXT[m[1]] ?? ".png", inFolder("_images"));
      extra.push({ path: `${prefix}_images/${name}`, base64: m[2] });
      return `_images/${name}`;
    },
    attachment: (id, fname) => {
      const dot = fname.lastIndexOf(".");
      const [stem, ext] = dot > 0 ? [fname.slice(0, dot), fname.slice(dot)] : [fname, ""];
      const name = uniqueName(fileName(stem, "fichier"), ext, inFolder("_fichiers"));
      extra.push({ path: `${prefix}_fichiers/${name}`, attachment_id: id });
      return `_fichiers/${name}`;
    },
  });
  return [{ path: `${prefix}${md}`, text: frontMatter(note) + body + "\n" }, ...extra];
}

/** Exporte toutes les notes dans un nouveau dossier de `dir` ; renvoie son chemin. */
export async function exportAllMarkdown(
  dir: string,
  notes: NoteMetadata[],
  untitled: string,
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  const target = await invoke<string>("begin_markdown_export", { dir });
  const used = new Map<string, Set<string>>();
  for (let i = 0; i < notes.length; i++) {
    onProgress(i, notes.length);
    const note = await invoke<Note>("get_note", { id: notes[i].id });
    await invoke("write_markdown_files", { entries: noteEntries(note, used, untitled) });
  }
  onProgress(notes.length, notes.length);
  return target;
}
