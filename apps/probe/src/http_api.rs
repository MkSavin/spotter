use std::sync::Arc;

use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::detections::Detection;
use crate::state::ProbeState;

/// How many frames a detection runs for unless the caller says otherwise.
///
/// Frigate needs an object to persist across several frames before it treats it
/// as tracked; a single frame is discarded as noise.
const DEFAULT_FRAMES: u32 = 30;

#[derive(Debug, Deserialize)]
pub struct DetectRequest {
    /// Model label index. Defaults to 0, which is `person` in the usual models.
    #[serde(default)]
    pub class_id: f32,
    #[serde(default = "default_score")]
    pub score: f32,
    #[serde(default = "default_frames")]
    pub frames: u32,
    /// Explicit box; omitted means a person-sized one mid-frame.
    #[serde(default)]
    pub box_: Option<[f32; 4]>,
}

fn default_score() -> f32 {
    0.9
}

fn default_frames() -> u32 {
    DEFAULT_FRAMES
}

impl DetectRequest {
    pub fn into_detection(self) -> Detection {
        match self.box_ {
            Some([y_min, x_min, y_max, x_max]) => Detection {
                class_id: self.class_id,
                score: self.score,
                y_min,
                x_min,
                y_max,
                x_max,
            },
            None => Detection::centered(self.class_id, self.score),
        }
    }
}

/// Splits a raw HTTP request into its method, path and body.
///
/// Hand-rolled rather than pulling in a web framework: this serves three
/// endpoints for a test tool, and a framework would cost more in build time and
/// image size than the parsing saves.
pub fn parse_request(raw: &str) -> Option<(String, String, String)> {
    let (head, body) = raw.split_once("\r\n\r\n").unwrap_or((raw, ""));
    let mut lines = head.lines();
    let mut parts = lines.next()?.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    Some((method, path, body.to_string()))
}

fn response(status: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    )
}

pub fn handle(method: &str, path: &str, body: &str, state: &ProbeState) -> String {
    match (method, path) {
        ("GET", "/health") => {
            let (frames_left, served) = state.snapshot();
            response(
                "200 OK",
                &format!(r#"{{"ok":true,"framesLeft":{frames_left},"framesServed":{served}}}"#),
            )
        }
        ("POST", "/detect") => match serde_json::from_str::<DetectRequest>(body) {
            Ok(request) => {
                let frames = request.frames;
                state.arm(vec![request.into_detection()], frames);
                response("200 OK", &format!(r#"{{"ok":true,"frames":{frames}}}"#))
            }
            Err(error) => response(
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":"{error}"}}"#),
            ),
        },
        ("POST", "/clear") => {
            state.clear();
            response("200 OK", r#"{"ok":true}"#)
        }
        _ => response("404 Not Found", r#"{"ok":false,"error":"not found"}"#),
    }
}

pub async fn serve(addr: &str, state: Arc<ProbeState>) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    println!("probe: http listening on {addr}");

    loop {
        let (mut socket, _) = listener.accept().await?;
        let state = Arc::clone(&state);

        tokio::spawn(async move {
            let mut buffer = vec![0u8; 8192];
            let read = match socket.read(&mut buffer).await {
                Ok(0) | Err(_) => return,
                Ok(read) => read,
            };

            let raw = String::from_utf8_lossy(&buffer[..read]);
            let reply = match parse_request(&raw) {
                Some((method, path, body)) => handle(&method, &path, &body, &state),
                None => response("400 Bad Request", r#"{"ok":false,"error":"bad request"}"#),
            };

            let _ = socket.write_all(reply.as_bytes()).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_post_with_a_body() {
        let raw = "POST /detect HTTP/1.1\r\nhost: x\r\n\r\n{\"score\":0.5}";
        let (method, path, body) = parse_request(raw).unwrap();
        assert_eq!(method, "POST");
        assert_eq!(path, "/detect");
        assert_eq!(body, "{\"score\":0.5}");
    }

    #[test]
    fn parses_a_get_without_a_body() {
        let (method, path, body) = parse_request("GET /health HTTP/1.1\r\n\r\n").unwrap();
        assert_eq!(method, "GET");
        assert_eq!(path, "/health");
        assert!(body.is_empty());
    }

    #[test]
    fn detect_arms_the_state() {
        let state = ProbeState::new();
        let reply = handle("POST", "/detect", r#"{"frames":2}"#, &state);

        assert!(reply.starts_with("HTTP/1.1 200"));
        assert_eq!(state.take_frame().len(), 1);
        assert_eq!(state.take_frame().len(), 1);
        assert!(state.take_frame().is_empty());
    }

    #[test]
    fn detect_defaults_to_a_usable_run() {
        let state = ProbeState::new();
        handle("POST", "/detect", "{}", &state);

        let (frames_left, _) = state.snapshot();
        // A single frame would be discarded by Frigate as noise.
        assert_eq!(frames_left, DEFAULT_FRAMES);
    }

    #[test]
    fn detect_honours_an_explicit_box() {
        let state = ProbeState::new();
        handle("POST", "/detect", r#"{"box_":[0.1,0.2,0.3,0.4]}"#, &state);

        let frame = state.take_frame();
        assert_eq!(frame[0].y_min, 0.1);
        assert_eq!(frame[0].x_max, 0.4);
    }

    #[test]
    fn malformed_json_is_a_400_not_a_panic() {
        let state = ProbeState::new();
        let reply = handle("POST", "/detect", "{not json", &state);
        assert!(reply.starts_with("HTTP/1.1 400"));
    }

    #[test]
    fn clear_disarms() {
        let state = ProbeState::new();
        handle("POST", "/detect", r#"{"frames":50}"#, &state);
        handle("POST", "/clear", "", &state);
        assert!(state.take_frame().is_empty());
    }

    #[test]
    fn health_reports_what_frigate_has_asked_for() {
        let state = ProbeState::new();
        state.take_frame();

        let reply = handle("GET", "/health", "", &state);
        // Proves the NVR is actually polling the detector, not just connected.
        assert!(reply.contains(r#""framesServed":1"#));
    }

    #[test]
    fn unknown_paths_are_404() {
        let state = ProbeState::new();
        assert!(handle("GET", "/nope", "", &state).starts_with("HTTP/1.1 404"));
    }
}
