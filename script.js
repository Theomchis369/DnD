// ==================== CONFIGURACIÓN DE FIREBASE (TUS DATOS) ====================
const firebaseConfig = {
    apiKey: "AIzaSyA-xQqjiOVb6L6Yh8RKB2TDZV6-Zn10Wz8",
    authDomain: "dnd-personajes.firebaseapp.com",
    projectId: "dnd-personajes",
    storageBucket: "dnd-personajes.firebasestorage.app",
    messagingSenderId: "639638791743",
    appId: "1:639638791743:web:8487dd7aa9f3b5edf03a8a",
    measurementId: "G-YDH5D9XCNV"
};

// Inicializar Firebase (usando la sintaxis compat para que funcione con tu HTML)
let db = null;
let syncEnabled = false;

// Verificar si Firebase está disponible
if (typeof firebase !== 'undefined' && firebase.initializeApp) {
    try {
        // Inicializar Firebase solo si no está ya inicializado
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        syncEnabled = true;
        console.log("✅ Firebase conectado - Sincronización activa");
    } catch (error) {
        console.warn("Error inicializando Firebase:", error);
        syncEnabled = false;
    }
} else {
    console.warn("⚠️ Firebase SDK no cargado, usando almacenamiento local");
    syncEnabled = false;
}

// ==================== MODELO DE DATOS ====================
let characters = [];
let globalItems = [];
let currentEditId = null;
let currentViewId = null;
let selectedThemeColor = "#3A3534";
let currentSelectedIcon = "⚔️";

// Contraseña del DM
const DM_PASSWORD = "Error123";

// Habilidades mapeadas a sus estadísticas base
const skillsMap = {
    'Atletismo': 'fue',
    'Acrobacias': 'des',
    'Juego de Manos': 'des',
    'Sigilo': 'des',
    'Arcanos': 'int',
    'Historia': 'int',
    'Investigación': 'int',
    'Naturaleza': 'int',
    'Religión': 'int',
    'Trato con Animales': 'sab',
    'Perspicacia': 'sab',
    'Medicina': 'sab',
    'Percepción': 'sab',
    'Supervivencia': 'sab',
    'Engaño': 'car',
    'Interpretación': 'car',
    'Intimidación': 'car',
    'Persuasión': 'car'
};

// Calcular modificador de estadística
function calcModifier(statValue) {
    return Math.floor((statValue - 10) / 2);
}

// Calcular bonificador de habilidad
function calculateSkillBonus(statValue, isProficient = false, proficiencyBonus = 2) {
    const mod = calcModifier(statValue);
    return isProficient ? mod + proficiencyBonus : mod;
}

// Obtener nivel y bonificador de competencia
function getProficiencyBonus(level) {
    return Math.floor((level - 1) / 4) + 2;
}

// Actualizar habilidades automáticamente en el editor
function updateSkillsDisplay() {
    const stats = {
        fue: parseInt(document.getElementById("statFue")?.value) || 10,
        des: parseInt(document.getElementById("statDes")?.value) || 10,
        con: parseInt(document.getElementById("statCon")?.value) || 10,
        int: parseInt(document.getElementById("statInt")?.value) || 10,
        sab: parseInt(document.getElementById("statSab")?.value) || 10,
        car: parseInt(document.getElementById("statCar")?.value) || 10
    };
    
    const classText = document.getElementById("charClass")?.value || "";
    const level = getCharacterLevel(classText);
    const profBonus = getProficiencyBonus(level);
    
    const container = document.getElementById("skillsContainer");
    if (!container) return;
    
    container.innerHTML = '<div style="grid-column: span 2; font-size: 0.7rem; color: var(--gold-light);">🎯 Bonificador de competencia: +' + profBonus + ' (Nivel ' + level + ')</div>';
    
    for (const [skill, stat] of Object.entries(skillsMap)) {
        const bonus = calculateSkillBonus(stats[stat], false, profBonus);
        const sign = bonus >= 0 ? '+' : '';
        container.innerHTML += `
            <div class="skill-item">
                <span class="skill-name">${skill}</span>
                <span class="skill-bonus">${sign}${bonus}</span>
            </div>
        `;
    }
}

// Cargar datos desde Firebase
async function loadData() {
    const syncStatus = document.getElementById("syncStatus");
    
    if (syncEnabled && db) {
        try {
            if (syncStatus) {
                syncStatus.innerHTML = "🔄 Sincronizando...";
                syncStatus.className = "sync-loading";
            }
            
            // Cargar personajes desde Firestore
            const charsSnapshot = await db.collection("characters").get();
            characters = [];
            charsSnapshot.forEach(doc => {
                const charData = doc.data();
                characters.push({ 
                    id: parseInt(doc.id), 
                    ...charData,
                    stats: charData.stats || { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
                    spellsList: charData.spellsList || [],
                    inventory: charData.inventory || [],
                    magicItems: charData.magicItems || [],
                    activeEffects: (charData.activeEffects || []).filter(e => e.expiresAt > Date.now())
                });
            });
            
            // Cargar items globales
            const itemsSnapshot = await db.collection("globalItems").get();
            globalItems = [];
            itemsSnapshot.forEach(doc => {
                globalItems.push(doc.data());
            });
            
            if (syncStatus) {
                syncStatus.innerHTML = "✅ Sincronizado";
                syncStatus.className = "sync-success";
                setTimeout(() => {
                    if (syncStatus.innerHTML === "✅ Sincronizado") {
                        syncStatus.innerHTML = "🔄 Online";
                    }
                }, 3000);
            }
        } catch (error) {
            console.error("Error cargando de Firebase:", error);
            if (syncStatus) {
                syncStatus.innerHTML = "⚠️ Offline (usando local)";
                syncStatus.className = "sync-error";
            }
            loadLocalData();
        }
    } else {
        if (syncStatus) {
            syncStatus.innerHTML = "📱 Modo local";
            syncStatus.className = "sync-error";
        }
        loadLocalData();
    }
    renderMainMenu();
}

function loadLocalData() {
    const storedChars = localStorage.getItem("dnd_chars");
    characters = storedChars ? JSON.parse(storedChars) : [];
    const storedGlobal = localStorage.getItem("dm_global_items");
    globalItems = storedGlobal ? JSON.parse(storedGlobal) : [];
    
    characters.forEach(char => {
        if (char.activeEffects) {
            char.activeEffects = char.activeEffects.filter(e => e.expiresAt > Date.now());
        } else {
            char.activeEffects = [];
        }
        if (!char.spellsList) char.spellsList = [];
        if (!char.stats) char.stats = { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };
    });
}

// Guardar datos en Firebase
async function saveChars() {
    // Siempre guardar en localStorage como respaldo
    localStorage.setItem("dnd_chars", JSON.stringify(characters));
    
    if (syncEnabled && db) {
        try {
            for (const char of characters) {
                const charData = { ...char };
                delete charData.id;
                await db.collection("characters").doc(char.id.toString()).set(charData);
            }
            
            const syncStatus = document.getElementById("syncStatus");
            if (syncStatus) {
                syncStatus.innerHTML = "✅ Guardado";
                setTimeout(() => {
                    if (syncStatus.innerHTML === "✅ Guardado") {
                        syncStatus.innerHTML = "🔄 Online";
                    }
                }, 2000);
            }
        } catch (error) {
            console.error("Error guardando en Firebase:", error);
            const syncStatus = document.getElementById("syncStatus");
            if (syncStatus) {
                syncStatus.innerHTML = "⚠️ Error al guardar";
                setTimeout(() => {
                    if (syncStatus.innerHTML === "⚠️ Error al guardar") {
                        syncStatus.innerHTML = "📱 Offline";
                    }
                }, 2000);
            }
        }
    }
}

async function saveGlobalItems() {
    localStorage.setItem("dm_global_items", JSON.stringify(globalItems));
    
    if (syncEnabled && db) {
        try {
            for (let i = 0; i < globalItems.length; i++) {
                await db.collection("globalItems").doc(i.toString()).set(globalItems[i]);
            }
        } catch (error) {
            console.error("Error guardando items globales:", error);
        }
    }
}

// Actualizar contadores de efectos cada segundo
setInterval(() => {
    let changed = false;
    characters.forEach(char => {
        if (char.activeEffects && char.activeEffects.length) {
            const before = char.activeEffects.length;
            char.activeEffects = char.activeEffects.filter(e => e.expiresAt > Date.now());
            if (before !== char.activeEffects.length) changed = true;
        }
    });
    if (changed) {
        saveChars();
        if (document.getElementById("viewScreen").classList.contains("active") && currentViewId) {
            viewCharacter(currentViewId);
        }
    }
}, 1000);

// Helper
function getCharacterLevel(className) {
    const match = className?.match(/\b(\d+)\b/);
    return match ? parseInt(match[1]) : 1;
}

function getSpellSlots(level) {
    const slots = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0};
    if (level >= 1) slots[1] = 2;
    if (level >= 2) slots[1] = 3;
    if (level >= 3) { slots[1] = 4; slots[2] = 2; }
    if (level >= 4) { slots[1] = 4; slots[2] = 3; }
    if (level >= 5) { slots[1] = 4; slots[2] = 3; slots[3] = 2; }
    if (level >= 6) { slots[1] = 4; slots[2] = 3; slots[3] = 3; }
    if (level >= 7) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 1; }
    if (level >= 8) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 2; }
    if (level >= 9) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 3; slots[5] = 1; }
    if (level >= 10) { slots[1] = 4; slots[2] = 3; slots[3] = 3; slots[4] = 3; slots[5] = 2; }
    return slots;
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>]/g, function(m) {
        return m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;';
    });
}

// Render menú principal
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

// Vista del personaje
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
    
    // Habilidades para la vista
    let skillsHtml = '<div class="skills-grid" style="margin-top:0.5rem;">';
    for (const [skill, stat] of Object.entries(skillsMap)) {
        const bonus = calculateSkillBonus(stats[stat] || 10, false, profBonus);
        const sign = bonus >= 0 ? '+' : '';
        skillsHtml += `<div class="skill-item"><span class="skill-name">${skill}</span><span class="skill-bonus">${sign}${bonus}</span></div>`;
    }
    skillsHtml += '</div>';
    
    const invList = (char.inventory || []).map(i => `<div class="item-row">🎒 ${escapeHtml(i)}</div>`).join("");
    const magicList = (char.magicItems || []).map(i => `<div class="item-row">✨ ${escapeHtml(i)}</div>`).join("");
    
    let spellsHtml = `<div><strong>📊 Nivel: ${level}</strong> | 🎯 Bonificador competencia: +${profBonus}</div>`;
    if (char.spellsList && char.spellsList.length) {
        spellsHtml += `<div style="margin-top:10px;">`;
        char.spellsList.forEach(sp => {
            const tipoLabel = sp.type === 'truco' ? '🎭 Truco' : (sp.type === 'hechizo' ? '✨ Hechizo' : '🔮 Encantamiento');
            spellsHtml += `<div class="spell-view"><strong>✨ ${escapeHtml(sp.name)}</strong> (${tipoLabel}, Nivel ${sp.level})<br>📖 Efecto: ${escapeHtml(sp.effect)}<br>🎲 Daño: ${escapeHtml(sp.damage || 'Ninguno')}</div>`;
        });
        spellsHtml += `</div>`;
    } else {
        spellsHtml += `<em>📜 Sin hechizos registrados</em>`;
    }
    
    let effectsHtml = "";
    if (char.activeEffects && char.activeEffects.length) {
        effectsHtml = char.activeEffects.map(eff => {
            const remaining = Math.max(0, Math.floor((eff.expiresAt - Date.now()) / 1000));
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            return `<div class="effect-timer">⏳ ${eff.icon || '⚠️'} ${escapeHtml(eff.name)}: ${mins}m ${secs}s restantes</div>`;
        }).join("");
    } else {
        effectsHtml = "<em>⏳ Sin efectos temporales activos</em>";
    }
    
    const content = `
        <div style="display:flex; gap:1rem; align-items:center; margin-bottom:1rem;">
            ${char.imageUrl ? `<img src="${char.imageUrl}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;" onerror="this.onerror=null;this.style.display='none';this.parentElement.innerHTML+='<div style=\\'background:var(--accent); width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:3rem;\\'>${char.name.charAt(0)}</div>';">` : `<div style="background:var(--accent); width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:3rem;">${char.name.charAt(0)}</div>`}
            <div><strong>${char.race || "?"}</strong> · ${char.alignment || "?"}<br>📖 Trasfondo: ${char.background || "—"}</div>
        </div>
        <div class="stat-grid">
            <div class="stat-card"><strong>💪 FUE</strong><br>${stats.fue||10} (${calcModifier(stats.fue||10)>=0?'+':''}${calcModifier(stats.fue||10)})</div>
            <div class="stat-card"><strong>🏃 DES</strong><br>${stats.des||10} (${calcModifier(stats.des||10)>=0?'+':''}${calcModifier(stats.des||10)})</div>
            <div class="stat-card"><strong>❤️ CON</strong><br>${stats.con||10} (${calcModifier(stats.con||10)>=0?'+':''}${calcModifier(stats.con||10)})</div>
            <div class="stat-card"><strong>🧠 INT</strong><br>${stats.int||10} (${calcModifier(stats.int||10)>=0?'+':''}${calcModifier(stats.int||10)})</div>
            <div class="stat-card"><strong>👁️ SAB</strong><br>${stats.sab||10} (${calcModifier(stats.sab||10)>=0?'+':''}${calcModifier(stats.sab||10)})</div>
            <div class="stat-card"><strong>💬 CAR</strong><br>${stats.car||10} (${calcModifier(stats.car||10)>=0?'+':''}${calcModifier(stats.car||10)})</div>
        </div>
        <h3>🎯 Habilidades</h3>
        ${skillsHtml}
        <div class="tabs">
            <button class="tab-btn active" data-tab="invTab">🎒 Inventario</button>
            <button class="tab-btn" data-tab="magicTab">✨ Obj. Mágicos</button>
            <button class="tab-btn" data-tab="spellsTab">📜 Hechizos</button>
            <button class="tab-btn" data-tab="effectsTab">⏳ Efectos</button>
            <button class="tab-btn" data-tab="notesTab">📝 Notas</button>
        </div>
        <div id="invTab" class="tab-content active">${invList || "<em>🎒 Vacío</em>"}</div>
        <div id="magicTab" class="tab-content">${magicList || "<em>✨ Sin objetos mágicos</em>"}</div>
        <div id="spellsTab" class="tab-content">${spellsHtml}</div>
        <div id="effectsTab" class="tab-content">${effectsHtml}</div>
        <div id="notesTab" class="tab-content"><pre style="white-space:pre-wrap;">${escapeHtml(char.notes || "📝 Sin notas")}</pre></div>
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

function deleteCharacterById(id) {
    if (confirm("⚠️ ¿Eliminar este personaje permanentemente?")) {
        characters = characters.filter(c => c.id !== id);
        saveChars();
        renderMainMenu();
        showScreen("mainMenuScreen");
        if (currentViewId === id) currentViewId = null;
    }
}

// Editor de hechizos
function renderSpellEditor(spellsList) {
    const container = document.getElementById("spellsContainer");
    if (!container) return;
    container.innerHTML = '';
    spellsList.forEach((spell, idx) => {
        const div = document.createElement('div');
        div.className = 'spell-card';
        div.innerHTML = `
            <input type="text" class="spell-name" value="${escapeHtml(spell.name)}" placeholder="Nombre del hechizo">
            <select class="spell-type">
                <option value="truco" ${spell.type === 'truco' ? 'selected' : ''}>🎭 Truco</option>
                <option value="hechizo" ${spell.type === 'hechizo' ? 'selected' : ''}>✨ Hechizo</option>
                <option value="encantamiento" ${spell.type === 'encantamiento' ? 'selected' : ''}>🔮 Encantamiento</option>
            </select>
            <input type="number" class="spell-level" value="${spell.level}" placeholder="Nivel" min="0" max="9">
            <input type="text" class="spell-effect" value="${escapeHtml(spell.effect)}" placeholder="Efecto / Descripción">
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
    updateSkillsDisplay();
    showScreen("editorScreen");
}

function loadCharToEditor(id) {
    const char = characters.find(c => c.id == id);
    if (!char) return;
    currentEditId = id;
    document.getElementById("editorTitle").innerText = `✏️ Editar: ${char.name}`;
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
        spellsList: spellsList,
        inventory: document.getElementById("inventory").value.split(",").map(s => s.trim()).filter(s => s),
        notes: document.getElementById("notes").value,
        magicItems: document.getElementById("magicItems").value.split(",").map(s => s.trim()).filter(s => s),
        themeColor: selectedThemeColor,
        activeEffects: currentEditId ? (characters.find(c => c.id === currentEditId)?.activeEffects || []) : []
    };
    
    if (currentEditId) {
        const index = characters.findIndex(c => c.id === currentEditId);
        if (index !== -1) characters[index] = newCharData;
    } else {
        characters.push(newCharData);
    }
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

// DM Panel
function initIconSelector() {
    document.querySelectorAll("#iconSelector .icon-option").forEach(icon => {
        icon.addEventListener("click", () => {
            document.querySelectorAll("#iconSelector .icon-option").forEach(i => i.classList.remove("selected"));
            icon.classList.add("selected");
            currentSelectedIcon = icon.getAttribute("data-icon");
            document.getElementById("selectedIcon").value = currentSelectedIcon;
        });
    });
}

function renderDMGlobalItems() {
    const container = document.getElementById("globalItemsList");
    if (!container) return;
    if (globalItems.length === 0) {
        container.innerHTML = "<em>📦 Almacén vacío</em>";
        return;
    }
    container.innerHTML = globalItems.map((item, idx) => `
        <div class="item-row">
            <span>${item.icon || '📦'} ${escapeHtml(item.name)} [${item.category === 'inventory' ? 'Inventario' : item.category === 'magic' ? 'Objeto Mágico' : 'Hechizo'}] ${item.desc ? `(${escapeHtml(item.desc)})` : ''} ${item.duration ? `⏱️ ${item.duration}min` : ''}</span>
            <button class="removeItemBtn" data-idx="${idx}" style="background:#8b3c2c; padding:0.2rem 0.7rem;">❌</button>
        </div>
    `).join("");
    document.querySelectorAll(".removeItemBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(btn.getAttribute("data-idx"));
            globalItems.splice(idx, 1);
            saveGlobalItems();
            renderDMGlobalItems();
            populateDMSelectors();
        });
    });
}

function populateDMSelectors() {
    const targetSel = document.getElementById("dmTargetCharSelect");
    const itemSel = document.getElementById("dmSelectItemToSend");
    if (targetSel) targetSel.innerHTML = characters.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    if (itemSel) itemSel.innerHTML = globalItems.map((it, idx) => `<option value="${idx}">${it.icon || '📦'} ${escapeHtml(it.name)}</option>`).join("");
}

function addGlobalItem() {
    const name = document.getElementById("dmItemName").value.trim();
    if (!name) { alert("📝 Escribe un nombre para el objeto"); return; }
    const desc = document.getElementById("dmItemDesc").value;
    const category = document.getElementById("dmItemCategory").value;
    const duration = parseInt(document.getElementById("effectDuration").value);
    globalItems.push({ 
        name, 
        desc, 
        category, 
        icon: currentSelectedIcon, 
        duration: isNaN(duration) ? null : duration 
    });
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
    if (!char || isNaN(itemIndex) || !globalItems[itemIndex]) return;
    const item = globalItems[itemIndex];
    let itemText = `${item.icon || '📦'} ${item.name}${item.desc ? ` (${item.desc})` : ''}`;
    
    if (item.category === 'inventory') {
        if (!char.inventory) char.inventory = [];
        char.inventory.push(itemText);
    } else if (item.category === 'magic') {
        if (!char.magicItems) char.magicItems = [];
        char.magicItems.push(itemText);
    } else if (item.category === 'spell') {
        if (!char.spellsList) char.spellsList = [];
        char.spellsList.push({ 
            name: item.name, 
            type: 'hechizo', 
            level: 1, 
            effect: item.desc || '', 
            damage: '' 
        });
    }
    
    if (item.duration && item.duration > 0) {
        if (!char.activeEffects) char.activeEffects = [];
        char.activeEffects.push({ 
            name: item.name, 
            icon: item.icon, 
            expiresAt: Date.now() + (item.duration * 60 * 1000) 
        });
    }
    saveChars();
    alert(`✅ Enviado: ${item.name} a ${char.name}`);
    if (currentViewId === charId) viewCharacter(charId);
    renderMainMenu();
}

// Login DM
function showDMLogin() {
    showScreen("loginScreen");
}

function verifyDMPassword() {
    const password = document.getElementById("dmPassword").value;
    if (password === DM_PASSWORD) {
        showScreen("dmScreen");
        renderDMGlobalItems();
        populateDMSelectors();
        document.getElementById("dmPassword").value = "";
    } else {
        alert("🔒 Contraseña incorrecta");
        document.getElementById("dmPassword").value = "";
    }
}

// Navegación
function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add("active");
    
    if (screenId === "dmScreen") {
        renderDMGlobalItems();
        populateDMSelectors();
    }
    if (screenId === "mainMenuScreen") {
        renderMainMenu();
        loadData(); // Recargar datos al volver al menú
    }
    if (screenId === "editorScreen") {
        updateSkillsDisplay();
    }
}

// Eventos y estadísticas en tiempo real
function setupEventListeners() {
    // Estadísticas en tiempo real para habilidades
    const statInputs = ['statFue', 'statDes', 'statCon', 'statInt', 'statSab', 'statCar'];
    statInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', updateSkillsDisplay);
        }
    });
    
    const classInput = document.getElementById("charClass");
    if (classInput) {
        classInput.addEventListener('input', updateSkillsDisplay);
    }
    
    // Botones principales
    document.getElementById("btnCreateNewChar")?.addEventListener("click", newCharacter);
    document.getElementById("closeEditorBtn")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("characterForm")?.addEventListener("submit", (e) => { 
        e.preventDefault(); 
        saveCharacterFromForm(); 
    });
    document.getElementById("deleteCharBtn")?.addEventListener("click", () => { 
        if (currentEditId) deleteCharacterById(currentEditId); 
    });
    document.getElementById("backToMenuFromView")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("editFromViewBtn")?.addEventListener("click", () => { 
        if (currentViewId) loadCharToEditor(currentViewId); 
    });
    document.getElementById("deleteFromViewBtn")?.addEventListener("click", () => { 
        if (currentViewId) deleteCharacterById(currentViewId); 
    });
    document.getElementById("btnDMMenu")?.addEventListener("click", showDMLogin);
    document.getElementById("closeDMBtn")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("verifyDMBtn")?.addEventListener("click", verifyDMPassword);
    document.getElementById("cancelDMLogin")?.addEventListener("click", () => showScreen("mainMenuScreen"));
    document.getElementById("addGlobalItemBtn")?.addEventListener("click", addGlobalItem);
    document.getElementById("sendItemToCharBtn")?.addEventListener("click", sendItemToCharacter);
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
    
    // Color picker
    const colorPicker = document.getElementById("bgColorPicker");
    const rgbText = document.getElementById("rgbTextInput");
    const applyBtn = document.getElementById("applyColorBtn");
    if (colorPicker) {
        colorPicker.addEventListener("input", (e) => applyEditorColor(e.target.value));
    }
    if (applyBtn) {
        applyBtn.addEventListener("click", () => {
            let val = rgbText?.value.trim();
            if (val?.startsWith("#") || val?.startsWith("rgb")) {
                applyEditorColor(val);
                if (colorPicker) colorPicker.value = val;
            } else if (/^[0-9A-Fa-f]{6}$/i.test(val || '')) {
                applyEditorColor("#" + val);
                if (colorPicker) colorPicker.value = "#" + val;
            } else {
                alert("🎨 Formato inválido. Usa #RRGGBB o rgb(r,g,b)");
            }
        });
    }
}

// Inicializar
document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    initIconSelector();
    loadData();
});
