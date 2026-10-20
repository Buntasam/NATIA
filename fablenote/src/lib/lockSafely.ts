import { useStore } from "../store";
import { callSaveNow } from "../components/CloseOverlay";

// Enregistre la note en cours avant de verrouiller : une fois la clé effacée,
// plus aucune sauvegarde n'est possible. Le backend laisse 5 s avant de forcer.
export async function lockSafely(): Promise<void> {
  const st = useStore.getState();
  if (!st.hasPassword || st.isLocked) return;
  callSaveNow();
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      if (!useStore.getState().isSaving) { resolve(); return; }
      const check = setInterval(() => {
        if (!useStore.getState().isSaving) { clearInterval(check); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(check); resolve(); }, 3000);
    }, 100);
  });
  await useStore.getState().lock();
}
