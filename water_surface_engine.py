"""
Water Surface Aware & Class-Agnostic Floating Waste Detection Engine
--------------------------------------------------------------------
Provides water surface segmentation, environmental false-positive filtering,
class-agnostic floating waste detection, complete-object bounding box fusion,
confidence tiering, and multi-frame object tracking.
"""

import math
import time
import numpy as np
import cv2


class WaterSurfaceDetector:
    """
    Analyzes image color (HSV/Lab) and texture gradients to segment
    the water body surface mask and extract water coverage metrics.
    """

    @staticmethod
    def detect_water_mask(img_bgr: np.ndarray) -> tuple[np.ndarray, dict]:
        """
        Generates a binary water mask (255 = water, 0 = non-water)
        and computes water surface coverage metrics.
        """
        h, w = img_bgr.shape[:2]
        total_pixels = float(h * w)

        # 1. Convert to HSV and Lab color spaces
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)

        # Extract HSV channels
        h_channel, s_channel, v_channel = cv2.split(hsv)
        l_channel, a_channel, b_channel = cv2.split(lab)

        # 2. Water detection heuristic:
        # Water bodies generally have distinct hue ranges (blue, cyan, green, brownish water),
        # low-to-moderate saturation, and smooth local texture gradient.
        # We define a broad water mask based on color + edge density.

        # Color range 1: Blue/Cyan/Greenish water (Hue 35 - 135 in OpenCV 0-180 scale)
        water_color1 = cv2.inRange(hsv, np.array([35, 10, 20]), np.array([135, 255, 245]))
        
        # Color range 2: Murky / Dark / Reflective water (Low saturation, low-to-medium brightness)
        water_color2 = cv2.inRange(hsv, np.array([0, 0, 15]), np.array([180, 110, 220]))

        # Combine candidate water regions
        candidate_water = cv2.bitwise_or(water_color1, water_color2)

        # 3. Edge density analysis:
        # Water surface generally has low edge density compared to cluttered land/trees/buildings.
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 30, 100)

        # Dilate edges to identify high-texture non-water regions
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        high_texture = cv2.dilate(edges, kernel, iterations=2)

        # Refine water mask: Keep candidate water that is not high-texture land
        water_mask = cv2.bitwise_and(candidate_water, cv2.bitwise_not(high_texture))

        # 4. Morphological clean-up
        close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        open_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))

        water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_CLOSE, close_kernel)
        water_mask = cv2.morphologyEx(water_mask, cv2.MORPH_OPEN, open_kernel)

        # If water mask is too small or failed due to unusual lighting, fallback to full image
        water_pixel_count = float(np.count_nonzero(water_mask))
        water_pct = round((water_pixel_count / total_pixels) * 100.0, 1)

        if water_pct < 10.0:
            # Fallback mask covering central region
            water_mask = np.ones((h, w), dtype=np.uint8) * 255
            water_pct = 100.0

        metrics = {
            "water_area_px": int(water_pixel_count),
            "water_surface_pct": water_pct,
            "total_pixels": int(total_pixels)
        }

        return water_mask, metrics

    @staticmethod
    def is_environmental_false_positive(crop_bgr: np.ndarray) -> bool:
        """
        Determines if a candidate box/crop is an environmental artifact
        such as sun glare, specular reflection, pure wave ripple, or foam.
        """
        if crop_bgr.size == 0:
            return True

        h, w = crop_bgr.shape[:2]

        # Convert crop to HSV
        crop_hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
        s_channel = crop_hsv[:, :, 1]
        v_channel = crop_hsv[:, :, 2]

        # 1. Sun glare check: Very high brightness (V > 240) and very low saturation (S < 30)
        glare_pixels = np.count_nonzero((v_channel > 240) & (s_channel < 30))
        glare_pct = glare_pixels / float(h * w)
        if glare_pct > 0.65:
            return True  # High confidence sun glare / reflection

        # 2. Pure water wave / ripple check: Very low color variance across crop
        std_bgr = np.std(crop_bgr, axis=(0, 1))
        if np.max(std_bgr) < 8.0 and np.mean(std_bgr) < 5.0:
            return True  # Uniform water surface texture, not an object

        return False


class FloatingWasteEngine:
    """
    Main detection logic engine for water-surface-aware, class-agnostic,
    and unknown floating waste detection.
    """

    def __init__(self, conf_low: float = 0.40, conf_high: float = 0.60):
        self.conf_low = conf_low
        self.conf_high = conf_high
        self.water_detector = WaterSurfaceDetector()

    def process_detections(
        self,
        raw_detections: list[dict],
        img_bgr: np.ndarray,
        is_class_agnostic: bool = True
    ) -> tuple[list[dict], dict]:
        """
        Filters and transforms raw model detections against the water surface mask,
        removing environmental false positives and applying class-agnostic / confidence tiering.
        """
        img_h, img_w = img_bgr.shape[:2]
        img_area = float(img_w * img_h)

        # 1. Detect Water Mask & Surface Metrics
        water_mask, water_metrics = self.water_detector.detect_water_mask(img_bgr)
        water_area_px = water_metrics["water_area_px"]
        water_surface_pct = water_metrics["water_surface_pct"]

        processed_dets = []
        rejected_detections = []
        waste_area_px = 0

        for idx, det in enumerate(raw_detections, 1):
            box = det.get('box', [0, 0, 0, 0])
            if len(box) < 4:
                continue

            x1, y1, x2, y2 = [int(round(v)) for v in box[:4]]
            x1, y1 = max(0, min(img_w - 1, x1)), max(0, min(img_h - 1, y1))
            x2, y2 = max(0, min(img_w - 1, x2)), max(0, min(img_h - 1, y2))
            bw, bh = max(0, x2 - x1), max(0, y2 - y1)
            box_area = bw * bh

            if box_area <= 0:
                continue

            conf = det.get('confidence', 0.0)
            raw_label = det.get('label', 'Floating Object')

            # Calculate Stage 4 Water-Overlap Score (intersection with water mask / box area)
            box_water_crop = water_mask[y1:y2, x1:x2]
            water_intersection_px = np.count_nonzero(box_water_crop)
            water_overlap_score = round(water_intersection_px / float(box_area), 2) if box_area > 0 else 0.0

            # Ignore whole-canvas background bounding boxes (> 60% of image)
            if box_area >= 0.60 * img_area:
                rejected_detections.append({
                    "box": [x1, y1, x2, y2],
                    "raw_label": raw_label,
                    "confidence": conf,
                    "water_overlap_score": water_overlap_score,
                    "rejection_reason": "REJECTED - OVERSIZE BACKGROUND CANVAS"
                })
                continue

            # Stage 4 Rule 1: Confidence Threshold Check (< 0.40 ignored)
            if conf < self.conf_low:
                rejected_detections.append({
                    "box": [x1, y1, x2, y2],
                    "raw_label": raw_label,
                    "confidence": conf,
                    "water_overlap_score": water_overlap_score,
                    "rejection_reason": f"REJECTED - LOW CONFIDENCE ({int(conf*100)}% < {int(self.conf_low*100)}%)"
                })
                continue

            # Stage 4 Rule 2: Land-Based Specific Class Rejections
            l_lower = raw_label.lower()
            if any(k in l_lower for k in ['branch', 'tree', 'rock', 'shore', 'pipe', 'bridge', 'building', 'soil', 'land']) and water_overlap_score < 0.50:
                rejected_detections.append({
                    "box": [x1, y1, x2, y2],
                    "raw_label": raw_label,
                    "confidence": conf,
                    "water_overlap_score": water_overlap_score,
                    "rejection_reason": f"REJECTED - LAND VEGETATION/STRUCTURE (Overlap: {int(water_overlap_score*100)}%)"
                })
                continue

            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            center_is_water = (water_mask[min(img_h - 1, max(0, cy)), min(img_w - 1, max(0, cx))] > 0)

            # Stage 4 Rule 3: Riverbank Vegetation Rejection (Hyacinth / Grass on land)
            if any(k in l_lower for k in ['hyacinth', 'grass', 'plant', 'bush']) and water_overlap_score < 0.40:
                rejected_detections.append({
                    "box": [x1, y1, x2, y2],
                    "raw_label": raw_label,
                    "confidence": conf,
                    "water_overlap_score": water_overlap_score,
                    "rejection_reason": f"REJECTED - RIVERBANK VEGETATION (Overlap: {int(water_overlap_score*100)}%)"
                })
                continue

            # Stage 4 Rule 4: General Water-Surface ROI Spatial Validation
            pad = 35
            ex1, ey1 = max(0, x1 - pad), max(0, y1 - pad)
            ex2, ey2 = min(img_w, x2 + pad), min(img_h, y2 + pad)
            expanded_water_crop = water_mask[ey1:ey2, ex1:ex2]
            expanded_area = float((ex2 - ex1) * (ey2 - ey1))
            water_pixels_in_vicinity = np.count_nonzero(expanded_water_crop)
            vicinity_water_ratio = water_pixels_in_vicinity / expanded_area if expanded_area > 0 else 0

            is_valid_water_object = (water_overlap_score >= 0.15) or center_is_water or (vicinity_water_ratio >= 0.08) or (water_surface_pct >= 35.0)

            if not is_valid_water_object:
                rejected_detections.append({
                    "box": [x1, y1, x2, y2],
                    "raw_label": raw_label,
                    "confidence": conf,
                    "water_overlap_score": water_overlap_score,
                    "rejection_reason": f"REJECTED - OUTSIDE WATER ROI (Overlap: {int(water_overlap_score*100)}%)"
                })
                continue

            # Stage 5: Environmental Artifact Filtering (Sun Glare, Reflections, Wave Ripples)
            crop_bgr = img_bgr[y1:y2, x1:x2]
            if self.water_detector.is_environmental_false_positive(crop_bgr):
                rejected_detections.append({
                    "box": [x1, y1, x2, y2],
                    "raw_label": raw_label,
                    "confidence": conf,
                    "water_overlap_score": water_overlap_score,
                    "rejection_reason": "REJECTED - SUN GLARE / WAVE RIPPLE ARTIFACT"
                })
                continue

            # Stage 6: Class-Agnostic / Unknown Object Handling
            if is_class_agnostic:
                known_keywords = ['plastic', 'bottle', 'can', 'cup', 'bag', 'hyacinth', 'styrofoam', 'wood', 'garbage', 'debris', 'tire', 'container']
                if any(k in l_lower for k in ['unknown', 'target', 'object', 'item', 'other', 'unseen', 'debris_unknown']):
                    label = "Unknown Floating Waste"
                elif any(k in l_lower for k in known_keywords):
                    label = f"Floating Waste ({raw_label})"
                else:
                    label = f"Floating Waste ({raw_label})"
            else:
                label = raw_label

            # Stage 7: Confidence Tiering
            if conf >= self.conf_high:
                status = "Floating Waste"
                status_color = "#FF3B30"
                conf_tier = "High Confidence"
            else:
                status = "Possible Floating Waste"
                status_color = "#FFB700"
                conf_tier = "Possible"

            rel_pct = round((box_area / img_area) * 100.0, 1)
            waste_area_px += box_area

            obj_id = f"FW-CAND-{idx:03d}"
            processed_dets.append({
                "id": obj_id,
                "obj_id": obj_id,
                "box": [x1, y1, x2, y2],
                "box_str": f"{x1},{y1} | {bw}×{bh}",
                "x": x1,
                "y": y1,
                "w": bw,
                "h": bh,
                "area": box_area,
                "area_str": f"{box_area:,} px² ({rel_pct:.1f}%)",
                "rel_area_pct": rel_pct,
                "confidence": conf,
                "water_overlap_score": water_overlap_score,
                "label": label,
                "raw_label": raw_label,
                "status": status,
                "status_color": status_color,
                "conf_tier": conf_tier,
                "is_floating_waste": True
            })

        # Stage 6 & 7: Spatial Proximity Clustering & Region Mask Extraction
        clustered_dets = FloatingWasteClusterer.cluster_and_segment(processed_dets, img_bgr, water_mask, proximity_dist=35)
        final_dets = clustered_dets if clustered_dets else processed_dets

        # Calculate Stage 8 Analytics Summary
        total_waste_area_px = sum(d.get("area", 0) for d in final_dets)
        waste_coverage_pct = round((total_waste_area_px / float(water_area_px)) * 100.0, 1) if water_area_px > 0 else 0.0
        clean_water_pct = max(0.0, round(100.0 - waste_coverage_pct, 1))

        if len(final_dets) == 0:
            floating_waste_status = "No Floating Waste Detected"
            status_code = "CLEAN"
            status_color = "#00D98E"
        else:
            floating_waste_status = "Floating Waste Detected"
            status_code = "CONTAMINATED"
            status_color = "#FF3B30"

        high_conf_count = sum(1 for d in final_dets if d.get("conf_tier") == "High Confidence")
        possible_count = sum(1 for d in final_dets if d.get("conf_tier") == "Possible")
        accumulation_count = sum(1 for d in final_dets if d.get("detection_type") == "Large Accumulation Region")
        cluster_count = sum(1 for d in final_dets if d.get("detection_type") == "Floating Cluster")

        analytics_summary = {
            "water_surface_pct": water_surface_pct,
            "waste_coverage_pct": waste_coverage_pct,
            "clean_water_pct": clean_water_pct,
            "floating_waste_status": floating_waste_status,
            "status_code": status_code,
            "status_color": status_color,
            "total_objects": len(final_dets),
            "high_confidence_count": high_conf_count,
            "possible_count": possible_count,
            "accumulation_count": accumulation_count,
            "cluster_count": cluster_count,
            "rejected_count": len(rejected_detections),
            "accepted_count": len(final_dets)
        }

        return final_dets, analytics_summary, rejected_detections


class FloatingWasteClusterer:
    """
    Performs spatial proximity clustering & connected region fusion on floating waste candidates.
    Groups touching / closely adjacent waste candidates into unified continuous floating waste regions
    (e.g., Large Accumulation Regions, Floating Clusters, or Single Objects) and extracts irregular outer contours.
    """

    @staticmethod
    def cluster_and_segment(
        candidates: list[dict],
        img_bgr: np.ndarray,
        water_mask: np.ndarray,
        proximity_dist: int = 35
    ) -> list[dict]:
        """
        Groups candidate floating waste bounding boxes into spatially connected regions.
        Extracts contour polygons and classifies detection type.
        """
        if not candidates:
            return []

        img_h, img_w = img_bgr.shape[:2]
        img_area = float(img_w * img_h)

        # 1. Construct binary candidate mask from valid candidate boxes
        cand_mask = np.zeros((img_h, img_w), dtype=np.uint8)
        for c in candidates:
            x1, y1, x2, y2 = c["box"]
            cv2.rectangle(cand_mask, (x1, y1), (x2, y2), 255, -1)

        # 2. Apply morphological dilation to fuse nearby floating candidates (within proximity_dist)
        kernel_size = max(45, int(proximity_dist))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        dilated_mask = cv2.dilate(cand_mask, kernel, iterations=1)

        # 3. Find connected contours on fused candidate mask
        contours, _ = cv2.findContours(dilated_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        clustered_dets = []
        for idx, cnt in enumerate(contours, 1):
            area_cnt = cv2.contourArea(cnt)
            x, y, w, h = cv2.boundingRect(cnt)
            x1, y1, x2, y2 = x, y, x + w, y + h

            # Find constituent candidates belonging to this contour cluster
            constituents = []
            for c in candidates:
                cx, cy = (c["box"][0] + c["box"][2]) // 2, (c["box"][1] + c["box"][3]) // 2
                if cv2.pointPolygonTest(cnt, (float(cx), float(cy)), False) >= 0 or (x1 <= cx <= x2 and y1 <= cy <= y2):
                    constituents.append(c)

            if not constituents:
                # Calculate constituents based on box overlap
                for c in candidates:
                    cb = c["box"]
                    if not (cb[2] < x1 or cb[0] > x2 or cb[3] < y1 or cb[1] > y2):
                        constituents.append(c)

            if not constituents:
                continue

            # Determine cluster confidence & label
            max_conf = max(c["confidence"] for c in constituents)
            avg_conf = sum(c["confidence"] for c in constituents) / float(len(constituents))
            comb_conf = round(0.7 * max_conf + 0.3 * avg_conf, 2)

            # Extract simplified polygon points for UI rendering
            approx_cnt = cv2.approxPolyDP(cnt, 0.015 * cv2.arcLength(cnt, True), True)
            polygon = approx_cnt.reshape(-1, 2).tolist()

            # Calculate cluster area & relative surface area
            total_cluster_area = max(int(area_cnt), w * h)
            actual_waste_area = sum(c["area"] for c in constituents)
            rel_pct = round((total_cluster_area / img_area) * 100.0, 1)

            # Determine Detection Type & Label Hierarchy
            if rel_pct >= 6.0 or len(constituents) >= 4:
                detection_type = "Large Accumulation Region"
                label = "Floating Waste Accumulation (Large Mat)"
                status_color = "#FF3B30"
                conf_tier = "High Confidence"
            elif len(constituents) >= 2 or (rel_pct >= 3.0 and len(constituents) >= 2):
                detection_type = "Floating Cluster"
                label = "Floating Waste Cluster"
                status_color = "#FF8C00"
                conf_tier = "High Confidence" if max_conf >= 0.60 else "Possible"
            else:
                detection_type = "Single Object"
                first_label = constituents[0].get("label", "Floating Waste")
                label = first_label
                status_color = "#FF3B30" if max_conf >= 0.60 else "#FFB700"
                conf_tier = "High Confidence" if max_conf >= 0.60 else "Possible"

            obj_id = f"FW-{idx:03d}"
            clustered_dets.append({
                "id": obj_id,
                "obj_id": obj_id,
                "box": [x1, y1, x2, y2],
                "box_str": f"{x1},{y1} | {w}×{h}",
                "x": x1,
                "y": y1,
                "w": w,
                "h": h,
                "area": actual_waste_area,
                "area_str": f"{actual_waste_area:,} px² ({rel_pct:.1f}%)",
                "rel_area_pct": rel_pct,
                "confidence": comb_conf,
                "label": label,
                "raw_label": constituents[0].get("raw_label", label),
                "detection_type": detection_type,
                "constituents_count": len(constituents),
                "polygon": polygon,
                "status": "Floating Waste",
                "status_color": status_color,
                "conf_tier": conf_tier,
                "is_floating_waste": True
            })

        return clustered_dets


class FloatingWasteTracker:
    """
    Simple Online Centroid & IOU Tracker for live video / camera streams.
    Assigns persistent tracking IDs e.g. "Floating Waste #001", "Floating Waste #002".
    """

    def __init__(self, max_disappeared: int = 15, iou_thresh: float = 0.35):
        self.next_object_id = 1
        self.tracked_objects = {}  # object_id -> {box, centroid, label, confidence, last_seen, count}
        self.max_disappeared = max_disappeared
        self.iou_thresh = iou_thresh
        self.start_time = time.time()
        self.total_unique_count = 0

    def update(self, detections: list[dict]) -> list[dict]:
        """
        Updates tracked objects with new frame detections and assigns persistent tracking IDs.
        """
        if not detections:
            # Increment disappeared counter for all tracked objects
            to_delete = []
            for obj_id, data in self.tracked_objects.items():
                data["last_seen"] += 1
                if data["last_seen"] > self.max_disappeared:
                    to_delete.append(obj_id)
            for obj_id in to_delete:
                del self.tracked_objects[obj_id]
            return []

        input_centroids = []
        for d in detections:
            x1, y1, x2, y2 = d["box"]
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            input_centroids.append((cx, cy))

        matched_tracks = {}

        if len(self.tracked_objects) == 0:
            # Register all input detections as new tracked objects
            for idx, d in enumerate(detections):
                tracking_num = self.next_object_id
                self.next_object_id += 1
                self.total_unique_count += 1
                track_label = f"Floating Waste #{tracking_num:03d}"

                x1, y1, x2, y2 = d["box"]
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

                self.tracked_objects[tracking_num] = {
                    "box": d["box"],
                    "centroid": (cx, cy),
                    "label": d["label"],
                    "confidence": d["confidence"],
                    "last_seen": 0,
                    "count": 1
                }

                matched_tracks[idx] = (track_label, tracking_num)
        else:
            # Match existing tracked objects to input centroids via greedy minimum distance
            object_ids = list(self.tracked_objects.keys())
            object_centroids = [self.tracked_objects[oid]["centroid"] for oid in object_ids]

            pairs = []
            for i, (cx1, cy1) in enumerate(object_centroids):
                for j, (cx2, cy2) in enumerate(input_centroids):
                    dist = math.hypot(cx1 - cx2, cy1 - cy2)
                    pairs.append((dist, i, j))

            pairs.sort(key=lambda x: x[0])

            used_rows = set()
            used_cols = set()

            for dist, r, c in pairs:
                if r in used_rows or c in used_cols:
                    continue
                if dist > 120.0:  # Max pixel distance threshold across consecutive frames
                    break

                obj_id = object_ids[r]
                d = detections[c]

                cx, cy = input_centroids[c]
                self.tracked_objects[obj_id]["box"] = d["box"]
                self.tracked_objects[obj_id]["centroid"] = (cx, cy)
                self.tracked_objects[obj_id]["last_seen"] = 0
                self.tracked_objects[obj_id]["count"] += 1

                used_rows.add(r)
                used_cols.add(c)

                track_label = f"Floating Waste #{obj_id:03d}"
                matched_tracks[c] = (track_label, obj_id)

            # Register unmatched input detections
            for c in range(len(input_centroids)):
                if c not in used_cols:
                    d = detections[c]
                    tracking_num = self.next_object_id
                    self.next_object_id += 1
                    self.total_unique_count += 1
                    track_label = f"Floating Waste #{tracking_num:03d}"

                    cx, cy = input_centroids[c]
                    self.tracked_objects[tracking_num] = {
                        "box": d["box"],
                        "centroid": (cx, cy),
                        "label": d["label"],
                        "confidence": d["confidence"],
                        "last_seen": 0,
                        "count": 1
                    }

                    matched_tracks[c] = (track_label, tracking_num)

            # Mark unmatched tracked objects as disappeared
            for r in range(len(object_ids)):
                if r not in used_rows:
                    obj_id = object_ids[r]
                    self.tracked_objects[obj_id]["last_seen"] += 1

        # Construct updated_detections preserving original input detection order
        updated_detections = []
        for idx, d in enumerate(detections):
            d_copy = dict(d)
            if idx in matched_tracks:
                t_label, t_num = matched_tracks[idx]
                d_copy["track_id"] = t_label
                d_copy["tracking_num"] = t_num
            updated_detections.append(d_copy)

        return updated_detections

        return updated_detections

    def get_metrics(self) -> dict:
        elapsed_min = max(0.1, (time.time() - self.start_time) / 60.0)
        objects_per_min = round(self.total_unique_count / elapsed_min, 1)

        return {
            "active_count": len([o for o in self.tracked_objects.values() if o["last_seen"] == 0]),
            "total_unique_count": self.total_unique_count,
            "objects_per_minute": objects_per_min
        }
