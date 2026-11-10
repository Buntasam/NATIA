import { invoke } from "@tauri-apps/api/core";

// Fichiers joints (voir src-tauri/src/attachments.rs).

export interface AddedAttachment { id: string; name: string; size: number }

/** Même limite que côté Rust : évite d'envoyer 2 Go pour se faire refuser. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** Lit le texte des nouveaux fichiers (PDF…) en arrière-plan, pour la recherche. */
export function indexAttachments() {
  invoke("index_attachments").catch(() => {});
}

/** Joint des fichiers choisis dans la fenêtre de sélection. */
export async function attachPaths(noteId: string, paths: string[]): Promise<AddedAttachment[]> {
  const added = await invoke<AddedAttachment[]>("add_attachments", { noteId, paths });
  indexAttachments();
  return added;
}

/** Joint des fichiers glissés dans la note (le contenu part brut, sans passer par JSON). */
export async function attachFiles(noteId: string, files: File[]): Promise<AddedAttachment[]> {
  const tooBig = files.find((f) => f.size > MAX_ATTACHMENT_BYTES);
  // Même message que le Rust : trError() le traduit.
  if (tooBig) throw `${tooBig.name} : fichier trop gros (100 Mo maximum)`;
  const added: AddedAttachment[] = [];
  for (const file of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    added.push(await invoke<AddedAttachment>("add_attachment_data", data, {
      headers: { "x-note-id": noteId, "x-file-name": encodeURIComponent(file.name) },
    }));
  }
  indexAttachments();
  return added;
}
