

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

// ==================== MODELO DE DATOS ====================
let characters = [];
let globalItems = [];
let currentEditId = null;
let currentViewId = null;
let selectedThemeColor = "#3A3534";
let currentSelectedIcon = "⚔️";
const DM_PASSWORD = "Error123";

// Mapeo de habilidades
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

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

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
            if (syncStatus) { syncStatus.innerHTML = "⚠️ Offline"; syncStatus.className = "sync-error"; }
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
            const syncStatus = document.getElementById("syncStatus");
            if (syncStatus) { syncStatus.innerHTML = "✅ Guardado"; setTimeout(() => { if (syncStatus.innerHTML === "✅ Guardado") syncStatus.innerHTML = "🔄 Online"; }, 2000); }
        } catch (error) { console.error("Error guardando:", error); }
    }
}

async function saveGlobalItems() {
    localStorage.setItem("dm_global_items", JSON.stringify(globalItems));
    if (syncEnabled && db) {
        for (let i = 0; i < globalItems.length; i++) {
            await db.collection("globalItems").doc(i.toString()).set(globalItems[i]);
        }
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
    
    container.innerHTML = `<div style="grid-column: span 2; font-size: 0.7rem; color: var(--gold-light);">🎯 Competencia: +${profBonus} (Nivel ${level}) | Dotes: ${feats.substring(0, 30)}${feats.length > 30 ? '...' : ''}</div>`;
    
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
        const div = document.createElement('div');
        div.className = 'item-entry';
        div.innerHTML = `<span class="item-name">${escapeHtml(item)}</span><button type="button" class="remove-item-btn" data-idx="${idx}" data-type="${type}">✖</button>`;
        listContainer.appendChild(div);
    });
    
    document.querySelectorAll(`#${containerId}List .remove-item-btn`).forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            const itemType = btn.getAttribute('data-type');
            if (itemType === 'inventory' && window.currentEditInventory) {
                window.currentEditInventory.splice(idx, 1);
                renderInventoryEditor(window

