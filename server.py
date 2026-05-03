import json
import os
from flask import Flask, request, jsonify, send_from_directory
import anthropic

app = Flask(__name__, static_folder='public')
client = anthropic.Anthropic()

RECIPE_SCHEMA = {
    "type": "object",
    "properties": {
        "recipes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name":                   {"type": "string"},
                    "description":            {"type": "string"},
                    "time_minutes":           {"type": "integer"},
                    "skill_level":            {"type": "integer"},
                    "ingredients_used":       {"type": "array", "items": {"type": "string"}},
                    "additional_ingredients": {"type": "array", "items": {"type": "string"}},
                    "steps":                  {"type": "array", "items": {"type": "string"}}
                },
                "required": [
                    "name", "description", "time_minutes", "skill_level",
                    "ingredients_used", "additional_ingredients", "steps"
                ],
                "additionalProperties": False
            }
        }
    },
    "required": ["recipes"],
    "additionalProperties": False
}

@app.route("/")
def index():
    return send_from_directory("public", "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory("public", filename)

@app.post("/api/recipes")
def generate_recipes():
    body = request.get_json(silent=True) or {}
    ingredients = body.get("ingredients", [])

    if not isinstance(ingredients, list) or len(ingredients) == 0:
        return jsonify({"error": "Please provide at least one ingredient."}), 400

    try:
        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=8192,
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
                    "Generate 6 to 8 diverse recipes I can make across different meal types and cuisines.\n\n"
                    "skill_level scale:\n"
                    "  1 = Beginner, nearly impossible to mess up\n"
                    "  2 = Easy, minimal technique\n"
                    "  3 = Intermediate, some experience helpful\n"
                    "  4 = Advanced, solid cooking knowledge needed\n"
                    "  5 = Expert / professional level\n\n"
                    "Use as many of my ingredients as possible. "
                    "additional_ingredients should only list things I'd actually need to buy."
                )
            }]
        )

        text = next(b.text for b in response.content if b.type == "text")
        # Strip any accidental markdown fences
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(text)
        return jsonify(data)

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}\nRaw response: {text}")
        return jsonify({"error": "Couldn't parse the recipe response. Please try again."}), 500
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(port=3000, debug=False)
