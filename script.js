// ======================== MODELO DE DATOS ========================
let characters = [];
let globalItems = [];
let currentEditId = null;
let currentViewId = null;
let selectedThemeColor = "#3A3534";
let currentSelectedIcon = "⚔️";

// Cargar datos
function loadData() {
    const storedChars = localStorage.getItem("dnd_chars");
    characters = storedChars ? JSON.parse(storedChars) : [];
    const storedGlobal = localStorage.getItem("dm_global_items");
    globalItems = storedGlobal ? JSON.parse(storedGlobal) : [];
    
    // Limpiar efectos expirados
    characters.forEach(char => {
        if(char.activeEffects) {
            char.activeEffects = char.activeEffects.filter(e => e.expiresAt > Date.now());
        } else {
            char.activeEffects = [];
        }
        // Asegurar estructura de hechizos
        if(!char.spellsList) char.spellsList = [];
    });
    saveChars();
}

function saveChars() {
    localStorage.setItem("dnd_chars", JSON.stringify(characters));
}

function saveGlobalItems() {
    localStorage.setItem("dm_global_items", JSON.stringify(globalItems));
}

// Actualizar contadores cada segundo
setInterval(() => {
    let changed = false;
    characters.forEach(char => {
        if(char.activeEffects && char.activeEffects.length) {
            const before = char.activeEffects.length;
            char.activeEffects = char.activeEffects.filter(e => e.expiresAt > Date.now());
            if(before !== char.activeEffects.length) changed = true;
        }
    });
    if(changed) {
        saveChars();
        if(document.getElementById("viewScreen").classList.contains("active") && currentViewId) {
            viewCharacter(currentViewId);
        }
    }
}, 1000);

// Helper: extraer nivel del personaje
function getCharacterLevel(className) {
    const match = className?.match(/\b(\d+)\b/);
    return match ? parseInt(match[1]) : 1;
}

// Calcular slots de hechizos según nivel (reglas simplificadas D&D)
function getSpellSlots(level) {
    const slots = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
    if(level >= 1) { slots[1] = 2; }
    if(level >= 2) { slots[1] = 3; }
    if(level >= 3) { slots[1] = 4; slots[2] = 2; }
    if(level >= 4) { slots[1] = 4; slots[2] = 3; }
    if(level >= 5) { slots[1] = 4; slots[2] = 3; slots[3] = 2; }
    if(level >= 6) { slots[1] = 4; slots[2] = 3; slots[3] = 3; }
    if(level >= 7) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 1; }
    if(level >= 8) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 2; }
    if(level >= 9) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 3; slots[5] = 1; }
    if(level >= 10) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 3; slots[5] = 2; }
    if(level >= 11) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 3; slots[5] = 2; slots[6] = 1; }
    if(level >= 13) { slots[6] = 1; slots[7] = 1; }
    if(level >= 15) { slots[7] = 1; slots[8] = 1; }
    if(level >= 17) { slots[8] = 1; slots[9] = 1; }
    return slots;
}

// Render menú principal
function renderMainMenu() {
    const container = document.getElementById("charactersList");
    if(characters.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:2rem;">✨ Aún no hay héroes. ¡Crea uno!</div>`;
        return;
    }
    container.innerHTML = "";
    characters.forEach(ch => {
        const card = document.createElement("div");
        card.className = "character-card";
        const avatar = ch.imageUrl ? `<img src="${ch.imageUrl}" style="width:55px;height:55px;border-radius:50%;object-fit:cover;">` : `<div class="char-avatar">${ch.name.charAt(0).toUpperCase()}</div>`;
        card.innerHTML = `${avatar}<div class="char-info"><div class="char-name">${escapeHtml(ch.name)}</div><div class="char-class">${ch.class || "Aventurero"} • ${ch.race || "?"}</div></div>`;
        card.addEventListener("click", () => viewCharacter(ch.id));
        container.appendChild(card);
    });
}

function escapeHtml(str) { if(!str) return ""; return str.replace(/[&<>]/g, function(m){return m==='&'?'&amp;':m==='<'?'&lt;':'&gt;';}); }

// Vista completa
function viewCharacter(id) {
    const char = characters.find(c => c.id == id);
    if(!char) return;
    currentViewId = id;
    const theme = char.themeColor || "#3A3534";
    document.getElementById("viewColorTheme").style.backgroundColor = theme;
    document.getElementById("viewCharName").innerHTML = `${escapeHtml(char.name)} <span style="font-size:0.8rem;">${char.class || ''}</span>`;
    
    const stats = char.stats || {};
    const level = getCharacterLevel(char.class);
    const slots = getSpellSlots(level);
    
    // Inventarios
    const invList = (char.inventory || []).map(i => `<div class="item-row">🎒 ${escapeHtml(i)}</div>`).join("");
    const magicList = (char.magicItems || []).map(i => `<div class="item-row">✨ ${escapeHtml(i)}</div>`).join("");
    
    // Hechizos con detalles
    let spellsHtml = `<div><strong>Nivel del personaje: ${level}</strong> | Slots de hechizos: ${Object.entries(slots).filter(([k,v])=>v>0).map(([lvl, cant])=>`N${lvl}:${cant}`).join(', ') || 'ninguno'}</div>`;
    if(char.spellsList && char.spellsList.length) {
        spellsHtml += `<div style="margin-top:10px;">`;
        char.spellsList.forEach(sp => {
            const tipoLabel = sp.type === 'truco' ? '🎭 Truco' : (sp.type === 'hechizo' ? '✨ Hechizo' : '🔮 Encantamiento');
            spellsHtml += `<div class="spell-view"><strong>${escapeHtml(sp.name)}</strong> (${tipoLabel}, Nivel ${sp.level})<br>📖 Efecto: ${escapeHtml(sp.effect)}<br>🎲 Daño: ${escapeHtml(sp.damage || 'Ninguno')}</div>`;
        });
        spellsHtml += `</div>`;
    } else {
        spellsHtml += `<em>Sin hechizos registrados</em>`;
    }
    
    // Efectos temporales
    let effectsHtml = "";
    if(char.activeEffects && char.activeEffects.length) {
        effectsHtml = char.activeEffects.map(eff => {
            const remaining = Math.max(0, Math.floor((eff.expiresAt - Date.now()) / 1000));
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            return `<div class="effect-timer">⏳ ${eff.icon || '⚠️'} ${escapeHtml(eff.name)}: ${mins}m ${secs}s restantes</div>`;
        }).join("");
    } else {
        effectsHtml = "<em>Sin efectos temporales activos</em>";
    }
    
    const content = `
        <div style="display:flex; gap:1rem; align-items:center; margin-bottom:1rem;">
            ${char.imageUrl ? `<img src="${char.imageUrl}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">` : `<div style="background:var(--accent); width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:3rem;">${char.name.charAt(0)}</div>`}
            <div><strong>${char.race || "?"}</strong> · ${char.alignment || "?"}<br>Trasfondo: ${char.background || "—"}</div>
        </div>
        <div class="stat-grid">
            <div class="stat-card"><strong>FUE</strong><br>${stats.fue||10}</div>
            <div class="stat-card"><strong>DES</strong><br>${stats.des||10}</div>
            <div class="stat-card"><strong>CON</strong><br>${stats.con||10}</div>
            <div class="stat-card"><strong>INT</strong><br>${stats.int||10}</div>
            <div class="stat-card"><strong>SAB</strong><br>${stats.sab||10}</div>
            <div class="stat-card"><strong>CAR</strong><br>${stats.car||10}</div>
        </div>
        <div class="tabs">
            <button class="tab-btn active" data-tab="invTab">🎒 Inventario</button>
            <button class="tab-btn" data-tab="magicTab">✨ Obj. Mágicos</button>
            <button class="tab-btn" data-tab="spellsTab">📜 Hechizos</button>
            <button class="tab-btn" data-tab="effectsTab">⏳ Efectos</button>
            <button class="tab-btn" data-tab="notesTab">📝 Notas</button>
        </div>
        <div id="invTab" class="tab-content active">${invList || "<em>Vacío</em>"}</div>
        <div id="magicTab" class="tab-content">${magicList || "<em>Sin objetos mágicos</em>"}</div>
        <div id="spellsTab" class="tab-content">${spellsHtml}</div>
        <div id="effectsTab" class="tab-content">${effectsHtml}</div>
        <div id="notesTab" class="tab-content"><pre style="white-space:pre-wrap;">${escapeHtml(char.notes || "Sin notas")}</pre></div>
    `;
    document.getElementById("viewContent").innerHTML = content;
    
    document.querySelectorAll("#viewContent .tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const target = btn.getAttribute("data-tab");
            document.querySelectorAll("#viewContent .tab-content").forEach(tc => tc.classList.remove("active"));
            document.getElementById(target).classList.add("active");
            document.querySelectorAll("#viewContent .tab-btn").forEach(b=>b.classList.remove("active"));
            btn.classList.add("active");
        });
    });
    showScreen("viewScreen");
}

function deleteCharacterById(id) {
    if(confirm("⚠️ ¿Eliminar este personaje permanentemente?")) {
        characters = characters.filter(c => c.id !== id);
        saveChars();
        renderMainMenu();
        showScreen("mainMenuScreen");
        if(currentViewId === id) currentViewId = null;
    }
}

// Editor de hechizos dinámico
function renderSpellEditor(spellsList) {
    const container = document.getElementById("spellsContainer");
    container.innerHTML = '';
    spellsList.forEach((spell, idx) => {
        const div = document.createElement('div');
        div.className = 'spell-card';
        div.innerHTML = `
            <input type="text" class="spell-name" value="${escapeHtml(spell.name)}" placeholder="Nombre">
            <select class="spell-type">
                <option value="truco" ${spell.type === 'truco' ? 'selected' : ''}>🎭 Truco</option>
                <option value="hechizo" ${spell.type === 'hechizo' ? 'selected' : ''}>✨ Hechizo</option>
                <option value="encantamiento" ${spell.type === 'encantamiento' ? 'selected' : ''}>🔮 Encantamiento</option>
            </select>
            <input type="number" class="spell-level" value="${spell.level}" placeholder="Nivel" min="0" max="9">
            <input type="text" class="spell-effect" value="${escapeHtml(spell.effect)}" placeholder="Efecto">
            <input type="text" class="spell-damage" value="${escapeHtml(spell.damage)}" placeholder="Daño (ej: 1d8+3)">
            <button type="button" class="remove-spell-btn">❌</button>
        `;
        div.querySelector('.remove-spell-btn').addEventListener('click', () => {
            spellsList.splice(idx,1);
            renderSpellEditor(spellsList);
        });
        container.appendChild(div);
    });
}

function newCharacter() {
    currentEditId = null;
    document.getElementById("editorTitle").innerText = "✨ Nuevo Personaje";
    document.getElementById("characterForm").reset();
    document.getElementById("statFue").value = 10;
    document.getElementById("statDes").value = 10;
    document.getElementById("statCon").value = 10;
    document.getElementById("statInt").value = 10;
    document.getElementById("statSab").value = 10;
    document.getElementById("statCar").value = 10;
    selectedThemeColor = "#3A3534";
    applyEditorColor(selectedThemeColor);
    document.getElementById("bgColorPicker").value = selectedThemeColor;
    renderSpellEditor([]);
    showScreen("editorScreen");
}

function loadCharToEditor(id) {
    const char = characters.find(c => c.id == id);
    if(!char) return;
    currentEditId = id;
    document.getElementById("editorTitle").innerText = `Editar: ${char.name}`;
    document.getElementById("charName").value = char.name || "";
    document.getElementById("charRace").value = char.race || "";
    document.getElementById("charClass").value = char.class || "";
    document.getElementById("charAlignment").value = char.alignment || "";
    document.getElementById("charBackground").value = char.background || "";
    document.getElementById("charImageUrl").value = char.imageUrl || "";
    document.getElementById("statFue").value = char.stats?.fue || 10;
    document.getElementById("statDes").value = char.stats?.des || 10;
    document.getElementById("statCon").value = char.stats?.con || 10;
    document.getElementById("statInt").value = char.stats?.int || 10;
    document.getElementById("statSab").value = char.stats?.sab || 10;
    document.getElementById("statCar").value = char.stats?.car || 10;
    document.getElementById("inventory").value = (char.inventory || []).join(", ");
    document.getElementById("notes").value = char.notes || "";
    document.getElementById("magicItems").value = (char.magicItems || []).join(", ");
    renderSpellEditor(char.spellsList || []);
    selectedThemeColor = char.themeColor || "#3A3534";
    applyEditorColor(selectedThemeColor);
    document.getElementById("bgColorPicker").value = selectedThemeColor;
    showScreen("editorScreen");
}

function saveCharacterFromForm() {
    const name = document.getElementById("charName").value.trim();
    if(!name) { alert("Nombre obligatorio"); return; }
    
    const spellsList = [];
    document.querySelectorAll("#spellsContainer .spell-card").forEach(card => {
        spellsList.push({
            name: card.querySelector('.spell-name').value,
            type: card.querySelector('.spell-type').value,
            level: parseInt(card.querySelector('.spell-level').value) || 0,
            effect: card.querySelector('.spell-effect').value,
            damage: card.querySelector('.spell-damage').value
        });
    });
    
    const newCharData = {
        id: currentEditId || Date.now(),
        name, race: document.getElementById("charRace").value,
        class: document.getElementById("charClass").value,
        alignment: document.getElementById("charAlignment").value,
        background: document.getElementById("charBackground").value,
        imageUrl: document.getElementById("charImageUrl").value,
        stats: {
            fue: parseInt(document.getElementById("statFue").value)||10,
            des: parseInt(document.getElementById("statDes").value)||10,
            con: parseInt(document.getElementById("statCon").value)||10,
            int: parseInt(document.getElementById("statInt").value)||10,
            sab: parseInt(document.getElementById("statSab").value)||10,
            car: parseInt(document.getElementById("statCar").value)||10,
        },
        spellsList: spellsList,
        inventory: document.getElementById("inventory").value.split(",").map(s=>s.trim()).filter(s=>s),
        notes: document.getElementById("notes").value,
        magicItems: document.getElementById("magicItems").value.split(",").map(s=>s.trim()).filter(s=>s),
        themeColor: selectedThemeColor,
        activeEffects: currentEditId ? (characters.find(c=>c.id===currentEditId)?.activeEffects || []) : []
    };
    
    if(currentEditId) {
        const index = characters.findIndex(c => c.id == currentEditId);
        if(index !== -1) characters[index] = newCharData;
    } else {
        characters.push(newCharData);
    }
    saveChars();
    renderMainMenu();
    showScreen("mainMenuScreen");
    currentEditId = null;
}

function applyEditorColor(color) {
    document.getElementById("editorColorWrapper").style.backgroundColor = color;
    selectedThemeColor = color;
}

// DM Panel
function initIconSelector() {
    document.querySelectorAll("#iconSelector .icon-option").forEach(icon => {
        icon.addEventListener("click", () => {
            document.querySelectorAll("#iconSelector .icon-option").forEach(i=>i.classList.remove("selected"));
            icon.classList.add("selected");
            currentSelectedIcon = icon.getAttribute("data-icon");
            document.getElementById("selectedIcon").value = currentSelectedIcon;
        });
    });
}

function renderDMGlobalItems() {
    const container = document.getElementById("globalItemsList");
    if(globalItems.length === 0) { container.innerHTML = "<em>Almacén vacío</em>"; return; }
    container.innerHTML = globalItems.map((item, idx) => `
        <div class="item-row">
            <span>${item.icon || '📦'} ${escapeHtml(item.name)} [${item.category}] ${item.desc ? `(${escapeHtml(item.desc)})` : ''} ${item.duration ? `⏱️ ${item.duration}min` : ''}</span>
            <button class="removeItemBtn" data-idx="${idx}" style="background:#8b3c2c;">❌</button>
        </div>
    `).join("");
    document.querySelectorAll(".removeItemBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(btn.getAttribute("data-idx"));
            globalItems.splice(idx,1);
            saveGlobalItems();
            renderDMGlobalItems();
            populateDMSelectors();
        });
    });
}

function populateDMSelectors() {
    const targetSel = document.getElementById("dmTargetCharSelect");
    const itemSel = document.getElementById("dmSelectItemToSend");
    if(targetSel) targetSel.innerHTML = characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    if(itemSel) itemSel.innerHTML = globalItems.map((it,idx)=>`<option value="${idx}">${it.icon || '📦'} ${escapeHtml(it.name)}</option>`).join("");
}

function addGlobalItem() {
    const name = document.getElementById("dmItemName").value.trim();
    if(!name) { alert("Escribe un nombre"); return; }
    const desc = document.getElementById("dmItemDesc").value;
    const category = document.getElementById("dmItemCategory").value;
    const duration = parseInt(document.getElementById("effectDuration").value);
    globalItems.push({ name, desc, category, icon: currentSelectedIcon, duration: isNaN(duration) ? null : duration });
    saveGlobalItems();
    renderDMGlobalItems();
    populateDMSelectors();
    document.getElementById("dmItemName").value = "";
    document.getElementById("dmItemDesc").value = "";
    document.getElementById("effectDuration").value = "";
}

function sendItemToCharacter() {
    const charId = parseInt(document.getElementById("dmTargetCharSelect").value);
    const itemIndex = parseInt(document.getElementById("dmSelectItemToSend").value);
    const char = characters.find(c => c.id === charId);
    if(!char || isNaN(itemIndex) || !globalItems[itemIndex]) return;
    const item = globalItems[itemIndex];
    let itemText = `${item.icon || '📦'} ${item.name}${item.desc ? ` (${item.desc})` : ''}`;
    
    if(item.category === 'inventory') {
        if(!char.inventory) char.inventory = [];
        char.inventory.push(itemText);
    } else if(item.category === 'magic') {
        if(!char.magicItems) char.magicItems = [];
        char.magicItems.push(itemText);
    } else if(item.category === 'spell') {
        if(!char.spellsList) char.spellsList = [];
        char.spellsList.push({ name: item.name, type: 'hechizo', level: 1, effect: item.desc, damage: '' });
    }
    
    if(item.duration && item.duration > 0) {
        if(!char.activeEffects) char.activeEffects = [];
        char.activeEffects.push({ name: item.name, icon: item.icon, expiresAt: Date.now() + (item.duration * 60 * 1000) });
    }
    saveChars();
    alert(`✅ Enviado: ${item.name} a ${char.name}`);
    if(currentViewId === charId) viewCharacter(charId);
    renderMainMenu();
}

// Navegación
function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
    if(screenId === "dmScreen") { renderDMGlobalItems(); populateDMSelectors(); }
    if(screenId === "mainMenuScreen") renderMainMenu();
}

// Eventos
document.addEventListener("DOMContentLoaded", () => {
    loadData();
    initIconSelector();
    
    document.getElementById("btnCreateNewChar").addEventListener("click", newCharacter);
    document.getElementById("closeEditorBtn").addEventListener("click", ()=>showScreen("mainMenuScreen"));
    document.getElementById("characterForm").addEventListener("submit", (e)=>{ e.preventDefault(); saveCharacterFromForm(); });
    document.getElementById("deleteCharBtn").addEventListener("click", ()=>{ if(currentEditId) deleteCharacterById(currentEditId); });
    document.getElementById("backToMenuFromView").addEventListener("click", ()=>showScreen("mainMenuScreen"));
    document.getElementById("editFromViewBtn").addEventListener("click", ()=>{ if(currentViewId) loadCharToEditor(currentViewId); });
    document.getElementById("deleteFromViewBtn").addEventListener("click", ()=>{ if(currentViewId) deleteCharacterById(currentViewId); });
    document.getElementById("btnDMMenu").addEventListener("click", ()=>showScreen("dmScreen"));
    document.getElementById("closeDMBtn").addEventListener("click", ()=>showScreen("mainMenuScreen"));
    document.getElementById("addGlobalItemBtn").addEventListener("click", addGlobalItem);
    document.getElementById("sendItemToCharBtn").addEventListener("click", sendItemToCharacter);
    document.getElementById("addSpellBtn").addEventListener("click", () => {
        const spellsList = [];
        document.querySelectorAll("#spellsContainer .spell-card").forEach(card => {
            spellsList.push({
                name: card.querySelector('.spell-name').value,
                type: card.querySelector('.spell-type').value,
                level: parseInt(card.querySelector('.spell-level').value) || 0,
                effect: card.querySelector('.spell-effect').value,
                damage: card.querySelector('.spell-damage').value
            });
        });
        spellsList.push({ name: "", type: "truco", level: 0, effect: "", damage: "" });
        renderSpellEditor(spellsList);
    });
    
    const colorPicker = document.getElementById("bgColorPicker");
    const rgbText = document.getElementById("rgbTextInput");
    const applyBtn = document.getElementById("applyColorBtn");
    colorPicker.addEventListener("input", (e)=> applyEditorColor(e.target.value));
    applyBtn.addEventListener("click", ()=>{
        let val = rgbText.value.trim();
        if(val.startsWith("#") || val.startsWith("rgb")) applyEditorColor(val);
        else if(/^[0-9A-Fa-f]{6}$/.test(val)) applyEditorColor("#"+val);
        else alert("Formato inválido");
    });
    
    renderMainMenu();
});