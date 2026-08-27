"""
Automated Verification Test Suite for Floating Waste Engine
------------------------------------------------------------
Tests WaterSurfaceDetector, FloatingWasteEngine (Zero-detection rule,
class-agnostic labeling, confidence tiering), and FloatingWasteTracker.
"""

import unittest
import numpy as np
import cv2

from water_surface_engine import (
    WaterSurfaceDetector,
    FloatingWasteEngine,
    FloatingWasteTracker
)


class TestFloatingWasteEngine(unittest.TestCase):

    def setUp(self):
        self.engine = FloatingWasteEngine(conf_low=0.40, conf_high=0.60)
        self.tracker = FloatingWasteTracker()

        # Synthetic Clean Water Image (Blue gradient water surface)
        self.clean_water_img = np.zeros((480, 640, 3), dtype=np.uint8)
        self.clean_water_img[:, :, 0] = 200  # Blue
        self.clean_water_img[:, :, 1] = 120  # Green
        self.clean_water_img[:, :, 2] = 40   # Red

        # Synthetic Image with Floating Waste (Clean water + textured colored objects on water)
        self.waste_img = self.clean_water_img.copy()
        # Add synthetic orange floating container with texture/text
        cv2.rectangle(self.waste_img, (250, 200), (310, 260), (0, 140, 255), -1)
        cv2.putText(self.waste_img, "CONTAINER", (252, 235), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)

        # Add synthetic green plastic bottle with texture/text
        cv2.rectangle(self.waste_img, (400, 300), (460, 350), (30, 180, 30), -1)
        cv2.circle(self.waste_img, (430, 325), 12, (255, 255, 0), -1)

    def test_water_mask_segmentation(self):
        """Test water surface detection and percentage calculation."""
        mask, metrics = WaterSurfaceDetector.detect_water_mask(self.clean_water_img)
        self.assertEqual(mask.shape, (480, 640))
        self.assertGreater(metrics["water_surface_pct"], 50.0)
        print(f"[PASS] Water Surface Segmentation Test: {metrics['water_surface_pct']}% water surface detected.")

    def test_zero_detection_on_clean_water(self):
        """Test Zero-Detection Rule on clean water surface."""
        raw_dets = []  # Model detects zero objects
        processed, analytics, rejected = self.engine.process_detections(raw_dets, self.clean_water_img)

        self.assertEqual(len(processed), 0)
        self.assertEqual(analytics["floating_waste_status"], "No Floating Waste Detected")
        self.assertEqual(analytics["status_code"], "CLEAN")
        print("[PASS] Zero-Detection Rule Test: Returns 0 detections & 'No Floating Waste Detected' on clean water.")

    def test_floating_waste_detection_and_tiering(self):
        """Test class-agnostic floating waste detection and confidence tiering."""
        raw_dets = [
            {"box": [250, 200, 310, 260], "confidence": 0.85, "label": "plastic_bottle"},
            {"box": [400, 300, 460, 350], "confidence": 0.50, "label": "unknown_item"},
            {"box": [10, 10, 50, 50], "confidence": 0.20, "label": "low_conf_noise"},  # Should be ignored (<0.40)
            {"box": [0, 0, 640, 480], "confidence": 0.90, "label": "background"}      # Should be ignored (>60% canvas)
        ]

        processed, analytics, rejected = self.engine.process_detections(raw_dets, self.waste_img)

        self.assertEqual(len(processed), 2)
        self.assertEqual(analytics["floating_waste_status"], "Floating Waste Detected")
        self.assertEqual(analytics["high_confidence_count"], 1)
        self.assertEqual(analytics["possible_count"], 1)

        # Check labels
        labels = [d["label"] for d in processed]
        self.assertTrue(any("Floating Waste" in l for l in labels))
        self.assertTrue(any("Unknown Floating Waste" in l for l in labels))
        print(f"[PASS] Class-Agnostic & Confidence Tiering Test: {len(processed)} objects detected with correct status.")

    def test_object_tracking(self):
        """Test multi-frame video object tracking and unique ID assignment."""
        frame1_dets = [
            {"box": [250, 200, 310, 260], "confidence": 0.85, "label": "Floating Waste"},
            {"box": [400, 300, 460, 350], "confidence": 0.75, "label": "Floating Waste"}
        ]
        
        # Frame 1 update
        tracked_f1 = self.tracker.update(frame1_dets)
        self.assertEqual(len(tracked_f1), 2)
        self.assertEqual(tracked_f1[0]["track_id"], "Floating Waste #001")
        self.assertEqual(tracked_f1[1]["track_id"], "Floating Waste #002")

        # Frame 2 update (Objects slightly moved)
        frame2_dets = [
            {"box": [254, 202, 314, 262], "confidence": 0.88, "label": "Floating Waste"},
            {"box": [402, 303, 462, 353], "confidence": 0.77, "label": "Floating Waste"}
        ]
        tracked_f2 = self.tracker.update(frame2_dets)
        self.assertEqual(len(tracked_f2), 2)
        # Tracking IDs should persist!
        self.assertEqual(tracked_f2[0]["track_id"], "Floating Waste #001")
        self.assertEqual(tracked_f2[1]["track_id"], "Floating Waste #002")

        metrics = self.tracker.get_metrics()
        self.assertEqual(metrics["total_unique_count"], 2)
        print("[PASS] Live Stream Object Tracking Test: Persistent tracking IDs maintained across frames.")

    def test_large_accumulation_clustering(self):
        """Test merging dense floating garbage mat into a single Large Accumulation Region."""
        # Create image with large continuous floating waste heap (grid of adjacent boxes)
        heap_img = self.clean_water_img.copy()
        cv2.rectangle(heap_img, (100, 100), (350, 350), (40, 160, 240), -1)
        cv2.putText(heap_img, "GARBAGE MAT HEAP", (120, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        raw_dets = [
            {"box": [100, 100, 180, 180], "confidence": 0.85, "label": "plastic"},
            {"box": [160, 100, 240, 180], "confidence": 0.80, "label": "can"},
            {"box": [220, 100, 300, 180], "confidence": 0.88, "label": "foam"},
            {"box": [100, 160, 180, 240], "confidence": 0.79, "label": "bottle"},
            {"box": [160, 160, 240, 240], "confidence": 0.92, "label": "debris"},
            {"box": [220, 160, 300, 240], "confidence": 0.87, "label": "bag"},
            {"box": [100, 220, 180, 300], "confidence": 0.84, "label": "garbage"},
            {"box": [160, 220, 240, 300], "confidence": 0.90, "label": "trash"},
            {"box": [220, 220, 300, 300], "confidence": 0.86, "label": "waste"}
        ]

        processed, analytics, rejected = self.engine.process_detections(raw_dets, heap_img)

        # The 9 adjacent touching candidate boxes MUST be merged into 1 continuous Large Accumulation Region!
        self.assertEqual(len(processed), 1)
        self.assertEqual(processed[0]["detection_type"], "Large Accumulation Region")
        self.assertEqual(processed[0]["label"], "Floating Waste Accumulation (Large Mat)")
        self.assertIn("polygon", processed[0])
        print(f"[PASS] Spatial Cluster Fusion Test: 9 candidate items merged into 1 {processed[0]['detection_type']}.")

    def test_all_candidates_included_as_detections(self):
        """Test that candidate detections on/near water surface (including aquatic vegetation and floating objects) are included as active detections."""
        land_water_img = np.zeros((480, 640, 3), dtype=np.uint8)
        land_water_img[0:200, :, 0] = 180  # Blue
        land_water_img[0:200, :, 1] = 180  # Green
        land_water_img[0:200, :, 2] = 180  # Red
        land_water_img[200:480, :, 0] = 200 # Blue
        land_water_img[200:480, :, 1] = 120 # Green
        land_water_img[200:480, :, 2] = 40  # Red

        cv2.rectangle(land_water_img, (50, 210), (110, 270), (20, 80, 140), -1)
        cv2.putText(land_water_img, "BRANCH", (52, 245), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)

        cv2.rectangle(land_water_img, (200, 210), (260, 270), (10, 40, 90), -1)
        cv2.putText(land_water_img, "PLANT", (202, 245), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)

        cv2.rectangle(land_water_img, (300, 320), (360, 380), (0, 140, 255), -1)
        cv2.putText(land_water_img, "BOTTLE", (302, 355), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)

        raw_dets = [
            {"box": [50, 210, 110, 270], "confidence": 0.62, "label": "branch"},
            {"box": [200, 210, 260, 270], "confidence": 0.70, "label": "water_hyacinth"},
            {"box": [300, 320, 360, 380], "confidence": 0.85, "label": "plastic_bottle"}
        ]

        processed, analytics, rejected = self.engine.process_detections(raw_dets, land_water_img)

        # Candidate detections on/near water surface MUST be included as detections!
        self.assertEqual(len(processed), 3)
        raw_labels = [d["raw_label"] for d in processed]
        self.assertIn("branch", raw_labels)
        self.assertIn("water_hyacinth", raw_labels)
        self.assertIn("plastic_bottle", raw_labels)
        print(f"[PASS] All Candidates Detection Test: All {len(processed)} candidate items accepted as detections.")


if __name__ == "__main__":
    unittest.main()
