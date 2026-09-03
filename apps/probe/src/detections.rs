use serde::Deserialize;

/// Frigate reads exactly 20 rows of 6 floats back from a detector.
pub const MAX_DETECTIONS: usize = 20;
pub const ROW_FLOATS: usize = 6;
pub const REPLY_BYTES: usize = MAX_DETECTIONS * ROW_FLOATS * 4;

/// One object to pretend is in frame.
///
/// `class_id` indexes the model's own label file, so it only means "person" if
/// the deployed model says so — the caller picks it, we never guess.
#[derive(Debug, Clone, Deserialize)]
pub struct Detection {
    pub class_id: f32,
    pub score: f32,
    /// Normalised 0..1, in Frigate's own order.
    pub y_min: f32,
    pub x_min: f32,
    pub y_max: f32,
    pub x_max: f32,
}

impl Detection {
    /// A person-sized box in the middle of frame — the common case, so the
    /// caller can ask for a detection without inventing coordinates.
    pub fn centered(class_id: f32, score: f32) -> Self {
        Self {
            class_id,
            score,
            y_min: 0.30,
            x_min: 0.35,
            y_max: 0.85,
            x_max: 0.65,
        }
    }
}

/// Packs detections into the fixed 20x6 float32 buffer Frigate expects.
///
/// Rows past the ones given stay zero: Frigate reads the whole array every
/// time and treats a zero row as "nothing here", so the buffer is always the
/// same size regardless of how much was found.
pub fn encode(detections: &[Detection]) -> Vec<u8> {
    let mut out = vec![0u8; REPLY_BYTES];

    for (index, detection) in detections.iter().take(MAX_DETECTIONS).enumerate() {
        let row = [
            detection.class_id,
            detection.score,
            detection.y_min,
            detection.x_min,
            detection.y_max,
            detection.x_max,
        ];
        let offset = index * ROW_FLOATS * 4;
        for (slot, value) in row.iter().enumerate() {
            let at = offset + slot * 4;
            out[at..at + 4].copy_from_slice(&value.to_le_bytes());
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read_f32(bytes: &[u8], index: usize) -> f32 {
        f32::from_le_bytes(bytes[index * 4..index * 4 + 4].try_into().unwrap())
    }

    #[test]
    fn empty_reply_is_the_full_buffer_of_zeros() {
        // Frigate reads a fixed 20x6; a short reply is discarded as malformed.
        let bytes = encode(&[]);
        assert_eq!(bytes.len(), REPLY_BYTES);
        assert!(bytes.iter().all(|b| *b == 0));
    }

    #[test]
    fn one_detection_lands_in_the_first_row() {
        let bytes = encode(&[Detection {
            class_id: 0.0,
            score: 0.9,
            y_min: 0.1,
            x_min: 0.2,
            y_max: 0.5,
            x_max: 0.6,
        }]);

        assert_eq!(bytes.len(), REPLY_BYTES);
        assert_eq!(read_f32(&bytes, 0), 0.0);
        assert_eq!(read_f32(&bytes, 1), 0.9);
        assert_eq!(read_f32(&bytes, 2), 0.1);
        assert_eq!(read_f32(&bytes, 3), 0.2);
        assert_eq!(read_f32(&bytes, 4), 0.5);
        assert_eq!(read_f32(&bytes, 5), 0.6);
        // Everything after the first row must stay zero.
        assert_eq!(read_f32(&bytes, 6), 0.0);
    }

    #[test]
    fn detections_past_the_limit_are_dropped_not_overflowed() {
        let many = vec![Detection::centered(0.0, 0.5); MAX_DETECTIONS + 5];
        let bytes = encode(&many);
        assert_eq!(bytes.len(), REPLY_BYTES);
    }

    #[test]
    fn centered_box_is_inside_the_frame() {
        let d = Detection::centered(0.0, 0.9);
        for value in [d.y_min, d.x_min, d.y_max, d.x_max] {
            assert!((0.0..=1.0).contains(&value));
        }
        assert!(d.y_max > d.y_min && d.x_max > d.x_min);
    }
}
