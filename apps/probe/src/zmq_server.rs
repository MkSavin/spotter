use std::sync::Arc;

use zeromq::{RepSocket, Socket, SocketRecv, SocketSend, ZmqMessage};

use crate::detections::encode;
use crate::state::ProbeState;

/// Whether a request frame is the model handshake rather than a frame to score.
///
/// Frigate asks once at startup whether the detector has its model, and refuses
/// to run inference until that is answered. We have no model — we are not
/// running one — so we always say it is ready.
fn is_model_request(header: &serde_json::Value) -> bool {
    header
        .get("model_request")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

const MODEL_READY: &str = r#"{"model_available":true,"model_loaded":true}"#;

/// Serves Frigate's `zmq_ipc` detector plugin over REQ/REP.
///
/// The protocol is two frames in (`header_json`, `tensor_bytes`) and one out:
/// a flat 20x6 float32 buffer. We ignore the tensor entirely — the point is to
/// decide what Frigate "sees" without running a model.
pub async fn serve(endpoint: &str, state: Arc<ProbeState>) -> Result<(), zeromq::ZmqError> {
    let mut socket = RepSocket::new();
    socket.bind(endpoint).await?;
    println!("probe: zmq listening on {endpoint}");

    loop {
        let message: ZmqMessage = socket.recv().await?;

        let header: serde_json::Value = message
            .get(0)
            .and_then(|frame| serde_json::from_slice(frame).ok())
            .unwrap_or(serde_json::Value::Null);

        if is_model_request(&header) {
            socket.send(MODEL_READY.into()).await?;
            println!("probe: model handshake answered");
            continue;
        }

        let detections = state.take_frame();
        socket.send(ZmqMessage::from(encode(&detections))).await?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_the_model_handshake() {
        let header = serde_json::json!({ "model_request": true, "model_name": "x.onnx" });
        assert!(is_model_request(&header));
    }

    #[test]
    fn an_inference_header_is_not_a_handshake() {
        let header = serde_json::json!({ "shape": [1, 320, 320, 3], "dtype": "uint8" });
        assert!(!is_model_request(&header));
    }

    #[test]
    fn a_malformed_header_is_treated_as_inference() {
        // Better to answer with zero detections than to stall the detector.
        assert!(!is_model_request(&serde_json::Value::Null));
    }

    #[test]
    fn handshake_reply_is_what_the_plugin_checks_for() {
        let parsed: serde_json::Value = serde_json::from_str(MODEL_READY).unwrap();
        assert_eq!(parsed["model_available"], true);
        assert_eq!(parsed["model_loaded"], true);
    }
}
