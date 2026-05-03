from http.server import BaseHTTPRequestHandler
import json
import anthropic

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            image_b64 = body.get('image')
            media_type = body.get('media_type', 'image/jpeg')

            if not image_b64:
                return self.send_json(400, {'error': 'No image provided.'})

            client = anthropic.Anthropic()
            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=512,
                system=(
                    'You identify food ingredients from photos. '
                    'Respond with valid JSON only — no markdown, no explanation. '
                    'Return {"ingredients": ["ingredient1", "ingredient2", ...]}. '
                    'List individual ingredients, not dishes. Keep names short and simple.'
                ),
                messages=[{
                    'role': 'user',
                    'content': [
                        {
                            'type': 'image',
                            'source': {
                                'type': 'base64',
                                'media_type': media_type,
                                'data': image_b64
                            }
                        },
                        {'type': 'text', 'text': 'List all the food ingredients you can see in this photo.'}
                    ]
                }]
            )

            text = next(b.text for b in response.content if b.type == 'text')
            text = text.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip()
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
