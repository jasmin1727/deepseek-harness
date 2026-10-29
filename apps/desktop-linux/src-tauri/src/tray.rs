//! System tray definition and event handling for DeepSeek Harness.
//!
//! Menu items
//! ----------
//! - **Show**       → reveal / focus the main window
//! - **Hide**       → hide the main window to tray
//! - **──────────** (separator)
//! - **Restart dsh** → stop and restart the `dsh web` sidecar
//! - **──────────**
//! - **Quit**       → cleanly exit

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tracing::info;

use crate::sidecar::DshSidecar;

/// Build the tray icon and wire up its event handler.
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let restart = MenuItem::with_id(app, "restart_dsh", "Restart dsh", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &hide, &separator1, &restart, &separator2, &quit])?;

    TrayIconBuilder::with_id("main")
        .tooltip("DeepSeek Harness")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            // Left-click → toggle window visibility
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "show" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
        "hide" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.hide();
            }
        }
        "restart_dsh" => {
            info!("User requested dsh restart via tray");
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                // Access the sidecar state we stored in app state
                if let Some(sidecar) = app.try_state::<DshSidecar>() {
                    sidecar.stop().await;
                    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
                    if let Err(e) = sidecar.start(app.clone()).await {
                        tracing::error!("Failed to restart dsh: {e}");
                    } else {
                        // Reload the webview after a short grace period
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval("window.location.reload()");
                        }
                    }
                }
            });
        }
        "quit" => {
            info!("Quit requested via tray");
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(sidecar) = app.try_state::<DshSidecar>() {
                    sidecar.stop().await;
                }
                app.exit(0);
            });
        }
        _ => {}
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}
