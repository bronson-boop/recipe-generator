from http.server import BaseHTTPRequestHandler
import json
import anthropic
import datetime

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8'))

            ingredients  = body.get('ingredients', [])
            surprise     = body.get('surprise', False)
            dietary      = body.get('dietary', [])
            servings     = body.get('servings', 2)
            max_time     = body.get('max_time', 0)
            max_skill    = body.get('max_skill', 5)
            count        = body.get('count', 5)
            cuisine      = body.get('cuisine', '')
            meal_type    = body.get('meal_type', '')
            budget_mode  = body.get('budget_mode', False)
            chef_style   = body.get('chef_style', '')
            language     = body.get('language', 'English')
            healthier    = body.get('make_healthier', False)
            cheaper      = body.get('make_cheaper', False)
            recipe_name  = body.get('recipe_name', '')

            if not ingredients and not surprise and not recipe_name:
                return self.send_json(400, {'error': 'Please provide at least one ingredient.'})

            month = datetime.datetime.now().month
            season = 'winter' if month in [12,1,2] else 'spring' if month in [3,4,5] else 'summer' if month in [6,7,8] else 'fall'

            constraints = [f'Servings: {servings} people', f'Current season: {season}']
            if dietary:     constraints.append(f'Dietary restrictions: {", ".join(dietary)}')
            if max_time:    constraints.append(f'Max cook time: {max_time} minutes')
            if max_skill<5: constraints.append(f'Max skill level: {max_skill}/5')
            if cuisine:     constraints.append(f'Cuisine: {cuisine}')
            if meal_type:   constraints.append(f'Meal type: {meal_type}')
            if budget_mode: constraints.append('Budget-friendly — use cheap, accessible ingredients')
            if chef_style:  constraints.append(f'Cook in the style of {chef_style}')
            if healthier:   constraints.append('Make as healthy as possible — low calorie, nutritious, whole foods')
            if cheaper:     constraints.append('Use cheapest possible ingredient substitutions')
            if language != 'English': constraints.append(f'Write recipe names and steps in {language}')

            if surprise:
                src = (
                    'Generate recipes using only the most common household fridge and pantry staples that nearly everyone has: '
                    'eggs, butter, milk, cheese, onions, garlic, pasta, rice, canned tomatoes, chicken, bread, potatoes, '
                    'carrots, celery, olive oil, flour, sugar, salt, pepper, basic herbs and spices. '
                    'Prioritise recipes that need NO shopping — use only what most people already own.'
                )
            elif (healthier or cheaper) and recipe_name:
                src = f'Regenerate "{recipe_name}" but {"much healthier" if healthier else "with cheaper ingredients"}. Same general concept.'
            else:
                src = f'I have: {", ".join(ingredients)}. Use as many as possible. additional_ingredients = only things to buy.'

            schema = (
                'Return JSON with a "recipes" array. Each recipe must have EXACTLY these fields:\n'
                'name, description, skill_description (plain-English e.g. "No knife skills needed"),\n'
                'cuisine, meal_type (breakfast/lunch/dinner/snack/dessert),\n'
                'time_minutes (int), skill_level (int 1-5),\n'
                'calories_per_serving (int),\n'
                'nutrition: {protein_g, carbs_g, fat_g, fiber_g} (all ints),\n'
                'estimated_cost ("$"/"$$"/"$$$"),\n'
                'carbon_footprint ("Low"/"Medium"/"High"),\n'
                'allergens (array from: nuts/gluten/dairy/eggs/fish/shellfish/soy),\n'
                'wine_pairing (one sentence string),\n'
                'leftover_ideas (array of 2 short strings),\n'
                'ingredients_used, additional_ingredients, equipment, steps (all string arrays).'
            )

            client = anthropic.Anthropic()
            resp = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=8000,
                system=f'You are a recipe generator. Respond with valid JSON only — no markdown, no fences.\n{schema}',
                messages=[{'role':'user','content':(
                    f'{src}\n\nGenerate {count} diverse recipes.\n\n'
                    f'Requirements:\n' + '\n'.join(f'- {c}' for c in constraints)
                )}]
            )

            text = next(b.text for b in resp.content if b.type=='text').strip()
            if text.startswith('```json'): text = text[7:]
            if text.startswith('```'):    text = text[3:]
            if text.endswith('```'):     text = text[:-3]
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

    def log_message(self, *args): pass
