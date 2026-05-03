from http.server import BaseHTTPRequestHandler
import json
import anthropic

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            ingredients = body.get('ingredients', [])
            surprise = body.get('surprise', False)
            dietary = body.get('dietary', [])
            servings = body.get('servings', 2)
            max_time = body.get('max_time', 0)
            max_skill = body.get('max_skill', 5)
            count = body.get('count', 5)

            if not ingredients and not surprise:
                return self.send_json(400, {'error': 'Please provide at least one ingredient.'})

            filters = []
            if dietary: filters.append(f"Dietary restrictions: {', '.join(dietary)}")
            if max_time: filters.append(f"Max cook time: {max_time} minutes")
            if max_skill < 5: filters.append(f"Max skill level: {max_skill} out of 5")
            filters.append(f"Servings: {servings} people")
            filter_text = '\n'.join(filters)

            if surprise:
                ingredient_text = "Generate recipes using ingredients commonly found in a typical home fridge and pantry. Be creative and varied."
            else:
                ingredient_text = f"I have these ingredients: {', '.join(ingredients)}. Use as many as possible. additional_ingredients should only list things I need to buy."

            client = anthropic.Anthropic()
            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=5000,
                system=(
                    'You are a recipe generator. Always respond with valid JSON only — '
                    'no markdown, no explanation, no code fences. '
                    'Return a JSON object with a "recipes" array. '
                    'Each recipe must have exactly these fields: '
                    'name (string), description (string), time_minutes (integer), '
                    'skill_level (integer 1-5), calories_per_serving (integer), '
                    'ingredients_used (array of strings), '
                    'additional_ingredients (array of strings), '
                    'equipment (array of strings — e.g. "large skillet", "baking sheet"), '
                    'steps (array of strings).'
                ),
                messages=[{
                    'role': 'user',
                    'content': (
                        f"{ingredient_text}\n\n"
                        f"Generate {count} diverse recipes across different meal types.\n\n"
                        f"Requirements:\n{filter_text}\n\n"
                        'skill_level: 1=Beginner, 2=Easy, 3=Intermediate, 4=Advanced, 5=Expert\n'
                        'calories_per_serving: realistic estimate as an integer.'
                    )
                }]
            )

            text = next(b.text for b in response.content if b.type == 'text')
            text = text.strip()
            if text.startswith('```json'): text = text[7:]
            if text.startswith('```'): text = text[3:]
            if text.endswith('```'): text = text[:-3]
            self.send_json(200, json.loads(text.strip()))

        except Exception as e:
            print(f'Error: {e}')
            self.send_json(500, {'error': str(e)})

    def send_json(self, status, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
