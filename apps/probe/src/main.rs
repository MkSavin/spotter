//! Stub object detector that drives a real Frigate.
//!
//! Frigate has no hook for creating an event, but it does have a supported
//! detector plugin (`zmq_ipc`) that asks an external process what is in each
//! frame. We answer that question on demand, so the NVR itself does the
//! tracking, the recording, the severity and the MQTT publishing — the whole
//! path our own test commands skip.
//!
//! This exists because the hop between the NVR and our adapter is covered by
//! nothing, and that is precisely the hop that went silent in production.

mod detections;
mod http_api;
mod state;
mod zmq_server;

use std::sync::Arc;

use state::ProbeState;

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let zmq_endpoint = env_or("PROBE_ZMQ_ENDPOINT", "tcp://0.0.0.0:5555");
    let http_addr = env_or("PROBE_HTTP_ADDR", "0.0.0.0:8080");

    let state = Arc::new(ProbeState::new());

    let zmq_state = Arc::clone(&state);
    let zmq = tokio::spawn(async move {
        if let Err(error) = zmq_server::serve(&zmq_endpoint, zmq_state).await {
            eprintln!("probe: zmq server stopped: {error}");
        }
    });

    let http_state = Arc::clone(&state);
    let http = tokio::spawn(async move {
        if let Err(error) = http_api::serve(&http_addr, http_state).await {
            eprintln!("probe: http server stopped: {error}");
        }
    });

    // Either half dying makes the probe useless, so the process goes with it
    // rather than sitting half-alive and looking healthy.
    tokio::select! {
        _ = zmq => {},
        _ = http => {},
    }

    Ok(())
}
