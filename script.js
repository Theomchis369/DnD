
// ==================== CONFIGURACIÓN DE FIREBASE ====================
const firebaseConfig = {
    apiKey: "AIzaSyA-xQqjiOVb6L6Yh8RKB2TDZV6-Zn10Wz8",
    authDomain: "dnd-personajes.firebaseapp.com",
    projectId: "dnd-personajes",
    storageBucket: "dnd-personajes.firebasestorage.app",
    messagingSenderId: "639638791743",
    appId: "1:639638791743:web:8487dd7aa9f3b5edf03a8a",
    measurementId: "G-YDH5D9XCNV"
};

let db = null;
let syncEnabled = false;
let characters = [];
let globalItems = [];
let currentEditId = null;
let currentViewId = null;
let selectedThemeColor = "#3A3534";
let currentSelectedIcon = "⚔️";
const DM_PASSWORD = "Error123";

// Inicializar Firebase
if (typeof firebase !== 'undefined' && firebase.initializeApp) {
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        syncEnabled = true;
        console.log("✅ Firebase conectado");
    } catch (error) {
        console.warn("Error inicializando Firebase:", error);
    }
}

// ==================== MAPEOS Y UTILIDADES ====================
const skillsMap = {
    'Atletismo': 'fue', 'Acrobacias': 'des', 'Juego de Manos': 'des', 'Sigilo': 'des',
    'Arcanos': 'int', 'Historia': 'int', 'Investigación': 'int', 'Naturaleza': 'int',
    'Religión': 'int', 'Trato con Animales': 'sab', 'Perspicacia': 'sab', 'Medicina': 'sab',
    'Percepción': 'sab', 'Supervivencia': 'sab', 'Engaño': 'car', 'Interpretación': 'car',
    'Intimidación': 'car', 'Persuasión': 'car'
};

function calcModifier(statValue) { return Math.floor((statValue - 10) / 2); }
function getCharacterLevel(className) { const match = className?.match(/\b(\d+)\b/); return match ? parseInt(match[1]) : 1; }
function getProficiencyBonus(level) { return Math.floor((level - 1) / 4) + 2; }
function calculateSkillBonus(statValue, hasFeat = false, proficiencyBonus = 2) {
    let bonus = calcModifier(statValue);
    if (hasFeat) bonus += proficiencyBonus;
    return bonus;
}
function escapeHtml(str) { if (!str) return ""; return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'); }

// ==================== FUNCIONES DE SINCRONIZACIÓN ====================
async function loadData() {
    const syncStatus = document.getElementById("syncStatus");
    if (syncEnabled && db) {
        try {
            if (syncStatus) { syncStatus.innerHTML = "🔄 Sincronizando..."; syncStatus.className = "sync-loading"; }
            const charsSnapshot = await db.collection("characters").get();
            characters = [];
            charsSnapshot.forEach(doc => {
                const charData = doc.data();
                characters.push({ id: parseInt(doc.id), ...charData });
            });
            const itemsSnapshot = await db.collection("globalItems").get();
            globalItems = [];
            itemsSnapshot.forEach(doc => globalItems.push(doc.data()));
            if (syncStatus) { syncStatus.innerHTML = "✅ Sincronizado"; syncStatus.className = "sync-success"; }
        } catch (error) {
            console.error("Error cargando:", error);
            loadLocalData();
        }
    } else { loadLocalData(); }
    renderMainMenu();
}

function loadLocalData() {
    const storedChars = localStorage.getItem("dnd_chars");
    characters = storedChars ? JSON.parse(storedChars) : [];
    const storedGlobal = localStorage.getItem("dm_global_items");
    globalItems = storedGlobal ? JSON.parse(storedGlobal) : [];
    characters.forEach(char => {
        if (char.activeEffects) char.activeEffects = char.activeEffects.filter(e => e.expiresAt > Date.now());
        else char.activeEffects = [];
        if (!char.spellsList) char.spellsList = [];
        if (!char.inventory) char.inventory = [];
        if (!char.magicItems) char.magicItems = [];
        if (!char.coins) char.coins = { platinum: 0, gold: 0, electrum: 0, silver: 0, copper: 0 };
    });
}

async function saveChars() {
    localStorage.setItem("dnd_chars", JSON.stringify(characters));
    if (syncEnabled && db) {
        try {
            for (const char of characters) {
                const charData = { ...char };
                delete charData.id;
                await db.collection("characters").doc(char.id.toString()).set(charData);
            }
        } catch (error) { console.error("Error guardando:", error); }
    }
}

async function saveGlobalItems() {
    localStorage.setItem("dm_global_items", JSON.stringify(globalItems));
    if (syncEnabled && db) {
        try {
            for (let i = 0; i < globalItems.length; i++) {
                if (globalItems[i]) await db.collection("globalItems").doc(i.toString()).set(globalItems[i]);
            }
        } catch (error) { console.error("Error guardando items globales:", error); }
    }
}

// ==================== ACTUALIZACIÓN DE HABILIDADES ====================
function updateSkillsDisplay() {
    const stats = {
        fue: parseInt(document.getElementById("statFue")?.value) || 10,
        des: parseInt(document.getElementById("statDes")?.value) || 10,
        con: parseInt(document.getElementById("statCon")?.value) || 10,
        int: parseInt(document.getElementById("statInt")?.value) || 10,
        sab: parseInt(document.getElementById("statSab")?.value) || 10,
        car: parseInt(document.getElementById("statCar")?.value) || 10
    };
    const level = getCharacterLevel(document.getElementById("charClass")?.value || "");
    const profBonus = getProficiencyBonus(level);
    const feats = document.getElementById("charFeats")?.value || "";
    const container = document.getElementById("skillsContainer");
    if (!container) return;
    container.innerHTML = `<div style="grid-column: span 2; font-size: 0.7rem; color: var(--gold-light);">🎯 Competencia: +${profBonus} (Nivel ${level})</div>`;
    for (const [skill, stat] of Object.entries(skillsMap)) {
        const hasFeat = feats.toLowerCase().includes(skill.toLowerCase());
        const bonus = calculateSkillBonus(stats[stat], hasFeat, profBonus);
        const sign = bonus >= 0 ? '+' : '';
        container.innerHTML += `<div class="skill-item"><span class="skill-name">${skill}${hasFeat ? ' ⭐' : ''}</span><span class="skill-bonus">${sign}${bonus}</span></div>`;
    }
}

// ==================== RENDER DE INVENTARIOS ====================
function renderInventoryEditor(items, containerId, inputId, btnId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="items-list" id="' + containerId + 'List"></div>';
    const listContainer = document.getElementById(containerId + 'List');
    items.forEach((item, idx) => {
        const itemName = typeof item === 'string' ? item : item.name;
        const itemQuantity = typeof item === 'string' ? 1 : (item.quantity || 1);
        const itemRarity = typeof item === 'string' ? 'Común' : (item.rarity || 'Común');
        const div = document.createElement('div');
        div.className = 'item-edit';
        div.innerHTML = `
            <input type="text" class="item-edit-name" value="${escapeHtml(itemName)}" placeholder="Nombre">
            <input type="number" class="item-edit-quantity" value="${itemQuantity}" min="1" placeholder="Cant">
            <select class="item-edit-rarity">
                <option value="Común" ${itemRarity === 'Común' ? 'selected' : ''}>🟢 Común</option>
                <option value="Poco común" ${itemRarity === 'Poco común' ? 'selected' : ''}>🔵 Poco común</option>
                <option value="Raro" ${itemRarity === 'Raro' ? 'selected' : ''}>🟣 Raro</option>
                <option value="Muy raro" ${itemRarity === 'Muy raro' ? 'selected' : ''}>🟠 Muy raro</option>
                <option value="Legendario" ${itemRarity === 'Legendario' ? 'selected' : ''}>🔴 Legendario</option>
                <option value="Artefacto" ${itemRarity === 'Artefacto' ? 'selected' : ''}>💎 Artefacto</option>
            </select>
            <button type="button" class="remove-item-btn" data-idx="${idx}" data-type="${type}">✖</button>
        `;
        const nameInput = div.querySelector('.item-edit-name');
        const qtyInput = div.querySelector('.item-edit-quantity');
        const raritySelect = div.querySelector('.item-edit-rarity');
        const updateItem = () => {
            if (type === 'inventory' && window.currentEditInventory) {
                window.currentEditInventory[idx] = { name: nameInput.value.trim(), quantity: parseInt(qtyInput.value) || 1, rarity: raritySelect.value };
            } else if (type === 'magic' && window.currentEditMagicItems) {
                window.currentEditMagicItems[idx] = { name: nameInput.value.trim(), quantity: parseInt(qtyInput.value) || 1, rarity: raritySelect.value };
            }
        };
        nameInput.addEventListener('change', updateItem);
        qtyInput.addEventListener('change', updateItem);
        raritySelect.addEventListener('change', updateItem);
        listContainer.appendChild(div);
    });
    document.querySelectorAll(`#${containerId}List .remove-item-btn`).forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            if (type === 'inventory' && window.currentEditInventory) {
                window.currentEditInventory.splice(idx, 1);
                renderInventoryEditor(window.currentEditInventory, containerId, inputId, btnId, type);
            } else if (type === 'magic' && window.currentEditMagicItems) {
                window.currentEditMagicItems.splice(idx, 1);
                renderInventoryEditor(window.currentEditMagicItems, containerId, inputId, btnId, type);
            }
        });
    });
    const addBtn = document.getElementById(btnId);
    const inputField = document.getElementById(inputId);
    if (addBtn) {
        const newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', () => {
            const newItemName = inputField?.value.trim();
            if (newItemName) {
                const newItem = { name: newItemName, quantity: 1, rarity: 'Común' };
                if (type === 'inventory') window.currentEditInventory.push(newItem);
                else window.currentEditMagicItems.push(newItem);
                if (inputField) inputField.value = '';
                renderInventoryEditor(window.currentEditInventory, 'inventoryContainer', 'newItemName', 'addItemBtn', 'inventory');
                renderInventoryEditor(window.currentEditMagicItems, 'magicItemsContainer', 'newMagicItemName', 'addMagicItemBtn', 'magic');
            }
        });
    }
}

function renderInventoryView(items) {
    if (!items || items.length === 0) return "<em>Vacío</em>";
    return items.map(item => {
        const itemName = typeof item === 'string' ? item : item.name;
        const itemQuantity = typeof item === 'string' ? 1 : (item.quantity || 1);
        const itemRarity = typeof item === 'string' ? 'Común' : (item.rarity || 'Común');
        let rarityIcon = '';
        switch(itemRarity) {
            case 'Común': rarityIcon = '🟢'; break;
            case 'Poco común': rarityIcon = '🔵'; break;
            case 'Raro': rarityIcon = '🟣'; break;
            case 'Muy raro': rarityIcon = '🟠'; break;
            case 'Legendario': rarityIcon = '🔴'; break;
            case 'Artefacto': rarityIcon = '💎'; break;
            default: rarityIcon = '⚪';
        }
        return `<div class="view-item-card"><div class="view-item-info"><span class="item-stack"><span class="item-quantity">×${itemQuantity}</span><span class="view-item-name">${escapeHtml(itemName)}</span></span><span class="view-item-rarity rarity-${itemRarity.replace(/ /g, '-')}">${rarityIcon} ${itemRarity}</span></div></div>`;
    }).join('');
}

// ==================== RENDER DE HECHIZOS ====================
function renderSpellEditor(spellsList) {
    const container = document.getElementById("spellsContainer");
    if (!container) return;
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
            <button type="button" class="remove-spell-btn">❌ Eliminar</button>
        `;
        div.querySelector('.remove-spell-btn').addEventListener('click', () => {
            spellsList.splice(idx, 1);
            renderSpellEditor(spellsList);
        });
        container.appendChild(div);
    });
}

// ==================== MENÚ PRINCIPAL ====================
function renderMainMenu() {
    const container = document.getElementById("charactersList");
    if (!container) return;
    if (characters.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:2rem;">✨ Aún no hay héroes. ¡Crea uno!</div>`;
        return;
    }
    container.innerHTML = "";
    characters.forEach(ch => {
        const card = document.createElement("div");
        card.className = "character-card";
        const avatar = ch.imageUrl ? `<img src="${ch.imageUrl}" style="width:55px;height:55px;border-radius:50%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\'char-avatar\'>${ch.name.charAt(0).toUpperCase()}</div>';">` : `<div class="char-avatar">${ch.name.charAt(0).toUpperCase()}</div>`;
        card.innerHTML = `${avatar}<div class="char-info"><div class="char-name">${escapeHtml(ch.name)}</div><div class="char-class">${ch.class || "Aventurero"} • ${ch.race || "?"}</div></div>`;
        card.addEventListener("click", () => viewCharacter(ch.id));
        container.appendChild(card);
    });
}

// ==================== ELIMINAR PERSONAJE ====================
function deleteCharacterById(id) {
    if (confirm(`⚠️ ¿Eliminar a "${characters.find(c => c.id === id)?.name}" permanentemente?`)) {
        characters = characters.filter(c => c.id !== id);
        saveChars();
        if (currentViewId === id) currentViewId = null;
        if (currentEditId === id) currentEditId = null;
        renderMainMenu();
        showScreen("mainMenuScreen");
        alert("✅ Personaje eliminado");
    }
}

// ==================== VISTA DE PERSONAJE ====================
function viewCharacter(id) {
    const char = characters.find(c => c.id == id);
    if (!char) return;
    currentViewId = id;
    const theme = char.themeColor || "#3A3534";
    document.getElementById("viewColorTheme").style.backgroundColor = theme;
    document.getElementById("viewCharName").innerHTML = `${escapeHtml(char.name)} <span style="font-size:0.8rem;">${char.class || ''}</span>`;
    const stats = char.stats || { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };
    const level = getCharacterLevel(char.class);
    const profBonus = getProficiencyBonus(level);
    const feats = char.feats || "";
    let skillsHtml = '<div class="skills-grid">';
    for (const [skill, stat] of Object.entries(skillsMap)) {
        const hasFeat = feats.toLowerCase().includes(skill.toLowerCase());
        const bonus = calculateSkillBonus(stats[stat], hasFeat, profBonus);
        const sign = bonus >= 0 ? '+' : '';
        skillsHtml += `<div class="skill-item"><span class="skill-name">${skill}${hasFeat ? ' ⭐' : ''}</span><span class="skill-bonus">${sign}${bonus}</span></div>`;
    }
    skillsHtml += '</div>';
    const coins = char.coins || { platinum: 0, gold: 0, electrum: 0, silver: 0, copper: 0 };
    const invList = renderInventoryView(char.inventory || []);
    const magicList = renderInventoryView(char.magicItems || []);
    let spellsHtml = `<div><strong>📊 Nivel: ${level}</strong> | 🎯 Competencia: +${profBonus}</div>`;
    if (char.spellsList && char.spellsList.length) {
        char.spellsList.forEach(sp => {
            const tipoLabel = sp.type === 'truco' ? '🎭 Truco' : (sp.type === 'hechizo' ? '✨ Hechizo' : '🔮 Encantamiento');
            spellsHtml += `<div class="spell-view"><strong>${escapeHtml(sp.name)}</strong> (${tipoLabel}, Nivel ${sp.level})<br>📖 ${escapeHtml(sp.effect)}<br>🎲 Daño: ${escapeHtml(sp.damage || 'Ninguno')}</div>`;
        });
    } else { spellsHtml += `<em>📜 Sin hechizos</em>`; }
    const content = `
        <div style="display:flex; gap:1rem; align-items:center; margin:1rem 0; flex-wrap:wrap;">
            ${char.imageUrl ? `<img src="${char.imageUrl}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;" onerror="this.onerror=null;this.style.display='none';">` : `<div style="background:var(--accent); width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:3rem;">${char.name.charAt(0)}</div>`}
            <div><strong>${char.race || "?"}</strong> · ${char.alignment || "?"}<br>📖 ${char.background || "—"}<br>🗣️ ${char.languages || "Común"} | Vel: ${char.speed || 30}' | Inic: +${char.initiative || 0}</div>
        </div>
        <div class="stat-grid">
            <div class="stat-card"><strong>💪 FUE</strong><span>${stats.fue||10} (${calcModifier(stats.fue||10)>=0?'+':''}${calcModifier(stats.fue||10)})</span></div>
            <div class="stat-card"><strong>🏃 DES</strong><span>${stats.des||10} (${calcModifier(stats.des||10)>=0?'+':''}${calcModifier(stats.des||10)})</span></div>
            <div class="stat-card"><strong>❤️ CON</strong><span>${stats.con||10} (${calcModifier(stats.con||10)>=0?'+':''}${calcModifier(stats.con||10)})</span></div>
            <div class="stat-card"><strong>🧠 INT</strong><span>${stats.int||10} (${calcModifier(stats.int||10)>=0?'+':''}${calcModifier(stats.int||10)})</span></div>
            <div class="stat-card"><strong>👁️ SAB</strong><span>${stats.sab||10} (${calcModifier(stats.sab||10)>=0?'+':''}${calcModifier(stats.sab||10)})</span></div>
            <div class="stat-card"><strong>💬 CAR</strong><span>${stats.car||10} (${calcModifier(stats.car||10)>=0?'+':''}${calcModifier(stats.car||10)})</span></div>
        </div>
        <div><span class="view-stat-badge">👁️ Percepción Pasiva: ${char.passivePerception || 10}</span><span class="view-stat-badge">📏 Tamaño: ${char.size || "Mediano"}</span></div>
        <div class="coins-container">
            <div class="coin-card"><span class="coin-icon">🪙</span><span class="coin-name">Platino</span><div>${coins.platinum || 0}</div></div>
            <div class="coin-card"><span class="coin-icon">💰</span><span class="coin-name">Oro</span><div style="color:var(--coin-gold);">${coins.gold || 0}</div></div>
            <div class="coin-card"><span class="coin-icon">⚜️</span><span class="coin-name">Electro</span><div>${coins.electrum || 0}</div></div>
            <div class="coin-card"><span class="coin-icon">🪙</span><span class="coin-name">Plata</span><div style="color:var(--coin-silver);">${coins.silver || 0}</div></div>
            <div class="coin-card"><span class="coin-icon">🔸</span><span class="coin-name">Cobre</span><div style="color:var(--coin-copper);">${coins.copper || 0}</div></div>
        </div>
        <h3>🎯 Habilidades</h3>${skillsHtml}
        ${char.traits ? `<h3>✨ Atributos de Especie</h3><p>${escapeHtml(char.traits)}</p>` : ''}
        ${char.classFeatures ? `<h3>⚔️ Rasgos de Clase</h3><p>${escapeHtml(char.classFeatures)}</p>` : ''}
        <div class="tabs">
            <button class="tab-btn active" data-tab="invTab">🎒 Inventario</button>
            <button class="tab-btn" data-tab="magicTab">✨ Obj. Mágicos</button>
            <button class="tab-btn" data-tab="spellsTab">📜 Hechizos</button>
            <button class="tab-btn" data-tab="notesTab">📝 Notas</button>
        </div>
        <div id="invTab" class="tab-content active"><div class="items-list">${invList}</div></div>
        <div id="magicTab" class="tab-content"><div class="items-list">${magicList}</div></div>
        <div id="spellsTab" class="tab-content">${spellsHtml}</div>
        <div id="notesTab" class="tab-content"><pre style="white-space:pre-wrap;">${escapeHtml(char.notes || "Sin notas")}</pre></div>
    `;
    document.getElementById("viewContent").innerHTML = content;
    document.querySelectorAll("#viewContent .tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const target = btn.getAttribute("data-tab");
            document.querySelectorAll("#viewContent .tab-content").forEach(tc => tc.classList.remove("active"));
            document.getElementById(target).classList.add("active");
            document.querySelectorAll("#viewContent .tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });
    showScreen("viewScreen");
}

// ==================== EDITOR DE PERSONAJE ====================
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
    document.getElementById("charSpeed").value = 30;
    document.getElementById("charSize").value = "Mediano";
    document.getElementById("coinPlatinum").value = 0;
    document.getElementById("coinGold").value = 0;
    document.getElementById("coinElectrum").value = 0;
    document.getElementById("coinSilver").value = 0;
    document.getElementById("coinCopper").value = 0;
    selectedThemeColor = "#3A3534";
    applyEditorColor(selectedThemeColor);
    document.getElementById("bgColorPicker").value = selectedThemeColor;
    window.currentEditInventory = [];
    window.currentEditMagicItems = [];
    renderInventoryEditor([], 'inventoryContainer', 'newItemName', 'addItemBtn', 'inventory');
    renderInventoryEditor([], 'magicItemsContainer', 'newMagicItemName', 'addMagicItemBtn', 'magic');
    renderSpellEditor([]);
    updateSkillsDisplay();
    showScreen("editorScreen");
}

function loadCharToEditor(id) {
    const char = characters.find(c => c.id == id);
    if (!char) return;
    currentEditId = id;
    document.getElementById("editorTitle").innerText = `✏️ Editando: ${char.name}`;
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
    document.getElementById("charSpeed").value = char.speed || 30;
    document.getElementById("charSize").value = char.size || "Mediano";
    document.getElementById("charTraits").value = char.traits || "";
    document.getElementById("charFeats").value = char.feats || "";
    document.getElementById("charClassFeatures").value = char.classFeatures || "";
    document.getElementById("charLanguages").value = char.languages || "";
    document.getElementById("charPassivePerception").value = char.passivePerception || 10;
    document.getElementById("charInitiative").value = char.initiative || 0;
    document.getElementById("charProficiencies").value = char.proficiencies || "";
    document.getElementById("coinPlatinum").value = char.coins?.platinum || 0;
    document.getElementById("coinGold").value = char.coins?.gold || 0;
    document.getElementById("coinElectrum").value = char.coins?.electrum || 0;
    document.getElementById("coinSilver").value = char.coins?.silver || 0;
    document.getElementById("coinCopper").value = char.coins?.copper || 0;
    document.getElementById("notes").value = char.notes || "";
    window.currentEditInventory = [...(char.inventory || [])];
    window.currentEditMagicItems = [...(char.magicItems || [])];
    renderInventoryEditor(window.currentEditInventory, 'inventoryContainer', 'newItemName', 'addItemBtn', 'inventory');
    renderInventoryEditor(window.currentEditMagicItems, 'magicItemsContainer', 'newMagicItemName', 'addMagicItemBtn', 'magic');
    renderSpellEditor(char.spellsList || []);
    selectedThemeColor = char.themeColor || "#3A3534";
    applyEditorColor(selectedThemeColor);
    document.getElementById("bgColorPicker").value = selectedThemeColor;
    updateSkillsDisplay();
    showScreen("editorScreen");
}

function saveCharacterFromForm() {
    const name = document.getElementById("charName").value.trim();
    if (!name) { alert("⚠️ El nombre es obligatorio"); return; }
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
        name: name,
        race: document.getElementById("charRace").value,
        class: document.getElementById("charClass").value,
        alignment: document.getElementById("charAlignment").value,
        background: document.getElementById("charBackground").value,
        imageUrl: document.getElementById("charImageUrl").value,
        stats: {
            fue: parseInt(document.getElementById("statFue").value) || 10,
            des: parseInt(document.getElementById("statDes").value) || 10,
            con: parseInt(document.getElementById("statCon").value) || 10,
            int: parseInt(document.getElementById("statInt").value) || 10,
            sab: parseInt(document.getElementById("statSab").value) || 10,
            car: parseInt(document.getElementById("statCar").value) || 10,
        },
        speed: parseInt(document.getElementById("charSpeed").value) || 30,
        size: document.getElementById("charSize").value,
        traits: document.getElementById("charTraits").value,
        feats: document.getElementById("charFeats").value,
        classFeatures: document.getElementById("charClassFeatures").value,
        languages: document.getElementById("charLanguages").value,
        passivePerception: parseInt(document.getElementById("charPassivePerception").value) || 10,
        initiative: parseInt(document.getElementById("charInitiative").value) || 0,
        proficiencies: document.getElementById("charProficiencies").value,
        coins: {
            platinum: parseInt(document.getElementById("coinPlatinum").value) || 0,
            gold: parseInt(document.getElementById("coinGold").value) || 0,
            electrum: parseInt(document.getElementById("coinElectrum").value) || 0,
            silver: parseInt(document.getElementById("coinSilver").value) || 0,
            copper: parseInt(document.getElementById("coinCopper").value) || 0
        },
        spellsList: spellsList,
        inventory: window.currentEditInventory || [],
        magicItems: window.currentEditMagicItems || [],
        notes: document.getElementById("notes").value,
        themeColor: selectedThemeColor,
        activeEffects: currentEditId ? (characters.find(c => c.id === currentEditId)?.activeEffects || []) : []
    };
    if (currentEditId) {
        const index = characters.findIndex(c => c.id === currentEditId);
        if (index !== -1) characters[index] = newCharData;
    } else { characters.push(newCharData); }
    saveChars();
    renderMainMenu();
    showScreen("mainMenuScreen");
    currentEditId = null;
}

function applyEditorColor(color) {
    const wrapper = document.getElementById("editorColorWrapper");
    if (wrapper) wrapper.style.backgroundColor = color;
    selectedThemeColor = color;
}

// ==================== DM PANEL ====================
function initIconSelector() {
    const iconContainer = document.getElementById("iconSelectorDm");
    if (!iconContainer) return;
    document.querySelectorAll("#iconSelectorDm .icon-option").forEach(icon => {
        icon.addEventListener("click", () => {
            document.querySelectorAll("#iconSelectorDm .icon-option").forEach(i => i.classList.remove("selected"));
            icon.classList.add("selected");
            currentSelectedIcon = icon.getAttribute("data-icon");
            document.getElementById("selectedIconDm").value = currentSelectedIcon;
        });
    });
}

function addGlobalItem() {
    const name = document.getElementById("dmItemName").value.trim();
    if (!name) { alert("📝 Escribe un nombre"); return; }
    const desc = document.getElementById("dmItemDesc").value;
    const category = document.getElementById("dmItemCategory").value;
    const rarity = document.getElementById("dmItemRarity").value;
    const duration = parseInt(document.getElementById("effectDuration").value);
    const newItem = { name, desc, category, rarity, icon: currentSelectedIcon, duration: isNaN(duration) ? null : duration };
    globalItems.push(newItem);
    saveGlobalItems();
    renderDMGlobalItems();
    populateDMSelectors();
    document.getElementById("dmItemName").value = "";
    document.getElementById("dmItemDesc").value = "";
    document.getElementById("effectDuration").value = "";
    alert(`✅ Objeto "${name}" añadido`);
}

function renderDMGlobalItems() {
    const container = document.getElementById("globalItemsList");
    if (!container) return;
    if (globalItems.length === 0) { container.innerHTML = "<em>📦 Almacén vacío</em>"; return; }
    container.innerHTML = globalItems.map((item, idx) => {
        let rarityIcon = '';
        switch(item.rarity) {
            case 'Común': rarityIcon = '🟢'; break;
            case 'Poco común': rarityIcon = '🔵'; break;
            case 'Raro': rarityIcon = '🟣'; break;
            case 'Muy raro': rarityIcon = '🟠'; break;
            case 'Legendario': rarityIcon = '🔴'; break;
            default: rarityIcon = '⚪';
        }
        return `<div class="item-entry"><span>${item.icon || '📦'} <strong>${escapeHtml(item.name)}</strong> ${rarityIcon} ${item.rarity} [${item.category}] ${item.desc ? `(${escapeHtml(item.desc)})` : ''}</span><button class="removeItemBtn" data-idx="${idx}" style="background:#8b3c2c;">❌</button></div>`;
    }).join("");
    document.querySelectorAll(".removeItemBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(btn.getAttribute("data-idx"));
            if (confirm(`¿Eliminar "${globalItems[idx]?.name}"?`)) {
                globalItems.splice(idx, 1);
                saveGlobalItems();
                renderDMGlobalItems();
                populateDMSelectors();
            }
        });
    });
}

function populateDMSelectors() {
    const targetSel = document.getElementById("dmTargetCharSelect");
    const removeCharSel = document.getElementById("dmRemoveCharSelect");
    const itemSel = document.getElementById("dmSelectItemToSend");
    if (targetSel) targetSel.innerHTML = characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    if (removeCharSel) removeCharSel.innerHTML = characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    if (itemSel) itemSel.innerHTML = globalItems.map((it, idx) => `<option value="${idx}">${it.icon || '📦'} ${escapeHtml(it.name)} (${it.rarity})</option>`).join("");
    
    const removeTypeSel = document.getElementById("dmRemoveTypeSelect");
    const removeItemSel = document.getElementById("dmRemoveItemSelect");
    if (removeTypeSel && removeItemSel) {
        const updateRemoveItems = () => {
            const charId = parseInt(removeCharSel?.value);
            const type = removeTypeSel.value;
            const char = characters.find(c => c.id === charId);
            const items = type === 'inventory' ? (char?.inventory || []) : (char?.magicItems || []);
            removeItemSel.innerHTML = items.map((item, idx) => {
                const qty = typeof item === 'string' ? 1 : (item.quantity || 1);
                const name = typeof item === 'string' ? item : item.name;
                return `<option value="${idx}" data-qty="${qty}">${escapeHtml(name)} (x${qty})</option>`;
            }).join("");
            if (items.length === 0) removeItemSel.innerHTML = "<option disabled>Sin objetos</option>";
            const selected = removeItemSel.options[removeItemSel.selectedIndex];
            const maxQtySpan = document.getElementById("maxQuantityDisplay");
            if (selected && selected.dataset.qty && maxQtySpan) maxQtySpan.textContent = `(Máx: ${selected.dataset.qty})`;
        };
        removeCharSel.onchange = updateRemoveItems;
        removeTypeSel.onchange = updateRemoveItems;
        updateRemoveItems();
    }
}

function sendItemToCharacter() {
    const charId = parseInt(document.getElementById("dmTargetCharSelect").value);
    const itemIndex = parseInt(document.getElementById("dmSelectItemToSend").value);
    const quantity = parseInt(document.getElementById("dmSendQuantity").value) || 1;
    const char = characters.find(c => c.id === charId);
    if (!char || isNaN(itemIndex) || !globalItems[itemIndex]) return;
    const item = globalItems[itemIndex];
    const newItem = { name: item.name, quantity: quantity, rarity: item.rarity || 'Común' };
    if (item.category === 'inventory') {
        if (!char.inventory) char.inventory = [];
        const existing = char.inventory.find(i => (typeof i === 'string' ? i : i.name) === item.name);
        if (existing) {
            if (typeof existing === 'string') {
                const idx = char.inventory.indexOf(existing);
                char.inventory[idx] = { name: item.name, quantity: 2, rarity: item.rarity };
            } else { existing.quantity = (existing.quantity || 1) + quantity; }
        } else { char.inventory.push(newItem); }
    } else if (item.category === 'magic') {
        if (!char.magicItems) char.magicItems = [];
        const existing = char.magicItems.find(i => (typeof i === 'string' ? i : i.name) === item.name);
        if (existing) {
            if (typeof existing === 'string') {
                const idx = char.magicItems.indexOf(existing);
                char.magicItems[idx] = { name: item.name, quantity: 2, rarity: item.rarity };
            } else { existing.quantity = (existing.quantity || 1) + quantity; }
        } else { char.magicItems.push(newItem); }
    } else if (item.category === 'spell') {
        if (!char.spellsList) char.spellsList = [];
        char.spellsList.push({ name: item.name, type: 'hechizo', level: 1, effect: item.desc || '', damage: '' });
    }
    if (item.duration && item.duration > 0) {
        if (!char.activeEffects) char.activeEffects = [];
        char.activeEffects.push({ name: item.name, icon: item.icon, expiresAt: Date.now() + (item.duration * 60 * 1000) });
    }
    saveChars();
    alert(`✅ Enviado: ${quantity}x ${item.name} a ${char.name}`);
    if (currentViewId === charId) viewCharacter(charId);
    renderMainMenu();
}

function removeItemFromCharacter() {
    const charId = parseInt(document.getElementById("dmRemoveCharSelect").value);
    const type = document.getElementById("dmRemoveTypeSelect").value;
    const itemIndex = parseInt(document.getElementById("dmRemoveItemSelect").value);
    const quantityToRemove = parseInt(document.getElementById("dmRemoveQuantity").value) || 1;
    const char = characters.find(c => c.id === charId);
    if (!char || isNaN(itemIndex)) return;
    const itemsArray = type === 'inventory' ? char.inventory : char.magicItems;
    if (!itemsArray || !itemsArray[itemIndex]) return;
    const item = itemsArray[itemIndex];
    const currentQty = typeof item === 'string' ? 1 : (item.quantity || 1);
    if (quantityToRemove >= currentQty) {
        itemsArray.splice(itemIndex, 1);
        alert(`🗑️ Eliminado completamente: ${typeof item === 'string' ? item : item.name}`);
    } else {
        if (typeof item === 'string') {
            itemsArray[itemIndex] = { name: item, quantity: currentQty - quantityToRemove, rarity: 'Común' };
        } else { item.quantity = currentQty - quantityToRemove; }
        alert(`🗑️ Eliminado ${quantityToRemove}x de ${item.name}. Restan: ${currentQty - quantityToRemove}`);
    }
    saveChars();
    populateDMSelectors();
    if (currentViewId === charId) viewCharacter(charId);
    renderMainMenu();
}

// ==================== LOGIN Y NAVEGACIÓN ====================
function showDMLogin() { showScreen("loginScreen"); }
function verifyDMPassword() {
    if (document.getElementById("dmPassword").value === DM_PASSWORD) {
        showScreen("dmScreen");
        renderDMGlobalItems();
        populateDMSelectors();
        document.getElementById("dmPassword").value = "";
    } else { alert("🔒 Contraseña incorrecta"); }
}
function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(screenId);
    if (target) target.classList.add("active");
    if (screenId === "dmScreen") { renderDMGlobalItems(); populateDMSelectors(); }
    if (screenId === "mainMenuScreen") renderMainMenu();
    if (screenId === "editorScreen") updateSkillsDisplay();
}

// ==================== EVENTOS ====================
function setupEventListeners() {
    const statInputs = ['statFue', 'statDes', 'statCon', 'statInt', 'statSab', 'statCar'];
    statInputs.forEach(id => document.getElementById(id)?.addEventListener('input', updateSkillsDisplay));
    document.getElementById("charClass")?.addEventListener('input', updateSkillsDisplay);
    document.getElementById("charFeats")?.addEventListener('input', updateSkillsDisplay);
    document.getElementById("btnCreateNewChar")?.addEventListener("click", newCharacter);
    document.getElementById("closeEditorBtn")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("characterForm")?.addEventListener("submit", (e) => { e.preventDefault(); saveCharacterFromForm(); });
    document.getElementById("deleteCharBtn")?.addEventListener("click", () => { if (currentEditId) deleteCharacterById(currentEditId); });
    document.getElementById("backToMenuFromView")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("editFromViewBtn")?.addEventListener("click", () => { if (currentViewId) loadCharToEditor(currentViewId); });
    document.getElementById("deleteFromViewBtn")?.addEventListener("click", () => { if (currentViewId) deleteCharacterById(currentViewId); });
    document.getElementById("btnDMMenu")?.addEventListener("click", showDMLogin);
    document.getElementById("closeDMBtn")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("verifyDMBtn")?.addEventListener("click", verifyDMPassword);
    document.getElementById("cancelDMLogin")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("addGlobalItemBtn")?.addEventListener("click", addGlobalItem);
    document.getElementById("sendItemToCharBtn")?.addEventListener("click", sendItemToCharacter);
    document.getElementById("removeItemFromCharBtn")?.addEventListener("click", removeItemFromCharacter);
    document.getElementById("addSpellBtn")?.addEventListener("click", () => {
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
    colorPicker?.addEventListener("input", (e) => applyEditorColor(e.target.value));
    applyBtn?.addEventListener("click", () => {
        let val = rgbText?.value.trim();
        if (val?.startsWith("#") || val?.startsWith("rgb")) applyEditorColor(val);
        else if (/^[0-9A-Fa-f]{6}$/i.test(val || '')) applyEditorColor("#" + val);
        else alert("🎨 Formato inválido");
    });
}

// ==================== EFECTOS TEMPORALES ====================
setInterval(() => {
    let changed = false;
    characters.forEach(char => {
        if (char.activeEffects?.length) {
            const before = char.activeEffects.length;
            char.activeEffects = char.activeEffects.filter(e => e.expiresAt > Date.now());
            if (before !== char.activeEffects.length) changed = true;
        }
    });
    if (changed) { saveChars(); if (currentViewId) viewCharacter(currentViewId); }
}, 1000);

// ==================== INICIALIZAR ====================
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    initIconSelector();
    loadData();
});
