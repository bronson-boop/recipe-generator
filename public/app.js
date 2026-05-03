// ── State ──
let manualIngredients = [];
let photoIngredients = [];
let currentIngredients = [];
let currentRecipes = [];
let savedRecipes = JSON.parse(localStorage.getItem('savedRecipes') || '[]');
let groceryList = JSON.parse(localStorage.getItem('groceryList') || '[]');

// ── Filters state ──
const filters = { dietary: [], servings: 2, maxTime: 0, maxSkill: 5 };

// ── Pages ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => { p.hidden = true; p.classList.remove('active'); });
  const page = document.getElementById(id);
  page.hidden = false;
  page.classList.add('active');
  window.scrollTo(0, 0);
}

// ── Build filters UI ──
function buildFiltersPanel(containerId) {
  const el = document.getElementById(containerId);
  el.innerHTML = `
    <div class="filter-group">
      <div class="filter-label">Dietary</div>
      <div class="filter-pills">
        ${['Vegetarian','Vegan','Gluten-Free','Dairy-Free'].map(d =>
          `<button class="filter-pill ${filters.dietary.includes(d) ? 'active' : ''}" data-dietary="${d}">${d}</button>`
        ).join('')}
      </div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Max cook time</div>
      <div class="filter-pills">
        ${[['Any',0],['15 min',15],['30 min',30],['45 min',45],['1 hour',60]].map(([label, val]) =>
          `<button class="filter-pill ${filters.maxTime === val ? 'active' : ''}" data-time="${val}">${label}</button>`
        ).join('')}
      </div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Max difficulty</div>
      <div class="filter-pills">
        ${[['Any',5],['1 – Beginner',1],['2 – Easy',2],['3 – Medium',3],['4 – Advanced',4]].map(([label, val]) =>
          `<button class="filter-pill ${filters.maxSkill === val ? 'active' : ''}" data-skill="${val}">${label}</button>`
        ).join('')}
      </div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Servings</div>
      <div class="serving-control">
        <button class="serving-btn" data-action="dec">−</button>
        <span class="serving-count">${filters.servings}</span>
        <button class="serving-btn" data-action="inc">+</button>
      </div>
    </div>
  `;

  el.querySelectorAll('[data-dietary]').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.dietary;
      if (filters.dietary.includes(d)) filters.dietary = filters.dietary.filter(x => x !== d);
      else filters.dietary.push(d);
      buildFiltersPanel(containerId);
    });
  });

  el.querySelectorAll('[data-time]').forEach(btn => {
    btn.addEventListener('click', () => { filters.maxTime = +btn.dataset.time; buildFiltersPanel(containerId); });
  });

  el.querySelectorAll('[data-skill]').forEach(btn => {
    btn.addEventListener('click', () => { filters.maxSkill = +btn.dataset.skill; buildFiltersPanel(containerId); });
  });

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'inc' && filters.servings < 10) filters.servings++;
      if (btn.dataset.action === 'dec' && filters.servings > 1) filters.servings--;
      buildFiltersPanel(containerId);
    });
  });
}

// ── Landing ──
document.getElementById('photoBtn').addEventListener('click', () => document.getElementById('photoInput').click());
document.getElementById('manualBtn').addEventListener('click', () => {
  buildFiltersPanel('manualFilters');
  showPage('pageManual');
  setTimeout(() => document.getElementById('manualIngredientInput').focus(), 100);
});
document.getElementById('surpriseBtn').addEventListener('click', () => generateRecipes([], true));
document.getElementById('landingSavedBtn').addEventListener('click', showSaved);
document.getElementById('landingGroceryBtn').addEventListener('click', openGrocery);

// ── Photo flow ──
document.getElementById('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById('photoPreview').src = url;
  document.getElementById('identifyStatus').hidden = false;
  document.getElementById('photoIngredientArea').hidden = true;
  showPage('pagePhoto');

  try {
    setLoading(true, 'Identifying ingredients…');
    const base64 = await fileToBase64(file);
    const res = await fetchWithTimeout('/api/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, media_type: file.type || 'image/jpeg' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not identify ingredients');
    photoIngredients = data.ingredients || [];
    renderPhotoTags();
    buildFiltersPanel('photoFilters');
    document.getElementById('identifyStatus').hidden = true;
    document.getElementById('photoIngredientArea').hidden = false;
  } catch (err) {
    alert(err.message);
    showPage('pageLanding');
  } finally {
    setLoading(false);
    e.target.value = '';
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

function renderPhotoTags() {
  const list = document.getElementById('photoTagList');
  list.innerHTML = '';
  photoIngredients.forEach((ing, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escHtml(ing)}<button class="tag-remove">×</button>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => { photoIngredients.splice(i, 1); renderPhotoTags(); });
    list.appendChild(tag);
  });
}

const photoInput2 = document.getElementById('photoIngredientInput');
photoInput2.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = photoInput2.value.trim().replace(/,+$/, '').trim();
    if (val && !photoIngredients.map(i => i.toLowerCase()).includes(val.toLowerCase())) photoIngredients.push(val);
    renderPhotoTags(); photoInput2.value = '';
  }
});
document.getElementById('photoTagWrapper').addEventListener('click', () => photoInput2.focus());
document.getElementById('photoGenerateBtn').addEventListener('click', () => { if (photoIngredients.length > 0) generateRecipes(photoIngredients); });
document.getElementById('backFromPhoto').addEventListener('click', () => showPage('pageLanding'));

// ── Manual flow ──
const manualInput = document.getElementById('manualIngredientInput');
manualInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addManualIngredient(manualInput.value); }
  if (e.key === 'Backspace' && manualInput.value === '' && manualIngredients.length > 0) {
    manualIngredients.pop(); renderManualTags(); updateManualBtn();
  }
});
manualInput.addEventListener('blur', () => { if (manualInput.value.trim()) addManualIngredient(manualInput.value); });
document.getElementById('manualTagWrapper').addEventListener('click', () => manualInput.focus());

function addManualIngredient(raw) {
  const name = raw.trim().replace(/,+$/, '').trim();
  if (!name) return;
  if (!manualIngredients.map(i => i.toLowerCase()).includes(name.toLowerCase())) manualIngredients.push(name);
  manualInput.value = ''; renderManualTags(); updateManualBtn();
}
function renderManualTags() {
  const list = document.getElementById('manualTagList');
  list.innerHTML = '';
  manualIngredients.forEach((ing, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escHtml(ing)}<button class="tag-remove">×</button>`;
    tag.querySelector('.tag-remove').addEventListener('click', e => { e.stopPropagation(); manualIngredients.splice(i, 1); renderManualTags(); updateManualBtn(); });
    list.appendChild(tag);
  });
}
function updateManualBtn() { document.getElementById('manualGenerateBtn').disabled = manualIngredients.length === 0; }
document.getElementById('manualGenerateBtn').addEventListener('click', () => { if (manualIngredients.length > 0) generateRecipes(manualIngredients); });
document.getElementById('backFromManual').addEventListener('click', () => { manualIngredients = []; renderManualTags(); updateManualBtn(); showPage('pageLanding'); });

// ── Recipe generation ──
async function generateRecipes(ingredients, surprise = false) {
  setLoading(true, surprise ? 'Finding surprise recipes…' : 'Finding your recipes…');
  currentIngredients = ingredients;
  try {
    const res = await fetchWithTimeout('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients,
        surprise,
        dietary: filters.dietary,
        servings: filters.servings,
        max_time: filters.maxTime,
        max_skill: filters.maxSkill
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    currentRecipes = data.recipes;
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
  let label = `${recipes.length} recipes for you`;
  if (filters.dietary.length) label += ` · ${filters.dietary.join(', ')}`;
  document.getElementById('resultsTitle').textContent = label;
  recipes.forEach((recipe, idx) => grid.appendChild(buildCard(recipe, ingredientsLower, idx)));
  showPage('pageResults');
}

function buildCard(recipe, ingredientsLower, idx, container) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  if (idx !== undefined) card.style.animationDelay = `${idx * 60}ms`;

  const skillLabel = ['','Beginner','Easy','Intermediate','Advanced','Expert'];
  const skill = Math.min(5, Math.max(1, recipe.skill_level));
  const isSaved = savedRecipes.some(r => r.name === recipe.name);
  const haveIngredients = (recipe.ingredients_used || []).filter(ing =>
    ingredientsLower.some(i => ing.toLowerCase().includes(i) || i.includes(ing.toLowerCase()))
  );
  const extraUsed = (recipe.ingredients_used || []).filter(ing => !haveIngredients.includes(ing));
  const allUsed = [...haveIngredients, ...extraUsed];

  card.innerHTML = `
    <div class="card-header">
      <div class="card-header-top">
        <div class="card-name">${escHtml(recipe.name)}</div>
        <div class="card-actions">
          <button class="card-btn save-btn ${isSaved ? 'saved' : ''}" title="Save recipe">${isSaved ? '❤️' : '🤍'}</button>
          <button class="card-btn share-btn" title="Share recipe">📤</button>
        </div>
      </div>
      <div class="card-description">${escHtml(recipe.description)}</div>
    </div>
    <div class="card-meta">
      <span class="meta-badge">⏱ ${escHtml(formatTime(recipe.time_minutes))}</span>
      <span class="meta-badge skill-badge skill-${skill}">⭐ ${skill}/5 · ${escHtml(skillLabel[skill])}</span>
      <span class="meta-badge">🍽 ${escHtml(String(filters.servings))} servings</span>
      ${recipe.calories_per_serving ? `<span class="meta-badge">🔥 ~${recipe.calories_per_serving} cal</span>` : ''}
    </div>
    <div class="card-body">
      ${allUsed.length > 0 ? `
        <div class="ingredient-section">
          <div class="section-label">Ingredients used</div>
          <div class="ingredient-tags">
            ${allUsed.map(ing => {
              const have = haveIngredients.includes(ing);
              return `<span class="ing-tag ${have ? 'have' : 'need'}" data-ing="${escHtml(ing)}" style="cursor:pointer" title="Click to swap">${escHtml(ing)}</span>`;
            }).join('')}
          </div>
          <div class="swap-form" id="swap-${idx}" style="display:none">
            <input class="swap-input" placeholder="Replace with…" />
            <button class="swap-btn">Swap →</button>
          </div>
        </div>` : ''}
      ${(recipe.additional_ingredients || []).length > 0 ? `
        <div class="ingredient-section">
          <div class="section-label">Also needed</div>
          <div class="ingredient-tags">
            ${recipe.additional_ingredients.map(ing => {
              const inList = groceryList.some(g => g.name.toLowerCase() === ing.toLowerCase());
              return `<span class="ing-tag need ${inList ? 'in-list' : ''}">${escHtml(ing)}<button class="add-grocery" title="Add to grocery list">${inList ? '✓' : '+'}</button></span>`;
            }).join('')}
          </div>
        </div>` : ''}
      ${(recipe.equipment || []).length > 0 ? `
        <div class="ingredient-section">
          <div class="section-label">🍳 Equipment</div>
          <div class="ingredient-tags">
            ${recipe.equipment.map(e => `<span class="ing-tag equipment">${escHtml(e)}</span>`).join('')}
          </div>
        </div>` : ''}
      <div class="steps-section">
        <button class="steps-toggle">
          <span>${(recipe.steps || []).length} steps</span>
          <em class="chevron">▾</em>
        </button>
        <ol class="steps-list">
          ${(recipe.steps || []).map((step, i) => `<li class="step-item"><span class="step-num">${i+1}</span><span>${escHtml(step)}</span></li>`).join('')}
        </ol>
      </div>
    </div>
  `;

  // Steps toggle
  const toggle = card.querySelector('.steps-toggle');
  const stepsList = card.querySelector('.steps-list');
  toggle.addEventListener('click', () => { const open = toggle.classList.toggle('open'); stepsList.classList.toggle('visible', open); });

  // Save button
  const saveBtn = card.querySelector('.save-btn');
  saveBtn.addEventListener('click', () => {
    const i = savedRecipes.findIndex(r => r.name === recipe.name);
    if (i >= 0) { savedRecipes.splice(i, 1); saveBtn.textContent = '🤍'; saveBtn.classList.remove('saved'); }
    else { savedRecipes.push({...recipe, _ingredients: ingredientsLower}); saveBtn.textContent = '❤️'; saveBtn.classList.add('saved'); }
    localStorage.setItem('savedRecipes', JSON.stringify(savedRecipes));
  });

  // Share button
  card.querySelector('.share-btn').addEventListener('click', () => shareRecipe(recipe));

  // Grocery list buttons
  card.querySelectorAll('.add-grocery').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ing = btn.closest('.ing-tag').textContent.replace(/[+✓]$/, '').trim();
      const i = groceryList.findIndex(g => g.name.toLowerCase() === ing.toLowerCase());
      if (i >= 0) { groceryList.splice(i, 1); btn.textContent = '+'; btn.closest('.ing-tag').classList.remove('in-list'); }
      else { groceryList.push({ name: ing, checked: false }); btn.textContent = '✓'; btn.closest('.ing-tag').classList.add('in-list'); }
      localStorage.setItem('groceryList', JSON.stringify(groceryList));
    });
  });

  // Swap ingredient
  const swapForm = card.querySelector('.swap-form');
  card.querySelectorAll('.ing-tag[data-ing]').forEach(tag => {
    tag.addEventListener('click', () => {
      swapForm.style.display = swapForm.style.display === 'none' ? 'flex' : 'none';
      if (swapForm.style.display === 'flex') {
        swapForm.querySelector('.swap-input').value = tag.dataset.ing;
        swapForm.querySelector('.swap-input').focus();
      }
    });
  });
  swapForm && swapForm.querySelector('.swap-btn').addEventListener('click', async () => {
    const oldIng = swapForm.querySelector('.swap-input').dataset.original;
    const newIng = swapForm.querySelector('.swap-input').value.trim();
    if (!newIng) return;
    const newIngredients = [...currentIngredients.filter(i => i.toLowerCase() !== (oldIng||'').toLowerCase()), newIng];
    swapForm.style.display = 'none';
    setLoading(true, 'Swapping ingredient…');
    try {
      const res = await fetchWithTimeout('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: newIngredients, count: 1, servings: filters.servings })
      });
      const data = await res.json();
      if (!res.ok || !data.recipes?.length) throw new Error('Could not generate replacement');
      const newCard = buildCard(data.recipes[0], newIngredients.map(i => i.toLowerCase()), undefined);
      card.replaceWith(newCard);
    } catch(err) { alert(err.message); }
    finally { setLoading(false); }
  });

  return card;
}

// ── Saved recipes ──
document.getElementById('savedBtn').addEventListener('click', showSaved);
document.getElementById('backFromSaved').addEventListener('click', () => showPage('pageResults'));

function showSaved() {
  const grid = document.getElementById('savedGrid');
  const empty = document.getElementById('savedEmpty');
  grid.innerHTML = '';
  if (savedRecipes.length === 0) { empty.hidden = false; }
  else {
    empty.hidden = true;
    savedRecipes.forEach((r, i) => grid.appendChild(buildCard(r, r._ingredients || [], i)));
  }
  showPage('pageSaved');
}

// ── Grocery list ──
document.getElementById('groceryBtn').addEventListener('click', openGrocery);
document.getElementById('groceryClose').addEventListener('click', () => document.getElementById('groceryModal').classList.remove('visible'));
document.getElementById('groceryClear').addEventListener('click', () => { groceryList = []; localStorage.setItem('groceryList', JSON.stringify(groceryList)); renderGrocery(); });
document.getElementById('groceryCopy').addEventListener('click', () => {
  const text = groceryList.map(g => (g.checked ? '✓ ' : '• ') + g.name).join('\n');
  navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
});

function openGrocery() { renderGrocery(); document.getElementById('groceryModal').classList.add('visible'); }

function renderGrocery() {
  const container = document.getElementById('groceryItems');
  const empty = document.getElementById('groceryEmpty');
  container.innerHTML = '';
  if (groceryList.length === 0) { empty.hidden = false; return; }
  empty.hidden = true;
  groceryList.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'grocery-item';
    row.innerHTML = `
      <input type="checkbox" id="g${i}" ${item.checked ? 'checked' : ''} />
      <label for="g${i}" class="${item.checked ? 'checked' : ''}">${escHtml(item.name)}</label>
      <button class="remove-item">×</button>
    `;
    row.querySelector('input').addEventListener('change', e => {
      groceryList[i].checked = e.target.checked;
      row.querySelector('label').className = e.target.checked ? 'checked' : '';
      localStorage.setItem('groceryList', JSON.stringify(groceryList));
    });
    row.querySelector('.remove-item').addEventListener('click', () => {
      groceryList.splice(i, 1);
      localStorage.setItem('groceryList', JSON.stringify(groceryList));
      renderGrocery();
    });
    container.appendChild(row);
  });
}

// ── Share ──
function shareRecipe(recipe) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(recipe))));
  const url = `${location.origin}${location.pathname}#recipe=${encoded}`;
  document.getElementById('shareUrl').value = url;
  document.getElementById('shareModal').classList.add('visible');
}
document.getElementById('shareClose').addEventListener('click', () => document.getElementById('shareModal').classList.remove('visible'));
document.getElementById('shareCopy').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('shareUrl').value).then(() => alert('Link copied!'));
});

// On load, check for shared recipe in URL
window.addEventListener('load', () => {
  const hash = location.hash;
  if (hash.startsWith('#recipe=')) {
    try {
      const recipe = JSON.parse(decodeURIComponent(escape(atob(hash.slice(8)))));
      const grid = document.getElementById('recipeGrid');
      grid.innerHTML = '';
      grid.appendChild(buildCard(recipe, [], 0));
      document.getElementById('resultsTitle').textContent = recipe.name;
      showPage('pageResults');
    } catch(e) { showPage('pageLanding'); }
  } else {
    showPage('pageLanding');
  }
});

// ── Reset ──
document.getElementById('resetBtn').addEventListener('click', () => {
  manualIngredients = []; photoIngredients = [];
  renderManualTags(); updateManualBtn();
  showPage('pageLanding');
});

// ── Helpers ──
function setLoading(on, msg = 'Loading…') {
  document.getElementById('loadingOverlay').classList.toggle('visible', on);
  if (on) document.getElementById('loadingMsg').textContent = msg;
}
document.getElementById('loadingCancel').addEventListener('click', () => setLoading(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { setLoading(false); document.getElementById('groceryModal').classList.remove('visible'); document.getElementById('shareModal').classList.remove('visible'); } });

async function fetchWithTimeout(url, options, ms = 55000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

function formatTime(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
