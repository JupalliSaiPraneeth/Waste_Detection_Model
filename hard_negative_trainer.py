"""
Hard-Negative Training & Dataset Curation Pipeline
---------------------------------------------------
Provides utilities to validate, curate, and format hard-negative training datasets
for YOLOv8/YOLO11 floating-waste models. Teaches models to distinguish clean water,
riverbank vegetation, rocks, trees, bridges, and pipes from true floating waste.
"""

import os
import json
import numpy as np


class HardNegativeDatasetCurator:
    """
    Manages negative training samples (zero annotations) and hard-negative examples
    (land objects previously misclassified as waste).
    """

    HARD_NEGATIVE_CLASSES = [
        "riverbank_vegetation",
        "tree_branch_land",
        "shore_rocks",
        "bridge_pillar",
        "water_pipe",
        "sun_glare",
        "wave_ripple",
        "water_reflection"
    ]

    @staticmethod
    def generate_yolo_negative_manifest(
        image_dir: str,
        output_txt_path: str
    ) -> dict:
        """
        Creates empty label files (.txt) for clean water and land background images,
        ensuring YOLO models learn clean water = 0 detections.
        """
        if not os.path.exists(image_dir):
            return {"status": "error", "message": f"Directory not found: {image_dir}"}

        valid_exts = ('.jpg', '.jpeg', '.png', '.bmp', '.webp')
        img_files = [f for f in os.listdir(image_dir) if f.lower().endswith(valid_exts)]

        created_labels = 0
        for img_name in img_files:
            base_name = os.path.splitext(img_name)[0]
            txt_name = f"{base_name}.txt"
            txt_path = os.path.join(image_dir, txt_name)

            # Create empty text file if not exists (signifying 0 annotations)
            if not os.path.exists(txt_path):
                with open(txt_path, 'w', encoding='utf-8') as f:
                    pass  # Empty file = zero annotations
                created_labels += 1

        manifest_summary = {
            "total_images": len(img_files),
            "negative_label_files_created": created_labels,
            "manifest_file": output_txt_path,
            "recommended_batch_split": {
                "clean_water_pct": 25,
                "hard_negative_land_pct": 25,
                "annotated_floating_waste_pct": 50
            }
        }

        with open(output_txt_path, 'w', encoding='utf-8') as f:
            json.dump(manifest_summary, f, indent=2)

        return manifest_summary

    @staticmethod
    def get_hard_negative_guidelines() -> dict:
        """
        Returns architectural & annotation rules for hard-negative training.
        """
        return {
            "title": "Hard-Negative Training Guidelines for Water Surface Detection",
            "principles": [
                "1. Clean Water Images MUST have 0 bounding box annotations.",
                "2. Land vegetation, trees, and shore rocks MUST be unannotated (background class).",
                "3. Annotate ONLY material floating on the water surface.",
                "4. Annotate contiguous floating garbage mat heaps as single large polygon/box regions.",
                "5. Include diverse water conditions: sun glare, ripples, murky water, reflections."
            ],
            "hard_negative_categories": HardNegativeDatasetCurator.HARD_NEGATIVE_CLASSES
        }


if __name__ == "__main__":
    guidelines = HardNegativeDatasetCurator.get_hard_negative_guidelines()
    print(json.dumps(guidelines, indent=2))
