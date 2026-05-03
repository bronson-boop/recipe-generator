// ── Page navigation ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => {
    p.hidden = true;
    p.classList.remove('active');
  });
  const page = document.getElementById(id);
  page.hidden = false;
  page.classList.add('active');
  window.scrollTo(0, 0);
}

// ── Landing ──
document.getElementById('photoBtn').addEventListener('click', () => {
  document.getElementById('photoInput').click();
});

document.getElementById('manualBtn').addEventListener('click', () => {
  showPage('pageManual');
  setTimeout(() => document.getElementById('manualIngredientInput').focus(), 100);
});

// ── Photo flow ──
document.getElementById('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Show photo page with preview
  const url = URL.createObjectURL(file);
  document.getElementById('photoPreview').src = url;
  document.getElementById('identifyStatus').hidden = false;
  document.getElementById('photoIngredientArea').hidden = true;
  showPage('pagePhoto');

  // Convert to base64
  const base64 = await fileToBase64(file);
  const mediaType = file.type || 'image/jpeg';

  try {
    setLoading(true, 'Identifying ingredients…');
    const res = await fetch('/api/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, media_type: mediaType })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not identify ingredients');

    photoIngredients = data.ingredients || [];
    renderPhotoTags();
    document.getElementById('identifyStatus').hidden = true;
    document.getElementById('photoIngredientArea').hidden = false;
  } catch (err) {
    alert(err.message);
    showPage('pageLanding');
  } finally {
    setLoading(false);
    e.target.value = ''; // reset so same photo can be re-selected
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Photo ingredient tags
let photoIngredients = [];

function renderPhotoTags() {
  const list = document.getElementById('photoTagList');
  list.innerHTML = '';
  photoIngredients.forEach((ing, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escHtml(ing)}<button class="tag-remove">×</button>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => {
      photoIngredients.splice(i, 1);
      renderPhotoTags();
    });
    list.appendChild(tag);
  });
}

const photoInput2 = document.getElementById('photoIngredientInput');
photoInput2.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = photoInput2.value.trim().replace(/,+$/, '').trim();
    if (val && !photoIngredients.map(i => i.toLowerCase()).includes(val.toLowerCase())) {
      photoIngredients.push(val);
      renderPhotoTags();
    }
    photoInput2.value = '';
  }
});

document.getElementById('photoTagWrapper').addEventListener('click', () => photoInput2.focus());

document.getElementById('photoGenerateBtn').addEventListener('click', () => {
  if (photoIngredients.length > 0) generateRecipes(photoIngredients);
});

document.getElementById('backFromPhoto').addEventListener('click', () => showPage('pageLanding'));

// ── Manual flow ──
let manualIngredients = [];

const manualInput = document.getElementById('manualIngredientInput');
manualInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addManualIngredient(manualInput.value);
  }
  if (e.key === 'Backspace' && manualInput.value === '' && manualIngredients.length > 0) {
    manualIngredients.pop();
    renderManualTags();
    updateManualBtn();
  }
});

manualInput.addEventListener('blur', () => {
  if (manualInput.value.trim()) addManualIngredient(manualInput.value);
});

document.getElementById('manualTagWrapper').addEventListener('click', () => manualInput.focus());

function addManualIngredient(raw) {
  const name = raw.trim().replace(/,+$/, '').trim();
  if (!name) return;
  if (!manualIngredients.map(i => i.toLowerCase()).includes(name.toLowerCase())) {
    manualIngredients.push(name);
  }
  manualInput.value = '';
  renderManualTags();
  updateManualBtn();
}

function renderManualTags() {
  const list = document.getElementById('manualTagList');
  list.innerHTML = '';
  manualIngredients.forEach((ing, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escHtml(ing)}<button class="tag-remove">×</button>`;
    tag.querySelector('.tag-remove').addEventListener('click', e => {
      e.stopPropagation();
      manualIngredients.splice(i, 1);
      renderManualTags();
      updateManualBtn();
    });
    list.appendChild(tag);
  });
}

function updateManualBtn() {
  document.getElementById('manualGenerateBtn').disabled = manualIngredients.length === 0;
}

document.getElementById('manualGenerateBtn').addEventListener('click', () => {
  if (manualIngredients.length > 0) generateRecipes(manualIngredients);
});

document.getElementById('backFromManual').addEventListener('click', () => {
  manualIngredients = [];
  renderManualTags();
  updateManualBtn();
  showPage('pageLanding');
});

// ── Recipe generation ──
async function fetchWithTimeout(url, options, ms = 55000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function generateRecipes(ingredients) {
  setLoading(true, 'Finding your recipes…');
  try {
    const res = await fetchWithTimeout('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    renderRecipes(data.recipes, ingredients);
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Request timed out — please try again.' : (err.message || 'Failed to generate recipes.');
    alert(msg);
  } finally {
    setLoading(false);
  }
}

function renderRecipes(recipes, ingredients) {
  const grid = document.getElementById('recipeGrid');
  grid.innerHTML = '';
  const ingredientsLower = ingredients.map(i => i.toLowerCase());
  document.getElementById('resultsTitle').textContent = `${recipes.length} recipes for you`;

  recipes.forEach((recipe, idx) => {
    const card = buildCard(recipe, ingredientsLower, idx);
    grid.appendChild(card);
  });

  showPage('pageResults');
}

function buildCard(recipe, ingredientsLower, idx) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.style.animationDelay = `${idx * 60}ms`;

  const skillLabel = ['', 'Beginner', 'Easy', 'Intermediate', 'Advanced', 'Expert'];
  const skill = Math.min(5, Math.max(1, recipe.skill_level));
  const timeLabel = formatTime(recipe.time_minutes);

  const haveIngredients = recipe.ingredients_used.filter(ing =>
    ingredientsLower.some(i => ing.toLowerCase().includes(i) || i.includes(ing.toLowerCase()))
  );
  const extraUsed = recipe.ingredients_used.filter(ing => !haveIngredients.includes(ing));
  const allUsed = [...haveIngredients, ...extraUsed];

  card.innerHTML = `
    <div class="card-header">
      <div class="card-name">${escHtml(recipe.name)}</div>
      <div class="card-description">${escHtml(recipe.description)}</div>
    </div>
    <div class="card-meta">
      <span class="meta-badge"><span>⏱</span> ${escHtml(timeLabel)}</span>
      <span class="meta-badge skill-badge skill-${skill}"><span>⭐</span> ${skill}/5 · ${escHtml(skillLabel[skill])}</span>
    </div>
    <div class="card-body">
      ${allUsed.length > 0 ? `
        <div class="ingredient-section">
          <div class="section-label">Ingredients used</div>
          <div class="ingredient-tags">
            ${allUsed.map(ing => `<span class="ing-tag ${haveIngredients.includes(ing) ? 'have' : 'need'}">${escHtml(ing)}</span>`).join('')}
          </div>
        </div>` : ''}
      ${recipe.additional_ingredients.length > 0 ? `
        <div class="ingredient-section">
          <div class="section-label">Also needed</div>
          <div class="ingredient-tags">
            ${recipe.additional_ingredients.map(ing => `<span class="ing-tag need">${escHtml(ing)}</span>`).join('')}
          </div>
        </div>` : ''}
      <div class="steps-section">
        <button class="steps-toggle">
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
  });

  return card;
}

document.getElementById('resetBtn').addEventListener('click', () => {
  manualIngredients = [];
  photoIngredients = [];
  renderManualTags();
  updateManualBtn();
  showPage('pageLanding');
});

// ── Helpers ──
function setLoading(on, msg = 'Loading…') {
  const overlay = document.getElementById('loadingOverlay');
  overlay.hidden = !on;
  if (on) document.getElementById('loadingMsg').textContent = msg;
}

// Press Escape to dismiss loading if stuck
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') setLoading(false);
});
document.getElementById('loadingOverlay').addEventListener('click', () => setLoading(false));

function formatTime(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Show landing on load
showPage('pageLanding');
