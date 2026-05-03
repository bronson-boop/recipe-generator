import json
import anthropic
from flask import Flask, request, jsonify

app = Flask(__name__)
client = anthropic.Anthropic()

@app.route('/', methods=['POST'])
@app.route('/api/recipes', methods=['POST'])
def generate_recipes():
    body = request.get_json(silent=True) or {}
    ingredients = body.get("ingredients", [])

    if not isinstance(ingredients, list) or len(ingredients) == 0:
        return jsonify({"error": "Please provide at least one ingredient."}), 400

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=(
                "You are a recipe generator. Always respond with valid JSON only — "
                "no markdown, no explanation, no code fences. "
                'Return a JSON object with a "recipes" array. '
                "Each recipe must have exactly these fields: "
                "name (string), description (string), time_minutes (integer), "
                "skill_level (integer 1-5), ingredients_used (array of strings), "
                "additional_ingredients (array of strings), steps (array of strings)."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"I have these ingredients: {', '.join(ingredients)}.\n\n"
                    "Generate 5 diverse recipes I can make across different meal types.\n\n"
                    "skill_level scale:\n"
                    "  1 = Beginner\n"
                    "  2 = Easy\n"
                    "  3 = Intermediate\n"
                    "  4 = Advanced\n"
                    "  5 = Expert\n\n"
                    "Use as many of my ingredients as possible. "
                    "additional_ingredients should only list things I'd need to buy."
                )
            }]
        )

        text = next(b.text for b in response.content if b.type == "text")
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(text)
        return jsonify(data)

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        return jsonify({"error": "Couldn't parse the recipe response. Please try again."}), 500
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
