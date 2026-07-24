from app import discover_models

discovered = discover_models()

for model_id, info in discovered.items():
    print(f"\n{'='*60}")
    print(f"Model ID: {model_id}")
    print(f"Name: {info['name']}")
    print(f"Path: {info['path']}")
    print(f"{'='*60}")
    names = info["instance"].names
    if isinstance(names, dict):
        print(f"Classes ({len(names)}):")
        for idx, class_name in names.items():
            print(f"  {idx}: {class_name}")
    else:
        print(f"Classes: {names}")
