//! WebSocket Bridge for /api/remote.mux
//!
//! Provides a bidirectional multiplexed streaming bridge between the Webview UI
//! and the Node daemon. Handles authentication cookies and bypasses browser
//! CORS / cross-origin origin fences safely on loopback.

use std::sync::Arc;
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::client::IntoClientRequest};
use tracing::{info, warn};

#[derive(Clone)]
pub struct WsBridge {
    tx: Arc<Mutex<Option<mpsc::UnboundedSender<String>>>>,
}

impl WsBridge {
    pub fn new() -> Self {
        Self {
            tx: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn is_connected(&self) -> bool {
        self.tx.lock().await.is_some()
    }

    pub async fn send(&self, msg: String) -> Result<(), String> {
        let guard = self.tx.lock().await;
        if let Some(tx) = &*guard {
            tx.send(msg).map_err(|e| format!("Failed to send WS message: {e}"))?;
            Ok(())
        } else {
            Err("WebSocket bridge is not connected".to_string())
        }
    }

    pub async fn connect(&self, app: AppHandle, port: u16, cookie: Option<String>) -> Result<(), String> {
        {
            let guard = self.tx.lock().await;
            if guard.is_some() {
                return Ok(()); // already connected
            }
        }

        let url = format!("ws://127.0.0.1:{port}/api/remote.mux");
        let mut req = url.clone().into_client_request().map_err(|e| format!("Invalid WS request: {e}"))?;
        if let Some(c) = cookie {
            if let Ok(val) = c.parse() {
                req.headers_mut().insert("cookie", val);
            }
        }
        req.headers_mut().insert("host", format!("127.0.0.1:{port}").parse().unwrap());

        info!("Connecting WebSocket bridge to {url}");
        let (ws_stream, _) = connect_async(req)
            .await
            .map_err(|e| format!("WS connect failed: {e}"))?;

        let (mut write, mut read) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        {
            let mut guard = self.tx.lock().await;
            *guard = Some(tx);
        }

        let tx_holder = Arc::clone(&self.tx);
        let app_handle = app.clone();

        // Spawn writer loop
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                let ws_msg = tokio_tungstenite::tungstenite::Message::text(msg);
                if let Err(e) = write.send(ws_msg).await {
                    warn!("WS bridge write error: {e}");
                    break;
                }
            }
        });

        // Spawn reader loop
        tokio::spawn(async move {
            while let Some(msg_res) = read.next().await {
                match msg_res {
                    Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                        let _ = app_handle.emit("dsh://ws-message", text.to_string());
                    }
                    Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                        info!("WS bridge closed by server");
                        break;
                    }
                    Err(e) => {
                        warn!("WS bridge read error: {e}");
                        break;
                    }
                    _ => {}
                }
            }
            let mut guard = tx_holder.lock().await;
            *guard = None;
        });

        Ok(())
    }
}

impl Default for WsBridge {
    fn default() -> Self {
        Self::new()
    }
}
