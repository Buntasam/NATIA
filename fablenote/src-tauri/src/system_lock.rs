//! Verrouille NATIA quand la session Windows se verrouille ou que le PC sort de veille.
//!
//! Le thread prévient d'abord l'interface (événement `system-lock`) pour qu'elle
//! enregistre la note en cours puis verrouille. Si elle ne l'a pas fait après
//! `GRACE`, la clé est effacée d'office.

use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use zeroize::Zeroize;

use crate::AppState;

pub const LOCK_EVENT: &str = "system-lock";
const POLL: Duration = Duration::from_secs(1);
const GRACE: Duration = Duration::from_secs(5);
const RESUME_THRESHOLD_MS: u64 = 2_000;

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut was_locked = false;
        let mut last_sleep = win::total_sleep_ms();
        loop {
            std::thread::sleep(POLL);
            let locked = win::session_locked();
            let sleep = win::total_sleep_ms();
            let resumed = sleep.saturating_sub(last_sleep) > RESUME_THRESHOLD_MS;
            last_sleep = sleep;
            if (locked && !was_locked) || resumed {
                request_lock(&app);
            }
            was_locked = locked;
            enforce_grace(&app);
        }
    });
}

pub(crate) fn request_lock(app: &AppHandle) {
    let state = app.state::<AppState>();
    let unlocked = state.enc_key.lock().map(|k| k.is_some()).unwrap_or(false);
    if !unlocked { return; }
    if let Ok(mut r) = state.lock_request.lock() {
        r.get_or_insert_with(Instant::now);
    }
    let _ = app.emit(LOCK_EVENT, ());
}

fn enforce_grace(app: &AppHandle) {
    let state = app.state::<AppState>();
    let expired = state.lock_request.lock()
        .map(|r| r.is_some_and(|t| t.elapsed() >= GRACE))
        .unwrap_or(false);
    if !expired { return; }
    if let Ok(mut k) = state.enc_key.lock() {
        if let Some(ref mut key) = *k { key.zeroize(); }
        *k = None;
    }
    if let Ok(mut r) = state.lock_request.lock() { *r = None; }
    crate::notes::clear_search_cache(&state);
    crate::attachments::clear_open_copies();
    let _ = app.emit(LOCK_EVENT, ());
}

#[cfg(windows)]
mod win {
    use windows_sys::Win32::System::RemoteDesktop::{
        WTSFreeMemory, WTSQuerySessionInformationW, WTSSessionInfoEx, WTSINFOEXW,
        WTS_CURRENT_SERVER_HANDLE, WTS_CURRENT_SESSION, WTS_SESSIONSTATE_LOCK,
    };
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::System::WindowsProgramming::QueryUnbiasedInterruptTime;

    pub fn session_locked() -> bool {
        unsafe {
            let mut buf: windows_sys::core::PWSTR = std::ptr::null_mut();
            let mut len = 0u32;
            let ok = WTSQuerySessionInformationW(
                WTS_CURRENT_SERVER_HANDLE, WTS_CURRENT_SESSION, WTSSessionInfoEx, &mut buf, &mut len,
            );
            if ok == 0 || buf.is_null() { return false; }
            let locked = (len as usize) >= std::mem::size_of::<WTSINFOEXW>() && {
                let info = &*(buf as *const WTSINFOEXW);
                info.Level == 1 && info.Data.WTSInfoExLevel1.SessionFlags as u32 == WTS_SESSIONSTATE_LOCK
            };
            WTSFreeMemory(buf as _);
            locked
        }
    }

    /// Temps cumulé passé en veille depuis le démarrage : horloge incluant la veille
    /// moins horloge l'excluant. Un saut entre deux mesures = le PC vient de se réveiller.
    pub fn total_sleep_ms() -> u64 {
        unsafe {
            let mut unbiased_100ns = 0u64;
            if QueryUnbiasedInterruptTime(&mut unbiased_100ns) == 0 { return 0; }
            GetTickCount64().saturating_sub(unbiased_100ns / 10_000)
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn session_locked() -> bool { false }
    pub fn total_sleep_ms() -> u64 { 0 }
}
