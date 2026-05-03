from http.server import BaseHTTPRequestHandler
import json
import anthropic

CHEF_STYLES = {
    'gordon ramsay': {
        'color': '#c0392b',
        'emoji': '👨‍🍳',
        'intro_style': 'Right, pay attention. I am going to show you exactly how to make this, and you are going to do it properly.',
        'system': (
            'You are Gordon Ramsay narrating a cooking video. Be intense, passionate, and exacting. '
            'Use his signature phrases: "stunning", "beautiful", "come on", "season properly", "perfect". '
            'Be dramatic about technique. Occasionally use light sarcasm. Short punchy sentences. '
            'Sound like he genuinely cares that the viewer gets it right.'
        ),
    },
    'julia child': {
        'color': '#8e44ad',
        'emoji': '👩‍🍳',
        'intro_style': 'Oh, how wonderful! We are going to have such a marvelous time making this together.',
        'system': (
            'You are Julia Child narrating a cooking video. Be warm, enthusiastic, and encouraging. '
            'Use French culinary terms naturally. Reassure the viewer when things go wrong. '
            'Use phrases like "bon appétit", "how wonderful", "don\'t worry at all". '
            'Make cooking feel like an adventure and a joy.'
        ),
    },
    'jamie oliver': {
        'color': '#27ae60',
        'emoji': '🧑‍🍳',
        'intro_style': 'Alright guys, we are going to make something absolutely gorgeous today — and it is dead simple.',
        'system': (
            'You are Jamie Oliver narrating a cooking video. Be casual, friendly, and excited. '
            'Use British slang: "gorgeous", "lovely", "cracking", "happy days", "a good lug of olive oil". '
            'Make cooking feel approachable and fun. Reference fresh, seasonal, simple ingredients.'
        ),
    },
    'anthony bourdain': {
        'color': '#2c3e50',
        'emoji': '🎤',
        'intro_style': 'Look. This dish is not complicated. But if you rush it, you will ruin it. So do not rush it.',
        'system': (
            'You are Anthony Bourdain narrating a cooking video. Be world-weary, honest, and compelling. '
            'Tell a story with the food. Reference culture and travel. Be direct and no-nonsense. '
            'Use short, punchy prose. Avoid clichés. Be irreverent but deeply knowledgeable.'
        ),
    },
    'ina garten': {
        'color': '#2980b9',
        'emoji': '🏡',
        'intro_style': 'Welcome! This recipe is so simple, yet so impressive. I promise your friends will be amazed.',
        'system': (
            'You are Ina Garten narrating a cooking video. Be warm, elegant, and reassuring. '
            'Reference good quality store-bought ingredients where appropriate. '
            'Use phrases like "how easy is that?", "good olive oil", "good vanilla extract". '
            'Make the viewer feel like they are cooking with a sophisticated but approachable friend.'
        ),
    },
}

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            recipe = body.get('recipe', {})
            chef_style = body.get('chef_style', 'gordon ramsay').lower()

            style = CHEF_STYLES.get(chef_style, CHEF_STYLES['gordon ramsay'])

            client = anthropic.Anthropic()
            response = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=2000,
                system=style['system'] + (
                    ' Respond with valid JSON only — no markdown, no code fences. '
                    'Return {"intro": string, "steps": [{"narration": string, "tip": string}], "outro": string}. '
                    'Each step narration should be 2-3 sentences in your voice. '
                    'Tips are short optional asides (1 sentence). The intro and outro should be 2-3 sentences.'
                ),
                messages=[{
                    'role': 'user',
                    'content': (
                        f'Narrate making "{recipe.get("name", "this recipe")}" in your signature style.\n'
                        f'Recipe description: {recipe.get("description", "")}\n'
                        f'Steps to narrate:\n' +
                        '\n'.join(f'{i+1}. {s}' for i, s in enumerate(recipe.get('steps', [])))
                    )
                }]
            )

            text = next(b.text for b in response.content if b.type == 'text').strip()
            if text.startswith('```json'): text = text[7:]
            if text.startswith('```'): text = text[3:]
            if text.endswith('```'): text = text[:-3]
            data = json.loads(text.strip())
            data['chef_color'] = style['color']
            data['chef_emoji'] = style['emoji']
            data['chef_name'] = chef_style.title()
            self.send_json(200, data)

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

    def log_message(self, *args): pass
