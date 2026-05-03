const input = document.getElementById('ingredientInput');
const tagList = document.getElementById('tagList');
const tagWrapper = document.getElementById('tagWrapper');
const generateBtn = document.getElementById('generateBtn');
const resultsSection = document.getElementById('resultsSection');
const recipeGrid = document.getElementById('recipeGrid');
const loadingOverlay = document.getElementById('loadingOverlay');
const resultsTitle = document.getElementById('resultsTitle');
const resetBtn = document.getElementById('resetBtn');

let ingredients = [];

// Click wrapper → focus input
tagWrapper.addEventListener('click', () => input.focus());

input.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addIngredient(input.value);
  }
  if (e.key === 'Backspace' && input.value === '' && ingredients.length > 0) {
    removeIngredient(ingredients.length - 1);
  }
});

input.addEventListener('blur', () => {
  if (input.value.trim()) addIngredient(input.value);
});

function addIngredient(raw) {
  const name = raw.trim().replace(/,+$/, '').trim();
  if (!name) return;
  if (ingredients.map(i => i.toLowerCase()).includes(name.toLowerCase())) {
    input.value = '';
    return;
  }
  ingredients.push(name);
  input.value = '';
  renderTags();
  updateBtn();
}

function removeIngredient(index) {
  ingredients.splice(index, 1);
  renderTags();
  updateBtn();
}

function renderTags() {
  tagList.innerHTML = '';
  ingredients.forEach((ing, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${ing}<button class="tag-remove" aria-label="Remove ${ing}">×</button>`;
    tag.querySelector('.tag-remove').addEventListener('click', e => {
      e.stopPropagation();
      removeIngredient(i);
    });
    tagList.appendChild(tag);
  });
}

function updateBtn() {
  generateBtn.disabled = ingredients.length === 0;
}

generateBtn.addEventListener('click', generateRecipes);

async function generateRecipes() {
  if (ingredients.length === 0) return;

  loadingOverlay.hidden = false;
  resultsSection.hidden = true;

  try {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    renderRecipes(data.recipes);
  } catch (err) {
    alert(err.message || 'Failed to generate recipes. Please try again.');
  } finally {
    loadingOverlay.hidden = true;
  }
}

function renderRecipes(recipes) {
  recipeGrid.innerHTML = '';

  const ingredientsLower = ingredients.map(i => i.toLowerCase());
  resultsTitle.textContent = `${recipes.length} recipes using your ingredients`;

  recipes.forEach((recipe, idx) => {
    const card = buildCard(recipe, ingredientsLower, idx);
    recipeGrid.appendChild(card);
  });

  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildCard(recipe, ingredientsLower, idx) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.style.animationDelay = `${idx * 60}ms`;

  const skillLabel = ['', 'Beginner', 'Easy', 'Intermediate', 'Advanced', 'Expert'];
  const timeLabel = formatTime(recipe.time_minutes);
  const skill = Math.min(5, Math.max(1, recipe.skill_level));

  // Check which "used" ingredients match user's pantry
  const haveIngredients = recipe.ingredients_used.filter(ing =>
    ingredientsLower.some(i => ing.toLowerCase().includes(i) || i.includes(ing.toLowerCase()))
  );
  const extraUsed = recipe.ingredients_used.filter(ing => !haveIngredients.includes(ing));
  const allHave = [...haveIngredients, ...extraUsed];

  card.innerHTML = `
    <div class="card-header">
      <div class="card-name">${escHtml(recipe.name)}</div>
      <div class="card-description">${escHtml(recipe.description)}</div>
    </div>

    <div class="card-meta">
      <span class="meta-badge">
        <span class="icon">⏱</span> ${escHtml(timeLabel)}
      </span>
      <span class="meta-badge skill-badge skill-${skill}">
        <span class="icon">⭐</span> ${skill}/5 · ${escHtml(skillLabel[skill])}
      </span>
    </div>

    <div class="card-body">
      ${allHave.length > 0 ? `
        <div class="ingredient-section">
          <div class="section-label">Ingredients used</div>
          <div class="ingredient-tags">
            ${allHave.map(ing => {
              const isHave = haveIngredients.includes(ing);
              return `<span class="ing-tag ${isHave ? 'have' : 'need'}">${escHtml(ing)}</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${recipe.additional_ingredients.length > 0 ? `
        <div class="ingredient-section">
          <div class="section-label">Also needed</div>
          <div class="ingredient-tags">
            ${recipe.additional_ingredients.map(ing =>
              `<span class="ing-tag need">${escHtml(ing)}</span>`
            ).join('')}
          </div>
        </div>
      ` : ''}

      <div class="steps-section">
        <button class="steps-toggle" aria-expanded="false">
          <span>${recipe.steps.length} steps</span>
          <em class="chevron">▾</em>
        </button>
        <ol class="steps-list">
          ${recipe.steps.map((step, i) =>
            `<li class="step-item"><span class="step-num">${i + 1}</span><span>${escHtml(step)}</span></li>`
          ).join('')}
        </ol>
      </div>
    </div>
  `;

  const toggle = card.querySelector('.steps-toggle');
  const stepsList = card.querySelector('.steps-list');

  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('open');
    stepsList.classList.toggle('visible', open);
    toggle.setAttribute('aria-expanded', open);
  });

  return card;
}

function formatTime(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

resetBtn.addEventListener('click', () => {
  resultsSection.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => input.focus(), 400);
});
