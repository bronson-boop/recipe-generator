import json
import anthropic
from flask import Flask, request, jsonify

app = Flask(__name__)
client = anthropic.Anthropic()

@app.route('/', methods=['POST'])
@app.route('/api/identify', methods=['POST'])
def identify_ingredients():
    body = request.get_json(silent=True) or {}
    image_b64 = body.get("image")
    media_type = body.get("media_type", "image/jpeg")

    if not image_b64:
        return jsonify({"error": "No image provided."}), 400

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=(
                "You identify food ingredients from photos. "
                "Respond with valid JSON only — no markdown, no explanation. "
                'Return {"ingredients": ["ingredient1", "ingredient2", ...]}. '
                "List individual ingredients, not dishes. Keep names short and simple."
            ),
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64
                        }
                    },
                    {
                        "type": "text",
                        "text": "List all the food ingredients you can see in this photo."
                    }
                ]
            }]
        )

        text = next(b.text for b in response.content if b.type == "text")
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(text)
        return jsonify(data)

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        return jsonify({"error": "Couldn't read the photo. Please try again."}), 500
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
