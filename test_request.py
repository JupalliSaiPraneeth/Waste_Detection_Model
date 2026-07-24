import requests

url = "http://localhost:5001/predict"
files = {'image': open('c:/WastageDetection/temp_frame.jpg', 'rb')}
data = {'model': 'best_pt'}

try:
    response = requests.post(url, files=files, data=data)
    print("Response status:", response.status_code)
    # the response is HTML
    text = response.text
    if "No objects detected" in text:
        print("Model did not detect anything!")
    else:
        print("Model detected something!")
        # Count the number of "Confidence Score" or similar markers
        count = text.count('<span class="badge">')
        print(f"Detected {count} objects.")
except Exception as e:
    print("Failed to run request:", e)
