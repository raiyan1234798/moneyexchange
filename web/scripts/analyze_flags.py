import os
from PIL import Image
import math
import json

def image_variance(img_slice):
    # Convert to grayscale to simplify variance calculation
    gray = img_slice.convert('L')
    data = list(gray.getdata())
    if not data:
        return 0
    mean = sum(data) / len(data)
    var = sum((x - mean) ** 2 for x in data) / len(data)
    return var

def analyze_flags(directory):
    results = {}
    for filename in os.listdir(directory):
        if not filename.endswith('.png'):
            continue
        filepath = os.path.join(directory, filename)
        country_code = filename.replace('.png', '')
        
        try:
            img = Image.open(filepath)
            width, height = img.size
            img_aspect = width / height
            
            # Target aspect ratio is 1.6 / 1.05 ≈ 1.52
            target_aspect = 1.6 / 1.05
            
            # If the image is narrower than target (e.g., 1:1), it will be cropped vertically.
            # We'll focus on horizontally cropped flags for now, as that's the most common (e.g. 2:1 flags).
            if img_aspect > target_aspect * 1.05: # > ~1.6 means it's definitely wider
                # It will be cropped horizontally.
                # Let's check the left 25% and right 25%
                slice_width = int(width * 0.25)
                left_slice = img.crop((0, 0, slice_width, height))
                right_slice = img.crop((width - slice_width, 0, width, height))
                
                left_var = image_variance(left_slice)
                right_var = image_variance(right_slice)
                
                # If left is much more detailed than right
                if left_var > right_var * 1.5 and left_var > 500:
                    results[country_code] = "object-left"
                elif right_var > left_var * 1.5 and right_var > 500:
                    results[country_code] = "object-right"
                elif left_var > 500 and right_var > 500:
                    # Both sides have high detail (e.g. full design, canton + seal on right)
                    # For these, object-fill might be best to avoid cropping any details
                    results[country_code] = "object-fill"
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            
    return results

if __name__ == "__main__":
    flags_dir = "public/flags"
    overrides = analyze_flags(flags_dir)
    print(json.dumps(overrides, indent=2))
