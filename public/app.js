// ── Service Worker ──
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

// ── State ──
let manualIngredients = [], photoIngredients = [], currentIngredients = [];
let currentRecipes = [], allRenderedRecipes = [];
let cookRecipe = null, cookStep = 0, timerInterval = null, timerSeconds = 0, timerRunning = false;
let scaleFactors = {};
let chefScript = null, chefStep = 0, chefAutoPlay = null, chefSpeaking = false;

const profile = JSON.parse(localStorage.getItem('profile') || '{"name":"","skill":3,"dietary":[],"language":"English"}');
let savedRecipes  = JSON.parse(localStorage.getItem('savedRecipes')  || '[]');
let groceryList   = JSON.parse(localStorage.getItem('groceryList')   || '[]');
let history_      = JSON.parse(localStorage.getItem('history')       || '[]');
let mealPlan      = JSON.parse(localStorage.getItem('mealPlan')      || '{}');
let fridgeItems   = JSON.parse(localStorage.getItem('fridgeItems')   || '[]');
let cookedLog     = JSON.parse(localStorage.getItem('cookedLog')     || '[]');
let ratings       = JSON.parse(localStorage.getItem('ratings')       || '{}');
let notes         = JSON.parse(localStorage.getItem('notes')         || '{}');
let lastIngredients = JSON.parse(localStorage.getItem('lastIngredients') || '[]');
let streakData    = JSON.parse(localStorage.getItem('streakData')    || '{"lastDate":"","count":0}');

const filters = {
  dietary: [...(profile.dietary||[])], servings: 2, maxTime: 0,
  maxSkill: profile.skill||5, cuisine: '', mealType: '', budgetMode: false,
  chefStyle: '', language: profile.language||'English'
};

// ── Trending ingredients ──
const TRENDING = ['chicken','pasta','eggs','avocado','salmon','tofu','lentils','sweet potato','spinach','garlic'];
const SEASONAL = {
  winter:['butternut squash','parsnip','kale','Brussels sprouts'],
  spring:['asparagus','peas','radish','artichoke'],
  summer:['tomatoes','zucchini','corn','peaches'],
  fall:['pumpkin','apple','mushroom','cauliflower']
};
const month = new Date().getMonth();
const season = month<2||month===11?'winter':month<5?'spring':month<8?'summer':'fall';

// ── Pages ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>{p.hidden=true;p.classList.remove('active')});
  document.getElementById('pageCook').classList.remove('active');
  const p = document.getElementById(id);
  p.hidden=false; p.classList.add('active'); window.scrollTo(0,0);
}

// ── Dark mode ──
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  document.getElementById('darkToggle').textContent = dark?'☀️':'🌙';
  localStorage.setItem('darkMode', dark?'1':'0');
}
applyTheme(false); // default light
document.getElementById('darkToggle').addEventListener('click', ()=> applyTheme(document.documentElement.getAttribute('data-theme')!=='dark'));

// ── Streak ──
function updateStreak() {
  const today = new Date().toDateString();
  document.getElementById('streakCount').textContent = streakData.count;
}
function markCooked(recipe) {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now()-86400000).toDateString();
  if (streakData.lastDate===today) {/* already counted */}
  else if (streakData.lastDate===yesterday) { streakData.count++; streakData.lastDate=today; }
  else { streakData.count=1; streakData.lastDate=today; }
  localStorage.setItem('streakData', JSON.stringify(streakData));
  cookedLog.unshift({name:recipe.name, date:today});
  localStorage.setItem('cookedLog', JSON.stringify(cookedLog));
  updateStreak();
}
updateStreak();

// ── Trending tags ──
function buildTrending() {
  const seasonal = SEASONAL[season]||[];
  const tags = [...seasonal.slice(0,2), ...TRENDING.slice(0,6)];
  const el = document.getElementById('trendingTags');
  el.innerHTML = tags.map(t=>`<button class="trending-tag">${t}</button>`).join('');
  el.querySelectorAll('.trending-tag').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if (!manualIngredients.includes(btn.textContent)) manualIngredients.push(btn.textContent);
      buildFiltersPanel('manualFilters');
      showPage('pageManual');
      renderManualTags(); updateManualBtn();
    });
  });
}
buildTrending();

// ── Filters builder ──
function buildFiltersPanel(id) {
  const el = document.getElementById(id);
  el.innerHTML = `
    <div class="filter-group">
      <div class="filter-label">Dietary</div>
      <div class="filter-pills">${['Vegetarian','Vegan','Gluten-Free','Dairy-Free'].map(d=>`<button class="filter-pill ${filters.dietary.includes(d)?'active':''}" data-dietary="${d}">${d}</button>`).join('')}</div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Max time</div>
      <div class="filter-pills">${[['Any',0],['15m',15],['30m',30],['45m',45],['1h',60]].map(([l,v])=>`<button class="filter-pill ${filters.maxTime===v?'active':''}" data-time="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Difficulty</div>
      <div class="filter-pills">${[['Any',5],['Beginner',1],['Easy',2],['Medium',3],['Advanced',4]].map(([l,v])=>`<button class="filter-pill ${filters.maxSkill===v?'active':''}" data-skill="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Meal type</div>
      <div class="filter-pills">${[['Any',''],['Breakfast','breakfast'],['Lunch','lunch'],['Dinner','dinner'],['Snack','snack'],['Dessert','dessert']].map(([l,v])=>`<button class="filter-pill ${filters.mealType===v?'active':''}" data-meal="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Cuisine</div>
      <div class="filter-pills">${[['Any',''],['Italian','Italian'],['Mexican','Mexican'],['Asian','Asian'],['Mediterranean','Mediterranean'],['American','American'],['Indian','Indian'],['French','French']].map(([l,v])=>`<button class="filter-pill ${filters.cuisine===v?'active':''}" data-cuisine="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Servings</div>
      <div class="serving-control">
        <button class="serving-btn" data-action="dec">−</button>
        <span class="serving-count">${filters.servings}</span>
        <button class="serving-btn" data-action="inc">+</button>
      </div>
    </div>
    <div class="filter-group">
      <div class="filter-label">Chef style (optional)</div>
      <input class="chef-input" placeholder="e.g. Gordon Ramsay, Julia Child…" value="${filters.chefStyle}"/>
    </div>
    <div class="filter-group">
      <div class="filter-label">Options</div>
      <div class="filter-pills">
        <button class="filter-pill ${filters.budgetMode?'active':''}" data-toggle="budget">💰 Budget mode</button>
        <button class="filter-pill ${filters.language!=='English'?'active':''}" data-toggle="lang">${filters.language!=='English'?filters.language:'🌍 Language'}</button>
      </div>
    </div>
  `;
  el.querySelector('[data-toggle="lang"]').addEventListener('click', ()=>{ openProfile(); });
  el.querySelectorAll('[data-dietary]').forEach(b=>b.addEventListener('click',()=>{const d=b.dataset.dietary;filters.dietary.includes(d)?filters.dietary=filters.dietary.filter(x=>x!==d):filters.dietary.push(d);buildFiltersPanel(id)}));
  el.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{filters.maxTime=+b.dataset.time;buildFiltersPanel(id)}));
  el.querySelectorAll('[data-skill]').forEach(b=>b.addEventListener('click',()=>{filters.maxSkill=+b.dataset.skill;buildFiltersPanel(id)}));
  el.querySelectorAll('[data-meal]').forEach(b=>b.addEventListener('click',()=>{filters.mealType=b.dataset.meal;buildFiltersPanel(id)}));
  el.querySelectorAll('[data-cuisine]').forEach(b=>b.addEventListener('click',()=>{filters.cuisine=b.dataset.cuisine;buildFiltersPanel(id)}));
  el.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.action==='inc'&&filters.servings<12)filters.servings++;if(b.dataset.action==='dec'&&filters.servings>1)filters.servings--;buildFiltersPanel(id)}));
  el.querySelector('[data-toggle="budget"]').addEventListener('click',()=>{filters.budgetMode=!filters.budgetMode;buildFiltersPanel(id)});
  el.querySelector('.chef-input').addEventListener('input',e=>filters.chefStyle=e.target.value);
}

// ── Landing ──
document.getElementById('photoBtn').addEventListener('click',()=>document.getElementById('photoInput').click());
document.getElementById('manualBtn').addEventListener('click',()=>{
  buildFiltersPanel('manualFilters');
  buildQuickAdd();
  showPage('pageManual');
  setTimeout(()=>document.getElementById('manualIngredientInput').focus(),100);
});

function buildQuickAdd() {
  const row = document.getElementById('quickAddRow');
  if (!row) return;
  const common = ['🧄 Garlic','🍋 Lemon','🧅 Onion','🍗 Chicken','🥚 Eggs','🧀 Cheese','🍅 Tomatoes','🥬 Spinach','🍚 Rice','🍝 Pasta'];
  row.innerHTML = common.map(i=>`<button class="quick-add-btn">${i}</button>`).join('');
  row.querySelectorAll('.quick-add-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const name = btn.textContent.replace(/^\S+\s/,''); // strip emoji
      addManualIng(name);
      btn.style.opacity='.35';btn.style.pointerEvents='none';
    });
  });
}
document.getElementById('surpriseBtn').addEventListener('click',()=>generateRecipes([],true));
document.getElementById('landingSavedBtn').addEventListener('click',showSaved);
document.getElementById('landingGroceryBtn').addEventListener('click',openGrocery);
document.getElementById('historyBtn').addEventListener('click',showHistory);
document.getElementById('plannerBtn').addEventListener('click',showPlanner);
document.getElementById('fridgeBtn').addEventListener('click',()=>showPage('pageFridge'));
document.getElementById('streakBtn').addEventListener('click',()=>alert(`🔥 ${streakData.count}-day cooking streak!\nKeep it up!`));
document.getElementById('rotdBtn').addEventListener('click',openRotd);
document.getElementById('cookAgainBtn').addEventListener('click',()=>{
  if (!lastIngredients.length) return alert('No previous search found!');
  currentIngredients = lastIngredients;
  generateRecipes(lastIngredients);
});
document.getElementById('profileBtn').addEventListener('click',openProfile);

// ── Photo flow ──
document.getElementById('photoInput').addEventListener('change', async e=>{
  const file = e.target.files[0]; if(!file) return;
  document.getElementById('photoPreview').src = URL.createObjectURL(file);
  document.getElementById('identifyStatus').hidden=false;
  document.getElementById('photoIngredientArea').hidden=true;
  showPage('pagePhoto');
  try {
    setLoading(true,'Identifying ingredients…');
    const b64 = await fileToBase64(file);
    const res = await fetchT('/api/identify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:b64,media_type:file.type||'image/jpeg'})});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error||'Could not identify');
    photoIngredients = data.ingredients||[];
    renderPhotoTags(); buildFiltersPanel('photoFilters');
    document.getElementById('identifyStatus').hidden=true;
    document.getElementById('photoIngredientArea').hidden=false;
  } catch(err){alert(err.message);showPage('pageLanding');}
  finally{setLoading(false);e.target.value='';}
});
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})}
function renderPhotoTags(){
  const list=document.getElementById('photoTagList');list.innerHTML='';
  photoIngredients.forEach((ing,i)=>{const t=document.createElement('span');t.className='tag';t.innerHTML=`${escHtml(ing)}<button class="tag-remove">×</button>`;t.querySelector('.tag-remove').addEventListener('click',()=>{photoIngredients.splice(i,1);renderPhotoTags()});list.appendChild(t)});
}
const photoIn2=document.getElementById('photoIngredientInput');
photoIn2.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();const v=photoIn2.value.trim().replace(/,+$/,'').trim();if(v&&!photoIngredients.map(i=>i.toLowerCase()).includes(v.toLowerCase()))photoIngredients.push(v);renderPhotoTags();photoIn2.value=''}});
document.getElementById('photoTagWrapper').addEventListener('click',()=>photoIn2.focus());
document.getElementById('photoGenerateBtn').addEventListener('click',()=>{if(photoIngredients.length>0)generateRecipes(photoIngredients)});
document.getElementById('backFromPhoto').addEventListener('click',()=>showPage('pageLanding'));

// ── Manual flow ──
const manualIn=document.getElementById('manualIngredientInput');
manualIn.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===','){e.preventDefault();addManualIng(manualIn.value)}
  if(e.key==='Backspace'&&manualIn.value===''&&manualIngredients.length>0){manualIngredients.pop();renderManualTags();updateManualBtn()}
});
manualIn.addEventListener('blur',()=>{if(manualIn.value.trim())addManualIng(manualIn.value)});
document.getElementById('manualTagWrapper').addEventListener('click',()=>manualIn.focus());
function addManualIng(raw){const n=raw.trim().replace(/,+$/,'').trim();if(!n)return;if(!manualIngredients.map(i=>i.toLowerCase()).includes(n.toLowerCase()))manualIngredients.push(n);manualIn.value='';renderManualTags();updateManualBtn()}
function renderManualTags(){
  const list=document.getElementById('manualTagList');list.innerHTML='';
  manualIngredients.forEach((ing,i)=>{const t=document.createElement('span');t.className='tag';t.innerHTML=`${escHtml(ing)}<button class="tag-remove">×</button>`;t.querySelector('.tag-remove').addEventListener('click',e=>{e.stopPropagation();manualIngredients.splice(i,1);renderManualTags();updateManualBtn()});list.appendChild(t)});
}
function updateManualBtn(){document.getElementById('manualGenerateBtn').disabled=manualIngredients.length===0}
document.getElementById('manualGenerateBtn').addEventListener('click',()=>{if(manualIngredients.length>0)generateRecipes(manualIngredients)});
document.getElementById('backFromManual').addEventListener('click',()=>{manualIngredients=[];renderManualTags();updateManualBtn();showPage('pageLanding')});

// ── Voice input ──
const voiceBtn=document.getElementById('voiceBtn');
if('webkitSpeechRecognition' in window||'SpeechRecognition' in window){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const recog=new SR();recog.lang='en-US';recog.continuous=false;recog.interimResults=false;
  voiceBtn.addEventListener('click',()=>{voiceBtn.classList.add('listening');recog.start()});
  recog.onresult=e=>{const text=e.results[0][0].transcript;text.split(/,|\band\b/).forEach(w=>{const t=w.trim();if(t)addManualIng(t)})};
  recog.onend=()=>voiceBtn.classList.remove('listening');
  recog.onerror=()=>voiceBtn.classList.remove('listening');
} else { voiceBtn.style.display='none'; }

// ── Recipe generation ──
async function generateRecipes(ingredients, surprise=false, opts={}) {
  setLoading(true, surprise?'Finding surprise recipes…':'Finding your recipes…');
  currentIngredients=ingredients;
  if(ingredients.length) { lastIngredients=ingredients; localStorage.setItem('lastIngredients',JSON.stringify(ingredients)); }
  try {
    const res = await fetchT('/api/recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      ingredients, surprise,
      dietary: filters.dietary, servings: filters.servings,
      max_time: filters.maxTime, max_skill: filters.maxSkill,
      cuisine: filters.cuisine, meal_type: filters.mealType,
      budget_mode: filters.budgetMode, chef_style: filters.chefStyle,
      language: filters.language||profile.language||'English',
      count: opts.count||5, ...opts
    })});
    const data = await res.json();
    if(!res.ok) throw new Error(data.error||'Something went wrong');
    currentRecipes=data.recipes;
    addHistory(ingredients, surprise, data.recipes);
    renderRecipes(data.recipes, ingredients);
  } catch(err) {
    alert(err.name==='AbortError'?'Request timed out — please try again.':(err.message||'Failed.'));
  } finally { setLoading(false); }
}

function addHistory(ingredients, surprise, recipes) {
  history_.unshift({ingredients, surprise, recipes, date:new Date().toLocaleString(), season});
  if(history_.length>20) history_.pop();
  localStorage.setItem('history', JSON.stringify(history_));
}

// ── Render results ──
function renderRecipes(recipes, ingredients) {
  allRenderedRecipes=recipes;
  const grid=document.getElementById('recipeGrid');
  grid.innerHTML='';
  const ingLower=ingredients.map(i=>i.toLowerCase());
  let label=`${recipes.length} recipes for you`;
  if(filters.dietary.length) label+=` · ${filters.dietary.join(', ')}`;
  if(filters.chefStyle) label+=` · ${filters.chefStyle} style`;
  document.getElementById('resultsTitle').textContent=label;
  document.getElementById('resultsMeta').textContent=[
    filters.maxTime?`Max ${filters.maxTime}min`:'',
    filters.mealType?filters.mealType:'',
    filters.cuisine?filters.cuisine:'',
    filters.budgetMode?'Budget mode':'',
    season?`${season} recipes`:'',
  ].filter(Boolean).join(' · ');
  recipes.forEach((r,i)=>grid.appendChild(buildCard(r,ingLower,i)));
  showPage('pageResults');
  setupResultsToolbar();
}

function setupResultsToolbar() {
  const search=document.getElementById('searchBar');
  const sort=document.getElementById('sortSelect');
  search.value=''; sort.value='';
  const rerender=()=>{
    let recipes=[...allRenderedRecipes];
    const q=search.value.toLowerCase();
    if(q) recipes=recipes.filter(r=>r.name.toLowerCase().includes(q)||r.description.toLowerCase().includes(q));
    if(sort.value==='time') recipes.sort((a,b)=>a.time_minutes-b.time_minutes);
    if(sort.value==='skill') recipes.sort((a,b)=>a.skill_level-b.skill_level);
    if(sort.value==='calories') recipes.sort((a,b)=>(a.calories_per_serving||999)-(b.calories_per_serving||999));
    if(sort.value==='cost') recipes.sort((a,b)=>(a.estimated_cost||'$').length-(b.estimated_cost||'$').length);
    const grid=document.getElementById('recipeGrid');
    grid.innerHTML='';
    const ingLower=currentIngredients.map(i=>i.toLowerCase());
    recipes.forEach((r,i)=>grid.appendChild(buildCard(r,ingLower,i)));
  };
  search.oninput=rerender; sort.onchange=rerender;
}

// ── Build card ──
function buildCard(recipe, ingLower, idx) {
  const card=document.createElement('div');
  card.className='recipe-card';
  if(idx!==undefined) card.style.animationDelay=`${idx*50}ms`;
  const sk=Math.min(5,Math.max(1,recipe.skill_level));
  const skLabel=['','Beginner','Easy','Intermediate','Advanced','Expert'][sk];
  const isSaved=savedRecipes.some(r=>r.name===recipe.name);
  const rating=ratings[recipe.name]||0;
  const note=notes[recipe.name]||'';
  const cooked=cookedLog.find(c=>c.name===recipe.name);
  const scale=scaleFactors[recipe.name]||1;
  const scaledServings=Math.round(filters.servings*scale);
  const haveIngs=(recipe.ingredients_used||[]).filter(ing=>ingLower.some(i=>ing.toLowerCase().includes(i)||i.includes(ing.toLowerCase())));
  const extraIngs=(recipe.ingredients_used||[]).filter(ing=>!haveIngs.includes(ing));
  const allergens=recipe.allergens||[];
  const nutrition=recipe.nutrition||{};

  // Pick hero colour + emoji based on cuisine/meal type
  const heroColors = {
    italian:'linear-gradient(135deg,#c0392b,#e74c3c)',
    mexican:'linear-gradient(135deg,#d35400,#e67e22)',
    asian:'linear-gradient(135deg,#c0392b,#8e44ad)',
    mediterranean:'linear-gradient(135deg,#27ae60,#2980b9)',
    american:'linear-gradient(135deg,#2c3e50,#e74c3c)',
    indian:'linear-gradient(135deg,#f39c12,#e74c3c)',
    french:'linear-gradient(135deg,#2980b9,#8e44ad)',
    breakfast:'linear-gradient(135deg,#f39c12,#f7931e)',
    lunch:'linear-gradient(135deg,#27ae60,#2ecc71)',
    dinner:'linear-gradient(135deg,#8e44ad,#3498db)',
    snack:'linear-gradient(135deg,#e74c3c,#ff6b9d)',
    dessert:'linear-gradient(135deg,#ff6b9d,#f39c12)',
  };
  const heroEmojis = {italian:'🍝',mexican:'🌮',asian:'🍜',mediterranean:'🥗',american:'🍔',indian:'🍛',french:'🥐',breakfast:'🍳',lunch:'🥪',dinner:'🍽',snack:'🍎',dessert:'🎂'};
  const heroKey = (recipe.cuisine||recipe.meal_type||'').toLowerCase();
  const heroColor = Object.entries(heroColors).find(([k])=>heroKey.includes(k))?.[1] || 'linear-gradient(135deg,#ff6b35,#f7931e)';
  const heroEmoji = Object.entries(heroEmojis).find(([k])=>heroKey.includes(k))?.[1] || '🍳';

  card.innerHTML=`
    <div class="card-hero" style="background:${heroColor}">
      <div class="card-hero-emoji">${heroEmoji}</div>
      ${cooked?`<span class="cooked-badge">✓ Cooked</span>`:''}
      <div class="card-actions">
        <button class="card-btn save-btn ${isSaved?'saved':''}">${isSaved?'❤️':'🤍'}</button>
        ${filters.chefStyle?`<button class="card-btn chef-show-btn">🎬</button>`:''}
        <button class="card-btn cook-btn">👨‍🍳</button>
        <button class="card-btn share-btn">📤</button>
      </div>
      <div class="card-hero-content">
        ${(recipe.cuisine||recipe.meal_type)?`<div class="card-type-chip">${escHtml(recipe.cuisine||(recipe.meal_type||''))}</div>`:''}
        <div class="card-name">${escHtml(recipe.name)}</div>
        <div class="card-description">${escHtml(recipe.description)}</div>
      </div>
    </div>

    <div class="card-stats">
      <div class="card-stat"><div class="card-stat-val">${escHtml(formatTime(recipe.time_minutes))}</div><div class="card-stat-key">⏱ Time</div></div>
      <div class="card-stat"><div class="card-stat-val" style="color:var(--skill-${sk})">${skLabel}</div><div class="card-stat-key">⭐ Level</div></div>
      <div class="card-stat"><div class="card-stat-val">${recipe.calories_per_serving?`${Math.round(recipe.calories_per_serving*scale)} cal`:'—'}</div><div class="card-stat-key">🔥 Per serving</div></div>
    </div>

    ${recipe.estimated_cost_total?`
    <div class="card-cost-bar">
      <div>
        <div class="card-cost-total">${escHtml(recipe.estimated_cost_total)}</div>
        <div class="card-cost-label">total estimated cost</div>
      </div>
      <div class="card-cost-detail">
        <div class="card-cost-per">${escHtml(recipe.estimated_cost_per_serving||'')}</div>
        <div class="card-cost-label">per person</div>
      </div>
    </div>`:``}

    <div class="card-badges">
      <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(recipe.name+' recipe')}" target="_blank" class="badge badge-light" style="text-decoration:none">▶ Watch on YouTube</a>
      ${allergens.filter(a=>a!=='none').map(a=>`<span class="allergen-badge">⚠️ ${escHtml(a)}</span>`).join('')}
    </div>

    <div class="card-body">
      <div class="scale-row">
        <span class="scale-label">Scale:</span>
        <button class="scale-btn" data-scale="dec">−</button>
        <span class="scale-val">${scale}×</span>
        <button class="scale-btn" data-scale="inc">+</button>
      </div>

      ${[...haveIngs,...extraIngs].length>0?`
        <div class="ingredient-section" style="margin-top:12px">
          <div class="section-label">Ingredients you have</div>
          <div class="ingredient-tags">
            ${[...haveIngs,...extraIngs].map(ing=>`<span class="ing-tag ${haveIngs.includes(ing)?'have':'need'} clickable" data-ing="${escHtml(ing)}" title="Click to swap">${escHtml(ing)}</span>`).join('')}
          </div>
          <div class="swap-form" style="display:none">
            <input class="swap-input" placeholder="Replace with…"/>
            <button class="swap-btn">Swap →</button>
          </div>
        </div>`:``}

      ${(recipe.additional_ingredients||[]).length?`
        <div class="ingredient-section">
          <div class="section-label">Need to buy</div>
          <div class="ingredient-tags">
            ${recipe.additional_ingredients.map(ing=>{const inL=groceryList.some(g=>g.name.toLowerCase()===ing.toLowerCase());return`<span class="ing-tag need ${inL?'in-list':''}">${escHtml(ing)}<button class="add-grocery">${inL?'✓':'+'}</button></span>`}).join('')}
          </div>
        </div>`:``}

      ${(recipe.equipment||[]).length?`
        <div class="ingredient-section">
          <div class="section-label">Equipment</div>
          <div class="ingredient-tags">${recipe.equipment.map(e=>`<span class="ing-tag equipment">${escHtml(e)}</span>`).join('')}</div>
        </div>`:``}

      ${nutrition.protein_g?`
        <button class="card-expand-btn"><span>📊 Nutrition per serving</span><em class="chev">▾</em></button>
        <div class="card-expand-content">
          <div class="nutrition-grid">
            <div class="nutrition-item"><div class="nutrition-val">${Math.round((nutrition.protein_g||0)*scale)}g</div><div class="nutrition-key">Protein</div></div>
            <div class="nutrition-item"><div class="nutrition-val">${Math.round((nutrition.carbs_g||0)*scale)}g</div><div class="nutrition-key">Carbs</div></div>
            <div class="nutrition-item"><div class="nutrition-val">${Math.round((nutrition.fat_g||0)*scale)}g</div><div class="nutrition-key">Fat</div></div>
            <div class="nutrition-item"><div class="nutrition-val">${Math.round((nutrition.fiber_g||0)*scale)}g</div><div class="nutrition-key">Fiber</div></div>
          </div>
        </div>`:``}

      ${recipe.wine_pairing?`<div style="font-size:13px;color:var(--text-muted);padding:10px 0;border-top:1px solid var(--border);margin-top:8px">🍷 ${escHtml(recipe.wine_pairing)}</div>`:``}

      ${(recipe.leftover_ideas||[]).length?`
        <button class="card-expand-btn" data-expand="leftovers"><span>🥡 Leftover ideas</span><em class="chev">▾</em></button>
        <div class="card-expand-content"><ul style="padding-left:16px;font-size:13px;display:flex;flex-direction:column;gap:4px">${recipe.leftover_ideas.map(l=>`<li>${escHtml(l)}</li>`).join('')}</ul></div>`:``}

      <button class="card-expand-btn" data-expand="steps" style="margin-top:6px"><span>${(recipe.steps||[]).length} steps</span><em class="chev">▾</em></button>
      <div class="card-expand-content">
        <ol class="steps-list">${(recipe.steps||[]).map((s,i)=>`<li class="step-item"><span class="step-num">${i+1}</span><span>${escHtml(s)}</span></li>`).join('')}</ol>
      </div>

      <div class="card-rating">${[1,2,3,4,5].map(n=>`<button class="star-btn ${rating>=n?'filled':''}" data-star="${n}">★</button>`).join('')}</div>

      <textarea class="card-notes" placeholder="Add a note…">${escHtml(note)}</textarea>

      <div class="card-action-bar">
        <button class="card-action healthier-btn">🥗 Make healthier</button>
        <button class="card-action cheaper-btn">💰 Make cheaper</button>
        <button class="card-action cooked-btn">${cooked?'✓ Cooked it!':'👆 Cooked it!'}</button>
      </div>
    </div>
  `;

  // Expand toggles
  card.querySelectorAll('.card-expand-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{const open=btn.classList.toggle('open');btn.nextElementSibling.classList.toggle('visible',open)});
  });

  // Save
  card.querySelector('.save-btn').addEventListener('click',()=>{
    const i=savedRecipes.findIndex(r=>r.name===recipe.name);
    if(i>=0){savedRecipes.splice(i,1);}else{savedRecipes.push({...recipe,_ingLower:ingLower});}
    localStorage.setItem('savedRecipes',JSON.stringify(savedRecipes));
    const newCard=buildCard(recipe,ingLower,undefined);
    card.replaceWith(newCard);
  });

  // Cook mode
  card.querySelector('.cook-btn').addEventListener('click',()=>startCookMode(recipe));

  // Chef show
  const chefBtn = card.querySelector('.chef-show-btn');
  if (chefBtn) {
    chefBtn.addEventListener('click', () => startChefShow(recipe));
  }

  // Share
  card.querySelector('.share-btn').addEventListener('click',()=>shareRecipe(recipe));

  // Grocery
  card.querySelectorAll('.add-grocery').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const ing=btn.closest('.ing-tag').textContent.replace(/[+✓]$/,'').trim();
      const i=groceryList.findIndex(g=>g.name.toLowerCase()===ing.toLowerCase());
      if(i>=0){groceryList.splice(i,1);}else{groceryList.push({name:ing,checked:false});}
      localStorage.setItem('groceryList',JSON.stringify(groceryList));
      const newCard=buildCard(recipe,ingLower,undefined);card.replaceWith(newCard);
    });
  });

  // Swap
  const swapForm=card.querySelector('.swap-form');
  card.querySelectorAll('.ing-tag.clickable').forEach(tag=>{
    tag.addEventListener('click',()=>{
      swapForm.style.display=swapForm.style.display==='none'?'flex':'none';
      if(swapForm.style.display==='flex'){swapForm.querySelector('.swap-input').value=tag.dataset.ing;swapForm.querySelector('.swap-input').dataset.original=tag.dataset.ing;swapForm.querySelector('.swap-input').focus();}
    });
  });
  swapForm.querySelector('.swap-btn').addEventListener('click',async()=>{
    const oldI=swapForm.querySelector('.swap-input').dataset.original;
    const newI=swapForm.querySelector('.swap-input').value.trim();
    if(!newI) return;
    const newIngs=[...currentIngredients.filter(i=>i.toLowerCase()!==oldI.toLowerCase()),newI];
    swapForm.style.display='none';
    setLoading(true,'Swapping ingredient…');
    try {
      const res=await fetchT('/api/recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ingredients:newIngs,count:1,servings:filters.servings})});
      const data=await res.json();
      if(!res.ok||!data.recipes?.length) throw new Error('Could not swap');
      card.replaceWith(buildCard(data.recipes[0],newIngs.map(i=>i.toLowerCase()),undefined));
    } catch(err){alert(err.message);}
    finally{setLoading(false);}
  });

  // Scale
  card.querySelectorAll('.scale-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      let s=scaleFactors[recipe.name]||1;
      if(btn.dataset.scale==='inc') s=Math.min(4,+(s+0.5).toFixed(1));
      if(btn.dataset.scale==='dec') s=Math.max(0.5,+(s-0.5).toFixed(1));
      scaleFactors[recipe.name]=s;
      card.replaceWith(buildCard(recipe,ingLower,undefined));
    });
  });

  // Rating
  card.querySelectorAll('.star-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{ratings[recipe.name]=+btn.dataset.star;localStorage.setItem('ratings',JSON.stringify(ratings));card.replaceWith(buildCard(recipe,ingLower,undefined))});
  });

  // Notes
  const notesEl=card.querySelector('.card-notes');
  notesEl.addEventListener('change',()=>{notes[recipe.name]=notesEl.value;localStorage.setItem('notes',JSON.stringify(notes))});

  // Healthier / cheaper
  card.querySelector('.healthier-btn').addEventListener('click',()=>generateRecipes(ingLower.length?ingLower:currentIngredients,false,{make_healthier:true,recipe_name:recipe.name,count:1}));
  card.querySelector('.cheaper-btn').addEventListener('click',()=>generateRecipes(ingLower.length?ingLower:currentIngredients,false,{make_cheaper:true,recipe_name:recipe.name,count:1}));
  card.querySelector('.cooked-btn').addEventListener('click',()=>{markCooked(recipe);card.replaceWith(buildCard(recipe,ingLower,undefined))});

  return card;
}

// ── Cook mode ──
function startCookMode(recipe) {
  cookRecipe=recipe; cookStep=0;
  document.getElementById('pageCook').classList.add('active');
  document.getElementById('cookTitle').textContent=recipe.name;
  renderCookStep();
  const ings=(recipe.ingredients_used||[]).concat(recipe.additional_ingredients||[]);
  document.getElementById('cookIngredients').innerHTML=ings.map(i=>`<span class="ing-tag need" style="font-size:11px">${escHtml(i)}</span>`).join('');
}
function renderCookStep() {
  const steps=cookRecipe.steps||[];
  document.getElementById('cookStepText').textContent=steps[cookStep]||'Done!';
  document.getElementById('cookStepCounter').textContent=`Step ${cookStep+1} of ${steps.length}`;
  document.getElementById('prevStep').disabled=cookStep===0;
  document.getElementById('nextStep').disabled=cookStep>=steps.length-1;
  stopTimer(); resetTimer();
}
document.getElementById('backFromCook').addEventListener('click',()=>document.getElementById('pageCook').classList.remove('active'));
document.getElementById('prevStep').addEventListener('click',()=>{if(cookStep>0){cookStep--;renderCookStep()}});
document.getElementById('nextStep').addEventListener('click',()=>{const s=(cookRecipe.steps||[]);if(cookStep<s.length-1){cookStep++;renderCookStep()}});

// Timer
function pad(n){return String(n).padStart(2,'0')}
function renderTimer(){const m=Math.floor(timerSeconds/60),s=timerSeconds%60;document.getElementById('cookTimer').textContent=`${m}:${pad(s)}`}
function stopTimer(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;timerRunning=false;document.getElementById('timerStart').textContent='▶ Start'}}
function resetTimer(){timerSeconds=0;renderTimer()}
document.getElementById('timerStart').addEventListener('click',()=>{
  if(timerRunning){stopTimer();}
  else {
    const mins=+document.getElementById('timerMinutes').value||1;
    timerSeconds=mins*60; renderTimer();
    document.getElementById('timerStart').textContent='⏸ Pause';
    timerRunning=true;
    timerInterval=setInterval(()=>{
      timerSeconds--;renderTimer();
      if(timerSeconds<=0){stopTimer();resetTimer();alert('⏰ Timer done!')}
    },1000);
  }
});
document.getElementById('timerReset').addEventListener('click',()=>{stopTimer();resetTimer()});

// ── Results actions ──
document.getElementById('luckyBtn').addEventListener('click',()=>{
  if(!allRenderedRecipes.length) return;
  const r=allRenderedRecipes[Math.floor(Math.random()*allRenderedRecipes.length)];
  const card=document.querySelector('.recipe-card');
  if(card) card.scrollIntoView({behavior:'smooth'});
  alert(`🎰 How about: ${r.name}?`);
});
document.getElementById('groceryBtn').addEventListener('click',openGrocery);
document.getElementById('savedBtn').addEventListener('click',showSaved);
document.getElementById('printBtn').addEventListener('click',()=>window.print());
document.getElementById('resetBtn').addEventListener('click',()=>{manualIngredients=[];photoIngredients=[];renderManualTags();updateManualBtn();showPage('pageLanding')});

// ── Saved ──
document.getElementById('backFromSaved').addEventListener('click',()=>showPage('pageResults'));
function showSaved() {
  const grid=document.getElementById('savedGrid'),empty=document.getElementById('savedEmpty');
  grid.innerHTML='';
  if(!savedRecipes.length){empty.hidden=false;}
  else{empty.hidden=true;savedRecipes.forEach((r,i)=>grid.appendChild(buildCard(r,r._ingLower||[],i)));}
  showPage('pageSaved');
}

// ── History ──
document.getElementById('backFromHistory').addEventListener('click',()=>showPage('pageLanding'));
function showHistory() {
  const list=document.getElementById('historyList'),empty=document.getElementById('historyEmpty');
  list.innerHTML='';
  if(!history_.length){empty.hidden=false;}
  else{
    empty.hidden=true;
    history_.forEach((h,i)=>{
      const el=document.createElement('div');el.className='history-item';
      el.innerHTML=`<div class="history-item-title">${h.surprise?'🎲 Surprise recipes':`🥘 ${h.ingredients.slice(0,3).join(', ')}${h.ingredients.length>3?'…':''}`}</div><div class="history-item-meta">${h.date} · ${h.recipes.length} recipes · ${h.season}</div>`;
      el.addEventListener('click',()=>renderRecipes(h.recipes,h.ingredients));
      list.appendChild(el);
    });
  }
  showPage('pageHistory');
}

// ── Meal Planner ──
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
document.getElementById('backFromPlanner').addEventListener('click',()=>showPage('pageLanding'));
document.getElementById('autoPlanBtn').addEventListener('click',()=>{
  if(!savedRecipes.length&&!currentRecipes.length) return alert('Generate or save some recipes first!');
  const pool=[...currentRecipes,...savedRecipes];
  DAYS.forEach((d,i)=>{ mealPlan[d]=pool[i%pool.length]?.name||''; });
  localStorage.setItem('mealPlan',JSON.stringify(mealPlan));
  renderPlanner();
});
function showPlanner(){renderPlanner();showPage('pagePlanner')}
function renderPlanner() {
  const grid=document.getElementById('plannerGrid');grid.innerHTML='';
  DAYS.forEach(day=>{
    const col=document.createElement('div');col.className='planner-day';
    const meal=mealPlan[day]||'';
    col.innerHTML=`<div class="planner-day-label">${day}</div><div class="planner-slot ${meal?'filled':''}">${meal||'+ Add meal'}</div>`;
    col.querySelector('.planner-slot').addEventListener('click',()=>{
      const pool=[...currentRecipes,...savedRecipes];
      if(!pool.length) return alert('Generate or save some recipes first!');
      const names=pool.map(r=>r.name);
      const chosen=prompt(`Pick a meal for ${day}:\n${names.map((n,i)=>`${i+1}. ${n}`).join('\n')}\n\nType the number:`);
      const idx=parseInt(chosen)-1;
      if(idx>=0&&idx<names.length){mealPlan[day]=names[idx];localStorage.setItem('mealPlan',JSON.stringify(mealPlan));renderPlanner();}
    });
    grid.appendChild(col);
  });
}

// ── Fridge tracker ──
document.getElementById('backFromFridge').addEventListener('click',()=>showPage('pageLanding'));
document.getElementById('addFridgeBtn').addEventListener('click',()=>{
  const name=document.getElementById('fridgeItem').value.trim();
  const expiry=document.getElementById('fridgeExpiry').value;
  if(!name) return;
  fridgeItems.push({name,expiry,added:new Date().toISOString()});
  localStorage.setItem('fridgeItems',JSON.stringify(fridgeItems));
  document.getElementById('fridgeItem').value='';document.getElementById('fridgeExpiry').value='';
  renderFridge();
});
document.getElementById('cookFridgeBtn').addEventListener('click',()=>{
  const ings=fridgeItems.filter(f=>!isExpired(f)).map(f=>f.name);
  if(!ings.length) return alert('No valid fridge items!');
  generateRecipes(ings);
});
function isExpired(f){return f.expiry&&new Date(f.expiry)<new Date()}
function isExpiringSoon(f){if(!f.expiry) return false;const d=(new Date(f.expiry)-new Date())/(1000*60*60*24);return d>=0&&d<=3}
function renderFridge() {
  const list=document.getElementById('fridgeList');list.innerHTML='';
  fridgeItems.forEach((item,i)=>{
    const exp=isExpired(item),soon=!exp&&isExpiringSoon(item);
    const el=document.createElement('div');el.className=`fridge-item${exp?' expired':soon?' expiring':''}`;
    el.innerHTML=`<div class="fridge-name">${escHtml(item.name)}</div><div class="fridge-date">${item.expiry||'No expiry'}</div><span class="fridge-badge ${exp?'exp':soon?'soon':'ok'}">${exp?'Expired':soon?'Soon':'✓ Good'}</span><button class="fridge-remove">×</button>`;
    el.querySelector('.fridge-remove').addEventListener('click',()=>{fridgeItems.splice(i,1);localStorage.setItem('fridgeItems',JSON.stringify(fridgeItems));renderFridge()});
    list.appendChild(el);
  });
}
renderFridge();

// ── Grocery ──
document.getElementById('groceryClose').addEventListener('click',()=>document.getElementById('groceryModal').classList.remove('visible'));
document.getElementById('groceryClear').addEventListener('click',()=>{groceryList=[];localStorage.setItem('groceryList',JSON.stringify(groceryList));renderGrocery()});
document.getElementById('groceryCopy').addEventListener('click',()=>navigator.clipboard.writeText(groceryList.map(g=>(g.checked?'✓ ':'• ')+g.name).join('\n')).then(()=>alert('Copied!')));
document.getElementById('groceryWhatsapp').addEventListener('click',()=>{const txt=encodeURIComponent('🛒 Grocery List:\n'+groceryList.map(g=>'• '+g.name).join('\n'));window.open(`https://wa.me/?text=${txt}`)});
function openGrocery(){renderGrocery();document.getElementById('groceryModal').classList.add('visible')}
function renderGrocery() {
  const c=document.getElementById('groceryItems'),e=document.getElementById('groceryEmpty');c.innerHTML='';
  if(!groceryList.length){e.hidden=false;return}e.hidden=true;
  groceryList.forEach((item,i)=>{
    const row=document.createElement('div');row.className='grocery-item';
    row.innerHTML=`<input type="checkbox" id="g${i}" ${item.checked?'checked':''}/><label for="g${i}" class="${item.checked?'checked':''}">${escHtml(item.name)}</label><button class="remove-item">×</button>`;
    row.querySelector('input').addEventListener('change',e=>{groceryList[i].checked=e.target.checked;row.querySelector('label').className=e.target.checked?'checked':'';localStorage.setItem('groceryList',JSON.stringify(groceryList))});
    row.querySelector('.remove-item').addEventListener('click',()=>{groceryList.splice(i,1);localStorage.setItem('groceryList',JSON.stringify(groceryList));renderGrocery()});
    c.appendChild(row);
  });
}

// ── Share ──
function shareRecipe(recipe) {
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(recipe))));
  const url=`${location.origin}${location.pathname}#recipe=${encoded}`;
  document.getElementById('shareUrl').value=url;
  document.getElementById('shareModal').classList.add('visible');
  document.getElementById('shareCopy').onclick=()=>navigator.clipboard.writeText(url).then(()=>alert('Copied!'));
  document.getElementById('shareWhatsapp').onclick=()=>window.open(`https://wa.me/?text=${encodeURIComponent(recipe.name+': '+url)}`);
  document.getElementById('shareEmail').onclick=()=>window.open(`mailto:?subject=${encodeURIComponent(recipe.name)}&body=${encodeURIComponent('Check out this recipe: '+url)}`);
  document.getElementById('shareInsta').onclick=()=>saveRecipeImage(recipe);
  document.getElementById('shareClose').onclick=()=>document.getElementById('shareModal').classList.remove('visible');
}

function saveRecipeImage(recipe) {
  const canvas=document.getElementById('shareCanvas');
  canvas.width=1080;canvas.height=1080;canvas.hidden=false;
  const ctx=canvas.getContext('2d');
  const grad=ctx.createLinearGradient(0,0,1080,1080);
  grad.addColorStop(0,'#ff6b35');grad.addColorStop(0.5,'#f7931e');grad.addColorStop(1,'#ff6b9d');
  ctx.fillStyle=grad;ctx.fillRect(0,0,1080,1080);
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(0,600,1080,480);
  ctx.fillStyle='#fff';ctx.font='bold 72px system-ui';ctx.textAlign='center';
  ctx.fillText('🍳',540,180);
  ctx.font='bold 64px system-ui';
  const words=recipe.name.split(' ');let line='',y=300;
  words.forEach(w=>{const t=line+w+' ';if(ctx.measureText(t).width>900&&line){ctx.fillText(line,540,y);line=w+' ';y+=76}else line=t});
  ctx.fillText(line,540,y);
  ctx.font='32px system-ui';ctx.fillStyle='rgba(255,255,255,0.8)';
  ctx.fillText(`⏱ ${formatTime(recipe.time_minutes)} · ⭐ Skill ${recipe.skill_level}/5`,540,820);
  ctx.fillText('whatcanicook.app',540,920);
  const link=document.createElement('a');link.download=`${recipe.name.replace(/\s+/g,'-')}.png`;link.href=canvas.toDataURL('image/png');link.click();
  canvas.hidden=true;
}

// ── Recipe of the day ──
function openRotd() {
  document.getElementById('rotdModal').classList.add('visible');
  const stored=localStorage.getItem('rotd');
  const today=new Date().toDateString();
  if(stored){const d=JSON.parse(stored);if(d.date===today){document.getElementById('rotdContent').innerHTML=renderRotdCard(d.recipe);return}}
  document.getElementById('rotdContent').innerHTML='<p style="color:var(--text-muted)">Click below to get today\'s recipe!</p>';
  document.getElementById('rotdGenerate').onclick=async()=>{
    setLoading(true,'Getting recipe of the day…');
    document.getElementById('rotdModal').classList.remove('visible');
    try {
      const res=await fetchT('/api/recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({surprise:true,count:1,servings:2})});
      const data=await res.json();
      if(data.recipes?.length){
        const r=data.recipes[0];
        localStorage.setItem('rotd',JSON.stringify({recipe:r,date:new Date().toDateString()}));
        document.getElementById('rotdContent').innerHTML=renderRotdCard(r);
        document.getElementById('rotdModal').classList.add('visible');
      }
    } catch(e){alert(e.message);}
    finally{setLoading(false);}
  };
  document.getElementById('rotdClose').onclick=()=>document.getElementById('rotdModal').classList.remove('visible');
}
function renderRotdCard(r){return`<h3 style="font-size:20px;font-weight:800;margin-bottom:8px">${escHtml(r.name)}</h3><p style="color:var(--text-muted);font-size:14px;margin-bottom:12px">${escHtml(r.description)}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><span style="background:var(--bg);border-radius:99px;padding:4px 10px;font-size:12px;font-weight:600">⏱ ${formatTime(r.time_minutes)}</span><span style="background:var(--bg);border-radius:99px;padding:4px 10px;font-size:12px;font-weight:600">⭐ Skill ${r.skill_level}/5</span>${r.calories_per_serving?`<span style="background:var(--bg);border-radius:99px;padding:4px 10px;font-size:12px;font-weight:600">🔥 ${r.calories_per_serving} cal</span>`:''}</div>`}

// ── Profile ──
function openProfile() {
  document.getElementById('profileName').value=profile.name||'';
  document.getElementById('profileLanguage').value=profile.language||'English';
  const skillPills=document.getElementById('profileSkill');
  skillPills.querySelectorAll('.filter-pill').forEach(b=>{b.classList.toggle('active',+b.dataset.skill===(profile.skill||3))});
  const dietPills=document.getElementById('profileDietary');
  dietPills.querySelectorAll('.filter-pill').forEach(b=>{b.classList.toggle('active',(profile.dietary||[]).includes(b.dataset.d))});
  skillPills.querySelectorAll('.filter-pill').forEach(b=>b.addEventListener('click',()=>{profile.skill=+b.dataset.skill;skillPills.querySelectorAll('.filter-pill').forEach(x=>x.classList.toggle('active',+x.dataset.skill===profile.skill))}));
  dietPills.querySelectorAll('.filter-pill').forEach(b=>b.addEventListener('click',()=>{const d=b.dataset.d;if(profile.dietary.includes(d))profile.dietary=profile.dietary.filter(x=>x!==d);else profile.dietary.push(d);b.classList.toggle('active',profile.dietary.includes(d))}));
  document.getElementById('profileModal').classList.add('visible');
  document.getElementById('profileClose').onclick=()=>document.getElementById('profileModal').classList.remove('visible');
  document.getElementById('profileSave').onclick=()=>{
    profile.name=document.getElementById('profileName').value;
    profile.language=document.getElementById('profileLanguage').value;
    filters.language=profile.language;
    filters.dietary=[...profile.dietary];
    localStorage.setItem('profile',JSON.stringify(profile));
    document.getElementById('profileModal').classList.remove('visible');
    alert(`Saved! Hi ${profile.name||'Chef'}! 👋`);
  };
}

// ── Unit converter ──
const UNITS=[
  {name:'cups',base:'ml',factor:236.588},
  {name:'tablespoons',base:'ml',factor:14.787},
  {name:'teaspoons',base:'ml',factor:4.929},
  {name:'ml',base:'ml',factor:1},
  {name:'liters',base:'ml',factor:1000},
  {name:'fl oz',base:'ml',factor:29.574},
  {name:'grams',base:'g',factor:1},
  {name:'kg',base:'g',factor:1000},
  {name:'oz',base:'g',factor:28.35},
  {name:'lbs',base:'g',factor:453.592},
  {name:'°F',base:'temp',factor:1},
  {name:'°C',base:'temp',factor:1},
];
function buildUnitSelects(){
  const from=document.getElementById('unitFrom'),to=document.getElementById('unitTo');
  UNITS.forEach(u=>{from.add(new Option(u.name,u.name));to.add(new Option(u.name,u.name))});
  to.value='ml';
}
function calcUnit(){
  const val=+document.getElementById('unitInput').value;
  const fromU=UNITS.find(u=>u.name===document.getElementById('unitFrom').value);
  const toU=UNITS.find(u=>u.name===document.getElementById('unitTo').value);
  if(!fromU||!toU||isNaN(val)){document.getElementById('unitResult').textContent='—';return}
  let result;
  if(fromU.name==='°F'&&toU.name==='°C') result=(val-32)*5/9;
  else if(fromU.name==='°C'&&toU.name==='°F') result=val*9/5+32;
  else if(fromU.base===toU.base) result=val*(fromU.factor/toU.factor);
  else{document.getElementById('unitResult').textContent='Can\'t convert';return}
  document.getElementById('unitResult').textContent=result.toFixed(2)+' '+toU.name;
}
buildUnitSelects();
document.getElementById('unitInput').addEventListener('input',calcUnit);
document.getElementById('unitFrom').addEventListener('change',calcUnit);
document.getElementById('unitTo').addEventListener('change',calcUnit);
document.getElementById('unitClose').addEventListener('click',()=>document.getElementById('unitModal').classList.remove('visible'));

// ── Chef Show ──
async function startChefShow(recipe) {
  const chefStyle = filters.chefStyle || 'Gordon Ramsay';
  setLoading(true, `Getting ${chefStyle} to narrate…`);
  try {
    const res = await fetchT('/api/chef_script', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ recipe, chef_style: chefStyle.toLowerCase() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    chefScript = data;
    chefStep = -1; // -1 = intro
    renderChefShow(recipe, chefStyle);
  } catch(e) { alert(e.message); }
  finally { setLoading(false); }
}

function renderChefShow(recipe, chefStyle) {
  const show = document.getElementById('chefShow');
  document.getElementById('chefShowBg').style.setProperty('--chef-color', chefScript.chef_color||'#c0392b');
  document.getElementById('chefShowBg').style.background = chefScript.chef_color||'#c0392b';
  document.getElementById('chefAvatar').textContent = chefScript.chef_emoji||'👨‍🍳';
  document.getElementById('chefName').textContent = chefScript.chef_name||chefStyle;
  document.getElementById('chefRecipeName').textContent = recipe.name;
  document.getElementById('chefYT').href = `https://www.youtube.com/results?search_query=${encodeURIComponent(chefStyle+' '+recipe.name)}`;

  const steps = chefScript.steps || [];
  const total = steps.length + 2; // intro + steps + outro

  // Build dots
  document.getElementById('chefDots').innerHTML = Array.from({length:total},(_,i)=>`<span class="chef-dot" data-i="${i}"></span>`).join('');

  show.hidden = false;
  show.classList.add('active');
  showChefStep(-1);

  // Auto-play
  clearInterval(chefAutoPlay);
  chefAutoPlay = setInterval(() => {
    const maxStep = steps.length; // last real step = outro
    if (chefStep < maxStep) {
      chefStep++;
      showChefStep(chefStep);
    } else {
      clearInterval(chefAutoPlay);
      chefAutoPlay = null;
      document.getElementById('chefPlayPause').textContent = '▶ Replay';
    }
  }, 8000);

  document.getElementById('chefPlayPause').textContent = '⏸ Pause';
}

function showChefStep(step) {
  chefStep = step;
  const steps = chefScript?.steps || [];
  const total = steps.length + 2;
  let label, narration, tip;

  if (step === -1) {
    label = 'Introduction';
    narration = chefScript.intro || '';
    tip = '';
  } else if (step >= steps.length) {
    label = 'That\'s a wrap!';
    narration = chefScript.outro || 'And that\'s how it\'s done. Enjoy!';
    tip = '';
  } else {
    label = `Step ${step + 1} of ${steps.length}`;
    narration = steps[step].narration || '';
    tip = steps[step].tip || '';
  }

  document.getElementById('chefStepLabel').textContent = label;
  document.getElementById('chefNarration').textContent = narration;
  document.getElementById('chefTip').textContent = tip ? `💡 ${tip}` : '';

  // Progress
  const pct = ((step + 1) / total) * 100;
  document.getElementById('chefProgressFill').style.width = `${Math.max(0, pct)}%`;

  // Dots
  document.querySelectorAll('.chef-dot').forEach((d,i) => d.classList.toggle('active', i === step + 1));

  // Buttons
  document.getElementById('chefPrev').disabled = step <= -1;
  document.getElementById('chefNext').disabled = step >= steps.length;

  // Speak
  if (document.getElementById('chefVoice')?.checked) speakText(narration + (tip ? '. ' + tip : ''));
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.95; utt.pitch = 1.0;
  window.speechSynthesis.speak(utt);
}

// Chef controls
document.getElementById('chefClose').addEventListener('click', () => {
  document.getElementById('chefShow').classList.remove('active');
  document.getElementById('chefShow').hidden = true;
  clearInterval(chefAutoPlay); chefAutoPlay = null;
  window.speechSynthesis?.cancel();
});

document.getElementById('chefPrev').addEventListener('click', () => {
  clearInterval(chefAutoPlay); chefAutoPlay = null;
  document.getElementById('chefPlayPause').textContent = '▶ Play';
  if (chefStep > -1) { chefStep--; showChefStep(chefStep); }
});

document.getElementById('chefNext').addEventListener('click', () => {
  clearInterval(chefAutoPlay); chefAutoPlay = null;
  document.getElementById('chefPlayPause').textContent = '▶ Play';
  const max = (chefScript?.steps||[]).length;
  if (chefStep < max) { chefStep++; showChefStep(chefStep); }
});

document.getElementById('chefPlayPause').addEventListener('click', () => {
  if (chefAutoPlay) {
    clearInterval(chefAutoPlay); chefAutoPlay = null;
    document.getElementById('chefPlayPause').textContent = '▶ Play';
    window.speechSynthesis?.cancel();
  } else {
    document.getElementById('chefPlayPause').textContent = '⏸ Pause';
    chefAutoPlay = setInterval(() => {
      const max = (chefScript?.steps||[]).length;
      if (chefStep < max) { chefStep++; showChefStep(chefStep); }
      else { clearInterval(chefAutoPlay); chefAutoPlay = null; document.getElementById('chefPlayPause').textContent = '▶ Replay'; }
    }, 8000);
  }
});

// ── Loading ──
function setLoading(on,msg='Loading…'){
  document.getElementById('loadingOverlay').classList.toggle('visible',on);
  if(on) document.getElementById('loadingMsg').textContent=msg;
}
document.getElementById('loadingCancel').addEventListener('click',()=>setLoading(false));

// ── Global close on Escape ──
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    setLoading(false);
    ['groceryModal','shareModal','unitModal','profileModal','rotdModal'].forEach(id=>document.getElementById(id).classList.remove('visible'));
  }
});

// ── Helpers ──
async function fetchT(url,opts,ms=58000){const c=new AbortController();const id=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opts,signal:c.signal})}finally{clearTimeout(id)}}
function formatTime(mins){if(!mins) return '?';if(mins<60) return `${mins}m`;const h=Math.floor(mins/60),m=mins%60;return m?`${h}h${m}m`:`${h}h`}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ── Shared recipe via URL hash ──
window.addEventListener('load',()=>{
  const hash=location.hash;
  if(hash.startsWith('#recipe=')){
    try{const r=JSON.parse(decodeURIComponent(escape(atob(hash.slice(8)))));const grid=document.getElementById('recipeGrid');grid.innerHTML='';grid.appendChild(buildCard(r,[],0));document.getElementById('resultsTitle').textContent=r.name;showPage('pageResults')}
    catch{showPage('pageLanding')}
  } else showPage('pageLanding');
});
