from http.server import BaseHTTPRequestHandler
import json
import anthropic

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            ingredients = body.get('ingredients', [])

            if not ingredients:
                return self.send_json(400, {'error': 'Please provide at least one ingredient.'})

            client = anthropic.Anthropic()
            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=4096,
                system=(
                    'You are a recipe generator. Always respond with valid JSON only — '
                    'no markdown, no explanation, no code fences. '
                    'Return a JSON object with a "recipes" array. '
                    'Each recipe must have exactly these fields: '
                    'name (string), description (string), time_minutes (integer), '
                    'skill_level (integer 1-5), ingredients_used (array of strings), '
                    'additional_ingredients (array of strings), '
                    'equipment (array of strings — pots, pans, tools needed e.g. "large skillet", "baking sheet"), '
                    'steps (array of strings).'
                ),
                messages=[{
                    'role': 'user',
                    'content': (
                        f"I have these ingredients: {', '.join(ingredients)}.\n\n"
                        'Generate 5 diverse recipes I can make across different meal types.\n\n'
                        'skill_level: 1=Beginner, 2=Easy, 3=Intermediate, 4=Advanced, 5=Expert\n\n'
                        'Use as many of my ingredients as possible. '
                        'additional_ingredients should only list things I need to buy.'
                    )
                }]
            )

            text = next(b.text for b in response.content if b.type == 'text')
            text = text.strip()
            if text.startswith('```json'): text = text[7:]
            if text.startswith('```'): text = text[3:]
            if text.endswith('```'): text = text[:-3]
            text = text.strip()
            self.send_json(200, json.loads(text))

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
