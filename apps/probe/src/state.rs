use std::sync::Mutex;

use crate::detections::Detection;

/// What the probe is currently telling Frigate it sees.
///
/// Counted in frames rather than seconds: Frigate asks once per analysed
/// frame, so a frame count is the honest unit — it survives a camera running
/// at a different rate, and a wall-clock window would not.
#[derive(Debug, Default)]
pub struct Pending {
    pub detections: Vec<Detection>,
    pub frames_left: u32,
}

#[derive(Debug, Default)]
pub struct ProbeState {
    pending: Mutex<Pending>,
    /// Frames served since start, so a caller can prove Frigate is asking.
    served: Mutex<u64>,
}

impl ProbeState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Arms the probe to report `detections` for the next `frames` requests.
    pub fn arm(&self, detections: Vec<Detection>, frames: u32) {
        let mut pending = self.pending.lock().unwrap();
        pending.detections = detections;
        pending.frames_left = frames;
    }

    pub fn clear(&self) {
        let mut pending = self.pending.lock().unwrap();
        pending.detections.clear();
        pending.frames_left = 0;
    }

    /// Takes what to report for one frame, counting it down.
    ///
    /// Returning empty once the count runs out is what ends the event: Frigate
    /// keeps the object alive while it is still being detected, and closes the
    /// event when it stops appearing.
    pub fn take_frame(&self) -> Vec<Detection> {
        *self.served.lock().unwrap() += 1;

        let mut pending = self.pending.lock().unwrap();
        if pending.frames_left == 0 {
            return Vec::new();
        }

        pending.frames_left -= 1;
        let detections = pending.detections.clone();
        if pending.frames_left == 0 {
            pending.detections.clear();
        }
        detections
    }

    pub fn snapshot(&self) -> (u32, u64) {
        let frames_left = self.pending.lock().unwrap().frames_left;
        let served = *self.served.lock().unwrap();
        (frames_left, served)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_nothing_until_armed() {
        let state = ProbeState::new();
        assert!(state.take_frame().is_empty());
    }

    #[test]
    fn serves_exactly_the_requested_frames() {
        let state = ProbeState::new();
        state.arm(vec![Detection::centered(0.0, 0.9)], 3);

        assert_eq!(state.take_frame().len(), 1);
        assert_eq!(state.take_frame().len(), 1);
        assert_eq!(state.take_frame().len(), 1);
        // The object stops appearing, which is what closes the Frigate event.
        assert!(state.take_frame().is_empty());
    }

    #[test]
    fn clear_stops_an_armed_run_early() {
        let state = ProbeState::new();
        state.arm(vec![Detection::centered(0.0, 0.9)], 100);
        state.clear();
        assert!(state.take_frame().is_empty());
    }

    #[test]
    fn arming_again_replaces_the_previous_run() {
        let state = ProbeState::new();
        state.arm(vec![Detection::centered(0.0, 0.5)], 100);
        state.arm(vec![Detection::centered(1.0, 0.8)], 1);

        let frame = state.take_frame();
        assert_eq!(frame.len(), 1);
        assert_eq!(frame[0].class_id, 1.0);
        assert!(state.take_frame().is_empty());
    }

    #[test]
    fn counts_every_frame_frigate_asks_for() {
        let state = ProbeState::new();
        state.take_frame();
        state.take_frame();

        let (frames_left, served) = state.snapshot();
        assert_eq!(frames_left, 0);
        // Proves Frigate is actually polling, even when nothing is armed.
        assert_eq!(served, 2);
    }
}
