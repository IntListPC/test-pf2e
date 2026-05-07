const LEGACY_SHEET_KEY = 'pf2_remaster_v22';
    const LEGACY_AVATAR_KEY = 'pf2_av';
    const CHARACTERS_KEY = 'pf2_characters_v1';
    const ACTIVE_CHARACTER_KEY = 'pf2_active_character_id';
    const MAX_CHARACTERS = 10;
    const SUPABASE_URL = 'https://jgrhmzbzojxsybghirrt.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cE3BBpoZlXM-cYx2DC9gnQ_h4fZqiI5';
    const LOCAL_SHEET_UPDATED_AT_KEY = '_localUpdatedAt';
    const ROUTE_MENU_HASH = '#characters';
    const ROUTE_CHARACTER_PREFIX = '#character=';

    let characters = [];
    let activeCharacterId = null;
    let characterDeleteSelectMode = false;
    let draggedCharacterIdx = null;
    let importCharacterAsNew = false;
    let appRouteReady = false;
    let lastStorageAlertAt = 0;
    let isLoadingSheet = false;
    let supabaseClient = null;
    let cloudUser = null;
    let cloudSyncTimer = null;
    let cloudLoading = false;
    let cloudAuthPanelOpen = false;

    let currentPage = 0;
    const totalPages = 6;
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;
    let touchStartAt = 0;
    let touchStartTarget = null;

    function navClick(idx) {
        if (idx === 5 && !isMagicEnabled()) return;
        if (window.innerWidth < 1000 && currentPage === idx) {
            openModal('pageNavModal');
        } else {
            switchPage(idx);
            closeModal('pageNavModal');
        }
    }

    function switchPage(idx) {
        let newIdx = idx;
        const isPC = window.innerWidth >= 1000;
        
        if (isPC) {
            if (newIdx < 1) newIdx = 1;
            if (newIdx >= totalPages) newIdx = totalPages - 1;
        } else {
            if (newIdx < 0) newIdx = totalPages - 1;
            else if (newIdx >= totalPages) newIdx = 0;
        }

        if (!isMagicEnabled() && newIdx === 5) newIdx = isPC ? 4 : (idx > currentPage ? 0 : 4);

        currentPage = newIdx;
        const slider = document.getElementById('pages-slider');
        slider.style.transform = `translateX(-${currentPage * (100 / totalPages)}%)`;
        
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`btn-p${currentPage}`);
        if(activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(updateAttackTagsOverflow);
        syncMobileReorderButtons();
    }

    function isMagicEnabled() {
        return !!document.getElementById('use-magic')?.checked;
    }

    function isFocusEnabled() {
        return !!document.getElementById('use-focus')?.checked;
    }

    function getFocusPointsMax() {
        const input = document.getElementById('focus-points-max');
        const value = Math.max(1, Math.min(3, parseInt(input?.value) || 1));
        if (input && String(input.value) !== String(value)) input.value = value;
        return value;
    }

    function syncMagicUsage() {
        const enabled = isMagicEnabled();
        const btn = document.getElementById('btn-p5');
        const navItem = document.getElementById('page-nav-magic');
        const wrap = document.getElementById('use-magic-wrap');
        if (btn) btn.style.display = enabled ? '' : 'none';
        if (navItem) navItem.style.display = enabled ? '' : 'none';
        if (wrap) wrap.classList.toggle('active', enabled);
        if (!enabled && currentPage === 5) switchPage(window.innerWidth >= 1000 ? 4 : 0);
    }

    function syncFocusUsage() {
        const enabled = isFocusEnabled();
        const wrap = document.getElementById('use-focus-wrap');
        const setting = document.getElementById('focus-points-setting');
        const max = getFocusPointsMax();
        if (wrap) wrap.classList.toggle('active', enabled);
        if (setting) setting.style.display = enabled ? '' : 'none';
        if (attackCourageCount > max) attackCourageCount = max;
        document.querySelectorAll('.attack-courage-dots').forEach(el => {
            el.style.display = enabled ? '' : 'none';
        });
        document.querySelectorAll('[data-attack-courage-dot]').forEach(dot => {
            const idx = parseInt(dot.dataset.attackCourageDot) || 0;
            dot.style.display = idx <= max ? '' : 'none';
        });
    }

    function syncSheetSettings() {
        syncMagicUsage();
        syncFocusUsage();
    }

    function toggleSheetSettings() {
        syncSheetSettings();
        saveAll();
    }

    function saveFocusPointsSetting() {
        syncSheetSettings();
        saveAll();
    }

    document.addEventListener('touchstart', e => {
        if (!e.changedTouches || e.changedTouches.length !== 1) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        touchStartAt = Date.now();
        touchStartTarget = e.target;
    }, { passive: true });
    document.addEventListener('touchend', e => {
        if (!e.changedTouches || e.changedTouches.length !== 1) return;
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        if (window.innerWidth < 1000 && !mobileReorderMode) handleSwipe();
    }, { passive: true });

    function isPageSwipeBlockedTarget(target) {
        return !!(target && target.closest && target.closest('input, textarea, select, button, .modal'));
    }

    function handleSwipe() {
        if (isPageSwipeBlockedTarget(touchStartTarget)) return;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const threshold = Math.max(115, window.innerWidth * 0.28);
        const elapsed = Date.now() - touchStartAt;
        if (elapsed > 800 || absX < threshold || absX < absY * 1.65) return;
        if (dx < 0) switchPage(currentPage + 1);
        if (dx > 0) switchPage(currentPage - 1);
    }

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 1000 && currentPage === 0) {
            switchPage(1); 
        }
        requestAnimationFrame(updateAttackTagsOverflow);
        syncMobileReorderButtons();
    });

    const DATA_MAP = {
        'СИЛА': { key: 'str', skills: ['Атлетика'] },
        'ЛОВКОСТЬ': { key: 'dex', skills: ['Акробатика', 'Воровство', 'Скрытность'] },
        'ТЕЛОСЛОЖЕНИЕ': { key: 'con', skills: [] },
        'ИНТЕЛЛЕКТ': { key: 'int', skills: ['Общество', 'Мистицизм', 'Оккультизм', 'Ремесло'] },
        'МУДРОСТЬ': { key: 'wis', skills: ['Медицина', 'Природа', 'Религия', 'Выживание'] },
        'ХАРИЗМА': { key: 'cha', skills: ['Обман', 'Дипломатия', 'Запугивание', 'Исполнение'] }
    };

    let skillProf = {}; let saveProf = { fort: 0, ref: 0, will: 0, perc: 0 };
    let heroPoints = 0; let lastMaxHP = 0;
    let itemBonuses = {}; let lores = { 1: '', 2: '', 3: '' };
    let abilities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    let partialBoosts = { str: false, dex: false, con: false, int: false, wis: false, cha: false };
    let dyingLevel = 0; let firstRun = true;
    let lastDeathCheck = null;
    let attacks = [];
    let activeCritAttacks = {}; // Хранилище включенных критов для каждой атаки
    let attackTagsHiddenById = {};
    let attackNotes = '';
    let attackNotesSaveTimer = null;
    let attackNotesSelectionRange = null;
    let attackDiceSelection = {};
    let attackDiceHoldTimer = null;
    let attackDiceSuppressClick = false;
    let attackQuickFeatIds = [];
    let attackQuickFeatSelectionCustom = false;
    let attackTagsExpanded = false;
    let attackMapPenaltyCount = 0;
    let attackCourageCount = 0;
    let attackMapSettings = { enabled: true, penalty: -5 };
    let notificationsCollapsed = false;
    let lastLevelUpReadyKey = '';
    let headerCollapsed = false;
    let hpKeypadOpen = false;
    let mobileReorderMode = null;
    let selectedMobileReorder = null;
    let suppressNextClickAfterReorder = false;
    let feats = {};
    let myFeats = [];
    let currentFeatTab = 'my';
    let currentFeatViewSlotId = null;
    let currentFeatViewMode = 'full';
    let currentMyFeatId = null;
    let draggedMyFeatIdx = null;
    let equipmentItems = [];
    let equipmentBackpack = [];
    let equipmentSettings = { backpackEnabled: false, bulkBonus: 0, coins: { pp: 0, gp: 0, sp: 0, cp: 0 } };
    let currentEquipmentTab = 'carried';
    let currentEquipmentViewItemId = null;
    let currentEquipmentViewMode = 'full';
    let currentBackpackSlotId = null;
    let personalitySectionCollapsed = { origin: false, personality: false, proficiency: false };
    let currentPersonalityNoteIndex = 1;
    let proficiencies = { armor: {}, weapon: {} };
    let attackDcSettings = { stat: 'str', bonus: 0 };
    let spells = [];
    let spellSlotsSpent = {};
    let spellSettings = {
        traditions: { arcane: false, occult: false, primal: false, divine: false },
        castingType: 'prepared',
        stat: 'int',
        prof: 0,
        item: 0,
        focusMax: 1,
        focusSpent: 0
    };
    let currentSpellId = null;

    const ATTACK_DAMAGE_TYPES = ['Дробящий', 'Колющий', 'Режущий', 'Звуковой', 'Кислотный', 'Огненный', 'Холод', 'Электрический', 'Ментальный', 'Силовой'];
    const ATTACK_TAG_OPTIONS = ['Безоружное', 'Быстрое', 'Дистанционное сбивающее', 'Длинное', 'Добивающее', 'Залповое', 'Замедляющее', 'Инерционное', 'Кавалерийское', 'Метательное', 'Модульное', 'Монах', 'Напористое', 'Наручное', 'Несмертельное', 'Парирующее', 'Парное', 'Подлое', 'Полуторное', 'Привязанное', 'Прикрепляемое', 'Размашистое', 'Разоружающее', 'Сбивающее', 'Скрываемое', 'Смертоносное', 'Толкающее', 'Убойное', 'Универсальное', 'Фехтовальное', 'Хваткое', 'Отдача', 'Разброс', 'Вместительность', 'Сотрясающее', 'Самопальное', 'Двуствольное'];
    const FEAT_EMOJI_OPTIONS = ['⭐', '⚔️', '🛡️', '🏹', '🔥', '❄️', '⚡', '💀', '❤️', '💚', '💜', '🧠', '👁️', '🦶', '🕊️', '🐺', '🐉', '🧪', '📜', '🔮', '🎭', '🎵', '🛠️', '💰', '🎯', '🌀', '🌙', '☀️', '🌿', '💎'];
    const EQUIPMENT_ICON_OPTIONS = ['🎒', '🗡️', '🛡️', '🏹', '🪓', '🔨', '🧪', '🧴', '📜', '📘', '🔮', '🪄', '💍', '👑', '💎', '💰', '🪙', '🧵', '🪢', '🔦', '🕯️', '🧰', '🔧', '🪤', '🍖', '🍞', '💧', '🧥', '🥾', '🗝️'];
    const EQUIPMENT_ITEM_TYPES = [
        { key: 'other', label: 'Другое' },
        { key: 'armor', label: 'Броня' },
        { key: 'shield', label: 'Щит' },
        { key: 'weapon', label: 'Оружие' },
        { key: 'consumable', label: 'Расходник' }
    ];
    const ARMOR_PROFICIENCY_TYPES = [
        { key: 'unarmored', label: 'Без брони' },
        { key: 'light', label: 'Лёгкая' },
        { key: 'medium', label: 'Средняя' },
        { key: 'heavy', label: 'Тяжёлая' }
    ];
    const WEAPON_PROFICIENCY_TYPES = [
        { key: 'unarmed', label: 'Безоружные' },
        { key: 'simple', label: 'Простое' },
        { key: 'martial', label: 'Особое' },
        { key: 'advanced', label: 'Необычное' },
        { key: 'other', label: 'Иное' }
    ];
    const MAGIC_TRADITIONS = [
        { key: 'arcane', label: 'Мистическая' },
        { key: 'occult', label: 'Оккультная' },
        { key: 'primal', label: 'Природная' },
        { key: 'divine', label: 'Сакральная' }
    ];
    const SPELL_CATEGORIES = [
        { key: 'cantrip', label: 'Фокус' },
        { key: 'ranked', label: 'Заклинание' },
        { key: 'focus', label: 'Фокусное' },
        { key: 'innate', label: 'Врожденное' },
        { key: 'ritual', label: 'Ритуал' }
    ];
    const SPELL_ACTION_OPTIONS = [
        { key: '1', label: '1' },
        { key: '2', label: '2' },
        { key: '3', label: '3' },
        { key: 'R', label: 'Р' },
        { key: 'F', label: 'С' },
        { key: '10m', label: '10м' },
        { key: '1h', label: '1ч' }
    ];
    const EQUIPMENT_TABS = [
        { key: 'backpack', label: 'Рюкзак' },
        { key: 'carried', label: 'Носимые' },
        { key: 'consumable', label: 'Расход' },
        { key: 'worn', label: 'Надетые' },
        { key: 'treasure', label: 'Ценности' }
    ];
    const EQUIPMENT_CATEGORY_LABELS = {
        carried: 'Носимые',
        consumable: 'Расход',
        worn: 'Надетые',
        treasure: 'Ценности'
    };
    const EQUIPMENT_BACKPACK_MAX_BULK = 4;
    const FEAT_TAB_ORDER = [
        { key: 'my', label: 'Главные фиты' },
        { key: 'ancestry', label: 'Черты народа' },
        { key: 'class', label: 'Черты класса' },
        { key: 'features', label: 'Особые фиты' },
        { key: 'general', label: 'Общие черты' }
    ];
    const FEAT_SLOTS = [
        { id: 'lvl1-ancestry-feature', level: 1, tab: 'features', type: 'Особенность народа' },
        { id: 'lvl1-lineage-feature', level: 1, tab: 'features', type: 'Особенность родословной' },
        { id: 'lvl1-ancestry-feat', level: 1, tab: 'ancestry', type: 'Черта народа' },
        { id: 'lvl1-background-skill-feat', level: 1, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl1-class-feat', level: 1, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl1-class-feature', level: 1, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl2-skill-feat', level: 2, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl2-class-feat', level: 2, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl3-general-feat', level: 3, tab: 'general', type: 'Общая черта' },
        { id: 'lvl3-class-feature', level: 3, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl4-skill-feat', level: 4, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl4-class-feat', level: 4, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl5-ancestry-feat', level: 5, tab: 'ancestry', type: 'Черта народа' },
        { id: 'lvl5-class-feature', level: 5, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl6-skill-feat', level: 6, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl6-class-feat', level: 6, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl7-general-feat', level: 7, tab: 'general', type: 'Общая черта' },
        { id: 'lvl7-class-feature', level: 7, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl8-skill-feat', level: 8, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl8-class-feat', level: 8, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl9-ancestry-feat', level: 9, tab: 'ancestry', type: 'Черта народа' },
        { id: 'lvl9-class-feature', level: 9, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl10-skill-feat', level: 10, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl10-class-feat', level: 10, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl11-general-feat', level: 11, tab: 'general', type: 'Общая черта' },
        { id: 'lvl11-class-feature', level: 11, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl12-skill-feat', level: 12, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl12-class-feat', level: 12, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl13-ancestry-feat', level: 13, tab: 'ancestry', type: 'Черта народа' },
        { id: 'lvl13-class-feature', level: 13, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl14-skill-feat', level: 14, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl14-class-feat', level: 14, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl15-general-feat', level: 15, tab: 'general', type: 'Общая черта' },
        { id: 'lvl15-class-feature', level: 15, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl16-skill-feat', level: 16, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl16-class-feat', level: 16, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl17-ancestry-feat', level: 17, tab: 'ancestry', type: 'Черта народа' },
        { id: 'lvl17-class-feature', level: 17, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl18-skill-feat', level: 18, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl18-class-feat', level: 18, tab: 'class', type: 'Классовая черта' },
        { id: 'lvl19-general-feat', level: 19, tab: 'general', type: 'Общая черта' },
        { id: 'lvl19-class-feature', level: 19, tab: 'features', type: 'Классовая особенность' },
        { id: 'lvl20-skill-feat', level: 20, tab: 'general', type: 'Черта навыка' },
        { id: 'lvl20-class-feat', level: 20, tab: 'class', type: 'Классовая черта' }
    ];
    const attackTagsExpandedById = {};
    let attackDeleteSelectMode = false;

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function jsEscape(str) {
        return String(str ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r/g, '')
            .replace(/\n/g, '\\n');
    }

    function clampLevel(val) {
        return Math.max(1, Math.min(20, parseInt(val) || 1));
    }

    function renderAttackModalOptions() {
        const typeSel = document.getElementById('atk-type');
        if (typeSel) {
            typeSel.innerHTML = ATTACK_DAMAGE_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
        }
        const weaponGroupSel = document.getElementById('atk-weapon-group');
        if (weaponGroupSel) {
            const attackWeaponLabels = { unarmed: 'Б', simple: 'П', martial: 'О', advanced: 'Н', other: 'И' };
            weaponGroupSel.innerHTML = WEAPON_PROFICIENCY_TYPES.map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(attackWeaponLabels[t.key] || t.label)}</option>`).join('');
        }

        const tagsWrap = document.getElementById('atk-tags-checklist');
        if (tagsWrap) {
            tagsWrap.innerHTML = ATTACK_TAG_OPTIONS.map((tag, idx) => {
                const id = `atk-tag-opt-${idx}`;
                return `<label class="atk-tag-option" for="${id}"><input type="checkbox" id="${id}" data-atk-tag value="${escapeHtml(tag)}"><span>${escapeHtml(tag)}</span></label>`;
            }).join('');
        }
    }

    function setAttackTagsFromString(tagsStr) {
        const selected = new Set(String(tagsStr || '').split(',').map(t => t.trim()).filter(Boolean));
        document.querySelectorAll('[data-atk-tag]').forEach(cb => {
            cb.checked = selected.has(cb.value);
        });
    }

    function getAttackTagsAsString() {
        return Array.from(document.querySelectorAll('[data-atk-tag]:checked')).map(cb => cb.value).join(', ');
    }

    function renderEquipmentModalOptions() {
        const typeSel = document.getElementById('equipment-item-type');
        if (typeSel) {
            typeSel.innerHTML = EQUIPMENT_ITEM_TYPES.map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join('');
        }
        const armorTypeSel = document.getElementById('equipment-armor-type');
        if (armorTypeSel) {
            const armorTypeLabels = { unarmored: 'Б', light: 'Л', medium: 'С', heavy: 'Т' };
            armorTypeSel.innerHTML = ARMOR_PROFICIENCY_TYPES.map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(armorTypeLabels[t.key] || t.label)}</option>`).join('');
        }
        ['equipment-weapon-group', 'equipment-weapon2-group'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel) {
                const weaponGroupLabels = { unarmed: 'Б', simple: 'П', martial: 'О', advanced: 'Н', other: 'И' };
                sel.innerHTML = WEAPON_PROFICIENCY_TYPES.map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(weaponGroupLabels[t.key] || t.label)}</option>`).join('');
            }
        });

        const dmgSel = document.getElementById('equipment-weapon-damage-type');
        if (dmgSel) {
            dmgSel.innerHTML = ATTACK_DAMAGE_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
        }
        const dmg2Sel = document.getElementById('equipment-weapon2-damage-type');
        if (dmg2Sel) {
            dmg2Sel.innerHTML = ATTACK_DAMAGE_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
        }

        const tagsWrap = document.getElementById('equipment-weapon-tags-checklist');
        if (tagsWrap) {
            tagsWrap.innerHTML = ATTACK_TAG_OPTIONS.map((tag, idx) => {
                const id = `equipment-weapon-tag-${idx}`;
                return `<label class="atk-tag-option" for="${id}"><input type="checkbox" id="${id}" data-equipment-weapon-tag value="${escapeHtml(tag)}"><span>${escapeHtml(tag)}</span></label>`;
            }).join('');
        }
    }

    function renderSpellModalOptions() {
        const categorySel = document.getElementById('spell-category');
        if (categorySel) {
            categorySel.innerHTML = SPELL_CATEGORIES.map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join('');
        }
        const rankSel = document.getElementById('spell-rank');
        if (rankSel) {
            rankSel.innerHTML = Array.from({ length: 10 }, (_, i) => i + 1)
                .map(rank => `<option value="${rank}">${rank}</option>`)
                .join('');
        }
        const actionsSel = document.getElementById('spell-actions');
        if (actionsSel) {
            actionsSel.innerHTML = SPELL_ACTION_OPTIONS.map(t => `<option value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join('');
        }
    }

    function getAmmoConsumableItems() {
        return (Array.isArray(equipmentItems) ? equipmentItems : [])
            .filter(item => item?.itemType === 'consumable' && item?.consumable?.type === 'ammo');
    }

    function renderAmmoSelectOptions(selectId, selectedId = '') {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const selected = String(selectedId || '');
        const ammoItems = getAmmoConsumableItems();
        sel.innerHTML = `<option value="">Не выбрано</option>` + ammoItems.map(item => {
            const qty = Math.max(0, parseInt(item.quantity) || 0);
            return `<option value="${escapeHtml(item.id)}" ${selected === String(item.id) ? 'selected' : ''}>${escapeHtml(item.name || 'Снаряды')} ×${qty}</option>`;
        }).join('');
    }

    function setEquipmentWeaponTagsFromString(tagsStr) {
        const selected = new Set(String(tagsStr || '').split(',').map(t => t.trim()).filter(Boolean));
        document.querySelectorAll('[data-equipment-weapon-tag]').forEach(cb => {
            cb.checked = selected.has(cb.value);
        });
    }

    function getEquipmentWeaponTagsAsString() {
        return Array.from(document.querySelectorAll('[data-equipment-weapon-tag]:checked')).map(cb => cb.value).join(', ');
    }

    let equipmentWeaponTagsExpanded = false;

    function toggleEquipmentWeaponTagsSection(force) {
        const wrap = document.getElementById('equipment-weapon-tags-section');
        const btn = document.getElementById('equipment-weapon-tags-toggle-btn');
        if (!wrap || !btn) return;
        equipmentWeaponTagsExpanded = typeof force === 'boolean' ? force : !equipmentWeaponTagsExpanded;
        wrap.classList.toggle('open', equipmentWeaponTagsExpanded);
        btn.innerText = equipmentWeaponTagsExpanded ? 'ХЕШТЕГИ ▲' : 'ХЕШТЕГИ ▼';
    }

    let featEmojiPickerOpen = false;

    function setFeatEmojiPickerOpen(open) {
        featEmojiPickerOpen = !!open;
        const picker = document.getElementById('feat-emoji-picker');
        const title = document.getElementById('feat-emoji-picker-title');
        const toggle = document.getElementById('feat-emoji-toggle');
        if (picker) picker.classList.toggle('open', featEmojiPickerOpen);
        if (title) title.classList.toggle('open', featEmojiPickerOpen);
        if (toggle) toggle.classList.toggle('open', featEmojiPickerOpen);
    }

    function toggleFeatEmojiPicker() {
        renderFeatEmojiPicker();
        setFeatEmojiPickerOpen(!featEmojiPickerOpen);
    }

    function renderFeatEmojiPicker() {
        const picker = document.getElementById('feat-emoji-picker');
        const input = document.getElementById('feat-emoji');
        const currentOut = document.getElementById('feat-emoji-current');
        const toggle = document.getElementById('feat-emoji-toggle');
        if (!input) return;
        const current = String(input.value || '').trim();
        const clearActive = current === '';

        if (currentOut) currentOut.innerText = current || '⭐';
        if (toggle) toggle.classList.toggle('empty', clearActive);

        if (!picker) return;
        picker.innerHTML = [
            `<button type="button" class="feat-emoji-preset clear ${clearActive ? 'active' : ''}" onclick="selectFeatEmoji('')" title="Без смайлика">×</button>`,
            ...FEAT_EMOJI_OPTIONS.map(emoji => `<button type="button" class="feat-emoji-preset ${current === emoji ? 'active' : ''}" onclick="selectFeatEmoji('${emoji}')" title="${emoji}">${emoji}</button>`)
        ].join('');
    }

    function selectFeatEmoji(emoji) {
        const input = document.getElementById('feat-emoji');
        if (!input) return;
        input.value = emoji;
        renderFeatEmojiPicker();
        setFeatEmojiPickerOpen(false);
    }

    let equipmentIconPickerOpen = false;

    function setEquipmentIconPickerOpen(open) {
        equipmentIconPickerOpen = !!open;
        const picker = document.getElementById('equipment-icon-picker');
        const title = document.getElementById('equipment-icon-picker-title');
        const toggle = document.getElementById('equipment-icon-toggle');
        if (picker) picker.classList.toggle('open', equipmentIconPickerOpen);
        if (title) title.classList.toggle('open', equipmentIconPickerOpen);
        if (toggle) toggle.classList.toggle('open', equipmentIconPickerOpen);
    }

    function toggleEquipmentIconPicker() {
        renderEquipmentIconPicker();
        setEquipmentIconPickerOpen(!equipmentIconPickerOpen);
    }

    function renderEquipmentIconPicker() {
        const picker = document.getElementById('equipment-icon-picker');
        const input = document.getElementById('equipment-item-icon');
        const currentOut = document.getElementById('equipment-icon-current');
        const toggle = document.getElementById('equipment-icon-toggle');
        if (!input) return;
        const current = String(input.value || '').trim();
        const clearActive = current === '';

        if (currentOut) currentOut.innerText = current || '🎒';
        if (toggle) toggle.classList.toggle('empty', clearActive);

        if (!picker) return;
        picker.innerHTML = [
            `<button type="button" class="feat-emoji-preset clear ${clearActive ? 'active' : ''}" onclick="selectEquipmentIcon('')" title="Без иконки">×</button>`,
            ...EQUIPMENT_ICON_OPTIONS.map(icon => `<button type="button" class="feat-emoji-preset ${current === icon ? 'active' : ''}" onclick="selectEquipmentIcon('${icon}')" title="${icon}">${icon}</button>`)
        ].join('');
    }

    function selectEquipmentIcon(icon) {
        const input = document.getElementById('equipment-item-icon');
        if (!input) return;
        input.value = icon;
        renderEquipmentIconPicker();
        setEquipmentIconPickerOpen(false);
    }

    function toggleAttackTagsSection(force) {
        const wrap = document.getElementById('atk-tags-section');
        const btn = document.getElementById('atk-tags-toggle-btn');
        if (!wrap || !btn) return;
        attackTagsExpanded = typeof force === 'boolean' ? force : !attackTagsExpanded;
        wrap.classList.toggle('open', attackTagsExpanded);
        btn.innerText = attackTagsExpanded ? 'ХЕШТЕГИ ▲' : 'ХЕШТЕГИ ▼';
    }

    function isHtmlLike(value) {
        return /<[a-z][\s\S]*>/i.test(String(value || ''));
    }

    function plainTextToNoteHtml(value) {
        return escapeHtml(value || '').replace(/\r?\n/g, '<br>');
    }

    function sanitizeAttackNotes(html) {
        const source = document.createElement('div');
        source.innerHTML = isHtmlLike(html) ? String(html || '') : plainTextToNoteHtml(html || '');
        const cleanChildren = (from, to) => {
            Array.from(from.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    to.appendChild(document.createTextNode(node.textContent || ''));
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const tag = node.tagName.toLowerCase();
                if (tag === 'br') {
                    to.appendChild(document.createElement('br'));
                    return;
                }
                if (tag === 'strong' || tag === 'b') {
                    const strong = document.createElement('strong');
                    cleanChildren(node, strong);
                    to.appendChild(strong);
                    return;
                }
                if (tag === 'button' && node.classList.contains('attack-note-roll')) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'attack-note-roll';
                    btn.contentEditable = 'false';
                    btn.dataset.roll = String(node.dataset.roll || node.textContent || '').trim();
                    btn.textContent = String(node.textContent || btn.dataset.roll || 'Бросок').trim();
                    to.appendChild(btn);
                    return;
                }
                if (tag === 'button' && node.classList.contains('attack-note-link')) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'attack-note-link';
                    btn.contentEditable = 'false';
                    btn.dataset.url = String(node.dataset.url || '').trim();
                    btn.textContent = String(node.textContent || 'Ссылка').trim();
                    to.appendChild(btn);
                    return;
                }
                if (tag === 'div' || tag === 'p') {
                    const block = document.createElement('div');
                    cleanChildren(node, block);
                    to.appendChild(block);
                    return;
                }
                cleanChildren(node, to);
            });
        };
        const out = document.createElement('div');
        cleanChildren(source, out);
        return out.innerHTML.trim();
    }

    function syncAttackNotesPreview(force = false) {
        const editor = document.getElementById('attack-notes-editor');
        if (!editor) return;
        if (!force && document.activeElement === editor) return;
        editor.innerHTML = sanitizeAttackNotes(attackNotes || '');
    }

    function saveAttackNotesFromEditor(immediate = false) {
        const editor = document.getElementById('attack-notes-editor');
        if (!editor) return;
        attackNotes = editor.innerHTML;
        clearTimeout(attackNotesSaveTimer);
        const doSave = () => {
            attackNotes = sanitizeAttackNotes(attackNotes);
            saveAll(false);
        };
        if (immediate) doSave();
        else attackNotesSaveTimer = setTimeout(doSave, 450);
    }

    function updateAttackNotesCount() {
        const ta = document.getElementById('attack-notes-textarea');
        const out = document.getElementById('attack-notes-count');
        if (!ta || !out) return;
        out.innerText = `${ta.value.length}`;
    }

    function getCurrentSheetLevel() {
        const lvlEl = document.getElementById('in-lvl');
        return lvlEl ? clampLevel(lvlEl.value) : 1;
    }

    function formatSignedNumber(num) {
        const n = parseInt(num) || 0;
        return (n >= 0 ? '+' : '') + n;
    }

    function normalizeAttackMapPenaltyValue(value) {
        const parsed = parseInt(value);
        if (!Number.isFinite(parsed)) return -5;
        if (parsed === 0) return 0;
        return parsed > 0 ? -parsed : parsed;
    }

    function normalizeAttackMapSettings(settings) {
        const source = settings || {};
        return {
            enabled: source.enabled !== false,
            penalty: normalizeAttackMapPenaltyValue(source.penalty ?? -5)
        };
    }

    function clampAttackMapPenaltyCount(value) {
        return Math.max(0, Math.min(2, parseInt(value) || 0));
    }

    function clampAttackCourageCount(value) {
        return Math.max(0, Math.min(getFocusPointsMax(), parseInt(value) || 0));
    }

    function getAttackMapPenaltyPerDot() {
        attackMapSettings = normalizeAttackMapSettings(attackMapSettings);
        return attackMapSettings.penalty;
    }

    function getAttackMapPenaltyForAttack(atk) {
        return normalizeAttackMapPenaltyValue(atk?.mapPenalty ?? getAttackMapPenaltyPerDot());
    }

    function getAttackMapTotalPenalty(atk) {
        return clampAttackMapPenaltyCount(attackMapPenaltyCount) * getAttackMapPenaltyForAttack(atk);
    }

    function normalizeAttackDcSettings(source = {}) {
        return {
            stat: ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(source.stat) ? source.stat : 'str',
            bonus: parseInt(source.bonus) || 0
        };
    }

    function getAttackDcValue(mods = null, lvl = null) {
        attackDcSettings = normalizeAttackDcSettings(attackDcSettings);
        const level = lvl === null ? clampLevel(document.getElementById('in-lvl')?.value || 1) : lvl;
        const statMod = mods ? (mods[attackDcSettings.stat] || 0) : (parseInt(document.getElementById(`score-${attackDcSettings.stat}`)?.value) || 0);
        return 10 + statMod + getBestWeaponProficiencyBonus(level) + (parseInt(attackDcSettings.bonus) || 0);
    }

    function renderAttackDcButton(mods = null, lvl = null) {
        const btn = document.getElementById('attack-dc-btn');
        if (btn) btn.innerText = `СЛ ${getAttackDcValue(mods, lvl)}`;
    }

    function getAttackMapButtonClass() {
        if (attackMapPenaltyCount <= 0) return '';
        return attackMapPenaltyCount >= 2 ? 'map-danger' : 'map-warning';
    }

    function getAttackDamageTypeClass(type) {
        const key = String(type || '').trim().toLowerCase();
        if (['дробящий', 'колющий', 'режущий'].includes(key)) return 'type-physical';
        if (key === 'звуковой') return 'type-sonic';
        if (key === 'кислотный') return 'type-acid';
        if (key === 'огненный') return 'type-fire';
        if (key === 'холод') return 'type-cold';
        if (key === 'электрический') return 'type-electric';
        if (key === 'ментальный') return 'type-mental';
        if (key === 'силовой') return 'type-force';
        return 'type-physical';
    }

    function renderAttackMapBar() {
        attackMapSettings = normalizeAttackMapSettings(attackMapSettings);
        attackMapPenaltyCount = clampAttackMapPenaltyCount(attackMapPenaltyCount);

        const bar = document.getElementById('attack-map-bar');
        const headerBtn = document.getElementById('header-attack-settings-btn');

        if (bar) bar.classList.remove('hidden');
        if (headerBtn) headerBtn.classList.remove('active');
        renderAttackDcButton();

        document.querySelectorAll('[data-attack-map-dot]').forEach(dot => {
            const idx = clampAttackMapPenaltyCount(dot.dataset.attackMapDot);
            dot.classList.toggle('active', idx <= attackMapPenaltyCount);
            dot.title = `${idx} круг штрафа`;
        });

        attackCourageCount = clampAttackCourageCount(attackCourageCount);
        document.querySelectorAll('[data-attack-courage-dot]').forEach(dot => {
            const idx = parseInt(dot.dataset.attackCourageDot) || 0;
            dot.style.display = idx <= getFocusPointsMax() ? '' : 'none';
            dot.classList.toggle('active', idx <= attackCourageCount);
        });
    }

    function setAttackMapPenaltyCount(val) {
        const target = clampAttackMapPenaltyCount(val);
        attackMapPenaltyCount = attackMapPenaltyCount === target ? Math.max(0, target - 1) : target;
        saveAll();
    }

    function setAttackCourageCount(val) {
        const target = clampAttackCourageCount(val);
        attackCourageCount = attackCourageCount === target ? Math.max(0, target - 1) : target;
        saveAll();
    }

    function resetAttackMapPenalty() {
        attackMapPenaltyCount = 0;
        saveAll();
    }

    function advanceAttackMapPenalty() {
        if (!attackMapSettings.enabled) return;
        attackMapPenaltyCount = attackMapPenaltyCount >= 2 ? 0 : attackMapPenaltyCount + 1;
        saveAll();
    }

    function openAttackSettingsModal() {
        attackMapSettings = normalizeAttackMapSettings(attackMapSettings);
        const enabledEl = document.getElementById('attack-map-enabled');
        const penaltyEl = document.getElementById('attack-map-penalty');
        if (enabledEl) enabledEl.checked = !!attackMapSettings.enabled;
        if (penaltyEl) penaltyEl.value = getAttackMapPenaltyPerDot();
        openModal('attackSettingsModal');
    }

    function openAttackDcModal() {
        attackDcSettings = normalizeAttackDcSettings(attackDcSettings);
        const statEl = document.getElementById('attack-dc-stat');
        const bonusEl = document.getElementById('attack-dc-bonus');
        if (statEl) statEl.value = attackDcSettings.stat;
        if (bonusEl) bonusEl.value = attackDcSettings.bonus;
        updateAttackDcPreview();
        openModal('attackDcModal');
    }

    function updateAttackDcPreview() {
        const statEl = document.getElementById('attack-dc-stat');
        const bonusEl = document.getElementById('attack-dc-bonus');
        const preview = document.getElementById('attack-dc-preview');
        const localSettings = normalizeAttackDcSettings({ stat: statEl?.value, bonus: bonusEl?.value });
        const oldSettings = attackDcSettings;
        attackDcSettings = localSettings;
        const value = getAttackDcValue();
        attackDcSettings = oldSettings;
        if (preview) preview.innerText = `СЛ ${value}`;
    }

    function saveAttackDcSettings() {
        attackDcSettings = normalizeAttackDcSettings({
            stat: document.getElementById('attack-dc-stat')?.value,
            bonus: document.getElementById('attack-dc-bonus')?.value
        });
        saveAll();
        closeModal('attackDcModal');
    }

    function syncAttackModalMapPenaltyField() {
        const field = document.getElementById('atk-map-penalty-field');
        if (field) field.classList.remove('hidden');
    }

    function setAttackRange(range) {
        const value = range === 'ranged' ? 'ranged' : 'melee';
        const input = document.getElementById('atk-range');
        if (input) input.value = value;
        document.getElementById('atk-melee-btn')?.classList.toggle('active', value === 'melee');
        document.getElementById('atk-ranged-btn')?.classList.toggle('active', value === 'ranged');
        document.getElementById('atk-ammo-settings')?.classList.toggle('open', value === 'ranged');
        syncAttackChargeSection();
    }

    function syncAttackChargeSection() {
        const section = document.getElementById('atk-charge-settings');
        const enabled = !!document.getElementById('atk-charges-enabled')?.checked;
        const ranged = document.getElementById('atk-range')?.value === 'ranged';
        if (section) section.classList.toggle('open', enabled && ranged);
    }

    function saveAttackSettings() {
        const enabledEl = document.getElementById('attack-map-enabled');
        const penaltyEl = document.getElementById('attack-map-penalty');
        attackMapSettings = normalizeAttackMapSettings({
            enabled: enabledEl ? enabledEl.checked : true,
            penalty: penaltyEl ? penaltyEl.value : -5
        });
        saveAll();
        closeModal('attackSettingsModal');
    }

    function getFeatSlot(slotId) {
        return FEAT_SLOTS.find(slot => slot.id === slotId) || null;
    }

    function getFeatTabLabel(tabKey) {
        const tab = FEAT_TAB_ORDER.find(t => t.key === tabKey);
        return tab ? tab.label : 'Черты';
    }

    function titleCaseRu(str) {
        return String(str || '')
            .split(/\s+/)
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    function getCleanFeatType(type) {
        const clean = String(type || '').replace(/\s+от\s+происхождения\s*$/i, '').trim();
        return titleCaseRu(clean || 'Черта');
    }

    function getFeatPageLabel(tabKey) {
        return titleCaseRu(getFeatTabLabel(tabKey));
    }

    function formatFeatPageMeta(slot) {
        if (!slot) return '';
        return `Уровень ${slot.level}: ${getFeatPageLabel(slot.tab)}`;
    }

    function formatFeatFullMeta(slot) {
        if (!slot) return '';
        return `${formatFeatPageMeta(slot)}
${getCleanFeatType(slot.type)}`;
    }

    function isFeatFilled(data) {
        return !!(data && (String(data.name || '').trim() || String(data.short || '').trim() || String(data.full || '').trim()));
    }

    function switchFeatTab(tabKey) {
        currentFeatTab = tabKey;
        renderFeats();
    }

    function renderFeatTabs() {
        const tabs = document.getElementById('feat-tabs');
        if (!tabs) return;
        const lvl = getCurrentSheetLevel();
        tabs.innerHTML = FEAT_TAB_ORDER.map(tab => {
            let filled = 0;
            let total = 0;

            if (tab.key === 'my') {
                total = myFeats.length;
                filled = myFeats.filter(item => {
                    const slot = getFeatSlot(item.sourceSlotId);
                    return !!(slot && isFeatFilled(feats[item.sourceSlotId]));
                }).length;
            } else {
                const slots = FEAT_SLOTS.filter(slot => slot.tab === tab.key && slot.level <= lvl);
                total = slots.length;
                filled = slots.filter(slot => isFeatFilled(feats[slot.id])).length;
            }

            return `<button type="button" class="feat-tab-btn feat-tab-btn-${tab.key} ${currentFeatTab === tab.key ? 'active' : ''}" onclick="switchFeatTab('${tab.key}')"><span>${escapeHtml(tab.label)}</span><small>${filled}/${total}</small></button>`;
        }).join('');
    }

    function renderFeats() {
        const list = document.getElementById('feats-list');
        if (!list) return;
        const lvl = getCurrentSheetLevel();
        const lvlOut = document.getElementById('feats-current-level');
        if (lvlOut) lvlOut.innerText = lvl;

        if (!FEAT_TAB_ORDER.some(tab => tab.key === currentFeatTab)) currentFeatTab = 'my';
        renderFeatTabs();

        if (currentFeatTab === 'my') {
            renderMyFeats(list);
            syncMobileReorderButtons();
            return;
        }

        const slots = FEAT_SLOTS
            .filter(slot => slot.tab === currentFeatTab && slot.level <= lvl)
            .sort((a, b) => a.level - b.level || a.type.localeCompare(b.type, 'ru'));

        if (!slots.length) {
            const nextSlot = FEAT_SLOTS
                .filter(slot => slot.tab === currentFeatTab && slot.level > lvl)
                .sort((a, b) => a.level - b.level)[0];
            list.innerHTML = `<div class="feats-empty-tab">На текущем уровне здесь пока нет плашек.${nextSlot ? `<br>Следующая появится на ${nextSlot.level} уровне.` : ''}</div>`;
            syncMobileReorderButtons();
            return;
        }

        list.innerHTML = slots.map(slot => renderFeatSlotCard(slot)).join('');
        syncMobileReorderButtons();
    }

    function renderFeatSlotCard(slot) {
        const data = feats[slot.id] || {};
        const filled = isFeatFilled(data);
        const cleanType = getCleanFeatType(slot.type);
        const name = String(data.name || '').trim() || cleanType;
        const emoji = String(data.emoji || '').trim();
        const emojiHTML = emoji ? `<span class="feat-emoji">${escapeHtml(emoji)}</span>` : '';
        const shortText = String(data.short || '').trim() || 'Краткое описание не заполнено.';
        return `
            <div class="feat-card feat-tab-${slot.tab} ${filled ? 'filled' : 'empty'}" data-feat-slot="${slot.id}" ${filled ? `onclick="openFeatView('${slot.id}')"` : ''}>
                <div class="feat-card-head">
                    <div class="feat-slot-meta">
                        <div class="feat-level">${slot.level}</div>
                        <div class="feat-slot-type">${escapeHtml(cleanType)}</div>
                    </div>
                    ${filled ? `<button type="button" class="feat-gear" onclick="event.stopPropagation(); openFeatEditor('${slot.id}')" title="Настроить">⚙</button>` : ''}
                </div>
                ${filled ? `<div class="feat-title-line">${emojiHTML}<div class="feat-name">${escapeHtml(name)}</div></div><div class="feat-short">${escapeHtml(shortText)}</div>` : `<button type="button" class="feat-add-slot" onclick="event.stopPropagation(); openFeatEditor('${slot.id}')">+ Добавить</button>`}
            </div>
        `;
    }

    function renderMyFeats(list) {
        const cards = myFeats.map((item, idx) => renderMyFeatCard(item, idx)).join('');
        list.innerHTML = `
            ${cards || ''}
            <div class="my-feats-toolbar"><button type="button" class="my-feats-add-btn" onclick="addMyFeatTemplate()">+ ДОБАВИТЬ ШАБЛОН</button></div>
        `;
    }

    function renderMyFeatCard(item, idx) {
        const slot = getFeatSlot(item.sourceSlotId);
        const data = slot ? (feats[item.sourceSlotId] || {}) : {};
        const filled = !!(slot && isFeatFilled(data));
        const tabClass = slot ? slot.tab : 'my';
        const cleanType = slot ? getCleanFeatType(slot.type) : 'Черта';
        const name = filled ? (String(data.name || '').trim() || cleanType) : 'ШАБЛОН';
        const emoji = filled ? String(data.emoji || '').trim() : '';
        const emojiHTML = emoji ? `<span class="feat-emoji">${escapeHtml(emoji)}</span>` : '';
        const shortText = filled ? (String(data.short || '').trim() || 'Краткое описание не заполнено.') : 'Нажми ⚙ и выбери фит из доступных.';
        const meta = filled ? formatFeatPageMeta(slot) : 'Главные фиты';
        const reorderActive = mobileReorderMode === 'feats';
        const picked = reorderActive && selectedMobileReorder && selectedMobileReorder.type === 'feats' && selectedMobileReorder.idx === idx;
        const clickAction = reorderActive ? `handleReorderTap(event, 'feats', ${idx})` : (filled ? `openFeatView('${slot.id}')` : `openMyFeatTemplate('${item.id}')`);
        return `
            <div class="feat-card my-feat-card feat-tab-${tabClass} ${filled ? 'filled' : 'empty'} ${picked ? 'reorder-picked' : ''}" draggable="${window.innerWidth >= 1000 ? 'true' : 'false'}" data-my-feat-id="${item.id}" data-reorder-type="feats" data-reorder-index="${idx}" onclick="${clickAction}" ondragstart="myFeatDragStart(event, ${idx})" ondragend="myFeatDragEnd(event)" ondragover="myFeatDragOver(event)" ondrop="myFeatDrop(event, ${idx})">
                <div class="feat-card-head">
                    <div class="feat-slot-meta">
                        <div class="my-feat-drag" title="Переместить" onclick="if(window.innerWidth >= 1000) event.stopPropagation()">☰</div>
                        <div class="feat-slot-type">${escapeHtml(meta)}</div>
                    </div>
                    <button type="button" class="feat-gear" ${reorderActive ? '' : `onclick="event.stopPropagation(); openMyFeatTemplate('${item.id}')"`} title="Настроить шаблон">⚙</button>
                </div>
                <div class="feat-title-line">${emojiHTML}<div class="feat-name">${escapeHtml(name)}</div></div>
                <div class="feat-short">${escapeHtml(shortText)}</div>
            </div>
        `;
    }

    function getAvailableFeatSources() {
        const lvl = getCurrentSheetLevel();
        const tabRank = Object.fromEntries(FEAT_TAB_ORDER.map((tab, idx) => [tab.key, idx]));
        return FEAT_SLOTS
            .filter(slot => slot.level <= lvl && slot.tab !== 'my' && isFeatFilled(feats[slot.id]))
            .sort((a, b) => (tabRank[a.tab] ?? 99) - (tabRank[b.tab] ?? 99) || a.level - b.level || a.type.localeCompare(b.type, 'ru'));
    }

    function getFilledMainFeatItems() {
        return myFeats
            .map(item => {
                const slot = getFeatSlot(item.sourceSlotId);
                const data = slot ? (feats[item.sourceSlotId] || {}) : {};
                if (!slot || !isFeatFilled(data)) return null;
                return { item, slot, data };
            })
            .filter(Boolean);
    }

    function isSlotInMainFeats(slotId) {
        return myFeats.some(item => String(item.sourceSlotId || '') === String(slotId));
    }

    function getAttackQuickFeatItems() {
        return getFilledMainFeatItems().filter(entry => !!entry.data.showInAttacks);
    }

    function renderAttackQuickFeats() {
        const list = document.getElementById('attack-quick-feats-list');
        if (!list) return;

        const selected = getAttackQuickFeatItems();
        const buttons = selected.map(entry => {
            const emoji = String(entry.data.emoji || '').trim() || '⭐';
            const name = String(entry.data.name || '').trim() || getCleanFeatType(entry.slot.type);
            return `<button type="button" class="attack-quick-feat-btn" onclick="openAttackQuickFeatView('${entry.slot.id}')" title="${escapeHtml(name)}">${escapeHtml(emoji)}</button>`;
        }).join('');

        list.innerHTML = buttons + '<button type="button" class="attack-quick-feat-btn empty" onclick="openAttackQuickFeatsModal()" title="Добавить фит">+</button>';
    }

    function getAttackConsumableItems() {
        normalizeEquipmentData();
        return equipmentItems.filter(item => item.showInAttacks);
    }

    function renderAttackConsumables() {
        const section = document.getElementById('attack-consumables-section');
        const list = document.getElementById('attack-consumables-list');
        if (!section || !list) return;
        const items = getAttackConsumableItems();
        section.style.display = items.length ? 'block' : 'none';
        if (!items.length) {
            list.innerHTML = '';
            return;
        }
        const consumables = items.filter(item => item.itemType === 'consumable');
        const equipment = items.filter(item => item.itemType !== 'consumable');
        const consumablesHtml = consumables.map(item => {
            const icon = String(item.icon || '').trim() || '✦';
            const name = item.name || 'Расходник';
            const qty = formatConsumableQuantity(item);
            const canUse = (parseInt(item.quantity) || 0) > 0;
            return `<div class="attack-consumable-chip ${!canUse ? 'disabled' : ''}" onclick="handleAttackEquipmentClick('${item.id}')" title="${escapeHtml(name)}">
                <span class="attack-consumable-icon">${escapeHtml(icon)}</span>
                <span class="attack-consumable-name">${escapeHtml(name)}${qty ? ` ${escapeHtml(qty)}` : ''}</span>
                <button type="button" class="attack-consumable-use" onclick="event.stopPropagation(); useConsumableItem('${item.id}')" title="Использовать"${canUse ? '' : ' disabled'}>✓</button>
                <button type="button" class="attack-consumable-use" onclick="event.stopPropagation(); restoreConsumableItem('${item.id}')" title="Вернуть 1">+</button>
            </div>`;
        }).join('');
        const equipmentHtml = equipment.length
            ? `<div class="attack-equipment-strip${consumables.length ? ' with-consumables' : ''}">${equipment.map(item => {
                const icon = String(item.icon || '').trim() || '🎒';
                const name = item.name || 'Снаряжение';
                const equippedClass = item.equipped ? ' equipped' : '';
                return `<button type="button" class="attack-equipment-square${equippedClass}" title="${escapeHtml(name)}"
                    onpointerdown="startAttackEquipmentLongPress('${item.id}')"
                    onpointerup="cancelAttackEquipmentLongPress()"
                    onpointerleave="cancelAttackEquipmentLongPress()"
                    onpointercancel="cancelAttackEquipmentLongPress()"
                    oncontextmenu="event.preventDefault(); openEquipmentEditor('${item.id}')"
                    onclick="handleAttackEquipmentSquareClick('${item.id}')">${escapeHtml(icon)}</button>`;
            }).join('')}</div>`
            : '';
        list.innerHTML = consumablesHtml + equipmentHtml;
    }

    function handleAttackEquipmentClick(itemId) {
        const item = equipmentItems.find(x => String(x.id) === String(itemId));
        if (!item) return;
        if (['armor', 'shield', 'weapon'].includes(item.itemType)) toggleEquipmentEquippedFromAttacks(itemId);
        else openEquipmentEditor(itemId);
    }

    let attackEquipmentLongPressTimer = null;
    let attackEquipmentLongPressFired = false;

    function startAttackEquipmentLongPress(itemId) {
        cancelAttackEquipmentLongPress();
        attackEquipmentLongPressFired = false;
        attackEquipmentLongPressTimer = setTimeout(() => {
            attackEquipmentLongPressFired = true;
            openEquipmentEditor(itemId);
        }, 550);
    }

    function cancelAttackEquipmentLongPress() {
        if (attackEquipmentLongPressTimer) clearTimeout(attackEquipmentLongPressTimer);
        attackEquipmentLongPressTimer = null;
    }

    function handleAttackEquipmentSquareClick(itemId) {
        if (attackEquipmentLongPressFired) {
            attackEquipmentLongPressFired = false;
            return;
        }
        handleAttackEquipmentClick(itemId);
    }

    function toggleEquipmentEquippedFromAttacks(itemId) {
        const idx = equipmentItems.findIndex(x => String(x.id) === String(itemId));
        if (idx < 0) return;
        const item = equipmentItems[idx];
        if (!['armor', 'shield', 'weapon'].includes(item.itemType)) {
            openEquipmentEditor(itemId);
            return;
        }
        const nextEquipped = !item.equipped;
        if (nextEquipped && getEquipmentWornCount(item.id) >= 10) {
            appendDiceLog('<div class="dice-log-rest-content">Надето максимум 10 предметов</div>', 'var(--hp-red)', 'dice-log-rest');
            return;
        }
        equipmentItems[idx] = normalizeEquipmentItem({ ...item, equipped: nextEquipped, category: nextEquipped ? 'worn' : 'carried' });
        if (nextEquipped) removeItemFromBackpack(item.id);
        saveAll(false);
        calculate();
    }

    function renderAttackQuickFeatSourceList() {
        const list = document.getElementById('attack-quick-feat-source-list');
        if (!list) return;
        const filled = getFilledMainFeatItems();
        const available = filled.filter(entry => !entry.data.showInAttacks);

        if (!filled.length) {
            list.innerHTML = '<div class="my-feat-source-empty">Нет заполненных “Главных фитов”. Сначала добавь их на вкладке фитов.</div>';
            return;
        }

        if (!available.length) {
            list.innerHTML = '<div class="my-feat-source-empty">Все заполненные “Главные фиты” уже отображаются в атаках. Чтобы убрать фит, открой настройки самого фита и сними галочку.</div>';
            return;
        }

        list.innerHTML = available.map(entry => {
            const id = String(entry.item.id);
            const emoji = String(entry.data.emoji || '').trim() || '⭐';
            const name = String(entry.data.name || '').trim() || getCleanFeatType(entry.slot.type);
            const meta = formatFeatPageMeta(entry.slot);
            return `<button type="button" class="attack-quick-feat-source-option" onclick="addAttackQuickFeat('${id}')"><span class="attack-quick-source-emoji">${escapeHtml(emoji)}</span><span class="attack-quick-source-text"><span class="attack-quick-source-name">${escapeHtml(name)}</span><span class="attack-quick-source-meta">${escapeHtml(meta)}</span></span><span class="attack-quick-source-check">+</span></button>`;
        }).join('');
    }

    function openAttackQuickFeatsModal() {
        renderAttackQuickFeatSourceList();
        openModal('attackQuickFeatsModal');
    }

    function addAttackQuickFeat(myFeatId) {
        const item = myFeats.find(x => String(x.id) === String(myFeatId));
        if (!item || !item.sourceSlotId || !feats[item.sourceSlotId]) return;
        feats[item.sourceSlotId].showInAttacks = true;
        saveAll();
        renderAttackQuickFeatSourceList();
        closeModal('attackQuickFeatsModal');
    }

    function toggleAttackQuickFeat(myFeatId) {
        addAttackQuickFeat(myFeatId);
    }

    function showAllAttackQuickFeats() {
        getFilledMainFeatItems().forEach(entry => { entry.data.showInAttacks = true; });
        saveAll();
        renderAttackQuickFeatSourceList();
    }

    function clearAttackQuickFeats() {
        Object.values(feats).forEach(data => { if (data) data.showInAttacks = false; });
        saveAll();
        renderAttackQuickFeatSourceList();
    }

    function openAttackQuickFeatView(slotId) {
        openFeatView(slotId, 'short');
    }

    function addMyFeatTemplate() {
        myFeats.push({ id: Date.now() + Math.floor(Math.random() * 1000), sourceSlotId: '', showInAttacks: false });
        saveAll();
        renderFeats();
    }

    function openMyFeatTemplate(itemId) {
        if (mobileReorderMode === 'feats' || suppressNextClickAfterReorder) return;
        currentMyFeatId = String(itemId);
        renderMyFeatSourceList();
        openModal('myFeatTemplateModal');
    }

    function renderMyFeatSourceList() {
        const list = document.getElementById('my-feat-source-list');
        if (!list) return;
        const item = myFeats.find(x => String(x.id) === String(currentMyFeatId));
        const selected = item ? item.sourceSlotId : '';
        const usedSlotIds = new Set(myFeats
            .filter(x => String(x.id) !== String(currentMyFeatId))
            .map(x => String(x.sourceSlotId || ''))
            .filter(Boolean));
        const sources = getAvailableFeatSources().filter(slot => !usedSlotIds.has(String(slot.id)) || selected === slot.id);

        if (!sources.length) {
            list.innerHTML = '<div class="my-feat-source-empty">Нет доступных фитов для добавления. Заполненные фиты, которые уже есть в “Главных фитах”, здесь скрыты.</div>';
            return;
        }

        list.innerHTML = sources.map(slot => {
            const data = feats[slot.id] || {};
            const cleanType = getCleanFeatType(slot.type);
            const name = String(data.name || '').trim() || cleanType;
            const emoji = String(data.emoji || '').trim();
            return `<button type="button" class="my-feat-source-option ${selected === slot.id ? 'active' : ''}" onclick="selectMyFeatSource('${slot.id}')"><div class="my-feat-source-name">${escapeHtml(emoji ? emoji + ' ' + name : name)}</div><div class="my-feat-source-meta">${escapeHtml(formatFeatPageMeta(slot))} — ${escapeHtml(cleanType)}</div></button>`;
        }).join('');
    }

    function syncMyFeatAttackToggle() {
        const cb = document.getElementById('my-feat-show-in-attacks');
        const wrap = document.getElementById('my-feat-attack-toggle-wrap');
        const item = myFeats.find(x => String(x.id) === String(currentMyFeatId));
        const slot = item ? getFeatSlot(item.sourceSlotId) : null;
        const canShow = !!(item && slot && isFeatFilled(feats[item.sourceSlotId]));
        if (cb) {
            cb.checked = !!(item && slot && feats[item.sourceSlotId] && feats[item.sourceSlotId].showInAttacks);
            cb.disabled = !canShow;
        }
        if (wrap) {
            wrap.classList.toggle('disabled', !canShow);
            wrap.title = canShow ? '' : 'Сначала выбери заполненный фит';
        }
    }

    function toggleMyFeatShowInAttacks(checked) {
        const item = myFeats.find(x => String(x.id) === String(currentMyFeatId));
        if (!item) return;
        const slot = getFeatSlot(item.sourceSlotId);
        if (!slot || !isFeatFilled(feats[item.sourceSlotId])) {
            if (feats[item.sourceSlotId]) feats[item.sourceSlotId].showInAttacks = false;
        } else {
            feats[item.sourceSlotId].showInAttacks = !!checked;
        }
        saveAll();
        syncMyFeatAttackToggle();
        renderFeats();
        renderAttackQuickFeats();
    }

    function selectMyFeatSource(slotId) {
        const item = myFeats.find(x => String(x.id) === String(currentMyFeatId));
        if (!item) return;
        const oldSlotId = item.sourceSlotId;
        item.sourceSlotId = slotId;
        if (oldSlotId && oldSlotId !== slotId && !isSlotInMainFeats(oldSlotId) && feats[oldSlotId]) feats[oldSlotId].showInAttacks = false;
        if (!getFeatSlot(slotId) || !isFeatFilled(feats[slotId])) item.showInAttacks = false;
        saveAll();
        renderMyFeatSourceList();
        renderFeats();
        renderAttackQuickFeats();
    }

    function deleteMyFeatTemplate() {
        if (!currentMyFeatId) return;
        const removed = myFeats.find(x => String(x.id) === String(currentMyFeatId));
        myFeats = myFeats.filter(x => String(x.id) !== String(currentMyFeatId));
        if (removed && removed.sourceSlotId && !isSlotInMainFeats(removed.sourceSlotId) && feats[removed.sourceSlotId]) feats[removed.sourceSlotId].showInAttacks = false;
        currentMyFeatId = null;
        saveAll();
        closeModal('myFeatTemplateModal');
        renderFeats();
        renderAttackQuickFeats();
    }

    function myFeatDragStart(e, idx) {
        if (window.innerWidth < 1000) { e.preventDefault(); return; }
        draggedMyFeatIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => { if (e.target) e.target.style.opacity = '0.5'; }, 0);
    }

    function myFeatDragEnd(e) {
        if (e.target) e.target.style.opacity = '1';
        draggedMyFeatIdx = null;
    }

    function myFeatDragOver(e) { e.preventDefault(); }

    function myFeatDrop(e, targetIdx) {
        e.preventDefault();
        if (draggedMyFeatIdx === null || draggedMyFeatIdx === targetIdx) return;
        const item = myFeats.splice(draggedMyFeatIdx, 1)[0];
        myFeats.splice(targetIdx, 0, item);
        draggedMyFeatIdx = null;
        saveAll();
        renderFeats();
    }

    function openFeatEditor(slotId) {
        const slot = getFeatSlot(slotId);
        if (!slot) return;
        const data = feats[slotId] || {};
        const canShowInAttacks = isSlotInMainFeats(slotId);
        document.getElementById('feat-slot-id').value = slotId;
        document.getElementById('feat-edit-title').innerText = isFeatFilled(data) ? 'Настройка черты' : 'Добавить черту';
        document.getElementById('feat-edit-meta').innerText = formatFeatFullMeta(slot);
        document.getElementById('feat-emoji').value = data.emoji || '';
        renderFeatEmojiPicker();
        setFeatEmojiPickerOpen(false);
        document.getElementById('feat-name').value = data.name || '';
        document.getElementById('feat-short').value = data.short || '';
        document.getElementById('feat-full').value = data.full || '';
        const attackCb = document.getElementById('feat-show-in-attacks');
        const attackWrap = document.getElementById('feat-show-in-attacks-wrap');
        const attackNote = document.getElementById('feat-show-in-attacks-note');
        if (attackCb) {
            attackCb.checked = !!(canShowInAttacks && data.showInAttacks);
            attackCb.disabled = !canShowInAttacks;
        }
        if (attackWrap) {
            attackWrap.classList.toggle('disabled', !canShowInAttacks);
            attackWrap.title = canShowInAttacks ? '' : 'Сначала добавь этот фит в “Главные фиты”';
        }
        if (attackNote) attackNote.classList.toggle('show', !canShowInAttacks);
        openModal('featEditModal');
    }

    function saveFeatSlot() {
        const slotId = document.getElementById('feat-slot-id').value;
        const slot = getFeatSlot(slotId);
        if (!slot) return;
        const canShowInAttacks = isSlotInMainFeats(slotId);
        const data = {
            emoji: document.getElementById('feat-emoji').value.trim(),
            name: document.getElementById('feat-name').value.trim(),
            short: document.getElementById('feat-short').value.trim(),
            full: document.getElementById('feat-full').value.trim(),
            showInAttacks: !!(canShowInAttacks && document.getElementById('feat-show-in-attacks')?.checked)
        };
        if (isFeatFilled(data)) feats[slotId] = data;
        else delete feats[slotId];
        saveAll();
        closeModal('featEditModal');
        renderFeats();
        renderAttackQuickFeats();
    }

    function clearFeatSlot() {
        const slotId = document.getElementById('feat-slot-id').value;
        if (slotId) delete feats[slotId];
        saveAll();
        closeModal('featEditModal');
        renderFeats();
        renderAttackQuickFeats();
    }

    function openFeatView(slotId, mode = 'full') {
        if (suppressNextClickAfterReorder) return;
        const slot = getFeatSlot(slotId);
        const data = feats[slotId] || {};
        if (!slot || !isFeatFilled(data)) return;
        currentFeatViewSlotId = slotId;
        currentFeatViewMode = mode === 'short' ? 'short' : 'full';
        document.getElementById('feat-view-title').innerText = `${String(data.emoji || '').trim() ? String(data.emoji || '').trim() + ' ' : ''}${String(data.name || '').trim() || getCleanFeatType(slot.type)}`;
        document.getElementById('feat-view-meta').innerText = formatFeatFullMeta(slot);
        updateFeatViewText();
        openModal('featViewModal');
    }

    function updateFeatViewText() {
        if (!currentFeatViewSlotId) return;
        const slot = getFeatSlot(currentFeatViewSlotId);
        const data = feats[currentFeatViewSlotId] || {};
        if (!slot) return;

        const isShort = currentFeatViewMode === 'short';
        const label = document.getElementById('feat-view-mode-label');
        const text = document.getElementById('feat-view-main-text');
        const btn = document.getElementById('feat-view-toggle-btn');

        if (label) label.innerText = isShort ? 'Кратко' : 'Полное описание';
        if (text) text.innerText = isShort
            ? (String(data.short || '').trim() || 'Краткое описание не заполнено.')
            : (String(data.full || '').trim() || 'Полное описание не заполнено.');
        if (btn) btn.innerText = isShort ? 'ПОЛНАЯ' : 'КРАТКО';
    }

    function toggleFeatViewMode() {
        currentFeatViewMode = currentFeatViewMode === 'short' ? 'full' : 'short';
        updateFeatViewText();
    }

    function openFeatEditorFromView() {
        if (!currentFeatViewSlotId) return;
        closeModal('featViewModal');
        openFeatEditor(currentFeatViewSlotId);
    }

    function makeSpellId() {
        return `sp${Date.now()}${Math.floor(Math.random() * 1000)}`;
    }

    function normalizeSpellSettings(source = {}) {
        const traditions = source.traditions || {};
        const focusMax = Math.max(0, Math.min(3, parseInt(source.focusMax) || 0));
        return {
            traditions: {
                arcane: !!traditions.arcane,
                occult: !!traditions.occult,
                primal: !!traditions.primal,
                divine: !!traditions.divine
            },
            castingType: source.castingType === 'spontaneous' ? 'spontaneous' : 'prepared',
            stat: ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(source.stat) ? source.stat : 'int',
            prof: normalizeTrainingRank(source.prof),
            item: parseInt(source.item) || 0,
            focusMax,
            focusSpent: Math.max(0, Math.min(focusMax, parseInt(source.focusSpent) || 0))
        };
    }

    function normalizeSpell(spell = {}) {
        const category = SPELL_CATEGORIES.some(type => type.key === spell.category) ? spell.category : 'ranked';
        const usesMax = Math.max(1, parseInt(spell.usesMax) || 1);
        return {
            id: String(spell.id || makeSpellId()),
            category,
            name: String(spell.name || '').trim(),
            rank: Math.max(1, Math.min(10, parseInt(spell.rank) || 1)),
            actions: SPELL_ACTION_OPTIONS.some(opt => opt.key === spell.actions) ? spell.actions : '2',
            usesMax,
            usesSpent: Math.max(0, Math.min(usesMax, parseInt(spell.usesSpent) || 0)),
            short: String(spell.short || '').trim(),
            full: String(spell.full || '').trim()
        };
    }

    function normalizeSpellData() {
        spellSettings = normalizeSpellSettings(spellSettings);
        const used = new Set();
        spells = (Array.isArray(spells) ? spells : [])
            .map(normalizeSpell)
            .filter(spell => !used.has(spell.id) && used.add(spell.id));
        const lvl = getCurrentSheetLevel();
        Object.keys(spellSlotsSpent || {}).forEach(rank => {
            const max = getSpellSlotMaxForRank(rank, lvl);
            if (max <= 0) delete spellSlotsSpent[rank];
            else spellSlotsSpent[rank] = Math.max(0, Math.min(max, parseInt(spellSlotsSpent[rank]) || 0));
        });
    }

    function getSpellMaxRank(lvl = getCurrentSheetLevel()) {
        return Math.max(1, Math.min(10, Math.ceil(clampLevel(lvl) / 2)));
    }

    function getSpellSlotMaxForRank(rank, lvl = getCurrentSheetLevel()) {
        const r = Math.max(1, Math.min(10, parseInt(rank) || 1));
        const level = clampLevel(lvl);
        if (r > getSpellMaxRank(level)) return 0;
        if (r === 10) return level >= 19 ? 1 : 0;
        const firstLevel = r * 2 - 1;
        if (level < firstLevel) return 0;
        return level === firstLevel ? 2 : 3;
    }

    function getSpellSlotSpent(rank, lvl = getCurrentSheetLevel()) {
        const max = getSpellSlotMaxForRank(rank, lvl);
        return Math.max(0, Math.min(max, parseInt(spellSlotsSpent[String(rank)]) || 0));
    }

    function getMagicSpellAttackValue(mods = null, lvl = getCurrentSheetLevel()) {
        spellSettings = normalizeSpellSettings(spellSettings);
        const statMod = mods ? (mods[spellSettings.stat] || 0) : (parseInt(document.getElementById(`score-${spellSettings.stat}`)?.value) || 0);
        const profBonus = spellSettings.prof > 0 ? clampLevel(lvl) + spellSettings.prof * 2 : 0;
        return statMod + profBonus + (parseInt(spellSettings.item) || 0);
    }

    function renderMagic(mods = null, lvl = getCurrentSheetLevel()) {
        const root = document.getElementById('magic-spells-list');
        if (!root) return;
        normalizeSpellData();
        const level = clampLevel(lvl);
        const maxRank = getSpellMaxRank(level);
        const levelOut = document.getElementById('magic-current-level');
        const rankOut = document.getElementById('magic-max-rank');
        if (levelOut) levelOut.innerText = level;
        if (rankOut) rankOut.innerText = maxRank;

        const statEl = document.getElementById('magic-stat');
        const itemEl = document.getElementById('magic-item-bonus');
        const focusEl = document.getElementById('magic-focus-max');
        if (statEl) statEl.value = spellSettings.stat;
        if (itemEl) itemEl.value = spellSettings.item;
        if (focusEl) focusEl.value = spellSettings.focusMax;
        document.getElementById('magic-prepared-btn')?.classList.toggle('active', spellSettings.castingType === 'prepared');
        document.getElementById('magic-spontaneous-btn')?.classList.toggle('active', spellSettings.castingType === 'spontaneous');

        const traditions = document.getElementById('magic-traditions');
        if (traditions) {
            traditions.innerHTML = MAGIC_TRADITIONS.map(type => {
                const active = !!spellSettings.traditions[type.key];
                return `<button type="button" class="magic-tradition-btn ${active ? 'active' : ''}" onclick="toggleMagicTradition('${type.key}')">${escapeHtml(type.label)}</button>`;
            }).join('');
        }

        const dots = document.getElementById('magic-prof-dots');
        if (dots) {
            dots.innerHTML = [1,2,3,4].map(i => `<div class="dot ${i <= spellSettings.prof ? 'active' : ''}" onclick="setMagicProf(${i})"></div>`).join('');
        }
        const attackVal = getMagicSpellAttackValue(mods, level);
        const attackOut = document.getElementById('magic-spell-attack');
        const dcOut = document.getElementById('magic-spell-dc');
        if (attackOut) attackOut.innerText = `${attackVal >= 0 ? '+' : ''}${attackVal}`;
        if (dcOut) dcOut.innerText = 10 + attackVal;

        renderSpellSlots(level);
        renderSpellList(level);
    }

    function renderSpellSlots(lvl = getCurrentSheetLevel()) {
        const list = document.getElementById('magic-slots-list');
        if (!list) return;
        const level = clampLevel(lvl);
        const maxRank = getSpellMaxRank(level);
        const rows = [];
        if (spellSettings.focusMax > 0) {
            const focusSpent = Math.max(0, Math.min(spellSettings.focusMax, parseInt(spellSettings.focusSpent) || 0));
            const cells = Array.from({ length: spellSettings.focusMax }, (_, i) => {
                const n = i + 1;
                return `<button type="button" class="magic-slot-cell ${n <= focusSpent ? 'spent' : ''}" onclick="toggleFocusPoint(${n})" title="Фокус ${n}"></button>`;
            }).join('');
            rows.push(`<div class="magic-slot-row"><div class="magic-slot-rank">Ф</div><div class="magic-slot-cells">${cells}</div><div class="magic-slot-count">${focusSpent}/${spellSettings.focusMax}</div></div>`);
        }
        for (let rank = 1; rank <= maxRank; rank++) {
            const max = getSpellSlotMaxForRank(rank, level);
            if (max <= 0) continue;
            const spent = getSpellSlotSpent(rank, level);
            const cells = Array.from({ length: max }, (_, i) => {
                const n = i + 1;
                return `<button type="button" class="magic-slot-cell ${n <= spent ? 'spent' : ''}" onclick="toggleSpellSlot(${rank}, ${n})" title="Ранг ${rank}, ячейка ${n}"></button>`;
            }).join('');
            rows.push(`<div class="magic-slot-row"><div class="magic-slot-rank">${rank}</div><div class="magic-slot-cells">${cells}</div><div class="magic-slot-count">${spent}/${max}</div></div>`);
        }
        list.innerHTML = rows.join('') || '<div class="magic-empty">Нет доступных ячеек.</div>';
    }

    function renderSpellList(lvl = getCurrentSheetLevel()) {
        const list = document.getElementById('magic-spells-list');
        if (!list) return;
        const order = ['cantrip', 'ranked', 'focus', 'innate', 'ritual'];
        const titles = {
            cantrip: 'Фокусы',
            ranked: 'Заклинания',
            focus: 'Фокусные заклинания',
            innate: 'Врожденные заклинания',
            ritual: 'Ритуалы'
        };
        const groups = order.map(category => {
            const items = spells
                .filter(spell => spell.category === category)
                .sort((a, b) => (a.rank - b.rank) || String(a.name).localeCompare(String(b.name), 'ru'));
            if (!items.length) return '';
            return `<div class="magic-group"><div class="magic-group-head"><span>${titles[category]}</span><small>${items.length}</small></div>${items.map(spell => renderSpellCard(spell, lvl)).join('')}</div>`;
        }).filter(Boolean);
        list.innerHTML = groups.join('') || '<div class="magic-empty">Заклинаний пока нет.</div>';
    }

    function renderSpellCard(spell, lvl = getCurrentSheetLevel()) {
        const name = spell.name || 'Заклинание';
        const categoryLabel = SPELL_CATEGORIES.find(type => type.key === spell.category)?.label || 'Заклинание';
        const actions = SPELL_ACTION_OPTIONS.find(opt => opt.key === spell.actions)?.label || spell.actions || '2';
        const rankText = spell.category === 'cantrip' ? `ранг ${getSpellMaxRank(lvl)}` : `ранг ${spell.rank}`;
        const resource = getSpellResourceText(spell, lvl);
        const short = spell.short || '';
        const canCast = canCastSpell(spell, lvl);
        return `<div class="magic-spell-card ${escapeHtml(spell.category)}">
            <div class="magic-spell-main" onclick="openSpellEditor('${spell.id}')">
                <div class="magic-spell-name">${escapeHtml(name)}</div>
                <div class="magic-spell-meta">${escapeHtml(categoryLabel)} · ${escapeHtml(rankText)} · ${escapeHtml(actions)} · ${escapeHtml(resource)}</div>
                ${short ? `<div class="magic-spell-short">${escapeHtml(short)}</div>` : ''}
            </div>
            <div class="magic-spell-actions">
                <button type="button" class="magic-cast-btn" onclick="event.stopPropagation(); castSpell('${spell.id}')" title="Использовать"${canCast ? '' : ' disabled'}>✓</button>
                <button type="button" class="magic-gear-btn" onclick="event.stopPropagation(); openSpellEditor('${spell.id}')" title="Настроить">⚙</button>
            </div>
        </div>`;
    }

    function getSpellResourceText(spell, lvl = getCurrentSheetLevel()) {
        if (spell.category === 'ranked') {
            const max = getSpellSlotMaxForRank(spell.rank, lvl);
            return max > 0 ? `${getSpellSlotSpent(spell.rank, lvl)}/${max}` : 'нет ячеек';
        }
        if (spell.category === 'focus') return `${spellSettings.focusSpent}/${spellSettings.focusMax} фокус`;
        if (spell.category === 'innate') return `${spell.usesSpent}/${spell.usesMax}`;
        return 'без ресурса';
    }

    function canCastSpell(spell, lvl = getCurrentSheetLevel()) {
        if (spell.category === 'ranked') return getSpellSlotMaxForRank(spell.rank, lvl) > 0 && getSpellSlotSpent(spell.rank, lvl) < getSpellSlotMaxForRank(spell.rank, lvl);
        if (spell.category === 'focus') return spellSettings.focusMax > 0 && spellSettings.focusSpent < spellSettings.focusMax;
        if (spell.category === 'innate') return spell.usesSpent < spell.usesMax;
        return true;
    }

    function toggleMagicTradition(key) {
        spellSettings = normalizeSpellSettings(spellSettings);
        if (!Object.prototype.hasOwnProperty.call(spellSettings.traditions, key)) return;
        spellSettings.traditions[key] = !spellSettings.traditions[key];
        saveAll();
    }

    function setMagicCastingType(type) {
        spellSettings.castingType = type === 'spontaneous' ? 'spontaneous' : 'prepared';
        saveAll();
    }

    function setMagicProf(val) {
        spellSettings = normalizeSpellSettings(spellSettings);
        spellSettings.prof = spellSettings.prof === val ? Math.max(0, val - 1) : normalizeTrainingRank(val);
        saveAll();
    }

    function saveMagicSettingsFromPage() {
        spellSettings = normalizeSpellSettings({
            ...spellSettings,
            stat: document.getElementById('magic-stat')?.value,
            item: document.getElementById('magic-item-bonus')?.value,
            focusMax: document.getElementById('magic-focus-max')?.value
        });
        saveAll();
    }

    function openMagicSettingsModal() {
        const stat = document.getElementById('magic-stat');
        if (stat) stat.focus();
    }

    function toggleSpellSlot(rank, cellIndex) {
        const max = getSpellSlotMaxForRank(rank);
        if (max <= 0) return;
        const current = getSpellSlotSpent(rank);
        spellSlotsSpent[String(rank)] = cellIndex <= current ? Math.max(0, cellIndex - 1) : Math.min(max, cellIndex);
        saveAll();
    }

    function toggleFocusPoint(cellIndex) {
        spellSettings = normalizeSpellSettings(spellSettings);
        const current = spellSettings.focusSpent;
        spellSettings.focusSpent = cellIndex <= current ? Math.max(0, cellIndex - 1) : Math.min(spellSettings.focusMax, cellIndex);
        saveAll();
    }

    function spendSpellSlot(rank) {
        const max = getSpellSlotMaxForRank(rank);
        const spent = getSpellSlotSpent(rank);
        if (max <= 0 || spent >= max) return false;
        spellSlotsSpent[String(rank)] = spent + 1;
        return true;
    }

    function castSpell(spellId) {
        normalizeSpellData();
        const idx = spells.findIndex(spell => String(spell.id) === String(spellId));
        if (idx < 0) return;
        const spell = spells[idx];
        const name = spell.name || 'Заклинание';
        if (spell.category === 'ranked') {
            if (!spendSpellSlot(spell.rank)) {
                appendDiceLog(`<div class="dice-log-rest-content">Нет ячеек ${spell.rank} ранга</div>`, 'var(--hp-red)', 'dice-log-rest');
                return;
            }
        } else if (spell.category === 'focus') {
            if (spellSettings.focusMax <= 0 || spellSettings.focusSpent >= spellSettings.focusMax) {
                appendDiceLog('<div class="dice-log-rest-content">Фокус закончился</div>', 'var(--hp-red)', 'dice-log-rest');
                return;
            }
            spellSettings.focusSpent += 1;
        } else if (spell.category === 'innate') {
            if (spell.usesSpent >= spell.usesMax) {
                appendDiceLog(`<div class="dice-log-rest-content">${escapeHtml(name)} закончено</div>`, 'var(--hp-red)', 'dice-log-rest');
                return;
            }
            spells[idx] = normalizeSpell({ ...spell, usesSpent: spell.usesSpent + 1 });
        }
        saveAll(false);
        calculate();
        appendDiceLog(`<div class="dice-log-rest-content">${escapeHtml(name)} использовано</div>`, 'var(--accent)', 'dice-log-rest');
    }

    function resetSpellResources(silent = false) {
        spellSlotsSpent = {};
        spellSettings = normalizeSpellSettings({ ...spellSettings, focusSpent: 0 });
        spells = spells.map(spell => normalizeSpell({ ...spell, usesSpent: 0 }));
        saveAll(false);
        calculate();
        if (!silent) appendDiceLog('<div class="dice-log-rest-content">Магия восстановлена</div>', 'var(--hp-green)', 'dice-log-rest');
    }

    function openSpellEditor(spellId = '') {
        currentSpellId = String(spellId || '');
        const spell = spells.find(x => String(x.id) === currentSpellId);
        document.getElementById('spell-edit-title').innerText = spell ? 'Настройка заклинания' : 'Добавить заклинание';
        document.getElementById('spell-id').value = spell?.id || '';
        document.getElementById('spell-category').value = spell?.category || 'ranked';
        document.getElementById('spell-name').value = spell?.name || '';
        document.getElementById('spell-rank').value = spell?.rank || getSpellMaxRank();
        document.getElementById('spell-actions').value = spell?.actions || '2';
        document.getElementById('spell-uses-max').value = spell?.usesMax || 1;
        document.getElementById('spell-short').value = spell?.short || '';
        document.getElementById('spell-full').value = spell?.full || '';
        const del = document.querySelector('#spellModal button[onclick="deleteSpell()"]');
        if (del) del.style.display = spell ? '' : 'none';
        syncSpellModalFields();
        openModal('spellModal');
    }

    function syncSpellModalFields() {
        const category = document.getElementById('spell-category')?.value || 'ranked';
        const rankWrap = document.getElementById('spell-rank-wrap');
        const usesWrap = document.getElementById('spell-uses-wrap');
        if (rankWrap) rankWrap.style.display = category === 'cantrip' ? 'none' : '';
        if (usesWrap) usesWrap.style.display = category === 'innate' ? '' : 'none';
    }

    function saveSpell() {
        const id = document.getElementById('spell-id').value || makeSpellId();
        const spell = normalizeSpell({
            id,
            category: document.getElementById('spell-category').value,
            name: document.getElementById('spell-name').value || 'Заклинание',
            rank: document.getElementById('spell-rank').value,
            actions: document.getElementById('spell-actions').value,
            usesMax: document.getElementById('spell-uses-max').value,
            usesSpent: spells.find(x => String(x.id) === String(id))?.usesSpent || 0,
            short: document.getElementById('spell-short').value,
            full: document.getElementById('spell-full').value
        });
        const idx = spells.findIndex(x => String(x.id) === String(id));
        if (idx >= 0) spells[idx] = spell;
        else spells.push(spell);
        saveAll(false);
        calculate();
        closeModal('spellModal');
    }

    function deleteSpell() {
        const id = document.getElementById('spell-id').value;
        if (!id) { closeModal('spellModal'); return; }
        spells = spells.filter(spell => String(spell.id) !== String(id));
        currentSpellId = null;
        saveAll(false);
        calculate();
        closeModal('spellModal');
    }

    function makeEquipmentId() {
        return `eq${Date.now()}${Math.floor(Math.random() * 1000)}`;
    }

    function normalizeEquipmentSettings(settings = {}) {
        const coins = settings.coins || {};
        return {
            backpackEnabled: settings.backpackEnabled !== false,
            bulkBonus: parseInt(settings.bulkBonus) || 0,
            coins: {
                pp: Math.max(0, parseInt(coins.pp) || 0),
                gp: Math.max(0, parseInt(coins.gp) || 0),
                sp: Math.max(0, parseInt(coins.sp) || 0),
                cp: Math.max(0, parseInt(coins.cp) || 0)
            }
        };
    }

    function normalizeEquipmentItem(item) {
        const itemType = EQUIPMENT_ITEM_TYPES.some(t => t.key === item?.itemType) ? item.itemType : 'other';
        const light = itemType === 'consumable' && item?.light === undefined ? true : !!item?.light;
        let category = EQUIPMENT_CATEGORY_LABELS[item?.category] ? item.category : 'carried';
        if (itemType === 'consumable') category = 'consumable';
        if (['armor', 'shield', 'weapon'].includes(itemType) && item?.equipped) category = 'worn';
        if (['armor', 'shield', 'weapon'].includes(itemType) && !item?.equipped && category === 'worn') category = 'carried';
        const parsedBulk = parseInt(item?.bulk);
        const bulk = Number.isFinite(parsedBulk) ? Math.max(0, parsedBulk) : 1;
        const armor = item?.armor || {};
        const shield = item?.shield || {};
        const weapon = item?.weapon || {};
        const second = weapon.second || {};
        const consumable = item?.consumable || {};
        const parsedQuantity = item?.quantity === undefined ? 1 : parseInt(item.quantity);
        return {
            id: String(item?.id || makeEquipmentId()),
            category,
            itemType,
            equipped: !!item?.equipped && ['armor', 'shield', 'weapon'].includes(itemType),
            icon: String(item?.icon || '').trim().slice(0, 3),
            name: String(item?.name || '').trim(),
            bulk,
            light,
            quantity: Math.max(0, Number.isFinite(parsedQuantity) ? parsedQuantity : 1),
            showInAttacks: !!item?.showInAttacks,
            consumable: {
                type: ['healingPotion', 'ammo'].includes(consumable.type) ? consumable.type : 'other',
                heal: String(consumable.heal ?? '').trim().replace(/d/gi, 'к')
            },
            armor: {
                item: parseInt(armor.item) || 0,
                pen: parseInt(armor.pen) || 0,
                speedPen: parseInt(armor.speedPen) || 0,
                cap: parseInt(armor.cap) || 0,
                armorType: normalizeArmorType(armor.armorType),
                prof: parseInt(armor.prof) || 0
            },
            shield: {
                bonus: parseInt(shield.bonus) || 0,
                hard: parseInt(shield.hard) || 0,
                hpMax: Math.max(0, parseInt(shield.hpMax) || 0),
                hpCur: Math.max(0, parseInt(shield.hpCur) || 0)
            },
            weapon: {
                range: weapon.range === 'ranged' ? 'ranged' : 'melee',
                ammoName: String(weapon.ammoName || '').trim(),
                ammoQuantity: Math.max(0, parseInt(weapon.ammoQuantity) || 0),
                ammoItemId: String(weapon.ammoItemId || '').trim(),
                chargesEnabled: !!weapon.chargesEnabled,
                chargeMax: Math.max(1, parseInt(weapon.chargeMax) || 1),
                chargeCurrent: Math.max(0, Math.min(Math.max(1, parseInt(weapon.chargeMax) || 1), parseInt(weapon.chargeCurrent) || 0)),
                name: String(weapon.name || '').trim(),
                stat: ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(weapon.stat) ? weapon.stat : 'str',
                weaponGroup: normalizeWeaponGroup(weapon.weaponGroup),
                prof: parseInt(weapon.prof) || 0,
                item: parseInt(weapon.item) || 0,
                mapPenalty: normalizeAttackMapPenaltyValue(weapon.mapPenalty ?? getAttackMapPenaltyPerDot()),
                dmg: String(weapon.dmg || '').replace(/d/gi, 'к'),
                crit: String(weapon.crit || '').replace(/d/gi, 'к'),
                type: ATTACK_DAMAGE_TYPES.includes(weapon.type) ? weapon.type : 'Дробящий',
                tags: String(weapon.tags || '').trim(),
                second: {
                    enabled: !!second.enabled,
                    name: String(second.name || '').trim(),
                    stat: ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(second.stat) ? second.stat : 'str',
                    weaponGroup: normalizeWeaponGroup(second.weaponGroup ?? weapon.weaponGroup),
                    prof: parseInt(second.prof) || 0,
                    item: parseInt(second.item) || 0,
                    mapPenalty: normalizeAttackMapPenaltyValue(second.mapPenalty ?? getAttackMapPenaltyPerDot()),
                    dmg: String(second.dmg || '').replace(/d/gi, 'к'),
                    crit: String(second.crit || '').replace(/d/gi, 'к'),
                    type: ATTACK_DAMAGE_TYPES.includes(second.type) ? second.type : 'Дробящий',
                    tags: String(second.tags || '').trim()
                }
            },
            short: String(item?.short || '').trim(),
            full: String(item?.full || '').trim()
        };
    }

    function normalizeEquipmentData() {
        const used = new Set();
        equipmentItems = (Array.isArray(equipmentItems) ? equipmentItems : [])
            .map(normalizeEquipmentItem)
            .filter(item => !used.has(item.id) && used.add(item.id));
        let wornSeen = 0;
        equipmentItems = equipmentItems.map(item => {
            if (item.category !== 'worn') return item;
            wornSeen += 1;
            return wornSeen <= 10 ? item : normalizeEquipmentItem({ ...item, equipped: false, category: 'carried' });
        });
        const itemIds = new Set(equipmentItems.map(item => item.id));
        const itemsById = new Map(equipmentItems.map(item => [String(item.id), item]));
        const slotIds = new Set();
        let backpackBulk = 0;
        equipmentBackpack = (Array.isArray(equipmentBackpack) ? equipmentBackpack : [])
            .filter(slot => slot && slot.id && !slotIds.has(String(slot.id)) && slotIds.add(String(slot.id)))
            .map(slot => {
                const id = String(slot.id);
                const itemId = itemIds.has(String(slot.itemId || '')) ? String(slot.itemId) : '';
                const item = itemsById.get(itemId);
                if (!item || item.equipped || item.category === 'worn') return { id, itemId: '' };
                const nextBulk = backpackBulk + getItemBulkValue(item);
                if (nextBulk > EQUIPMENT_BACKPACK_MAX_BULK + 0.0001) return { id, itemId: '' };
                backpackBulk = nextBulk;
                return { id, itemId };
            });
        equipmentSettings = normalizeEquipmentSettings(equipmentSettings);
        if (!EQUIPMENT_TABS.some(tab => tab.key === currentEquipmentTab)) currentEquipmentTab = equipmentSettings.backpackEnabled ? 'backpack' : 'carried';
        if (!equipmentSettings.backpackEnabled && currentEquipmentTab === 'backpack') currentEquipmentTab = 'carried';
    }

    function getBackpackItemIdSet() {
        if (!equipmentSettings.backpackEnabled) return new Set();
        return new Set(equipmentBackpack.map(slot => String(slot.itemId || '')).filter(Boolean));
    }

    function isItemInBackpack(itemId) {
        return getBackpackItemIdSet().has(String(itemId));
    }

    function removeItemFromBackpack(itemId) {
        const id = String(itemId || '');
        equipmentBackpack = equipmentBackpack.map(slot => String(slot.itemId || '') === id ? { ...slot, itemId: '' } : slot);
    }

    function getEquipmentItemsForTab(tabKey) {
        normalizeEquipmentData();
        if (tabKey === 'backpack') return [];
        const backpackIds = getBackpackItemIdSet();
        return equipmentItems.filter(item => item.category === tabKey && !backpackIds.has(String(item.id)));
    }

    function getEquipmentTabCount(tabKey) {
        if (tabKey === 'backpack') return equipmentBackpack.filter(slot => slot.itemId).length;
        return getEquipmentItemsForTab(tabKey).length;
    }

    function getItemBulkValue(item) {
        const baseBulk = item?.light ? 0.1 : Math.max(0, parseInt(item?.bulk) || 0);
        if (item?.itemType !== 'consumable') return baseBulk;
        const qty = Math.max(0, parseInt(item.quantity) || 0);
        const extraStacks = Math.max(0, Math.ceil(qty / 10) - 1);
        return baseBulk + extraStacks * 0.1;
    }

    function formatBulkNumber(value) {
        const n = Math.round((Number(value) || 0) * 10) / 10;
        return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
    }

    function formatItemBulk(item) {
        return `${formatBulkNumber(getItemBulkValue(item))} балк`;
    }

    function formatConsumableQuantity(item) {
        return item?.itemType === 'consumable' ? `×${Math.max(0, parseInt(item.quantity) || 0)}` : '';
    }

    function getBackpackInsideBulk(slotId = '', nextItemId) {
        const itemsById = new Map(equipmentItems.map(item => [String(item.id), item]));
        return equipmentBackpack.reduce((sum, slot) => {
            const itemId = nextItemId !== undefined && String(slot.id) === String(slotId)
                ? String(nextItemId || '')
                : String(slot.itemId || '');
            const item = itemsById.get(itemId);
            return sum + (item ? getItemBulkValue(item) : 0);
        }, 0);
    }

    function canPutItemInBackpack(item, slotId = '') {
        if (!item) return false;
        if (item.equipped || item.category === 'worn') return false;
        return getBackpackInsideBulk(slotId, item.id) <= EQUIPMENT_BACKPACK_MAX_BULK + 0.0001;
    }

    function getBackpackCarriedBulk() {
        if (!equipmentSettings.backpackEnabled) return 0;
        const inside = getBackpackInsideBulk();
        if (inside <= 0) return 0;
        return Math.max(1, inside - 2);
    }

    function getEquipmentCarriedBulk() {
        normalizeEquipmentData();
        const backpackIds = getBackpackItemIdSet();
        const outerBulk = equipmentItems.reduce((sum, item) => {
            if (backpackIds.has(String(item.id))) return sum;
            return sum + getItemBulkValue(item);
        }, 0);
        return outerBulk + getBackpackCarriedBulk();
    }

    function getEquipmentBaseMaxBulk() {
        const str = parseInt(abilities.str);
        const mod = Number.isFinite(str) ? str : 0;
        const settings = normalizeEquipmentSettings(equipmentSettings);
        return Math.max(0, 5 + mod + settings.bulkBonus);
    }

    function getEquipmentOverloadMaxBulk() {
        const str = parseInt(abilities.str);
        const mod = Number.isFinite(str) ? str : 0;
        const settings = normalizeEquipmentSettings(equipmentSettings);
        return Math.max(0, 10 + mod + settings.bulkBonus);
    }

    function getEquipmentBulkStatus(carried = getEquipmentCarriedBulk()) {
        const baseMax = getEquipmentBaseMaxBulk();
        const overloadMax = Math.max(baseMax, getEquipmentOverloadMaxBulk());
        const atBaseMax = Math.abs(carried - baseMax) < 0.0001;
        const overBaseMax = carried > baseMax && !atBaseMax;
        const overOverloadMax = carried > overloadMax;
        return {
            baseMax,
            overloadMax,
            activeMax: overBaseMax ? overloadMax : baseMax,
            state: overBaseMax ? 'bad' : (atBaseMax ? 'warn' : 'good'),
            speedPenalty: overBaseMax ? 10 : 0,
            speedZero: overOverloadMax
        };
    }

    function getEquipmentSpeed(baseSpeed) {
        const speed = Math.max(0, parseInt(baseSpeed) || 0);
        const status = getEquipmentBulkStatus();
        const armor = getEquippedEquipmentItem('armor');
        const armorSpeedPenalty = armor ? Math.abs(parseInt(armor.armor?.speedPen) || 0) : 0;
        if (status.speedZero) return 0;
        return Math.max(0, speed - status.speedPenalty - armorSpeedPenalty);
    }

    function updateEquipmentSpeedDisplay() {
        const speedInput = document.getElementById('in-speed');
        const speedOut = document.getElementById('disp-speed-head');
        if (!speedOut) return;
        const baseSpeed = parseInt(speedInput?.value) || 25;
        const effectiveSpeed = getEquipmentSpeed(baseSpeed);
        const status = getEquipmentBulkStatus();
        const armor = getEquippedEquipmentItem('armor');
        const armorSpeedPenalty = armor ? Math.abs(parseInt(armor.armor?.speedPen) || 0) : 0;
        const penalties = [];
        if (status.speedZero) penalties.push('перегруз по весу: скорость 0');
        else if (status.speedPenalty) penalties.push(`перегруз по весу -${status.speedPenalty}`);
        if (armorSpeedPenalty) penalties.push(`броня -${armorSpeedPenalty}`);
        speedOut.innerText = effectiveSpeed;
        speedOut.title = effectiveSpeed === baseSpeed ? '' : `База ${baseSpeed}: ${penalties.join(', ')}`;
    }

    function getCoinGoldValue() {
        const coins = normalizeEquipmentSettings(equipmentSettings).coins;
        return coins.pp * 10 + coins.gp + coins.sp / 10 + coins.cp / 100;
    }

    function formatGoldValue(value) {
        return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2).replace('.', ',');
    }

    function getEquippedEquipmentItem(type) {
        normalizeEquipmentData();
        return equipmentItems.find(item => item.itemType === type && item.equipped) || null;
    }

    function openArmorPanel() {
        const armor = getEquippedEquipmentItem('armor');
        if (armor) openEquipmentEditor(armor.id);
        else openModal('acModal');
    }

    function openShieldPanel() {
        const shield = getEquippedEquipmentItem('shield');
        if (shield) openEquipmentEditor(shield.id);
        else openModal('shieldModal');
    }

    function getEquipmentAttackId(itemId, attackIndex = 0) {
        let hash = 0;
        `${itemId || ''}:${attackIndex}`.split('').forEach(ch => { hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0; });
        return 900000000 + (hash % 90000000);
    }

    function getEquipmentWornCount(exceptId = '') {
        normalizeEquipmentData();
        return equipmentItems.filter(item => item.category === 'worn' && String(item.id) !== String(exceptId)).length;
    }

    function syncEquipmentDerivedAttacks() {
        const existingByKey = new Map(attacks.filter(a => a.equipmentSourceId).map(a => [`${String(a.equipmentSourceId)}:${parseInt(a.equipmentAttackIndex) || 0}`, a]));
        const manualAttacks = attacks.filter(a => !a.equipmentSourceId);
        const derivedAttacks = [];
        equipmentItems
            .filter(item => item.itemType === 'weapon' && item.equipped)
            .forEach(item => {
                const weapon = item.weapon || {};
                const attackConfigs = [
                    { index: 0, data: weapon, fallbackName: item.name || 'Оружие' },
                    ...(weapon.second?.enabled ? [{ index: 1, data: weapon.second, fallbackName: `${item.name || 'Оружие'} 2` }] : [])
                ];
                attackConfigs.forEach(entry => {
                    const old = existingByKey.get(`${String(item.id)}:${entry.index}`) || {};
                    const data = entry.data || {};
                    const id = getEquipmentAttackId(item.id, entry.index);
                    derivedAttacks.push({
                    id,
                    equipmentSourceId: String(item.id),
                    equipmentAttackIndex: entry.index,
                    equipmentRange: weapon.range || 'melee',
                    name: data.name || entry.fallbackName,
                    stat: data.stat || 'str',
                    weaponGroup: normalizeWeaponGroup(data.weaponGroup ?? weapon.weaponGroup),
                    prof: data.prof ?? 0,
                    item: data.item ?? 0,
                    mapPenalty: normalizeAttackMapPenaltyValue(data.mapPenalty ?? getAttackMapPenaltyPerDot()),
                    dmg: data.dmg || '1к8',
                    crit: data.crit || '',
                    type: data.type || 'Дробящий',
                    tags: data.tags || '',
                    tagsHidden: !!(old.tagsHidden || attackTagsHiddenById[id]),
                    ...(old.critActive ? { critActive: old.critActive } : {})
                    });
                });
            });
        attacks = [...derivedAttacks, ...manualAttacks];
    }

    function renderEquipmentSummary() {
        normalizeEquipmentData();
        const carried = getEquipmentCarriedBulk();
        const bulkStatus = getEquipmentBulkStatus(carried);
        const maxBulk = bulkStatus.activeMax;
        const left = maxBulk - carried;
        const circle = document.getElementById('equipment-bulk-left');
        const maxOut = document.getElementById('equipment-bulk-max');
        const backpackIndicator = document.getElementById('equipment-backpack-indicator');
        const coins = document.getElementById('equipment-coins');
        if (circle) {
            circle.classList.toggle('warn', bulkStatus.state === 'warn');
            circle.classList.toggle('bad', bulkStatus.state === 'bad');
            circle.innerHTML = `<b>${formatBulkNumber(left)}</b><span>ещё</span>`;
            circle.title = `Несёшь ${formatBulkNumber(carried)} из ${formatBulkNumber(maxBulk)} балк`;
        }
        if (maxOut) maxOut.innerText = formatBulkNumber(maxBulk);
        if (backpackIndicator) backpackIndicator.classList.toggle('active', !!equipmentSettings.backpackEnabled);
        if (coins) coins.innerText = formatGoldValue(getCoinGoldValue());
        updateEquipmentSpeedDisplay();
    }

    function renderEquipmentTabs() {
        const tabs = document.getElementById('equipment-tabs');
        if (!tabs) return;
        normalizeEquipmentData();
        const visibleTabs = EQUIPMENT_TABS.filter(tab => tab.key !== 'backpack' || equipmentSettings.backpackEnabled);
        tabs.innerHTML = visibleTabs.map(tab => `<button type="button" class="feat-tab-btn equipment-tab-${tab.key} ${currentEquipmentTab === tab.key ? 'active' : ''}" onclick="switchEquipmentTab('${tab.key}')"><span>${escapeHtml(tab.label)}</span><small>${getEquipmentTabCount(tab.key)}</small></button>`).join('');
    }

    function renderEquipment() {
        const list = document.getElementById('equipment-list');
        if (!list) return;
        normalizeEquipmentData();
        syncEquipmentDerivedAttacks();
        renderEquipmentSummary();
        renderEquipmentTabs();
        if (currentEquipmentTab === 'backpack') {
            renderBackpackList(list);
            return;
        }
        const items = getEquipmentItemsForTab(currentEquipmentTab);
        const label = EQUIPMENT_CATEGORY_LABELS[currentEquipmentTab] || 'Предметы';
        const cards = items.map(item => renderEquipmentItemCard(item)).join('');
        const empty = items.length ? '' : `<div class="equipment-empty">Вкладка “${escapeHtml(label)}” пока пустая.</div>`;
        const addBtn = currentEquipmentTab === 'worn'
            ? ''
            : `<button type="button" class="equipment-add-btn" onclick="openEquipmentEditor('', '${currentEquipmentTab}')">+ ДОБАВИТЬ ПРЕДМЕТ</button>`;
        list.innerHTML = `${cards}${empty}${addBtn}`;
    }

    function switchEquipmentTab(tabKey) {
        currentEquipmentTab = tabKey;
        renderEquipment();
        saveAll(false);
    }

    function renderEquipmentItemCard(item) {
        const name = item.name || 'Предмет';
        const icon = String(item.icon || '').trim();
        const iconHTML = icon ? `<div class="equipment-icon">${escapeHtml(icon)}</div>` : '';
        const short = item.short || 'Краткое описание не заполнено.';
        const inBackpack = isItemInBackpack(item.id);
        const typeLabel = EQUIPMENT_ITEM_TYPES.find(t => t.key === item.itemType)?.label || 'Другое';
        const qty = formatConsumableQuantity(item);
        const action = item.itemType === 'consumable'
            ? `<div class="equipment-qty-actions"><button type="button" class="equipment-consume-btn" onclick="event.stopPropagation(); useConsumableItem('${item.id}')" title="Использовать"${(parseInt(item.quantity) || 0) <= 0 ? ' disabled' : ''}>✓</button><button type="button" class="equipment-consume-btn" onclick="event.stopPropagation(); restoreConsumableItem('${item.id}')" title="Вернуть 1">+</button></div>`
            : `<button type="button" class="equipment-gear" onclick="event.stopPropagation(); openEquipmentEditor('${item.id}')" title="Настроить">⚙</button>`;
        return `<div class="equipment-card ${icon ? '' : 'no-icon'} ${inBackpack ? 'in-backpack' : ''}" onclick="openEquipmentView('${item.id}')">
            ${iconHTML}
            <div class="equipment-card-main">
                <div class="equipment-card-name">${escapeHtml(name)}</div>
                <div class="equipment-card-meta">${escapeHtml(typeLabel)}${item.equipped ? ' · экипировано' : ''} · ${escapeHtml(formatItemBulk(item))}${qty ? ` · <span class="equipment-qty-badge">${escapeHtml(qty)}</span>` : ''}</div>
                <div class="equipment-card-short">${escapeHtml(short)}</div>
            </div>
            ${action}
        </div>`;
    }

    function useConsumableItem(itemId) {
        const idx = equipmentItems.findIndex(x => String(x.id) === String(itemId));
        const item = idx >= 0 ? equipmentItems[idx] : null;
        if (!item) return;
        const qty = Math.max(0, parseInt(item.quantity) || 0);
        if (qty <= 0) {
            return;
        }
        const healFormula = String(item.consumable?.heal ?? '').trim();
        const shouldHeal = item.consumable?.type === 'healingPotion' || (healFormula && healFormula !== '0');
        if (shouldHeal) healFromConsumable(item);
        equipmentItems[idx] = normalizeEquipmentItem({ ...item, quantity: qty - 1 });
        saveAll(false);
        calculate();
        closeModal('equipmentViewModal');
    }

    function restoreConsumableItem(itemId) {
        const idx = equipmentItems.findIndex(x => String(x.id) === String(itemId));
        if (idx < 0) return;
        const item = equipmentItems[idx];
        const qty = Math.max(0, parseInt(item.quantity) || 0);
        equipmentItems[idx] = normalizeEquipmentItem({ ...item, quantity: qty + 1 });
        saveAll(false);
        calculate();
    }

    function healFromConsumable(item) {
        const roll = rollHealingFormula(item?.consumable?.heal);
        const heal = Math.max(0, roll.total);
        const hpEl = getPreferredField('in-hp-cur') || document.getElementById('in-hp-cur');
        if (!hpEl) return;
        const before = Math.max(0, parseInt(hpEl.value) || 0);
        const max = getCurrentMaxHP();
        const after = Math.min(max, before + heal);
        if (typeof setFieldValueAll === 'function') setFieldValueAll('in-hp-cur', after);
        else hpEl.value = after;
        appendDiceLog(buildRollLogMarkup(item?.name || 'Лечение', roll.label || '0', after - before, 'color:var(--hp-green); font-size:32px; font-weight:900;'), 'var(--hp-green)');
    }

    function rollHealingFormula(value) {
        const raw = String(value ?? '').trim().replace(/d/gi, 'к');
        const formula = raw.replace(/\s+/g, '').toLowerCase();
        if (!formula) return { total: 0, label: '' };
        if (/^\d+$/.test(formula)) return { total: parseInt(formula) || 0, label: formula };

        let total = 0;
        let matched = false;
        const parts = [];
        const tokenRe = /([+-]?)(?:(\d*)к(\d+)|(\d+))/g;
        let token;
        while ((token = tokenRe.exec(formula)) !== null) {
            matched = true;
            const sign = token[1] === '-' ? -1 : 1;
            if (token[3]) {
                const count = Math.max(1, parseInt(token[2]) || 1);
                const faces = Math.max(1, parseInt(token[3]) || 1);
                let subtotal = 0;
                const rolls = [];
                for (let i = 0; i < count; i++) {
                    const r = Math.floor(Math.random() * faces) + 1;
                    rolls.push(r);
                    subtotal += r;
                }
                total += sign * subtotal;
                parts.push(`${sign < 0 ? '-' : parts.length ? '+' : ''}${count === 1 ? '' : count}к${faces}(${rolls.join('+')})`);
            } else {
                const flat = parseInt(token[4]) || 0;
                total += sign * flat;
                parts.push(`${sign < 0 ? '-' : parts.length ? '+' : ''}${flat}`);
            }
        }
        if (!matched) return { total: Math.max(0, parseInt(formula) || 0), label: formula };
        return { total: Math.max(0, total), label: parts.join('') || formula };
    }

    function renderBackpackList(list) {
        const cards = equipmentBackpack.map(slot => renderBackpackSlotCard(slot)).join('');
        list.innerHTML = `${cards}<button type="button" class="equipment-add-btn" onclick="addBackpackSlot()">+ ЯЧЕЙКА РЮКЗАКА</button>`;
    }

    function renderBackpackSlotCard(slot) {
        const item = equipmentItems.find(x => String(x.id) === String(slot.itemId));
        if (!item) {
            return `<div class="equipment-card empty" onclick="openBackpackSlot('${slot.id}')">
                <div class="equipment-icon">+</div>
                <div class="equipment-card-main">
                    <div class="equipment-card-name">Пустая ячейка</div>
                    <div class="equipment-card-meta">Рюкзак</div>
                </div>
                <button type="button" class="equipment-gear" onclick="event.stopPropagation(); openBackpackSlot('${slot.id}')" title="Выбрать">⚙</button>
            </div>`;
        }
        const icon = String(item.icon || '').trim();
        const iconHTML = icon ? `<div class="equipment-icon">${escapeHtml(icon)}</div>` : '';
        const qty = formatConsumableQuantity(item);
        const action = `<button type="button" class="equipment-gear" onclick="event.stopPropagation(); openBackpackSlot('${slot.id}')" title="Настроить ячейку">⚙</button>`;
        return `<div class="equipment-card ${icon ? '' : 'no-icon'}" onclick="openEquipmentView('${item.id}')">
            ${iconHTML}
            <div class="equipment-card-main">
                <div class="equipment-card-name">${escapeHtml(item.name || 'Предмет')}</div>
                <div class="equipment-card-meta">${escapeHtml(formatItemBulk(item))}${qty ? ` · <span class="equipment-qty-badge">${escapeHtml(qty)}</span>` : ''}</div>
            </div>
            ${action}
        </div>`;
    }

    function addBackpackSlot() {
        equipmentBackpack.push({ id: makeEquipmentId(), itemId: '' });
        saveAll(false);
        renderEquipment();
    }

    function openBackpackSlot(slotId) {
        currentBackpackSlotId = String(slotId);
        renderBackpackSourceList();
        openModal('equipmentBackpackModal');
    }

    function renderBackpackSourceList() {
        const list = document.getElementById('equipment-backpack-source-list');
        if (!list) return;
        const currentSlot = equipmentBackpack.find(slot => String(slot.id) === String(currentBackpackSlotId));
        const selected = String(currentSlot?.itemId || '');
        const used = new Set(equipmentBackpack
            .filter(slot => String(slot.id) !== String(currentBackpackSlotId))
            .map(slot => String(slot.itemId || ''))
            .filter(Boolean));
        const available = equipmentItems.filter(item => {
            const id = String(item.id);
            if (used.has(id) && selected !== id) return false;
            return canPutItemInBackpack(item, currentBackpackSlotId);
        });
        if (!available.length) {
            list.innerHTML = '<div class="equipment-empty">Нет предметов, которые можно положить в рюкзак. Лимит рюкзака — 4 балка.</div>';
            return;
        }
        list.innerHTML = available.map(item => {
            const icon = String(item.icon || '').trim();
            const iconHTML = icon ? `<span class="equipment-icon">${escapeHtml(icon)}</span>` : '';
            return `<button type="button" class="equipment-source-option ${icon ? '' : 'no-icon'} ${selected === String(item.id) ? 'active' : ''}" onclick="selectBackpackItem('${item.id}')">${iconHTML}<span><span class="equipment-source-title">${escapeHtml(item.name || 'Предмет')}</span><span class="equipment-source-meta">${escapeHtml(formatItemBulk(item))}</span></span></button>`;
        }).join('');
    }

    function selectBackpackItem(itemId) {
        const slot = equipmentBackpack.find(x => String(x.id) === String(currentBackpackSlotId));
        if (!slot) return;
        const item = equipmentItems.find(x => String(x.id) === String(itemId));
        if (itemId && !canPutItemInBackpack(item, currentBackpackSlotId)) {
            appendDiceLog('<div class="dice-log-rest-content">В рюкзак нельзя: надето или больше 4 балков</div>', 'var(--hp-red)', 'dice-log-rest');
            renderBackpackSourceList();
            return;
        }
        slot.itemId = String(itemId || '');
        saveAll(false);
        renderEquipment();
        closeModal('equipmentBackpackModal');
    }

    function deleteBackpackSlot() {
        if (!currentBackpackSlotId) return;
        equipmentBackpack = equipmentBackpack.filter(slot => String(slot.id) !== String(currentBackpackSlotId));
        currentBackpackSlotId = null;
        saveAll(false);
        renderEquipment();
        closeModal('equipmentBackpackModal');
    }

    function openEquipmentEditor(itemId = '', category = currentEquipmentTab) {
        const item = equipmentItems.find(x => String(x.id) === String(itemId));
        const cat = item?.category || (EQUIPMENT_CATEGORY_LABELS[category] ? category : 'carried');
        const defaultType = item?.itemType || (cat === 'consumable' ? 'consumable' : 'other');
        document.getElementById('equipment-edit-title').innerText = item ? 'Настройка предмета' : 'Добавить предмет';
        document.getElementById('equipment-item-id').value = item?.id || '';
        document.getElementById('equipment-item-category').value = cat;
        document.getElementById('equipment-item-icon').value = item?.icon || '';
        renderEquipmentIconPicker();
        setEquipmentIconPickerOpen(false);
        document.getElementById('equipment-item-name').value = item?.name || '';
        document.getElementById('equipment-item-type').value = defaultType;
        document.getElementById('equipment-item-equipped').checked = !!item?.equipped;
        document.getElementById('equipment-show-in-attacks').checked = !!item?.showInAttacks;
        document.getElementById('equipment-item-bulk').value = item ? item.bulk : 1;
        document.getElementById('equipment-item-quantity').value = item?.quantity ?? 1;
        document.getElementById('equipment-consumable-type').value = item?.consumable?.type || 'other';
        document.getElementById('equipment-consumable-heal').value = item?.consumable?.heal ?? 0;
        document.getElementById('equipment-armor-item').value = item?.armor?.item ?? 0;
        document.getElementById('equipment-armor-pen').value = item?.armor?.pen ?? 0;
        document.getElementById('equipment-armor-speed-pen').value = item?.armor?.speedPen ?? 0;
        document.getElementById('equipment-armor-cap').value = item?.armor?.cap ?? 0;
        document.getElementById('equipment-armor-type').value = normalizeArmorType(item?.armor?.armorType);
        document.getElementById('equipment-shield-bonus').value = item?.shield?.bonus ?? 0;
        document.getElementById('equipment-shield-hard').value = item?.shield?.hard ?? 0;
        document.getElementById('equipment-shield-hp-max').value = item?.shield?.hpMax ?? 0;
        document.getElementById('equipment-shield-hp-cur').value = item?.shield?.hpCur ?? 0;
        document.getElementById('equipment-weapon-range').value = item?.weapon?.range || 'melee';
        renderAmmoSelectOptions('equipment-weapon-ammo-item', item?.weapon?.ammoItemId || '');
        document.getElementById('equipment-weapon-charges-enabled').checked = !!item?.weapon?.chargesEnabled;
        document.getElementById('equipment-weapon-charge-max').value = item?.weapon?.chargeMax ?? 1;
        document.getElementById('equipment-weapon-charge-current').value = item?.weapon?.chargeCurrent ?? 0;
        document.getElementById('equipment-weapon-name').value = item?.weapon?.name || item?.name || '';
        document.getElementById('equipment-weapon-stat').value = item?.weapon?.stat || 'str';
        document.getElementById('equipment-weapon-group').value = normalizeWeaponGroup(item?.weapon?.weaponGroup);
        document.getElementById('equipment-weapon-item').value = item?.weapon?.item ?? 0;
        document.getElementById('equipment-weapon-map').value = item?.weapon?.mapPenalty ?? getAttackMapPenaltyPerDot();
        document.getElementById('equipment-weapon-dmg').value = item?.weapon?.dmg || '1к8';
        document.getElementById('equipment-weapon-crit').value = item?.weapon?.crit || '';
        document.getElementById('equipment-weapon-damage-type').value = item?.weapon?.type || 'Дробящий';
        document.getElementById('equipment-weapon-second-enabled').checked = !!item?.weapon?.second?.enabled;
        document.getElementById('equipment-weapon2-name').value = item?.weapon?.second?.name || '';
        document.getElementById('equipment-weapon2-stat').value = item?.weapon?.second?.stat || 'str';
        document.getElementById('equipment-weapon2-group').value = normalizeWeaponGroup(item?.weapon?.second?.weaponGroup ?? item?.weapon?.weaponGroup);
        document.getElementById('equipment-weapon2-item').value = item?.weapon?.second?.item ?? 0;
        document.getElementById('equipment-weapon2-map').value = item?.weapon?.second?.mapPenalty ?? getAttackMapPenaltyPerDot();
        document.getElementById('equipment-weapon2-dmg').value = item?.weapon?.second?.dmg || '1к8';
        document.getElementById('equipment-weapon2-crit').value = item?.weapon?.second?.crit || '';
        document.getElementById('equipment-weapon2-damage-type').value = item?.weapon?.second?.type || 'Дробящий';
        setEquipmentWeaponTagsFromString(item?.weapon?.tags || '');
        equipmentWeaponTagsExpanded = false;
        document.getElementById('equipment-item-short').value = item?.short || '';
        document.getElementById('equipment-item-full').value = item?.full || '';
        setEquipmentLight(item ? !!item.light : defaultType === 'consumable');
        equipmentItemTypeChanged();
        syncEquipmentConsumableHealField();
        openModal('equipmentItemModal');
    }

    function setEquipmentWeaponRange(range) {
        const value = range === 'ranged' ? 'ranged' : 'melee';
        const input = document.getElementById('equipment-weapon-range');
        if (input) input.value = value;
        const meleeBtn = document.getElementById('equipment-weapon-melee-btn');
        const rangedBtn = document.getElementById('equipment-weapon-ranged-btn');
        if (meleeBtn) meleeBtn.classList.toggle('active', value === 'melee');
        if (rangedBtn) rangedBtn.classList.toggle('active', value === 'ranged');
        const ammo = document.getElementById('equipment-ammo-settings');
        if (ammo) ammo.classList.toggle('open', value === 'ranged');
        syncEquipmentWeaponChargeSection();
    }

    function syncEquipmentSecondAttackSection() {
        const section = document.getElementById('equipment-second-attack');
        const cb = document.getElementById('equipment-weapon-second-enabled');
        if (section) section.classList.toggle('open', !!(cb && cb.checked));
    }

    function syncEquipmentWeaponChargeSection() {
        const section = document.getElementById('equipment-weapon-charge-settings');
        const enabled = !!document.getElementById('equipment-weapon-charges-enabled')?.checked;
        const ranged = document.getElementById('equipment-weapon-range')?.value === 'ranged';
        if (section) section.classList.toggle('open', enabled && ranged);
    }

    function setEquipmentLight(light) {
        const cb = document.getElementById('equipment-item-light');
        const bulk = document.getElementById('equipment-item-bulk');
        const row = document.getElementById('equipment-weight-row');
        if (cb) cb.checked = !!light;
        if (cb && cb.closest('.equipment-light-check')) cb.closest('.equipment-light-check').classList.toggle('active', !!light);
        if (row) row.style.display = light ? 'none' : '';
        if (bulk) {
            bulk.disabled = !!light;
            if (light) bulk.value = 0;
        }
    }

    function updateEquipmentShieldPp() {
        const max = Math.max(0, parseInt(document.getElementById('equipment-shield-hp-max')?.value) || 0);
        const pp = document.getElementById('equipment-shield-pp');
        if (pp) pp.value = Math.floor(max / 2);
    }

    function syncEquipmentConsumableHealField() {
        const type = document.getElementById('equipment-item-type')?.value || 'other';
        const consumableType = document.getElementById('equipment-consumable-type')?.value || 'other';
        const show = type === 'consumable' && consumableType === 'healingPotion';
        const label = document.getElementById('equipment-consumable-heal-label');
        const input = document.getElementById('equipment-consumable-heal');
        if (label) label.style.display = show ? '' : 'none';
        if (input) input.style.display = show ? '' : 'none';
    }

    function equipmentItemTypeChanged() {
        const type = document.getElementById('equipment-item-type')?.value || 'other';
        const itemId = document.getElementById('equipment-item-id')?.value || '';
        const category = document.getElementById('equipment-item-category');
        if (category && type === 'consumable') category.value = 'consumable';
        else if (category && category.value === 'consumable') category.value = 'carried';
        if (type === 'consumable' && !itemId) setEquipmentLight(true);
        const equippedWrap = document.getElementById('equipment-equipped-wrap');
        const canEquip = ['armor', 'shield', 'weapon'].includes(type);
        if (equippedWrap) equippedWrap.classList.toggle('visible', canEquip);
        const equipped = document.getElementById('equipment-item-equipped');
        if (equipped && !canEquip) equipped.checked = false;
        ['armor', 'shield', 'weapon', 'consumable'].forEach(key => {
            const el = document.getElementById(`equipment-${key}-settings`);
            if (el) el.classList.toggle('open', type === key);
        });
        setEquipmentWeaponRange(document.getElementById('equipment-weapon-range')?.value || 'melee');
        syncEquipmentSecondAttackSection();
        toggleEquipmentWeaponTagsSection(type === 'weapon' ? equipmentWeaponTagsExpanded : false);
        updateEquipmentShieldPp();
        syncEquipmentConsumableHealField();
    }

    function toggleEquipmentLight() {
        const cb = document.getElementById('equipment-item-light');
        setEquipmentLight(!(cb && cb.checked));
    }

    function saveEquipmentItem() {
        const id = document.getElementById('equipment-item-id').value || makeEquipmentId();
        const itemTypeValue = document.getElementById('equipment-item-type').value;
        const equippedValue = !!document.getElementById('equipment-item-equipped').checked;
        if (equippedValue && ['armor', 'shield', 'weapon'].includes(itemTypeValue) && getEquipmentWornCount(id) >= 10) {
            appendDiceLog('<div class="dice-log-rest-content">Надето максимум 10 предметов</div>', 'var(--hp-red)', 'dice-log-rest');
            return;
        }
        let categoryValue = document.getElementById('equipment-item-category').value;
        if (!equippedValue && ['armor', 'shield', 'weapon'].includes(itemTypeValue) && categoryValue === 'worn') categoryValue = 'carried';
        const item = normalizeEquipmentItem({
            id,
            category: categoryValue,
            itemType: itemTypeValue,
            equipped: equippedValue,
            icon: document.getElementById('equipment-item-icon').value,
            name: document.getElementById('equipment-item-name').value,
            bulk: document.getElementById('equipment-item-bulk').value,
            light: document.getElementById('equipment-item-light').checked,
            quantity: document.getElementById('equipment-item-quantity').value,
            showInAttacks: document.getElementById('equipment-show-in-attacks').checked,
            consumable: {
                type: document.getElementById('equipment-consumable-type').value,
                heal: document.getElementById('equipment-consumable-heal').value
            },
            armor: {
                item: document.getElementById('equipment-armor-item').value,
                pen: document.getElementById('equipment-armor-pen').value,
                speedPen: document.getElementById('equipment-armor-speed-pen').value,
                cap: document.getElementById('equipment-armor-cap').value,
                armorType: document.getElementById('equipment-armor-type').value
            },
            shield: {
                bonus: document.getElementById('equipment-shield-bonus').value,
                hard: document.getElementById('equipment-shield-hard').value,
                hpMax: document.getElementById('equipment-shield-hp-max').value,
                hpCur: document.getElementById('equipment-shield-hp-cur').value
            },
            weapon: {
                range: document.getElementById('equipment-weapon-range').value,
                ammoItemId: document.getElementById('equipment-weapon-ammo-item').value,
                chargesEnabled: document.getElementById('equipment-weapon-charges-enabled').checked,
                chargeMax: document.getElementById('equipment-weapon-charge-max').value,
                chargeCurrent: document.getElementById('equipment-weapon-charge-current').value,
                name: document.getElementById('equipment-weapon-name').value,
                stat: document.getElementById('equipment-weapon-stat').value,
                weaponGroup: document.getElementById('equipment-weapon-group').value,
                item: document.getElementById('equipment-weapon-item').value,
                mapPenalty: document.getElementById('equipment-weapon-map').value,
                dmg: document.getElementById('equipment-weapon-dmg').value.replace(/d/gi, 'к'),
                crit: document.getElementById('equipment-weapon-crit').value.replace(/d/gi, 'к'),
                type: document.getElementById('equipment-weapon-damage-type').value,
                tags: getEquipmentWeaponTagsAsString(),
                second: {
                    enabled: document.getElementById('equipment-weapon-second-enabled').checked,
                    name: document.getElementById('equipment-weapon2-name').value,
                    stat: document.getElementById('equipment-weapon2-stat').value,
                    weaponGroup: document.getElementById('equipment-weapon2-group').value,
                    item: document.getElementById('equipment-weapon2-item').value,
                    mapPenalty: document.getElementById('equipment-weapon2-map').value,
                    dmg: document.getElementById('equipment-weapon2-dmg').value.replace(/d/gi, 'к'),
                    crit: document.getElementById('equipment-weapon2-crit').value.replace(/d/gi, 'к'),
                    type: document.getElementById('equipment-weapon2-damage-type').value,
                    tags: ''
                }
            },
            short: document.getElementById('equipment-item-short').value,
            full: document.getElementById('equipment-item-full').value
        });
        const idx = equipmentItems.findIndex(x => String(x.id) === String(id));
        if (idx >= 0) equipmentItems[idx] = item;
        else equipmentItems.push(item);
        if (item.equipped || item.category === 'worn') removeItemFromBackpack(item.id);
        normalizeEquipmentData();
        currentEquipmentTab = item.category;
        saveAll(false);
        calculate();
        closeModal('equipmentItemModal');
    }

    function deleteEquipmentItem() {
        const id = document.getElementById('equipment-item-id').value;
        if (!id) { closeModal('equipmentItemModal'); return; }
        equipmentItems = equipmentItems.filter(item => String(item.id) !== String(id));
        equipmentBackpack = equipmentBackpack.filter(slot => String(slot.itemId) !== String(id));
        saveAll(false);
        calculate();
        closeModal('equipmentItemModal');
        closeModal('equipmentViewModal');
    }

    function openEquipmentView(itemId, mode = 'full') {
        const item = equipmentItems.find(x => String(x.id) === String(itemId));
        if (!item) return;
        currentEquipmentViewItemId = String(itemId);
        currentEquipmentViewMode = mode === 'short' ? 'short' : 'full';
        document.getElementById('equipment-view-title').innerText = `${item.icon ? item.icon + ' ' : ''}${item.name || 'Предмет'}`;
        const typeLabel = EQUIPMENT_ITEM_TYPES.find(t => t.key === item.itemType)?.label || 'Другое';
        const qty = formatConsumableQuantity(item);
        document.getElementById('equipment-view-meta').innerText = `${typeLabel}${item.equipped ? ' · экипировано' : ''} · ${formatItemBulk(item)}${qty ? ` · ${qty}` : ''}${isItemInBackpack(item.id) ? ' · в рюкзаке' : ''}`;
        updateEquipmentViewText();
        openModal('equipmentViewModal');
    }

    function updateEquipmentViewText() {
        const item = equipmentItems.find(x => String(x.id) === String(currentEquipmentViewItemId));
        if (!item) return;
        const isShort = currentEquipmentViewMode === 'short';
        const label = document.getElementById('equipment-view-mode-label');
        const text = document.getElementById('equipment-view-main-text');
        const btn = document.getElementById('equipment-view-toggle-btn');
        if (label) label.innerText = isShort ? 'Кратко' : 'Полное описание';
        if (text) text.innerText = isShort
            ? (item.short || 'Краткое описание не заполнено.')
            : (item.full || item.short || 'Полное описание не заполнено.');
        if (btn) btn.innerText = isShort ? 'ПОЛНАЯ' : 'КРАТКО';
    }

    function toggleEquipmentViewMode() {
        currentEquipmentViewMode = currentEquipmentViewMode === 'short' ? 'full' : 'short';
        updateEquipmentViewText();
    }

    function openEquipmentEditorFromView() {
        if (!currentEquipmentViewItemId) return;
        closeModal('equipmentViewModal');
        openEquipmentEditor(currentEquipmentViewItemId);
    }

    function toggleEquipmentBackpack(checked) {
        equipmentSettings = normalizeEquipmentSettings(equipmentSettings);
        equipmentSettings.backpackEnabled = checked === undefined ? !equipmentSettings.backpackEnabled : !!checked;
        if (!equipmentSettings.backpackEnabled && currentEquipmentTab === 'backpack') currentEquipmentTab = 'carried';
        saveAll(false);
        renderEquipment();
    }

    function openCurrencyModal() {
        equipmentSettings = normalizeEquipmentSettings(equipmentSettings);
        const coins = equipmentSettings.coins;
        document.getElementById('coin-pp').value = coins.pp;
        document.getElementById('coin-gp').value = coins.gp;
        document.getElementById('coin-sp').value = coins.sp;
        document.getElementById('coin-cp').value = coins.cp;
        updateCurrencyTotal();
        openModal('currencyModal');
    }

    function openEquipmentBulkSettingsModal() {
        equipmentSettings = normalizeEquipmentSettings(equipmentSettings);
        const bonus = document.getElementById('equipment-bulk-bonus');
        if (bonus) bonus.value = equipmentSettings.bulkBonus;
        updateEquipmentBulkSettingsPreview();
        openModal('equipmentBulkSettingsModal');
    }

    function updateEquipmentBulkSettingsPreview() {
        const preview = document.getElementById('equipment-bulk-preview');
        if (!preview) return;
        const str = parseInt(abilities.str);
        const mod = Number.isFinite(str) ? str : 0;
        const bonus = parseInt(document.getElementById('equipment-bulk-bonus')?.value) || 0;
        const baseMax = Math.max(0, 5 + mod + bonus);
        const overloadMax = Math.max(baseMax, 10 + mod + bonus);
        preview.innerHTML = `<span>Пороги</span><b>${formatBulkNumber(baseMax)} / ${formatBulkNumber(overloadMax)}</b><small>5 + сила + бонус / 10 + сила + бонус</small>`;
    }

    function saveEquipmentBulkSettings() {
        equipmentSettings = normalizeEquipmentSettings({
            ...equipmentSettings,
            bulkBonus: parseInt(document.getElementById('equipment-bulk-bonus')?.value) || 0
        });
        saveAll(false);
        renderEquipment();
        closeModal('equipmentBulkSettingsModal');
    }

    function getCurrencyInputCounts() {
        return {
            pp: Math.max(0, parseInt(document.getElementById('coin-pp')?.value) || 0),
            gp: Math.max(0, parseInt(document.getElementById('coin-gp')?.value) || 0),
            sp: Math.max(0, parseInt(document.getElementById('coin-sp')?.value) || 0),
            cp: Math.max(0, parseInt(document.getElementById('coin-cp')?.value) || 0)
        };
    }

    function getCurrencyTotalCopper(coins = getCurrencyInputCounts()) {
        return coins.pp * 1000 + coins.gp * 100 + coins.sp * 10 + coins.cp;
    }

    function splitCopperToCoins(totalCopper) {
        let left = Math.max(0, parseInt(totalCopper) || 0);
        const pp = Math.floor(left / 1000); left -= pp * 1000;
        const gp = Math.floor(left / 100); left -= gp * 100;
        const sp = Math.floor(left / 10); left -= sp * 10;
        return { pp, gp, sp, cp: left };
    }

    function updateCurrencyTotal() {
        const totalCopper = getCurrencyTotalCopper();
        const totalGp = document.getElementById('coin-total-gp');
        const breakdown = document.getElementById('coin-total-breakdown');
        const normalized = splitCopperToCoins(totalCopper);
        if (totalGp) totalGp.innerText = `${formatGoldValue(totalCopper / 100)} зм`;
        if (breakdown) breakdown.innerText = `${normalized.pp} пм · ${normalized.gp} зм · ${normalized.sp} см · ${normalized.cp} мм`;
    }

    function normalizeCurrencyInputs() {
        const normalized = splitCopperToCoins(getCurrencyTotalCopper());
        document.getElementById('coin-pp').value = normalized.pp;
        document.getElementById('coin-gp').value = normalized.gp;
        document.getElementById('coin-sp').value = normalized.sp;
        document.getElementById('coin-cp').value = normalized.cp;
        updateCurrencyTotal();
    }

    function saveCurrency() {
        const coins = getCurrencyInputCounts();
        equipmentSettings = normalizeEquipmentSettings({
            backpackEnabled: equipmentSettings.backpackEnabled,
            bulkBonus: equipmentSettings.bulkBonus,
            coins
        });
        saveAll(false);
        renderEquipment();
        closeModal('currencyModal');
    }

    function openAttackNotes() {
        const ta = document.getElementById('attack-notes-textarea');
        if (ta) {
            ta.value = attackNotes || '';
            updateAttackNotesCount();
        }
        syncAttackNotesPreview();
        openModal('attackNotesModal');
    }

    function saveAttackNotes() {
        const ta = document.getElementById('attack-notes-textarea');
        if (ta) {
            attackNotes = ta.value;
            ta.value = attackNotes;
            updateAttackNotesCount();
        }
        syncAttackNotesPreview();
        saveAll();
        closeModal('attackNotesModal');
    }

    function getAttackNotesSelection() {
        const editor = document.getElementById('attack-notes-editor');
        const selection = window.getSelection();
        if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
        const range = selection.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return null;
        return { editor, selection, range };
    }

    function queueAttackNotesToolbar() {
        setTimeout(updateAttackNotesToolbar, 0);
    }

    function updateAttackNotesToolbar() {
        const toolbar = document.getElementById('attack-note-toolbar');
        const info = getAttackNotesSelection();
        if (!toolbar || !info) {
            if (toolbar) toolbar.classList.remove('active');
            return;
        }
        attackNotesSelectionRange = info.range.cloneRange();
        const rect = info.range.getBoundingClientRect();
        toolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - 128, rect.left + rect.width / 2 - 58))}px`;
        toolbar.style.top = `${Math.max(8, rect.top - 48)}px`;
        toolbar.classList.add('active');
    }

    function restoreAttackNotesSelection() {
        const editor = document.getElementById('attack-notes-editor');
        if (!editor || !attackNotesSelectionRange) return null;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(attackNotesSelectionRange);
        return attackNotesSelectionRange;
    }

    function formatAttackNoteSelection(mode) {
        const range = restoreAttackNotesSelection();
        const editor = document.getElementById('attack-notes-editor');
        const toolbar = document.getElementById('attack-note-toolbar');
        if (!range || !editor || range.collapsed) return;
        const text = range.toString().trim();
        if (!text) return;

        let node;
        if (mode === 'bold') {
            document.execCommand('bold', false, null);
            if (toolbar) toolbar.classList.remove('active');
            saveAttackNotesFromEditor(true);
            return;
        } else if (mode === 'roll') {
            node = document.createElement('button');
            node.type = 'button';
            node.className = 'attack-note-roll';
            node.contentEditable = 'false';
            node.dataset.roll = text;
            node.textContent = text;
            range.deleteContents();
        } else if (mode === 'link') {
            const url = prompt('Куда ведёт кнопка?', 'https://');
            if (!url) return;
            node = document.createElement('button');
            node.type = 'button';
            node.className = 'attack-note-link';
            node.contentEditable = 'false';
            node.dataset.url = url.trim();
            node.textContent = text;
            range.deleteContents();
        }
        if (!node) return;
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        if (toolbar) toolbar.classList.remove('active');
        saveAttackNotesFromEditor(true);
    }

    function pastePlainTextIntoAttackNotes(event) {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
        saveAttackNotesFromEditor();
    }

    function handleAttackNotesClick(event) {
        const rollBtn = event.target.closest('.attack-note-roll');
        if (rollBtn) {
            event.preventDefault();
            rollAttackNoteButton(rollBtn);
            return;
        }
        const linkBtn = event.target.closest('.attack-note-link');
        if (linkBtn) {
            event.preventDefault();
            const url = linkBtn.dataset.url || '';
            if (url) window.open(url, '_blank', 'noopener');
        }
    }

    function getPersonalityNoteTitle(index) {
        const value = document.getElementById(`persona-note-${index}`)?.value || '';
        const firstLine = value.split(/\r?\n/)[0] || '';
        return firstLine.trim() || String(index);
    }

    function renderPersonalityNotes() {
        for (let i = 1; i <= 6; i++) {
            const title = getPersonalityNoteTitle(i);
            const label = document.getElementById(`personality-note-title-${i}`);
            const btn = label?.closest('.personality-note-btn');
            if (label) label.innerText = title;
            if (btn) btn.title = title === String(i) ? `Заметка ${i}` : title;
        }
    }

    function openPersonalityNotesMenu() {
        renderPersonalityNotes();
        openModal('personalityNotesMenuModal');
    }

    function openPersonalityNote(index) {
        currentPersonalityNoteIndex = Math.min(6, Math.max(1, parseInt(index) || 1));
        const store = document.getElementById(`persona-note-${currentPersonalityNoteIndex}`);
        const ta = document.getElementById('personality-note-textarea');
        const title = document.getElementById('personality-note-modal-title');
        if (ta) ta.value = store?.value || '';
        if (title) title.innerText = getPersonalityNoteTitle(currentPersonalityNoteIndex) === String(currentPersonalityNoteIndex)
            ? `Заметка ${currentPersonalityNoteIndex}`
            : getPersonalityNoteTitle(currentPersonalityNoteIndex);
        closeModal('personalityNotesMenuModal');
        openModal('personalityNoteModal');
        setTimeout(() => ta && ta.focus(), 0);
    }

    function updatePersonalityNoteDraft() {
        const store = document.getElementById(`persona-note-${currentPersonalityNoteIndex}`);
        const ta = document.getElementById('personality-note-textarea');
        if (!store || !ta) return;
        store.value = ta.value.slice(0, 8000);
        renderPersonalityNotes();
        const title = document.getElementById('personality-note-modal-title');
        if (title) title.innerText = getPersonalityNoteTitle(currentPersonalityNoteIndex) === String(currentPersonalityNoteIndex)
            ? `Заметка ${currentPersonalityNoteIndex}`
            : getPersonalityNoteTitle(currentPersonalityNoteIndex);
    }

    function savePersonalityNote() {
        updatePersonalityNoteDraft();
        saveAll();
        closeModal('personalityNoteModal');
    }

    function renderPersonalitySections() {
        ['origin', 'personality', 'proficiency'].forEach(key => {
            const section = document.getElementById(`personality-section-${key}`);
            if (section) section.classList.toggle('collapsed', !!personalitySectionCollapsed[key]);
        });
    }

    function togglePersonalitySection(key) {
        personalitySectionCollapsed[key] = !personalitySectionCollapsed[key];
        renderPersonalitySections();
        saveAll(false);
    }

    function init(showMenuOnReady = false) {
        let attrsHTML = '';
        for (const [name, info] of Object.entries(DATA_MAP)) {
            let skillsList = [...info.skills];
            if (info.key === 'int') for (let i = 1; i <= 3; i++) if (lores[i]) skillsList.push(`lore-${i}|${lores[i]}`);
            let skillsHTML = skillsList.map(s => renderSkill(s)).join('');
            attrsHTML += `<div class="attr-card" data-key="${info.key}" id="card-${info.key}"><div class="attr-head" onclick="openAbilityModal('${name}', '${info.key}')"><span>${name}</span><div style="display:flex;align-items:center;gap:8px"><div class="dot boost-dot" style="background:var(--hp-gold);display:${partialBoosts[info.key]?'block':'none'};width:8px;height:8px;border-radius:50%"></div><div class="attr-input v" id="disp-score-${info.key}">+0</div></div><input type="hidden" id="score-${info.key}" value="${abilities[info.key] ?? 0}"></div><div class="skills-container">${skillsHTML}</div></div>`;
        }
        document.querySelectorAll('#attr-list').forEach(root => { root.innerHTML = attrsHTML; });

        const leftPanel = document.getElementById('static-combat-page');
        const mainContent = document.getElementById('combat-page-content');
        if (leftPanel && mainContent && leftPanel.innerHTML.trim() === "") {
            leftPanel.appendChild(mainContent.cloneNode(true));
        }

        renderAttackModalOptions();
        renderEquipmentModalOptions();
        renderSpellModalOptions();
        toggleAttackTagsSection(false);
        toggleEquipmentWeaponTagsSection(false);
        syncAttackNotesPreview();
        renderPersonalitySections();
        renderPersonalityNotes();

        loadAll(showMenuOnReady);
    }

    function renderSkill(s) {
        let [id, lbl] = s.includes('|') ? s.split('|') : [s, s];
        return `<div class="skill-item"><div class="skill-name" id="name-${id}" data-label="${lbl}" onclick="openSkillModal('${id}', '${lbl}')">${lbl}</div><div style="display:flex;align-items:center;gap:8px"><div class="dot-container" data-skill-id="${id}"><div class="dot" onclick="setSkillProf('${id}', 1)"></div><div class="dot" onclick="setSkillProf('${id}', 2)"></div><div class="dot" onclick="setSkillProf('${id}', 3)"></div><div class="dot" onclick="setSkillProf('${id}', 4)"></div></div><div class="skill-roll-btn v" onclick="rollDice('${lbl}', this.innerText)" id="val-${id}">+0</div></div></div>`;
    }

    function setSkillProf(id, val) { skillProf[id] = (skillProf[id] === val) ? 0 : val; saveAll(); }
    function setSaveProf(id, val) { saveProf[id] = (saveProf[id] === val) ? 0 : val; saveAll(); }
    function setHeroPoints(val) { heroPoints = (heroPoints === val) ? val - 1 : val; saveAll(); }
    function normalizeTrainingRank(value) { return Math.max(0, Math.min(4, parseInt(value) || 0)); }
    function normalizeProficiencies(source = {}) {
        const armor = {};
        const weapon = {};
        ARMOR_PROFICIENCY_TYPES.forEach(type => { armor[type.key] = normalizeTrainingRank(source?.armor?.[type.key]); });
        WEAPON_PROFICIENCY_TYPES.forEach(type => { weapon[type.key] = normalizeTrainingRank(source?.weapon?.[type.key]); });
        return { armor, weapon };
    }
    function getProficiencyRank(kind, key) {
        proficiencies = normalizeProficiencies(proficiencies);
        return normalizeTrainingRank(proficiencies?.[kind]?.[key]);
    }
    function getProficiencyBonus(kind, key, lvl = clampLevel(document.getElementById('in-lvl')?.value || 1)) {
        const rank = getProficiencyRank(kind, key);
        return rank > 0 ? lvl + rank * 2 : 0;
    }
    function getBestWeaponProficiencyBonus(lvl = clampLevel(document.getElementById('in-lvl')?.value || 1)) {
        return Math.max(...WEAPON_PROFICIENCY_TYPES.map(type => getProficiencyBonus('weapon', type.key, lvl)), 0);
    }
    function normalizeArmorType(value) {
        return ARMOR_PROFICIENCY_TYPES.some(type => type.key === value) ? value : 'unarmored';
    }
    function normalizeWeaponGroup(value) {
        return WEAPON_PROFICIENCY_TYPES.some(type => type.key === value) ? value : 'unarmed';
    }
    function getArmorProficiencyBonusForItem(item, lvl = clampLevel(document.getElementById('in-lvl')?.value || 1)) {
        return getProficiencyBonus('armor', normalizeArmorType(item?.armor?.armorType), lvl);
    }
    function getWeaponProficiencyBonusForAttack(atk, lvl = clampLevel(document.getElementById('in-lvl')?.value || 1)) {
        return getProficiencyBonus('weapon', normalizeWeaponGroup(atk?.weaponGroup), lvl);
    }
    function setProficiency(kind, key, val) {
        proficiencies = normalizeProficiencies(proficiencies);
        const current = getProficiencyRank(kind, key);
        proficiencies[kind][key] = current === val ? Math.max(0, val - 1) : normalizeTrainingRank(val);
        saveAll();
    }
    function renderProficiencyRows(targetId, kind, types) {
        const list = document.getElementById(targetId);
        if (!list) return;
        list.innerHTML = types.map(type => {
            const rank = getProficiencyRank(kind, type.key);
            const dots = [1,2,3,4].map(i => `<div class="dot ${i <= rank ? 'active' : ''}" onclick="setProficiency('${kind}', '${type.key}', ${i})"></div>`).join('');
            return `<div class="proficiency-row"><div class="proficiency-name">${escapeHtml(type.label)}</div><div class="dot-container">${dots}</div></div>`;
        }).join('');
    }
    function renderProficiencies() {
        proficiencies = normalizeProficiencies(proficiencies);
        renderProficiencyRows('armor-proficiency-list', 'armor', ARMOR_PROFICIENCY_TYPES);
        renderProficiencyRows('weapon-proficiency-list', 'weapon', WEAPON_PROFICIENCY_TYPES);
    }
    function setWounds(val) {
        let cur = parseInt(document.getElementById('in-wounds').value) || 0;
        document.getElementById('in-wounds').value = (cur === val) ? val - 1 : val;
        saveAll();
    }

    function openRestMenu() {
        const lvl = clampLevel(document.getElementById('in-lvl').value); document.getElementById('in-lvl').value = lvl;
        const con = parseInt(document.getElementById('score-con').value) || 0;
        const recovery = Math.max(0, lvl + con);
        document.getElementById('rest-hp-msg').innerText = `+${recovery} HP`;
        document.getElementById('rest-wound-msg').style.display = (parseInt(document.getElementById('in-wounds').value)||0) > 0 ? 'block' : 'none';
        openModal('restModal');
    }

    function doRest() {
        const lvl = clampLevel(document.getElementById('in-lvl').value); document.getElementById('in-lvl').value = lvl;
        const con = parseInt(document.getElementById('score-con').value) || 0;
        const recovery = Math.max(0, lvl + con);
        let curHP = parseInt(document.getElementById('in-hp-cur').value) || 0;
        const currentMaxHP = (parseInt(document.getElementById('in-hp-anc').value) || 0) + ((parseInt(document.getElementById('in-hp-cls').value) || 0) + con) * lvl;
        document.getElementById('in-hp-cur').value = Math.min(currentMaxHP, curHP + recovery);
        document.getElementById('in-wounds').value = 0; dyingLevel = 0; lastDeathCheck = null;
        resetSpellResources(true);
        saveAll(); closeModal('restModal');
        appendRestLog(recovery);
    }

    function repairShield() {
        const cur = parseInt(document.getElementById('sh-hp-cur').value) || 0;
        const max = parseInt(document.getElementById('sh-hp-max').value) || 0;
        document.getElementById('sh-hp-cur').value = max;
        const equippedShield = getEquippedEquipmentItem('shield');
        if (equippedShield) equippedShield.shield.hpCur = max;
        saveAll();
    }

    function toggleShieldCheckbox(checked) {
        if (checked && (parseInt(document.getElementById('sh-hp-cur').value)||0) <= 0) document.getElementById('sh-hp-cur').value = 1;
        saveAll();
    }

    function applyHeaderCollapsedState() {
        document.body.classList.toggle('header-collapsed', !!headerCollapsed);
        const btn = document.getElementById('header-collapse-btn');
        if (btn) {
            btn.innerText = headerCollapsed ? '▼' : '▲';
            btn.title = headerCollapsed ? 'Развернуть шапку' : 'Свернуть шапку';
        }
    }

    function toggleHeaderCollapsed() {
        headerCollapsed = !headerCollapsed;
        applyHeaderCollapsedState();
        saveAll();
    }

    function getMobileReorderModeForCurrentPage() {
        if (window.innerWidth >= 1000) return null;
        if (document.body.classList.contains('main-menu-open')) return characters.length > 1 ? 'characters' : null;
        if (currentPage === 1 && attacks.length > 1) return 'attacks';
        if (currentPage === 2 && currentFeatTab === 'my' && myFeats.length > 1) return 'feats';
        return null;
    }

    function getMobileReorderTitle(mode) {
        if (mode === 'characters') return 'Режим перемещения персонажей: нажми карточку, потом место вставки';
        if (mode === 'attacks') return 'Режим перемещения атак: нажми атаку, потом место вставки';
        if (mode === 'feats') return 'Режим перемещения главных фитов: нажми фит, потом место вставки';
        return 'Режим перемещения';
    }

    function syncMobileReorderButtons() {
        const availableMode = getMobileReorderModeForCurrentPage();
        if (!availableMode || mobileReorderMode !== availableMode) {
            mobileReorderMode = null;
            selectedMobileReorder = null;
        }

        document.body.classList.toggle('mobile-reorder-characters', mobileReorderMode === 'characters');
        document.body.classList.toggle('mobile-reorder-attacks', mobileReorderMode === 'attacks');
        document.body.classList.toggle('mobile-reorder-feats', mobileReorderMode === 'feats');

        const available = !!availableMode;
        const btn = document.getElementById('global-reorder-btn');
        if (btn) {
            btn.classList.toggle('active', !!mobileReorderMode && mobileReorderMode !== 'characters');
            btn.disabled = !available || availableMode === 'characters';
            btn.title = available && availableMode !== 'characters'
                ? (mobileReorderMode ? 'Выключить режим перемещения' : getMobileReorderTitle(availableMode))
                : 'На этой странице нечего перемещать';
        }

    }

    function toggleMobileReorderMode() {
        const availableMode = getMobileReorderModeForCurrentPage();
        if (!availableMode) {
            mobileReorderMode = null;
            selectedMobileReorder = null;
            syncMobileReorderButtons();
            return;
        }
        mobileReorderMode = mobileReorderMode === availableMode ? null : availableMode;
        selectedMobileReorder = null;
        if (mobileReorderMode) {
            attackDeleteSelectMode = false;
            characterDeleteSelectMode = false;
        }
        syncMobileReorderButtons();
        syncAttackDeleteButton();
        if (availableMode === 'characters') renderCharacterMenu();
        else calculate();
    }

    function getReorderCollection(type) {
        if (type === 'characters') return characters;
        return type === 'attacks' ? attacks : myFeats;
    }

    function refreshAfterReorderChange(type) {
        if (type === 'characters') renderCharacterMenu();
        else calculate();
    }

    function commitReorderChange(type) {
        if (type === 'characters') {
            writeCharacters();
            if (window.innerWidth < 1000) {
                mobileReorderMode = null;
                selectedMobileReorder = null;
            }
            renderCharacterMenu();
        } else {
            saveAll();
        }
    }

    function handleReorderTap(e, type, idx) {
        if (window.innerWidth >= 1000 || mobileReorderMode !== type) return;
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const collection = getReorderCollection(type);
        if (!collection || idx < 0 || idx >= collection.length) return;

        if (!selectedMobileReorder || selectedMobileReorder.type !== type) {
            selectedMobileReorder = { type, idx };
            refreshAfterReorderChange(type);
            return;
        }

        const fromIdx = selectedMobileReorder.idx;
        if (fromIdx === idx) {
            selectedMobileReorder = null;
            refreshAfterReorderChange(type);
            return;
        }

        const item = collection.splice(fromIdx, 1)[0];
        // Клик по карточке означает: поставить выбранный элемент на место этой карточки.
        // Если двигаем сверху вниз, элементы между ними должны сдвинуться вверх,
        // поэтому индекс цели не уменьшаем после удаления выбранного элемента.
        let insertIdx = idx;
        insertIdx = Math.max(0, Math.min(insertIdx, collection.length));
        collection.splice(insertIdx, 0, item);
        selectedMobileReorder = null;
        commitReorderChange(type);
    }

    function handleCharacterDragHandleClick(event, idx) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (characterDeleteSelectMode) return;
        if (window.innerWidth >= 1000) return;
        if (characters.length < 2) return;

        if (mobileReorderMode !== 'characters') {
            mobileReorderMode = 'characters';
            selectedMobileReorder = { type: 'characters', idx };
            renderCharacterMenu();
            return;
        }

        if (selectedMobileReorder && selectedMobileReorder.type === 'characters' && selectedMobileReorder.idx === idx) {
            mobileReorderMode = null;
            selectedMobileReorder = null;
            renderCharacterMenu();
            return;
        }

        selectedMobileReorder = { type: 'characters', idx };
        renderCharacterMenu();
    }


    function getCurrentMaxHP() {
        const lvlEl = document.getElementById('in-lvl');
        const lvl = lvlEl ? clampLevel(lvlEl.value) : 1;
        const conEl = document.getElementById('score-con');
        const con = conEl ? (parseInt(conEl.value) || 0) : (abilities.con || 0);
        const anc = parseInt(document.getElementById('in-hp-anc')?.value) || 0;
        const cls = parseInt(document.getElementById('in-hp-cls')?.value) || 0;
        return Math.max(0, anc + (cls + con) * lvl);
    }

    function clampCurrentHPInput() {
        const hpEl = document.getElementById('in-hp-cur');
        if (!hpEl) return;
        const maxHP = getCurrentMaxHP();
        let cur = parseInt(hpEl.value);
        if (isNaN(cur)) return;
        cur = Math.max(0, Math.min(maxHP, cur));
        hpEl.value = cur;
        hpEl.max = maxHP;
        hpEl.min = 0;
    }

    function toggleHpCriticalDamage() {
        const cb = document.getElementById('hp-critical-damage');
        const label = document.getElementById('hp-critical-damage-label');
        if (label) label.classList.toggle('active', !!(cb && cb.checked));
        saveAll();
    }

    function getHpKeypadValue() {
        const el = document.getElementById('hp-calc-val');
        return el ? String(el.value || '').replace(/\D/g, '').slice(0, 4) : '';
    }

    function setHpKeypadValue(value) {
        const el = document.getElementById('hp-calc-val');
        if (!el) return;
        el.value = String(value || '').replace(/\D/g, '').slice(0, 4);
        updateHpKeypadDisplay();
    }

    function updateHpKeypadDisplay() {
        const input = document.getElementById('hp-calc-val');
        if (!input) return;
        const val = getHpKeypadValue();
        if (input.value !== val) input.value = val;
    }

    function applyHpKeypadState() {
        const shell = document.getElementById('hp-keypad-shell');
        const toggle = document.getElementById('hp-keypad-toggle');
        if (shell) shell.classList.toggle('open', !!hpKeypadOpen);
        if (toggle) {
            toggle.classList.toggle('active', !!hpKeypadOpen);
            toggle.innerHTML = `⌨<span>${hpKeypadOpen ? '▲' : '▼'}</span>`;
            toggle.title = hpKeypadOpen ? 'Свернуть калькулятор HP' : 'Развернуть калькулятор HP';
        }
        updateHpKeypadDisplay();
    }

    function toggleHpKeypad() {
        hpKeypadOpen = !hpKeypadOpen;
        applyHpKeypadState();
        saveAll();
    }

    function hpKeypadPress(digit) {
        const current = getHpKeypadValue();
        if (current.length >= 4) return;
        const next = (current === '0' ? '' : current) + String(digit);
        setHpKeypadValue(next.replace(/^0+(?=\d)/, ''));
    }

    function clearHpKeypad() {
        setHpKeypadValue('');
    }

    function hpKeypadBackspace() {
        const current = getHpKeypadValue();
        setHpKeypadValue(current.slice(0, -1));
    }

    function applyHpKeypad(dir) {
        const val = parseInt(getHpKeypadValue()) || 0;
        if (val <= 0) return;
        modHP(dir);
    }

    function getLevelUpReadyKey(lvl = null, exp = null) {
        const lvlVal = lvl === null ? clampLevel(document.getElementById('in-lvl')?.value || 1) : clampLevel(lvl);
        const expVal = exp === null ? (parseInt(document.getElementById('in-exp')?.value) || 0) : (parseInt(exp) || 0);
        return (activeCharacterId && expVal >= 1000 && lvlVal < 20) ? `${activeCharacterId}:${lvlVal}:${Math.floor(expVal / 1000)}` : '';
    }

    function snapshotLevelUpReadyState() {
        lastLevelUpReadyKey = getLevelUpReadyKey();
    }

    function pulseLevelUpVisuals(kind = 'done') {
        const expWrap = document.querySelector('.exp-container');
        const expFill = document.getElementById('exp-fill');
        const lvlBadge = document.querySelector('.stat-badge.lvl-main');
        const personalityExpFill = document.getElementById('personality-exp-fill');
        const personalityLvlBadge = document.querySelector('.personality-level-badge');
        const duration = kind === 'done' ? 2050 : 900;
        [expWrap, expFill, lvlBadge, personalityExpFill, personalityLvlBadge].forEach(el => {
            if (!el) return;
            el.classList.remove('level-up-burst');
            void el.offsetWidth;
            el.classList.add('level-up-burst');
        });
        window.setTimeout(() => {
            [expWrap, expFill, lvlBadge, personalityExpFill, personalityLvlBadge].forEach(el => el && el.classList.remove('level-up-burst'));
            if (kind === 'done' && expFill) expFill.classList.remove('level-up-slow');
            if (kind === 'done' && personalityExpFill) personalityExpFill.classList.remove('level-up-slow');
        }, duration);
    }

    function primeLevelUpMotion() {
        const expFill = document.getElementById('exp-fill');
        const personalityExpFill = document.getElementById('personality-exp-fill');
        if (expFill) expFill.classList.add('level-up-slow');
        if (personalityExpFill) personalityExpFill.classList.add('level-up-slow');
    }

    function appendLevelUpReadyLog(lvl) {
        appendDiceLog(`<div class="dice-log-level-text"><div class="dice-log-level-title">Повышение уровня</div><div class="dice-log-level-sub">Опыт готов — нажми ↑ у уровня ${lvl}</div></div>`, 'var(--hp-gold)', 'dice-log-level-up');
    }

    function appendLevelUpDoneLog(lvl) {
        appendDiceLog(`<div class="dice-log-level-text"><div class="dice-log-level-title">Уровень повышен</div><div class="dice-log-level-sub">Теперь уровень ${lvl}</div></div>`, 'var(--hp-gold)', 'dice-log-level-up');
    }

    function calculate() {
        let lvl = clampLevel(document.getElementById('in-lvl').value); document.getElementById('in-lvl').value = lvl;
        const mods = {};
        for (const info of Object.values(DATA_MAP)) {
            let val = abilities[info.key];
            if (val === undefined) val = parseInt(document.getElementById(`score-${info.key}`).value) || 0;
            mods[info.key] = val;
            document.querySelectorAll(`#disp-score-${info.key}`).forEach(el => {
                el.innerText = (val >= 0 ? '+' : '') + val;
            });
        }
        const armorForPenalty = getEquippedEquipmentItem('armor');
        let armorPen = armorForPenalty ? Math.abs(parseInt(armorForPenalty.armor?.pen) || 0) : 0;

        document.querySelectorAll('[data-skill-id]').forEach(cont => {
            const id = cont.dataset.skillId, p = skillProf[id] || 0;
            cont.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i < p));
            let mKey = ['Акробатика','Воровство','Скрытность'].includes(id) ? 'dex' : (['Общество','Мистицизм','Оккультизм','Ремесло'].includes(id) || id.includes('lore') ? 'int' : (['Медицина','Природа','Религия','Выживание'].includes(id) ? 'wis' : (['Обман','Дипломатия','Запугивание','Исполнение'].includes(id) ? 'cha' : 'str')));
            const res = mods[mKey] + (p === 0 ? 0 : lvl + p * 2) + (itemBonuses[id] || 0) - (['str', 'dex'].includes(mKey) ? armorPen : 0);
            document.querySelectorAll(`#val-${id}`).forEach(el => {
                el.innerText = (res >= 0 ? '+' : '') + res;
            });
        });

        document.querySelectorAll('[data-save]').forEach(cont => {
            const id = cont.dataset.save, p = saveProf[id] || 0;
            cont.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i < p));
            let mKey = id === 'fort' ? 'con' : (id === 'ref' ? 'dex' : 'wis');
            const resVal = mods[mKey] + (p === 0 ? 0 : lvl + p * 2);
            document.querySelectorAll(`#val-${id}`).forEach(el => {
                el.innerText = (resVal >= 0 ? '+' : '') + resVal;
            });
        });

        document.querySelectorAll('.hero-points-bar').forEach(bar => {
            bar.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i < heroPoints));
        });
        for(let i=1; i<=3; i++) document.querySelectorAll(`#w-dot-${i}`).forEach(d => d.classList.toggle('active', i <= (parseInt(document.getElementById('in-wounds').value)||0)));
        const hpCritDamageCb = document.getElementById('hp-critical-damage');
        const hpCritDamageLabel = document.getElementById('hp-critical-damage-label');
        if (hpCritDamageLabel) hpCritDamageLabel.classList.toggle('active', !!(hpCritDamageCb && hpCritDamageCb.checked));

        renderProficiencies();
        renderAttackDcButton(mods, lvl);
        syncEquipmentDerivedAttacks();
        const equippedArmor = getEquippedEquipmentItem('armor');
        const acItemEl = document.getElementById('in-ac-item');
        const acPenEl = document.getElementById('in-ac-pen');
        const acCapEl = document.getElementById('in-ac-cap');
        const acProfEl = document.getElementById('in-ac-prof');
        const armorData = equippedArmor?.armor || null;
        [acItemEl, acPenEl, acCapEl].forEach(el => { if (el) el.disabled = !!equippedArmor; });
        if (acProfEl) acProfEl.disabled = true;
        const acNote = document.getElementById('equipment-ac-note');
        if (acNote) acNote.style.display = equippedArmor ? 'block' : 'none';
        const armorProfBonus = equippedArmor ? getArmorProficiencyBonusForItem(equippedArmor, lvl) : getProficiencyBonus('armor', 'unarmored', lvl);
        if (equippedArmor) {
            if (acItemEl) acItemEl.value = armorData.item || 0;
            if (acPenEl) acPenEl.value = armorData.pen || 0;
            if (acCapEl) acCapEl.value = armorData.cap || 0;
        } else {
            if (acItemEl) acItemEl.value = 0;
            if (acPenEl) acPenEl.value = 0;
            if (acCapEl) acCapEl.value = 0;
        }
        if (acProfEl) acProfEl.value = armorProfBonus;
        const acCapForCalc = equippedArmor ? (parseInt(acCapEl?.value) || 10) : 10;
        const totalAC = 10 + Math.min(mods['dex'], acCapForCalc) + (parseInt(acItemEl?.value)||0) + armorProfBonus;
        document.getElementById('disp-ac-head').innerText = totalAC;
        
        const equippedShield = getEquippedEquipmentItem('shield');
        const hasShieldEl = document.getElementById('has-shield');
        const shBonusEl = document.getElementById('sh-bonus');
        const shHardEl = document.getElementById('sh-hard');
        const shMaxEl = document.getElementById('sh-hp-max');
        const shCurEl = document.getElementById('sh-hp-cur');
        [hasShieldEl, shBonusEl, shHardEl, shMaxEl, shCurEl].forEach(el => { if (el) el.disabled = !!equippedShield; });
        const shieldNote = document.getElementById('equipment-shield-note');
        if (shieldNote) shieldNote.style.display = equippedShield ? 'block' : 'none';
        if (equippedShield) {
            const shieldData = equippedShield.shield || {};
            if (hasShieldEl) hasShieldEl.checked = true;
            if (shBonusEl) shBonusEl.value = shieldData.bonus || 0;
            if (shHardEl) shHardEl.value = shieldData.hard || 0;
            if (shMaxEl) shMaxEl.value = shieldData.hpMax || 0;
            if (shCurEl) shCurEl.value = shieldData.hpCur || 0;
        } else {
            if (hasShieldEl) hasShieldEl.checked = false;
            if (shBonusEl) shBonusEl.value = 0;
            if (shHardEl) shHardEl.value = 0;
            if (shMaxEl) shMaxEl.value = 0;
            if (shCurEl) shCurEl.value = 0;
        }
        let hasShield = hasShieldEl.checked;
        const shHP = parseInt(shCurEl.value) || 0;
        const shMax = parseInt(shMaxEl.value) || 0;
        const shPP = Math.floor(shMax / 2);
        if (shHP <= 0 && hasShield && !equippedShield) { hasShield = false; document.getElementById('has-shield').checked = false; }
        document.getElementById('shield-btn-main').classList.toggle('active', hasShield);
        document.getElementById('disp-shield-bonus').innerText = `+${shBonusEl.value || 0}`;
        document.getElementById('sh-pp-auto').value = shPP;

        const shBarWrap = document.getElementById('shield-bar-wrap');
        const shBarFill = document.getElementById('shield-bar-fill');
        const hpModalShieldBlock = document.getElementById('hp-modal-shield-block');
        const hpModalShieldFill = document.getElementById('hp-modal-shield-fill');
        const hpModalShieldNumbers = document.getElementById('hp-modal-shield-numbers');
        const hpShieldBreakInfo = document.getElementById('hp-shield-break-info');
        const shieldUseWrap = document.getElementById('shield-use-wrap');
        const shieldRaisedEl = document.getElementById('shield-raised');
        const shieldBlockEl = document.getElementById('use-shield-damage');
        const shieldBlockLabel = document.getElementById('use-shield-damage-label');
        const shieldBonus = parseInt(document.getElementById('sh-bonus').value) || 0;
        const shieldBreakMax = Math.max(0, shMax - shPP);
        const shieldBreakCur = Math.max(0, shHP - shPP);
        const shieldBreakPct = shieldBreakMax > 0 ? (shieldBreakCur / shieldBreakMax) * 100 : 0;
        const shieldCanBlockByHp = !!(hasShield && shieldBreakMax > 0 && shieldBreakCur > 0);

        if (shieldCanBlockByHp) {
            if (shBarWrap) shBarWrap.classList.add('active');
            if (shBarFill) shBarFill.style.width = shieldBreakPct + '%';
            if (hpModalShieldBlock) hpModalShieldBlock.classList.add('active');
            if (hpModalShieldFill) hpModalShieldFill.style.width = shieldBreakPct + '%';
            if (hpModalShieldNumbers) hpModalShieldNumbers.innerText = `${shieldBreakCur} / ${shieldBreakMax}`;
        } else {
            if (shBarWrap) shBarWrap.classList.remove('active');
            if (shBarFill) shBarFill.style.width = '0%';
            if (hpModalShieldBlock) hpModalShieldBlock.classList.remove('active');
            if (hpModalShieldFill) hpModalShieldFill.style.width = '0%';
            if (hpModalShieldNumbers) hpModalShieldNumbers.innerText = `${shieldBreakCur} / ${shieldBreakMax}`;
        }

        if (shieldUseWrap) shieldUseWrap.style.display = hasShield ? 'flex' : 'none';
        if (!hasShield) {
            if (shieldRaisedEl) shieldRaisedEl.checked = false;
            if (shieldBlockEl) shieldBlockEl.checked = false;
        }
        if (!shieldCanBlockByHp) {
            if (shieldBlockEl) shieldBlockEl.checked = false;
        }

        const shieldRaised = !!(shieldCanBlockByHp && shieldRaisedEl && shieldRaisedEl.checked);
        const canBlockShield = !!(shieldCanBlockByHp && shieldRaised);
        if (shieldBlockEl) {
            shieldBlockEl.disabled = !canBlockShield;
            if (!canBlockShield) shieldBlockEl.checked = false;
        }
        if (shieldBlockLabel) shieldBlockLabel.classList.toggle('disabled', !canBlockShield);
        const hpModalAc = document.getElementById('hp-modal-ac');
        if (hpModalAc) hpModalAc.innerText = totalAC + (shieldRaised ? shieldBonus : 0);

        const currentMaxHP = getCurrentMaxHP();
        let curHP = parseInt(document.getElementById('in-hp-cur').value);
        
        if (isNaN(curHP)) {
            curHP = currentMaxHP;
            document.getElementById('in-hp-cur').value = curHP;
        }

        if (lastMaxHP > 0 && currentMaxHP !== lastMaxHP) {
            let diff = currentMaxHP - lastMaxHP;
            curHP = Math.max(0, curHP + diff);
            document.getElementById('in-hp-cur').value = curHP;
        }
        
        lastMaxHP = currentMaxHP;
        curHP = Math.min(currentMaxHP, Math.max(0, curHP));
        const hpCurInput = document.getElementById('in-hp-cur');
        if (hpCurInput) {
            hpCurInput.value = curHP;
            hpCurInput.max = currentMaxHP;
            hpCurInput.min = 0;
        }

        const hpPct = currentMaxHP > 0 ? (curHP / currentMaxHP) : 0;
        const hpColor = hpPct <= 0.34 ? 'var(--hp-red)' : (hpPct <= 0.67 ? 'var(--hp-gold)' : 'var(--hp-green)');
        document.getElementById('hp-fill-bar').style.width = (hpPct * 100) + '%';
        document.getElementById('hp-fill-bar').style.background = hpColor;
        const hpIsZero = curHP <= 0;
        const dispHp = document.getElementById('disp-hp');
        if (dispHp) dispHp.innerText = `${hpIsZero ? '💀 ' : ''}${curHP} / ${currentMaxHP} оз`;
        const bannerHpRow = document.querySelector('.banner-hp-row');
        if (bannerHpRow) bannerHpRow.classList.toggle('hp-zero', hpIsZero);
        const hpModalBars = document.querySelector('.hp-modal-bars');
        if (hpModalBars) hpModalBars.classList.toggle('hp-zero', hpIsZero);
        const hpModalNumbers = document.getElementById('hp-modal-numbers');
        const hpModalFill = document.getElementById('hp-modal-fill-bar');
        if (hpModalNumbers) hpModalNumbers.innerText = `${hpIsZero ? '💀 ' : ''}${curHP} / ${currentMaxHP}`;
        if (hpModalFill) {
            hpModalFill.style.width = (hpPct * 100) + '%';
            hpModalFill.style.background = hpColor;
        }
        applyHpKeypadState();

        const exp = parseInt(document.getElementById('in-exp').value) || 0;
        const canLevelUp = exp >= 1000 && lvl < 20;
        const expFill = document.getElementById('exp-fill');
        const expWrap = document.querySelector('.exp-container');
        const lvlUpBtn = document.getElementById('lvl-up-btn');
        const lvlBadge = document.querySelector('.stat-badge.lvl-main');
        const personalityLvlUpBtn = document.getElementById('personality-lvl-up-btn');
        const personalityLevelBadge = document.querySelector('.personality-level-badge');
        if (expFill) {
            expFill.style.width = Math.min(100, exp / 10) + '%';
            expFill.classList.toggle('ready', canLevelUp);
        }
        if (expWrap) expWrap.classList.toggle('levelup-ready', canLevelUp);
        if (lvlBadge) lvlBadge.classList.toggle('levelup-ready', canLevelUp);
        if (personalityLevelBadge) personalityLevelBadge.classList.toggle('levelup-ready', canLevelUp);
        if (lvlUpBtn) {
            lvlUpBtn.style.display = canLevelUp ? 'flex' : 'none';
            lvlUpBtn.classList.toggle('levelup-ready', canLevelUp);
        }
        if (personalityLvlUpBtn) {
            personalityLvlUpBtn.style.display = canLevelUp ? 'flex' : 'none';
            personalityLvlUpBtn.classList.toggle('levelup-ready', canLevelUp);
        }
        const levelUpReadyKey = getLevelUpReadyKey(lvl, exp);
        lastLevelUpReadyKey = levelUpReadyKey;

        document.getElementById('disp-name').innerText = document.getElementById('in-name').value || "Герой";
        document.getElementById('disp-lvl').innerText = lvl;
        updateEquipmentSpeedDisplay();
        document.getElementById('disp-meta').innerText = `${document.getElementById('in-anc').value || 'Народ'} — ${document.getElementById('in-cls').value || 'Класс'}`;
        const personalityName = document.getElementById('personality-profile-name');
        const personalityMeta = document.getElementById('personality-profile-meta');
        const personalityLevel = document.getElementById('personality-level');
        const personalityExpText = document.getElementById('personality-exp-text');
        const personalityExpFill = document.getElementById('personality-exp-fill');
        if (personalityName) personalityName.innerText = document.getElementById('in-name').value || 'Герой';
        if (personalityMeta) personalityMeta.innerText = `${document.getElementById('in-anc').value || 'Народ'} — ${document.getElementById('in-cls').value || 'Класс'}`;
        if (personalityLevel) personalityLevel.innerText = lvl;
        if (personalityExpText) personalityExpText.innerText = `${Math.max(0, exp)} / 1000`;
        if (personalityExpFill) {
            personalityExpFill.style.width = Math.min(100, exp / 10) + '%';
            personalityExpFill.classList.toggle('ready', canLevelUp);
        }
        renderPersonalityNotes();
        renderPersonalitySections();
        
        const dyingUi = document.getElementById('dying-ui');
        if (dyingUi) dyingUi.style.display = (curHP <= 0 && dyingLevel > 0) ? 'block' : 'none';
        updateDyingDots();

        renderAttackMapBar();
        renderAttacks(mods, lvl);
        renderAttackQuickFeats();
        renderAttackConsumables();
        renderFeats();
        renderEquipment();
        renderMagic(mods, lvl);
        syncMobileReorderButtons();
    }

    function toggleShieldRaised() {
        const raised = document.getElementById('shield-raised');
        const block = document.getElementById('use-shield-damage');
        if (raised && block && !raised.checked) block.checked = false;
        saveAll();
    }

    function toggleShieldBlock() {
        const raised = document.getElementById('shield-raised');
        const block = document.getElementById('use-shield-damage');
        if (block && (!raised || !raised.checked || block.disabled)) block.checked = false;
        saveAll();
    }

    function setDyingLevel(val) {
        const before = dyingLevel;
        dyingLevel = (dyingLevel === val) ? val - 1 : val;
        if (dyingLevel <= 0) {
            dyingLevel = 0;
            lastDeathCheck = null;
            if (before > 0) {
                const woundsEl = document.getElementById('in-wounds');
                if (woundsEl) woundsEl.value = Math.min(3, (parseInt(woundsEl.value) || 0) + 1);
            }
        }
        saveAll();
    }

    function updateDeathRollResult() {
        const el = document.getElementById('death-roll-result');
        if (!el) return;

        el.className = 'death-roll-result';
        el.innerHTML = '';

        if (!lastDeathCheck) return;

        el.classList.add('show', lastDeathCheck.className || '');
        el.innerHTML = `${lastDeathCheck.roll} vs ${lastDeathCheck.dc}`;
    }

    function updateDyingDots() {
        for(let i=1; i<=4; i++) document.querySelectorAll(`#d-dot-${i}`).forEach(d => d.classList.toggle('active', i <= dyingLevel));
        const status = document.getElementById('death-status');
        const deathBtn = document.getElementById('death-check-btn');
        if (status) {
            if (dyingLevel >= 4) status.innerHTML = '<div style="color:var(--hp-red); font-weight:900; font-size:24px; animation:flash-red 1s infinite;">ВЫ МЕРТВЫ</div>';
            else status.innerHTML = dyingLevel > 0 ? `<div class="l">Сложность: ${10 + dyingLevel}</div>` : '';
        }
        if (deathBtn) deathBtn.style.display = (dyingLevel >= 4) ? 'none' : 'block';
        updateDeathRollResult();
    }

    function deathCheck() {
        if (dyingLevel <= 0 || dyingLevel >= 4) return;

        const roll = Math.floor(Math.random() * 20) + 1;
        const dc = 10 + dyingLevel;
        const before = dyingLevel;
        let outcome = '';
        let className = '';

        if (roll === 20) {
            dyingLevel = Math.max(0, dyingLevel - 2);
            outcome = 'критический успех';
            className = 'crit-success';
        } else if (roll === 1) {
            dyingLevel = Math.min(4, dyingLevel + 2);
            outcome = 'критический провал';
            className = 'crit-fail';
        } else if (roll >= dc) {
            dyingLevel = Math.max(0, dyingLevel - 1);
            outcome = 'успех';
            className = 'success';
        } else {
            dyingLevel = Math.min(4, dyingLevel + 1);
            outcome = 'провал';
            className = 'fail';
        }

        if (before > 0 && dyingLevel === 0) {
            const woundsEl = document.getElementById('in-wounds');
            if (woundsEl) woundsEl.value = Math.min(3, (parseInt(woundsEl.value) || 0) + 1);
        }

        lastDeathCheck = { roll, dc, outcome, className };
        saveAll();
    }

    function clampPct01(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(1, n));
    }

    function getHpEffectTargets() {
        const modalRoot = document.querySelector('.hp-modal-bars');
        const modalTrack = document.getElementById('hp-modal-fill-bar')?.parentElement;
        const bannerRoot = document.querySelector('.banner-hp-row');
        const bannerTrack = document.getElementById('hp-fill-bar')?.parentElement;
        return [
            modalRoot && modalTrack ? { root: modalRoot, track: modalTrack } : null,
            bannerRoot && bannerTrack ? { root: bannerRoot, track: bannerTrack } : null
        ].filter(Boolean);
    }

    function getShieldEffectTargets() {
        const modalRoot = document.getElementById('hp-modal-shield-block');
        const modalTrack = document.getElementById('hp-modal-shield-fill')?.parentElement;
        const bannerRoot = document.querySelector('.banner-hp-row');
        const bannerTrack = document.getElementById('shield-bar-wrap');
        return [
            modalRoot && modalTrack ? { root: modalRoot, track: modalTrack, shakeRoot: modalRoot } : null,
            bannerRoot && bannerTrack ? { root: bannerRoot, track: bannerTrack, shakeRoot: bannerTrack } : null
        ].filter(Boolean);
    }

    function restartHpAnimation(el, cls, duration = 520) {
        if (!el || !cls) return;
        el.classList.remove('hp-shake-light', 'hp-shake-medium', 'hp-shake-heavy');
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), duration);
    }

    function spawnHpFloat(target, type, amount) {
        const el = target?.root || target;
        if (!el || !amount) return;
        const node = document.createElement('div');
        node.className = `hp-float-number ${type}`;
        node.textContent = `${type === 'heal' ? '+' : '-'}${amount}`;
        el.appendChild(node);
        setTimeout(() => node.remove(), 950);
    }

    function spawnHpTrailParticles(target, type, color, count, fromPct, toPct) {
        const root = target?.root;
        const track = target?.track;
        if (!root || !track || count <= 0) return;

        const rootRect = root.getBoundingClientRect();
        const trackRect = track.getBoundingClientRect();
        if (!rootRect.width || !trackRect.width) return;

        const from = clampPct01(fromPct);
        const to = clampPct01(toPct);
        const startX = trackRect.left - rootRect.left + trackRect.width * from;
        const endX = trackRect.left - rootRect.left + trackRect.width * to;
        const baseY = trackRect.top - rootRect.top + trackRect.height / 2;
        const distance = Math.abs(endX - startX);
        const effectiveCount = Math.max(count, distance > 12 ? Math.ceil(distance / 13) : count);

        for (let i = 0; i < effectiveCount; i++) {
            const t = effectiveCount === 1 ? 1 : i / (effectiveCount - 1);
            const p = document.createElement('span');
            p.className = `hp-particle ${type}`;
            const alongX = startX + (endX - startX) * t;
            const jitterX = Math.round((Math.random() - 0.5) * 7);
            const jitterY = Math.round((Math.random() - 0.5) * 10);
            const flySide = Math.round((Math.random() - 0.5) * 30);
            const flyUp = Math.round(-18 - Math.random() * (type === 'heal' ? 30 : 38));
            const size = Math.round(4 + Math.random() * 3);

            p.style.setProperty('--x', `${alongX + jitterX}px`);
            p.style.setProperty('--y', `${baseY + jitterY}px`);
            p.style.setProperty('--dx', `${flySide}px`);
            p.style.setProperty('--dy', `${flyUp}px`);
            p.style.setProperty('--size', `${size}px`);
            p.style.setProperty('--delay', `${Math.round(i * 18)}ms`);
            p.style.setProperty('--particle-color', color);

            root.appendChild(p);
            setTimeout(() => p.remove(), 980 + i * 18);
        }
    }

    function animateHpChange(type, amount, severityRatio = 0, fromPct = null, toPct = null) {
        if (!amount || amount <= 0) return;
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const targets = getHpEffectTargets();
        const color = type === 'heal'
            ? '#86efac'
            : (getComputedStyle(document.getElementById('hp-fill-bar') || document.documentElement).backgroundColor || '#fca5a5');

        targets.forEach(target => spawnHpFloat(target, type, amount));
        if (reduceMotion) return;

        let shakeClass = '';
        let particles = type === 'heal' ? 6 : 4;
        if (severityRatio >= 1) { shakeClass = type === 'damage' ? 'hp-shake-heavy' : ''; particles = 16; }
        else if (severityRatio >= 0.5) { shakeClass = type === 'damage' ? 'hp-shake-medium' : ''; particles = 12; }
        else if (severityRatio >= 0.25) { shakeClass = type === 'damage' ? 'hp-shake-light' : ''; particles = 8; }

        const hasTrail = Number.isFinite(Number(fromPct)) && Number.isFinite(Number(toPct));
        targets.forEach(target => {
            if (shakeClass) restartHpAnimation(target.shakeRoot || target.root, shakeClass, severityRatio >= 1 ? 620 : 520);
            spawnHpTrailParticles(target, type, color, particles, hasTrail ? fromPct : toPct, hasTrail ? toPct : toPct);
        });
    }

    function animateShieldChange(amount, severityRatio = 0, fromPct = null, toPct = null) {
        if (!amount || amount <= 0) return;
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const targets = getShieldEffectTargets();
        if (!targets.length) return;
        const color = getComputedStyle(document.getElementById('shield-bar-fill') || document.documentElement).backgroundColor || '#60a5fa';
        if (reduceMotion) return;

        let shakeClass = '';
        let particles = 4;
        if (severityRatio >= 1) { shakeClass = 'hp-shake-heavy'; particles = 14; }
        else if (severityRatio >= 0.5) { shakeClass = 'hp-shake-medium'; particles = 10; }
        else if (severityRatio >= 0.25) { shakeClass = 'hp-shake-light'; particles = 7; }
        else { particles = 5; }

        const hasTrail = Number.isFinite(Number(fromPct)) && Number.isFinite(Number(toPct));
        targets.forEach(target => {
            if (shakeClass) restartHpAnimation(target.shakeRoot || target.root, shakeClass, severityRatio >= 1 ? 620 : 520);
            spawnHpTrailParticles(target, 'damage', color, particles, hasTrail ? fromPct : toPct, hasTrail ? toPct : toPct);
        });
    }

    function modHP(dir) {
        const hpCalcEl = document.getElementById('hp-calc-val');
        const hpCurEl = document.getElementById('in-hp-cur');
        let rawVal = parseInt(hpCalcEl?.value) || 0;
        if (rawVal <= 0 || !hpCurEl) return;

        let cur = parseInt(hpCurEl.value) || 0;
        const currentMaxHP = getCurrentMaxHP();
        const hpBefore = cur;
        const hpPctBefore = currentMaxHP > 0 ? clampPct01(hpBefore / currentMaxHP) : 0;
        let animationAmount = rawVal;
        let severityRatio = currentMaxHP > 0 ? rawVal / currentMaxHP : 0;
        let shieldDamageAnimation = null;

        if (dir === -1) {
            let incomingDamage = Math.max(0, rawVal);
            const wasCritDamage = !!document.getElementById('hp-critical-damage')?.checked;
            let effectiveDamage = incomingDamage;
            const massiveDeathLimit = cur + currentMaxHP;

            if (cur <= 0) {
                dyingLevel = Math.min(4, (dyingLevel || (1 + (parseInt(document.getElementById('in-wounds').value)||0))) + 1);
            } else {
                if (document.getElementById('use-shield-damage')?.checked) {
                    const hard = parseInt(document.getElementById('sh-hard').value) || 0;
                    effectiveDamage = Math.max(0, incomingDamage - hard);

                    const shieldHpEl = document.getElementById('sh-hp-cur');
                    const shieldMax = parseInt(document.getElementById('sh-hp-max')?.value) || 0;
                    const shieldPp = Math.floor(shieldMax / 2);
                    const shieldBreakMax = Math.max(0, shieldMax - shieldPp);
                    const shieldDenom = shieldBreakMax > 0 ? shieldBreakMax : Math.max(1, shieldMax);
                    const shieldHpBefore = parseInt(shieldHpEl?.value) || 0;
                    const shieldHpAfter = Math.max(0, shieldHpBefore - effectiveDamage);
                    if (shieldHpEl) shieldHpEl.value = shieldHpAfter;
                    const equippedShield = getEquippedEquipmentItem('shield');
                    if (equippedShield) equippedShield.shield.hpCur = shieldHpAfter;

                    const actualShieldDamage = Math.max(0, shieldHpBefore - shieldHpAfter);
                    if (actualShieldDamage > 0) {
                        const beforeBreak = shieldBreakMax > 0 ? Math.max(0, shieldHpBefore - shieldPp) : shieldHpBefore;
                        const afterBreak = shieldBreakMax > 0 ? Math.max(0, shieldHpAfter - shieldPp) : shieldHpAfter;
                        shieldDamageAnimation = {
                            amount: actualShieldDamage,
                            severityRatio: actualShieldDamage / shieldDenom,
                            fromPct: shieldDenom > 0 ? clampPct01(beforeBreak / shieldDenom) : 0,
                            toPct: shieldDenom > 0 ? clampPct01(afterBreak / shieldDenom) : 0
                        };
                    }
                }

                animationAmount = effectiveDamage;
                severityRatio = currentMaxHP > 0 ? effectiveDamage / currentMaxHP : 0;

                if (effectiveDamage >= massiveDeathLimit) {
                    hpCurEl.value = 0;
                    dyingLevel = 4;
                    lastDeathCheck = null;
                } else {
                    hpCurEl.value = Math.max(0, cur - effectiveDamage);
                    if (parseInt(hpCurEl.value) === 0) {
                        const wounds = parseInt(document.getElementById('in-wounds').value) || 0;
                        dyingLevel = Math.min(4, 1 + wounds + (wasCritDamage ? 1 : 0));
                        lastDeathCheck = null;
                    }
                }
            }

            const shieldBlockEl = document.getElementById('use-shield-damage');
            if (shieldBlockEl) shieldBlockEl.checked = false;
            const critDamageEl = document.getElementById('hp-critical-damage');
            if (critDamageEl) critDamageEl.checked = false;
        } else {
            if (cur <= 0) {
                if (dyingLevel > 0) document.getElementById('in-wounds').value = Math.min(3, (parseInt(document.getElementById('in-wounds').value)||0) + 1);
                dyingLevel = 0;
                lastDeathCheck = null;
            }
            hpCurEl.value = Math.min(currentMaxHP, cur + Math.max(0, rawVal));
            const hpAfterHeal = parseInt(hpCurEl.value) || 0;
            animationAmount = Math.max(0, hpAfterHeal - hpBefore) || rawVal;
            severityRatio = 0;
        }

        const hpAfter = parseInt(hpCurEl.value) || 0;
        const hpPctAfter = currentMaxHP > 0 ? clampPct01(hpAfter / currentMaxHP) : 0;

        if (hpCalcEl) hpCalcEl.value = '';
        clampCurrentHPInput();
        saveAll();
        updateHpKeypadDisplay();
        animateHpChange(dir === -1 ? 'damage' : 'heal', animationAmount, severityRatio, hpPctBefore, hpPctAfter);
        if (shieldDamageAnimation) {
            animateShieldChange(shieldDamageAnimation.amount, shieldDamageAnimation.severityRatio, shieldDamageAnimation.fromPct, shieldDamageAnimation.toPct);
        }
    }


    function resizeDiceLogItem(msg) {
        if (!msg || msg.classList.contains('dice-log-collapsed')) return;
        const maxWidth = Math.max(170, window.innerWidth - 20);
        const minWidth = msg.classList.contains('dice-log-rest') ? 120 : 170;
        const clone = msg.cloneNode(true);
        clone.querySelectorAll('.dice-log-close').forEach(btn => btn.remove());
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.pointerEvents = 'none';
        clone.style.left = '-9999px';
        clone.style.top = '-9999px';
        clone.style.width = 'max-content';
        clone.style.maxWidth = 'none';
        clone.style.minWidth = '0';
        document.body.appendChild(clone);
        const desired = Math.ceil(clone.scrollWidth + 10);
        document.body.removeChild(clone);
        msg.style.width = Math.min(maxWidth, Math.max(minWidth, desired)) + 'px';
    }

    function refreshDiceLogCloseButton() {
        const log = document.getElementById('dice-log');
        if (!log) return;

        log.querySelectorAll('.dice-log-close').forEach(btn => btn.remove());

        const lastMsg = log.lastElementChild;
        if (!lastMsg) return;

        const close = document.createElement('span');
        close.className = 'dice-log-close';
        close.textContent = '✕';
        close.title = 'Очистить все уведомления';
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            log.innerHTML = '';
            notificationsCollapsed = false;
            log.classList.remove('hide-old');
        });
        lastMsg.appendChild(close);
    }

    function appendDiceLog(innerContent, color = 'var(--accent)', extraClass = '') {
        const log = document.getElementById('dice-log');
        if (log.children.length >= 5) { log.removeChild(log.firstChild); }

        Array.from(log.children).forEach(c => c.classList.add('dice-log-collapsed'));

        const msg = document.createElement('div');
        msg.className = `dice-log-item${extraClass ? ' ' + extraClass : ''}`;
        msg.style.borderLeftColor = color;
        if (String(color).includes('hp-gold')) {
            msg.style.boxShadow = '0 0 12px rgba(251, 191, 36, 0.30), 0 4px 16px rgba(0, 0, 0, 0.5)';
        }
        msg.innerHTML = innerContent;

        msg.addEventListener('click', () => {
            notificationsCollapsed = !notificationsCollapsed;
            log.classList.toggle('hide-old', notificationsCollapsed);
        });

        log.appendChild(msg);
        resizeDiceLogItem(msg);
        refreshDiceLogCloseButton();
        log.classList.toggle('hide-old', notificationsCollapsed);
    }

    function appendRestLog(recovery) {
        appendDiceLog(`<div class="dice-log-rest-content">Отдых +${recovery} HP</div>`, 'var(--hp-green)', 'dice-log-rest');
    }

    function toggleAttackTags(id) {
        const row = document.querySelector(`.attack-row[data-atk-id="${id}"]`);
        if (!row) return;
        const expanded = !row.classList.contains('tags-expanded');
        row.classList.toggle('tags-expanded', expanded);
        attackTagsExpandedById[id] = expanded;
        const btn = row.querySelector('.atk-tags-more');
        if (btn) btn.innerText = expanded ? '▲' : '▼';
        updateAttackTagsOverflow();
    }

    function toggleAttackTagsVisibility(id) {
        const row = document.querySelector(`.attack-row[data-atk-id="${id}"]`);
        if (!row) return;
        const hidden = !row.classList.contains('tags-hidden');
        row.classList.toggle('tags-hidden', hidden);
        attackTagsHiddenById[id] = hidden;
        const atk = attacks.find(a => String(a.id) === String(id));
        if (atk) atk.tagsHidden = hidden;
        if (!hidden) delete attackTagsHiddenById[id];
        const btn = row.querySelector('.atk-tags-hide-toggle');
        if (btn) btn.classList.toggle('active', hidden);
        updateAttackTagsOverflow();
        saveAll(false);
    }

    function updateAttackTagsOverflow() {
        document.querySelectorAll('.attack-row').forEach(row => {
            const tags = row.querySelector('.atk-tags');
            const btn = row.querySelector('.atk-tags-more');
            if (!tags || !btn) return;

            const chips = Array.from(tags.querySelectorAll('.atk-tag'));
            const marker = tags.querySelector('.atk-tags-overflow-marker');
            const tagsHidden = row.classList.contains('tags-hidden');
            const expanded = row.classList.contains('tags-expanded');

            chips.forEach(chip => chip.classList.remove('tag-clipped'));
            if (marker) marker.style.display = 'none';

            if (tagsHidden || chips.length === 0) {
                btn.style.display = 'none';
                return;
            }

            if (expanded) {
                btn.style.display = 'inline-flex';
                btn.innerText = '▲';
                return;
            }

            btn.innerText = '▼';

            const tagsRect = tags.getBoundingClientRect();
            if (!tagsRect.width) {
                btn.style.display = 'none';
                return;
            }

            if (!marker) return;

            const probe = tags.cloneNode(true);
            probe.style.position = 'absolute';
            probe.style.left = '-9999px';
            probe.style.top = '-9999px';
            probe.style.visibility = 'hidden';
            probe.style.pointerEvents = 'none';
            probe.style.width = `${tagsRect.width}px`;
            probe.style.maxWidth = `${tagsRect.width}px`;
            probe.style.display = 'flex';
            probe.style.flexWrap = 'wrap';
            probe.style.overflow = 'visible';
            probe.style.whiteSpace = 'nowrap';

            probe.querySelectorAll('.atk-tag').forEach(chip => chip.classList.remove('tag-clipped'));
            const probeMarker = probe.querySelector('.atk-tags-overflow-marker');
            if (probeMarker) probeMarker.style.display = 'none';

            document.body.appendChild(probe);

            const probeChips = Array.from(probe.querySelectorAll('.atk-tag'));
            const firstTop = probeChips[0]?.offsetTop ?? 0;
            let visibleCount = probeChips.findIndex(chip => chip.offsetTop > firstTop + 1);

            if (visibleCount === -1) {
                document.body.removeChild(probe);
                marker.style.display = 'none';
                btn.style.display = 'none';
                chips.forEach(chip => chip.classList.remove('tag-clipped'));
                return;
            }

            if (probeMarker) probeMarker.style.display = 'inline-flex';
            probeChips.forEach((chip, i) => {
                chip.classList.toggle('tag-clipped', i >= visibleCount);
            });

            while (
                probeMarker &&
                visibleCount > 0 &&
                probeMarker.offsetTop > firstTop + 1
            ) {
                visibleCount -= 1;
                probeChips[visibleCount].classList.add('tag-clipped');
            }

            const markerFits = !probeMarker || probeMarker.offsetTop <= firstTop + 1;
            document.body.removeChild(probe);

            btn.style.display = 'inline-flex';
            marker.style.display = markerFits ? 'inline-flex' : 'none';
            chips.forEach((chip, i) => {
                chip.classList.toggle('tag-clipped', i >= visibleCount);
            });
        });
    }

    function formatNotificationLabel(label, maxLen = 30) {
        let clean = String(label ?? '').replace(/\s*\(Попадание\)\s*/gi, '').replace(/\s+/g, ' ').trim();
        if (clean.length > maxLen) clean = clean.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
        return clean;
    }

    function buildRollLogMarkup(label, equation, total, valStyle) {
        const displayLabel = escapeHtml(formatNotificationLabel(label));
        const eq = equation ? `(${escapeHtml(equation)})` : '';
        const totalStyle = valStyle ? ` style="${valStyle}"` : '';
        return `<div class="dice-log-stack"><div class="dice-log-text"><div class="dice-log-title">${displayLabel}</div><div class="dice-log-formula-inline">${eq}</div></div><div class="dice-log-result"><span class="log-total"${totalStyle}>${total}</span></div></div>`;
    }

    function normalizeDiceFormulaText(value) {
        return String(value || '').toLowerCase().replace(/d/g, 'к').replace(/\s+/g, '');
    }

    function rollFormula(label, formula, color = 'var(--accent)') {
        let clean = normalizeDiceFormulaText(formula);
        const directBonus = clean.match(/[+-]\d+/);
        if (!/[к]/.test(clean) && directBonus) clean = `к20${directBonus[0]}`;
        const diceMatches = [...clean.matchAll(/([+-]?)(\d*)к(\d+)/g)];
        if (!diceMatches.length) {
            appendDiceLog(`<div class="dice-log-rest-content">${escapeHtml(label || 'Бросок')} не формула</div>`, 'var(--hp-red)', 'dice-log-rest');
            return null;
        }
        let total = 0;
        diceMatches.forEach(match => {
            const sign = match[1] === '-' ? -1 : 1;
            const count = Math.max(1, Math.min(100, parseInt(match[2]) || 1));
            const faces = Math.max(2, Math.min(1000, parseInt(match[3]) || 20));
            for (let i = 0; i < count; i++) total += sign * (Math.floor(Math.random() * faces) + 1);
        });
        const withoutDice = clean.replace(/([+-]?)(\d*)к(\d+)/g, '');
        (withoutDice.match(/[+-]?\d+/g) || []).forEach(n => { total += parseInt(n) || 0; });
        appendDiceLog(buildRollLogMarkup(label || 'Бросок', clean, total, `color:${color}; font-size:32px; font-weight:900;`), color);
        return total;
    }

    function rollAttackNoteButton(btn) {
        const label = btn.textContent.trim() || 'Бросок';
        rollFormula(label, btn.dataset.roll || label, 'var(--accent)');
    }

    function toggleAttackDiceWheel(force) {
        const wheel = document.getElementById('attack-dice-wheel');
        if (!wheel) return;
        const open = typeof force === 'boolean' ? force : !wheel.classList.contains('open');
        wheel.classList.toggle('open', open);
        document.getElementById('attack-dice-fab')?.classList.toggle('active', open);
        if (!open) {
            attackDiceSelection = {};
            renderAttackDiceWheel();
        }
    }

    function addAttackDie(faces) {
        if (attackDiceSuppressClick) {
            attackDiceSuppressClick = false;
            return;
        }
        attackDiceSelection[faces] = (attackDiceSelection[faces] || 0) + 1;
        renderAttackDiceWheel();
    }

    function removeAttackDie(faces) {
        if (!attackDiceSelection[faces]) return;
        attackDiceSelection[faces] -= 1;
        if (attackDiceSelection[faces] <= 0) delete attackDiceSelection[faces];
        renderAttackDiceWheel();
    }

    function startAttackDieHold(event, faces) {
        if (event.button !== undefined && event.button !== 0) return;
        clearTimeout(attackDiceHoldTimer);
        attackDiceSuppressClick = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        attackDiceHoldTimer = setTimeout(() => {
            removeAttackDie(faces);
            attackDiceSuppressClick = true;
        }, 520);
    }

    function endAttackDieHold(event) {
        clearTimeout(attackDiceHoldTimer);
        event.currentTarget?.releasePointerCapture?.(event.pointerId);
    }

    function getAttackDiceFormula() {
        return [2,4,6,8,10,12,20,100]
            .filter(faces => attackDiceSelection[faces] > 0)
            .map(faces => `${attackDiceSelection[faces] > 1 ? attackDiceSelection[faces] : ''}к${faces}`)
            .join('+');
    }

    function renderAttackDiceWheel() {
        const formula = getAttackDiceFormula();
        document.querySelectorAll('.attack-dice-choice').forEach(btn => {
            const count = attackDiceSelection[btn.dataset.die] || 0;
            btn.classList.toggle('selected', count > 0);
            const small = btn.querySelector('small');
            if (small) small.innerText = count > 1 ? count : '';
        });
        const center = document.querySelector('.attack-dice-center');
        if (center) {
            center.classList.toggle('ready', !!formula);
            center.innerText = formula ? 'Бросить' : '×';
        }
        const summary = document.getElementById('attack-dice-summary');
        if (summary) summary.innerText = formula;
    }

    function commitAttackDiceWheel() {
        const formula = getAttackDiceFormula();
        if (!formula) {
            toggleAttackDiceWheel(false);
            return;
        }
        rollFormula('Кубики', formula, 'var(--accent)');
        toggleAttackDiceWheel(false);
    }

    function rollDice(label, bonusOrRoll) {
        let total, equation;
        let isNat20 = false, isNat1 = false;
        
        if (typeof bonusOrRoll === 'string' && (bonusOrRoll.includes('+') || bonusOrRoll.includes('-'))) {
            const d20 = Math.floor(Math.random() * 20) + 1;
            if (d20 === 20) isNat20 = true;
            if (d20 === 1) isNat1 = true;
            const b = parseInt(bonusOrRoll) || 0;
            total = d20 + b;
            equation = `к20${b >= 0 ? '+' : ''}${b}`;
        } else if (typeof bonusOrRoll === 'number') {
            total = bonusOrRoll;
            equation = '';
            if (label.includes('Death Check') || label.includes('d20')) {
                if (total === 20) isNat20 = true;
                if (total === 1) isNat1 = true;
            }
        } else { 
            total = bonusOrRoll;
            equation = '';
        }

        let valStyle = 'color:#ffffff; font-size:32px; font-weight:800;';
        let borderColor = 'var(--accent)';
        if (isNat20) { 
            valStyle = 'color:var(--hp-gold); font-size:36px; font-weight:900; text-shadow:0 0 8px rgba(251,191,36,0.6);'; 
            borderColor = 'var(--hp-gold)'; 
        } else if (isNat1) { 
            valStyle = 'color:var(--hp-red); font-size:36px; font-weight:900; text-shadow:0 0 8px rgba(239,68,68,0.6);'; 
            borderColor = 'var(--hp-red)'; 
        }

        appendDiceLog(buildRollLogMarkup(label, equation, total, valStyle), borderColor);
    }

    function rollAttack(atkId, name, bonusOrRoll) {
        const atk = attacks.find(a => String(a.id) === String(atkId));
        if (!spendAmmoForAttack(atk, true)) return;
        let total, equation;
        let isNat20 = false, isNat1 = false;

        if (typeof bonusOrRoll === 'string' && (bonusOrRoll.includes('+') || bonusOrRoll.includes('-'))) {
            const d20 = Math.floor(Math.random() * 20) + 1;
            const b = parseInt(bonusOrRoll) || 0;
            total = d20 + b;
            equation = `к20${b >= 0 ? '+' : ''}${b}`;
            isNat20 = d20 === 20;
            isNat1 = d20 === 1;
        } else if (typeof bonusOrRoll === 'number') {
            total = bonusOrRoll;
            equation = '';
            if (total === 20) isNat20 = true;
            if (total === 1) isNat1 = true;
        } else {
            total = bonusOrRoll;
            equation = '';
        }

        let valStyle = 'color:#ffffff; font-size:32px; font-weight:800;';
        let borderColor = 'var(--accent)';
        if (isNat20) {
            valStyle = 'color:var(--hp-gold); font-size:36px; font-weight:900; text-shadow:0 0 8px rgba(251,191,36,0.6);';
            borderColor = 'var(--hp-gold)';
            activeCritAttacks[atkId] = true;
            calculate();
        } else if (isNat1) {
            valStyle = 'color:var(--hp-red); font-size:36px; font-weight:900; text-shadow:0 0 8px rgba(239,68,68,0.6);';
            borderColor = 'var(--hp-red)';
            activeCritAttacks[atkId] = false;
            calculate();
        }

        appendDiceLog(buildRollLogMarkup(name, equation, total, valStyle), borderColor);
        advanceAttackMapPenalty();
        calculate();
    }

    function getEquipmentAmmoLabel(item) {
        const weapon = item?.weapon || {};
        return getAmmoItemLabel(weapon.ammoItemId, weapon.ammoName || 'Снаряды');
    }

    function getAttackAmmoLabel(atk) {
        return getAmmoItemLabel(atk?.ammoItemId, atk?.ammoName || 'Снаряды');
    }

    function getAmmoItemById(ammoItemId) {
        const id = String(ammoItemId || '');
        return equipmentItems.find(item => String(item.id) === id && item.itemType === 'consumable' && item.consumable?.type === 'ammo') || null;
    }

    function getAmmoItemLabel(ammoItemId, fallback = 'Снаряды') {
        const item = getAmmoItemById(ammoItemId);
        return item?.name || fallback || 'Снаряды';
    }

    function getAmmoItemQuantity(ammoItemId) {
        const item = getAmmoItemById(ammoItemId);
        return item ? Math.max(0, parseInt(item.quantity) || 0) : 0;
    }

    function adjustAmmoItem(ammoItemId, delta, fallbackLabel = 'Снаряды') {
        const idx = equipmentItems.findIndex(item => String(item.id) === String(ammoItemId) && item.itemType === 'consumable' && item.consumable?.type === 'ammo');
        if (idx < 0) {
            appendDiceLog(`<div class="dice-log-rest-content">${escapeHtml(fallbackLabel)} не выбраны</div>`, 'var(--hp-red)', 'dice-log-rest');
            return false;
        }
        const item = equipmentItems[idx];
        const qty = Math.max(0, parseInt(item.quantity) || 0);
        if (delta < 0 && qty < Math.abs(delta)) {
            appendDiceLog(`<div class="dice-log-rest-content">${escapeHtml(item.name || fallbackLabel)} закончились</div>`, 'var(--hp-red)', 'dice-log-rest');
            return false;
        }
        equipmentItems[idx] = normalizeEquipmentItem({ ...item, quantity: qty + delta });
        return true;
    }

    function spendAmmoForAttack(atk, silentWhenOk = false) {
        if (!atk) return true;
        if (atk.equipmentSourceId) {
            const sourceItem = equipmentItems.find(item => String(item.id) === String(atk.equipmentSourceId));
            if (sourceItem?.weapon?.chargesEnabled) return spendEquipmentCharge(atk.equipmentSourceId, silentWhenOk);
            if (atk.equipmentRange === 'ranged') return spendEquipmentAmmo(atk.equipmentSourceId, silentWhenOk);
            return true;
        }
        if (atk.range === 'ranged' && atk.chargesEnabled) return spendAttackCharge(atk.id, silentWhenOk);
        if (atk.range === 'ranged') return spendAttackAmmo(atk.id, silentWhenOk);
        return true;
    }

    function hasAttackCharges(atk) {
        return atk?.range === 'ranged' && !!atk.chargesEnabled;
    }

    function hasEquipmentCharges(item) {
        return item?.weapon?.range === 'ranged' && !!item?.weapon?.chargesEnabled;
    }

    function getChargeNumbers(source) {
        const max = Math.max(1, parseInt(source?.chargeMax) || 1);
        const current = Math.max(0, Math.min(max, parseInt(source?.chargeCurrent) || 0));
        return { max, current };
    }

    function renderChargeControls(source, id, kind) {
        const charges = getChargeNumbers(source);
        const clickFn = kind === 'equipment' ? 'toggleEquipmentChargeSlot' : 'toggleAttackChargeSlot';
        const body = charges.max <= 5
            ? `<span class="attack-charge-dots">${Array.from({ length: charges.max }, (_, i) => `<button type="button" class="attack-charge-dot ${i < charges.current ? 'active' : ''}" onclick="event.stopPropagation(); ${clickFn}('${id}', ${i})" title="${i < charges.current ? 'Потратить заряд' : 'Зарядить за снаряд'}"></button>`).join('')}</span>`
            : `<button type="button" class="attack-charge-count" onclick="event.stopPropagation(); fillAllCharges('${id}', '${kind}')" title="Дозарядить до максимума">${charges.current}/${charges.max}</button><button type="button" class="attack-ammo-use" onclick="event.stopPropagation(); spendOneCharge('${id}', '${kind}')" title="Убрать 1 заряд">-</button>`;
        return body;
    }

    function fillAllCharges(id, kind) {
        if (kind === 'equipment') fillAllEquipmentCharges(id);
        else fillAllAttackCharges(id);
    }

    function spendOneCharge(id, kind) {
        if (kind === 'equipment') spendEquipmentCharge(id);
        else spendAttackCharge(id);
    }

    function toggleAttackChargeSlot(atkId, slotIndex) {
        const atk = attacks.find(a => String(a.id) === String(atkId));
        if (!hasAttackCharges(atk)) return;
        const charges = getChargeNumbers(atk);
        if (slotIndex < charges.current) spendAttackCharge(atkId);
        else fillAttackCharge(atkId);
    }

    function toggleEquipmentChargeSlot(itemId, slotIndex) {
        const item = equipmentItems.find(x => String(x.id) === String(itemId));
        if (!hasEquipmentCharges(item)) return;
        const charges = getChargeNumbers(item.weapon);
        if (slotIndex < charges.current) spendEquipmentCharge(itemId);
        else fillEquipmentCharge(itemId);
    }

    function spendAttackCharge(atkId, silentWhenOk = false) {
        const atk = attacks.find(a => String(a.id) === String(atkId));
        if (!hasAttackCharges(atk)) return true;
        const charges = getChargeNumbers(atk);
        if (charges.current <= 0) {
            appendDiceLog('<div class="dice-log-rest-content">Заряды пустые</div>', 'var(--hp-red)', 'dice-log-rest');
            return false;
        }
        atk.chargeCurrent = charges.current - 1;
        saveAll(false);
        if (!silentWhenOk) calculate();
        return true;
    }

    function fillAttackCharge(atkId) {
        const atk = attacks.find(a => String(a.id) === String(atkId));
        if (!hasAttackCharges(atk)) return;
        const charges = getChargeNumbers(atk);
        if (charges.current >= charges.max) {
            appendDiceLog('<div class="dice-log-rest-content">Заряды полные</div>', 'var(--hp-gold)', 'dice-log-rest');
            return;
        }
        if (!spendAttackAmmo(atkId, true)) return;
        atk.chargeCurrent = charges.current + 1;
        saveAll(false);
        calculate();
    }

    function fillAllAttackCharges(atkId) {
        const atk = attacks.find(a => String(a.id) === String(atkId));
        if (!hasAttackCharges(atk)) return;
        const charges = getChargeNumbers(atk);
        const need = charges.max - charges.current;
        if (need <= 0) return;
        const ammo = getAmmoItemQuantity(atk.ammoItemId);
        const add = Math.min(need, ammo);
        if (add <= 0) {
            appendDiceLog(`<div class="dice-log-rest-content">${escapeHtml(getAttackAmmoLabel(atk))} закончились</div>`, 'var(--hp-red)', 'dice-log-rest');
            return;
        }
        if (!adjustAmmoItem(atk.ammoItemId, -add, getAttackAmmoLabel(atk))) return;
        atk.chargeCurrent = charges.current + add;
        saveAll(false);
        calculate();
    }

    function spendAttackAmmo(atkId, silentWhenOk = false) {
        const atk = attacks.find(a => String(a.id) === String(atkId));
        if (!atk || atk.range !== 'ranged') return true;
        if (!adjustAmmoItem(atk.ammoItemId, -1, getAttackAmmoLabel(atk))) return false;
        saveAll(false);
        if (!silentWhenOk) calculate();
        return true;
    }

    function restoreAttackAmmo(atkId) {
        const atk = attacks.find(a => String(a.id) === String(atkId));
        if (!atk) return;
        if (!adjustAmmoItem(atk.ammoItemId, 1, getAttackAmmoLabel(atk))) return;
        saveAll(false);
        calculate();
    }

    function spendEquipmentAmmo(itemId, silentWhenOk = false) {
        const idx = equipmentItems.findIndex(item => String(item.id) === String(itemId));
        if (idx < 0) return false;
        const item = equipmentItems[idx];
        const weapon = item.weapon || {};
        if (weapon.range !== 'ranged') return true;
        if (!adjustAmmoItem(weapon.ammoItemId, -1, getEquipmentAmmoLabel(item))) return false;
        saveAll(false);
        if (silentWhenOk) renderEquipment();
        else calculate();
        return true;
    }

    function spendEquipmentCharge(itemId, silentWhenOk = false) {
        const idx = equipmentItems.findIndex(item => String(item.id) === String(itemId));
        if (idx < 0) return false;
        const item = equipmentItems[idx];
        const weapon = item.weapon || {};
        if (!hasEquipmentCharges(item)) return true;
        const charges = getChargeNumbers(weapon);
        if (charges.current <= 0) {
            appendDiceLog('<div class="dice-log-rest-content">Заряды пустые</div>', 'var(--hp-red)', 'dice-log-rest');
            return false;
        }
        equipmentItems[idx] = normalizeEquipmentItem({ ...item, weapon: { ...weapon, chargeCurrent: charges.current - 1 } });
        saveAll(false);
        if (!silentWhenOk) calculate();
        return true;
    }

    function fillEquipmentCharge(itemId) {
        const idx = equipmentItems.findIndex(item => String(item.id) === String(itemId));
        if (idx < 0) return;
        const item = equipmentItems[idx];
        const weapon = item.weapon || {};
        if (!hasEquipmentCharges(item)) return;
        const charges = getChargeNumbers(weapon);
        if (charges.current >= charges.max) {
            appendDiceLog('<div class="dice-log-rest-content">Заряды полные</div>', 'var(--hp-gold)', 'dice-log-rest');
            return;
        }
        if (!spendEquipmentAmmo(itemId, true)) return;
        const fresh = equipmentItems.find(x => String(x.id) === String(itemId));
        const freshIdx = equipmentItems.findIndex(x => String(x.id) === String(itemId));
        if (freshIdx < 0 || !fresh) return;
        equipmentItems[freshIdx] = normalizeEquipmentItem({ ...fresh, weapon: { ...fresh.weapon, chargeCurrent: charges.current + 1 } });
        saveAll(false);
        calculate();
    }

    function fillAllEquipmentCharges(itemId) {
        const idx = equipmentItems.findIndex(item => String(item.id) === String(itemId));
        if (idx < 0) return;
        const item = equipmentItems[idx];
        const weapon = item.weapon || {};
        if (!hasEquipmentCharges(item)) return;
        const charges = getChargeNumbers(weapon);
        const need = charges.max - charges.current;
        if (need <= 0) return;
        const ammo = getAmmoItemQuantity(weapon.ammoItemId);
        const add = Math.min(need, ammo);
        if (add <= 0) {
            appendDiceLog(`<div class="dice-log-rest-content">${escapeHtml(getEquipmentAmmoLabel(item))} закончились</div>`, 'var(--hp-red)', 'dice-log-rest');
            return;
        }
        if (!adjustAmmoItem(weapon.ammoItemId, -add, getEquipmentAmmoLabel(item))) return;
        equipmentItems[idx] = normalizeEquipmentItem({ ...item, weapon: { ...weapon, chargeCurrent: charges.current + add } });
        saveAll(false);
        calculate();
    }

    function restoreEquipmentAmmo(itemId) {
        const idx = equipmentItems.findIndex(item => String(item.id) === String(itemId));
        if (idx < 0) return;
        const item = equipmentItems[idx];
        const weapon = item.weapon || {};
        if (!adjustAmmoItem(weapon.ammoItemId, 1, getEquipmentAmmoLabel(item))) return;
        saveAll(false);
        calculate();
    }

    function rollDamage(atkId, name, isCrit) {
        const atk = attacks.find(a => a.id === atkId);
        if(!atk) return;

        let formula = (isCrit && atk.crit) ? atk.crit : atk.dmg;
        let typeLabel = isCrit ? "КРИТ УРОН" : "Урон";
        const displayName = formatNotificationLabel(name);
        const damageColor = isCrit ? 'var(--hp-gold)' : 'var(--hp-red)';

        let f = formula.toLowerCase().replace(/d/g, 'к').replace(/\s/g, '');
        let total = 0;
        let rollsHTML = '';
        let msgStr = '';

        // Базовая логика парсинга кубов. Можно писать и 1к8, и просто к8.
        let match = f.match(/(\d*)к(\d+)([+-]\d+)?/);

        if(match) {
            let count = parseInt(match[1]) || 1;
            let faces = parseInt(match[2]) || 8;
            let mod = parseInt(match[3]) || 0;

            let rolls = [];
            for(let i=0; i<count; i++) {
                let r = Math.floor(Math.random() * faces) + 1;
                rolls.push(r);
                total += r;
            }
            total += mod;
            const visibleCount = match[1] ? String(count) : '';
            rollsHTML = `${visibleCount}к${faces}${mod !== 0 ? (mod > 0 ? '+'+mod : mod) : ''}`;
            msgStr = buildRollLogMarkup(name, rollsHTML, total, `color:${damageColor}; font-size:32px; font-weight:900;`);
        } else {
            msgStr = buildRollLogMarkup(name, String(formula || ''), escapeHtml(formula || '—'), `color:${damageColor}; font-weight:900;`);
        }

        appendDiceLog(msgStr, damageColor);

        // Автоматическое отключение крита после нажатия
        if(isCrit) {
            activeCritAttacks[atkId] = false;
            calculate();
        }
    }

    // Включение/отключение режима крита в строке
    function toggleCritMode(atkId) {
        activeCritAttacks[atkId] = !activeCritAttacks[atkId];
        calculate();
    }

    let draggedAtkIdx = null;
    function atkDragStart(e, idx) {
        if (attackDeleteSelectMode || window.innerWidth < 1000) { e.preventDefault(); return; }
        draggedAtkIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => e.target.style.opacity = '0.5', 0);
    }
    function atkDragEnd(e) { e.target.style.opacity = '1'; draggedAtkIdx = null; }
    function atkDragOver(e) {
        if (attackDeleteSelectMode) return;
        e.preventDefault();
    }
    function atkDrop(e, targetIdx) {
        if (attackDeleteSelectMode) return;
        e.preventDefault();
        if (draggedAtkIdx === null || draggedAtkIdx === targetIdx) return;
        const item = attacks.splice(draggedAtkIdx, 1)[0];
        attacks.splice(targetIdx, 0, item);
        saveAll(); draggedAtkIdx = null;
    }

    function syncAttackDeleteButton() {
        const btn = document.querySelector('.attack-delete-btn');
        if (!btn) return;
        btn.classList.toggle('active', attackDeleteSelectMode);
        btn.innerText = attackDeleteSelectMode ? 'ОТМЕНА' : 'УДАЛИТЬ';
    }

    function clearAttackRuntimeState(id) {
        delete activeCritAttacks[id];
        delete attackTagsHiddenById[id];
        delete attackTagsExpandedById[id];
    }

    function toggleAttackDeleteMode() {
        if (!attacks.length) {
            attackDeleteSelectMode = false;
            syncAttackDeleteButton();
            return;
        }
        attackDeleteSelectMode = !attackDeleteSelectMode;
        if (attackDeleteSelectMode) { mobileReorderMode = null; selectedMobileReorder = null; }
        calculate();
    }

    function deleteSelectedAttack(id) {
        if (!attackDeleteSelectMode) return;
        const atk = attacks.find(a => a.id === id);
        if (atk?.equipmentSourceId) {
            appendDiceLog('<div class="dice-log-rest-content">Это часть снаряжения</div>', 'var(--hp-gold)', 'dice-log-rest');
            attackDeleteSelectMode = false;
            saveAll();
            return;
        }
        attacks = attacks.filter(a => a.id !== id);
        clearAttackRuntimeState(id);
        attackDeleteSelectMode = false;
        saveAll();
    }

    function renderAttacks(mods, lvl) {
        const list = document.getElementById('attacks-list');
        if(!list) return;
        list.innerHTML = '';

        attacks.forEach((atk, idx) => {
            let m = mods[atk.stat] || 0;
            let iBonus = parseInt(atk.item) || 0;
            let profBonus = getWeaponProficiencyBonusForAttack(atk, lvl);
            let baseHit = m + profBonus + iBonus;
            let mapPenalty = getAttackMapTotalPenalty(atk);
            let totalHit = baseHit + mapPenalty;
            let hitStr = (totalHit >= 0 ? '+' : '') + totalHit;
            let hitTitle = mapPenalty ? `title="База ${formatSignedNumber(baseHit)}, штраф ${formatSignedNumber(mapPenalty)}"` : '';

            let isCritActive = activeCritAttacks[atk.id] || false;
            let currentDmgFormula = (isCritActive && atk.crit) ? atk.crit : (atk.dmg || '—');
            let displayName = escapeHtml(atk.name || 'Атака') + (atk.equipmentSourceId ? ' <span title="Из снаряжения">🎒</span>' : '');
            let displayType = escapeHtml(atk.type || '');
            let dmgTypeClass = getAttackDamageTypeClass(atk.type);
            let dmgTypeHTML = displayType ? `<div class="atk-dmg-type ${dmgTypeClass}">${displayType}</div>` : '';
            const sourceItem = atk.equipmentSourceId ? equipmentItems.find(item => String(item.id) === String(atk.equipmentSourceId)) : null;
            const chargeHTML = hasEquipmentCharges(sourceItem)
                ? renderChargeControls(sourceItem.weapon, sourceItem.id, 'equipment')
                : (hasAttackCharges(atk) ? renderChargeControls(atk, atk.id, 'attack') : '');
            const ammoHTML = sourceItem?.weapon?.range === 'ranged'
                ? `<div class="attack-ammo-row"><span>${escapeHtml(getEquipmentAmmoLabel(sourceItem))}: ${getAmmoItemQuantity(sourceItem.weapon.ammoItemId)}</span>${chargeHTML}</div>`
                : (atk.range === 'ranged'
                    ? `<div class="attack-ammo-row"><span>${escapeHtml(getAttackAmmoLabel(atk))}: ${getAmmoItemQuantity(atk.ammoItemId)}</span>${chargeHTML}</div>`
                    : '');

            let tagsHTML = '';
            if(atk.tags) {
                atk.tags.split(',').forEach(t => {
                    const clean = t.trim();
                    if(clean) tagsHTML += `<span class="atk-tag" data-atk-tag-chip>${escapeHtml(clean)}</span>`;
                });
            }
            const tagsExpanded = !!attackTagsExpandedById[atk.id];
            const tagsMoreBtn = tagsHTML ? `<button type="button" class="atk-tags-more" onclick="event.stopPropagation(); toggleAttackTags(${atk.id})">${tagsExpanded ? '▲' : '▼'}</button>` : '';

            const deleteSelectClass = attackDeleteSelectMode ? 'delete-select' : '';
            const reorderActive = mobileReorderMode === 'attacks';
            const picked = reorderActive && selectedMobileReorder && selectedMobileReorder.type === 'attacks' && selectedMobileReorder.idx === idx;
            const rowClick = attackDeleteSelectMode ? `onclick="deleteSelectedAttack(${atk.id})"` : (reorderActive ? `onclick="handleReorderTap(event, 'attacks', ${idx})"` : '');
            const nameClick = reorderActive ? '' : `onclick="openAttackModal(${atk.id})"`;
            const tagsHideClick = reorderActive ? '' : `onclick="event.stopPropagation(); toggleAttackTagsVisibility(${atk.id})"`;
            const critClick = reorderActive ? '' : `onclick="toggleCritMode(${atk.id})"`;
            const hitClick = reorderActive ? '' : `onclick="rollAttack(${atk.id}, '${jsEscape(atk.name || 'Атака')}', '${jsEscape(hitStr)}')"`;
            const dmgClick = reorderActive ? '' : `onclick="rollDamage(${atk.id}, '${jsEscape(atk.name || 'Атака')}', ${isCritActive})"`;

            const tagsHidden = !!(atk.tagsHidden || attackTagsHiddenById[atk.id]);
            list.innerHTML += `
            <div class="attack-row ${tagsExpanded ? 'tags-expanded' : ''} ${tagsHidden ? 'tags-hidden' : ''} ${deleteSelectClass} ${picked ? 'reorder-picked' : ''}" data-atk-id="${atk.id}" data-reorder-type="attacks" data-reorder-index="${idx}" draggable="${(!attackDeleteSelectMode && !reorderActive && window.innerWidth >= 1000) ? 'true' : 'false'}" ${rowClick} ondragstart="atkDragStart(event, ${idx})" ondragend="atkDragEnd(event)" ondragover="atkDragOver(event)" ondrop="atkDrop(event, ${idx})">
                <div class="attack-main">
                    <div class="atk-drag">☰</div>
                    <div class="atk-content">
                        <div class="atk-top-row">
                            <div class="atk-name" ${nameClick}>${displayName}</div>
                            <div class="atk-top-actions">
                                ${tagsMoreBtn ? `<div style="margin-right:2px;">${tagsMoreBtn}</div>` : ''}
                                <div class="atk-tags-hide-toggle ${tagsHidden ? 'active' : ''}" ${tagsHideClick} title="Скрыть/показать хэштеги">...</div>
                                <div class="atk-crit-toggle ${isCritActive ? 'active' : ''}" ${critClick} title="Крит">К</div>
                            </div>
                        </div>
                        <div class="atk-actions">
                            <div class="atk-btn-hit ${getAttackMapButtonClass()}" ${hitTitle} ${hitClick}>${hitStr}</div>
                            ${dmgTypeHTML}
                            <div class="atk-btn-dmg ${isCritActive ? 'crit-active' : ''}" style="${isCritActive ? 'border-color:rgba(251, 191, 36, 0.9); color:#fde68a; font-weight:900; box-shadow: 0 0 10px rgba(251, 191, 36, 0.45), 0 0 22px rgba(251, 191, 36, 0.2);' : ''}" ${dmgClick}>${escapeHtml(currentDmgFormula)}</div>
                        </div>
                    </div>
                </div>
                ${tagsHTML ? `<div class="atk-tags">${tagsHTML}<span class="atk-tags-overflow-marker">. . .</span></div>` : ''}
                ${ammoHTML}
            </div>
            `;
        });
        updateAttackTagsOverflow();
        syncAttackDeleteButton();
        syncMobileReorderButtons();
    }

    function addNewAttack() {
        attackDeleteSelectMode = false;
        mobileReorderMode = null;
        attacks.push({
            id: Date.now(),
            name: "Новая атака",
            stat: "str",
            weaponGroup: "unarmed",
            prof: 0,
            item: 0,
            mapPenalty: getAttackMapPenaltyPerDot(),
            dmg: "1к8",
            crit: "",
            type: "Дробящий",
            tags: "",
            range: "melee",
            ammoItemId: "",
            chargesEnabled: false,
            chargeMax: 1,
            chargeCurrent: 0,
            tagsHidden: false
        });
        saveAll();
    }

    function deleteLastAttack() {
        toggleAttackDeleteMode();
    }

    function openAttackModal(id) {
        if (mobileReorderMode === 'attacks' || suppressNextClickAfterReorder) return;
        const atk = attacks.find(a => a.id === id);
        if(!atk) return;
        if (atk.equipmentSourceId) {
            openEquipmentEditor(atk.equipmentSourceId);
            return;
        }
        document.getElementById('atk-id').value = atk.id;
        document.getElementById('atk-name').value = atk.name || '';
        document.getElementById('atk-stat').value = atk.stat || 'str';
        document.getElementById('atk-weapon-group').value = normalizeWeaponGroup(atk.weaponGroup);
        document.getElementById('atk-item').value = atk.item || '0';
        document.getElementById('atk-map-penalty').value = getAttackMapPenaltyForAttack(atk);
        document.getElementById('atk-dmg').value = (atk.dmg || '').replace(/d/gi, 'к');
        document.getElementById('atk-crit').value = (atk.crit || '').replace(/d/gi, 'к');
        const typeSel = document.getElementById('atk-type');
        if (typeSel) typeSel.value = ATTACK_DAMAGE_TYPES.includes(atk.type) ? atk.type : 'Дробящий';
        setAttackRange(atk.range || 'melee');
        renderAmmoSelectOptions('atk-ammo-item', atk.ammoItemId || '');
        document.getElementById('atk-charges-enabled').checked = !!atk.chargesEnabled;
        document.getElementById('atk-charge-max').value = atk.chargeMax ?? 1;
        document.getElementById('atk-charge-current').value = atk.chargeCurrent ?? 0;
        syncAttackChargeSection();
        setAttackTagsFromString(atk.tags || '');
        toggleAttackTagsSection(false);
        syncAttackModalMapPenaltyField();
        openModal('attackModal');
        updateAttackTagsOverflow();
    }

    function saveAttack() {
        const id = parseInt(document.getElementById('atk-id').value);
        const atk = attacks.find(a => a.id === id);
        if(!atk) return;
        atk.name = document.getElementById('atk-name').value;
        atk.stat = document.getElementById('atk-stat').value;
        atk.weaponGroup = document.getElementById('atk-weapon-group').value;
        atk.prof = 0;
        atk.item = document.getElementById('atk-item').value;
        atk.mapPenalty = normalizeAttackMapPenaltyValue(document.getElementById('atk-map-penalty').value);
        atk.dmg = document.getElementById('atk-dmg').value.replace(/d/gi, 'к');
        atk.crit = document.getElementById('atk-crit').value.replace(/d/gi, 'к');
        atk.type = document.getElementById('atk-type').value || 'Дробящий';
        atk.range = document.getElementById('atk-range').value || 'melee';
        atk.ammoItemId = document.getElementById('atk-ammo-item').value;
        atk.chargesEnabled = !!document.getElementById('atk-charges-enabled').checked;
        atk.chargeMax = Math.max(1, parseInt(document.getElementById('atk-charge-max').value) || 1);
        atk.chargeCurrent = Math.max(0, Math.min(atk.chargeMax, parseInt(document.getElementById('atk-charge-current').value) || 0));
        atk.tags = getAttackTagsAsString();
        saveAll();
        closeModal('attackModal');
    }

    function deleteAttack() {
        const id = parseInt(document.getElementById('atk-id').value);
        const atk = attacks.find(a => a.id === id);
        if (atk?.equipmentSourceId) {
            appendDiceLog('<div class="dice-log-rest-content">Это часть снаряжения</div>', 'var(--hp-gold)', 'dice-log-rest');
            closeModal('attackModal');
            return;
        }
        attacks = attacks.filter(a => a.id !== id);
        clearAttackRuntimeState(id);
        attackDeleteSelectMode = false;
        saveAll();
        closeModal('attackModal');
    }

    function openAbilityModal(name, key) {
        document.getElementById('ab-modal-title').innerText = name;
        document.getElementById('ab-modal-key').value = key;
        document.getElementById('ab-modal-val').value = abilities[key] ?? document.getElementById(`score-${key}`).value;
        document.getElementById('ab-modal-half').checked = partialBoosts[key];
        document.getElementById('ab-modal-lores').style.display = key === 'int' ? 'block' : 'none';
        if(key === 'int') { document.getElementById('in-lore-1').value = lores[1]; document.getElementById('in-lore-2').value = lores[2]; document.getElementById('in-lore-3').value = lores[3]; }
        openModal('abilityModal');
        previewAbilityModal();
    }

    function applyAbilityScoreToUI(key, value) {
        const num = parseInt(value) || 0;
        abilities[key] = num;
        const scoreEl = document.getElementById(`score-${key}`);
        if (scoreEl) scoreEl.value = num;
        const dispEl = document.getElementById(`disp-score-${key}`);
        if (dispEl) dispEl.innerText = (num >= 0 ? '+' : '') + num;
    }

    function previewAbilityModal() {
        const keyEl = document.getElementById('ab-modal-key');
        const valEl = document.getElementById('ab-modal-val');
        if (!keyEl || !valEl) return;
        const key = keyEl.value;
        applyAbilityScoreToUI(key, valEl.value);
        partialBoosts[key] = document.getElementById('ab-modal-half').checked;
        if (key === 'int') {
            lores[1] = document.getElementById('in-lore-1').value;
            lores[2] = document.getElementById('in-lore-2').value;
            lores[3] = document.getElementById('in-lore-3').value;
        }
        calculate();
    }

    function saveAbilityModal() {
        let key = document.getElementById('ab-modal-key').value;
        applyAbilityScoreToUI(key, document.getElementById('ab-modal-val').value);
        partialBoosts[key] = document.getElementById('ab-modal-half').checked;
        if (key === 'int') { lores[1] = document.getElementById('in-lore-1').value; lores[2] = document.getElementById('in-lore-2').value; lores[3] = document.getElementById('in-lore-3').value; }
        saveAll();
        init();
        loadAll();
        closeModal('abilityModal');
    }

    function openSkillModal(id, label) {
        document.getElementById('sk-modal-title').innerText = label;
        document.getElementById('sk-modal-id').value = id;
        document.getElementById('sk-modal-item').value = itemBonuses[id] || 0;
        openModal('skillModal');
    }

    function saveSkillModal() {
        itemBonuses[document.getElementById('sk-modal-id').value] = parseInt(document.getElementById('sk-modal-item').value) || 0;
        saveAll(); closeModal('skillModal');
    }

    function levelUp() {
        const lvlEl = document.getElementById('in-lvl');
        const expEl = document.getElementById('in-exp');
        if (!lvlEl || !expEl) return;
        const currentLvl = clampLevel(lvlEl.value);
        const currentExp = parseInt(expEl.value) || 0;
        if (currentLvl >= 20 || currentExp < 1000) return;
        const nextLvl = Math.min(20, currentLvl + 1);
        primeLevelUpMotion();
        lvlEl.value = nextLvl;
        expEl.value = Math.max(0, currentExp - 1000);
        saveAll();
        appendLevelUpDoneLog(nextLvl);
        pulseLevelUpVisuals('done');
    }

    function characterSheetKey(id) { return `pf2_character_${id}_sheet`; }
    function characterAvatarKey(id) { return `pf2_character_${id}_avatar`; }
    function storageBackupKey(key) { return `${key}__backup`; }

    function parseStorageJSON(raw, fallback = null) {
        if (!raw) return fallback;
        try { return JSON.parse(raw); } catch (e) { return fallback; }
    }

    function safeStorageSet(key, value, makeBackup = true) {
        const previous = localStorage.getItem(key);
        if (makeBackup && previous !== null && previous !== value) {
            try { localStorage.setItem(storageBackupKey(key), previous); } catch (e) { console.warn('Не удалось обновить резервную копию', key, e); }
        }
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.warn('Не удалось записать localStorage', key, e);
            try {
                localStorage.removeItem(storageBackupKey(key));
                localStorage.setItem(key, value);
                return true;
            } catch (e2) {
                console.warn('Не удалось записать localStorage после очистки резерва', key, e2);
                return false;
            }
        }
    }

    function safeStorageRemove(key) {
        try { localStorage.removeItem(key); localStorage.removeItem(storageBackupKey(key)); } catch (e) { console.warn('Не удалось удалить localStorage', key, e); }
    }

    function readStorageJSONWithBackup(key, fallback = null) {
        const raw = localStorage.getItem(key);
        const parsed = parseStorageJSON(raw, null);
        if (parsed !== null) return parsed;
        const backupRaw = localStorage.getItem(storageBackupKey(key));
        const backup = parseStorageJSON(backupRaw, null);
        if (backup !== null) {
            console.warn('Восстановлено сохранение из резервной копии', key);
            safeStorageSet(key, JSON.stringify(backup), false);
            return backup;
        }
        return fallback;
    }

    function normalizeCharacterList(list) {
        if (!Array.isArray(list)) return [];
        const used = new Set();
        return list
            .filter(ch => ch && ch.id && !used.has(String(ch.id)) && used.add(String(ch.id)))
            .slice(0, MAX_CHARACTERS)
            .map(ch => ({
                id: String(ch.id),
                name: String(ch.name || 'Герой'),
                meta: String(ch.meta || 'Народ — Класс 1'),
                updatedAt: Number(ch.updatedAt || Date.now()),
                cloud: !!ch.cloud
            }));
    }

    function readCharacters() {
        return normalizeCharacterList(readStorageJSONWithBackup(CHARACTERS_KEY, []));
    }

    function writeCharacters() {
        const ok = safeStorageSet(CHARACTERS_KEY, JSON.stringify(normalizeCharacterList(characters)));
        if (!ok) showStorageErrorOnce('Не удалось сохранить список персонажей: хранилище браузера заполнено. Экспортируй важного персонажа в JSON.');
        return ok;
    }

    function readCharacterSheet(id) {
        return readStorageJSONWithBackup(characterSheetKey(id), null);
    }

    function writeCharacterSheet(id, sheet) {
        const ok = safeStorageSet(characterSheetKey(id), JSON.stringify(sheet));
        if (!ok) showStorageErrorOnce('Не удалось сохранить лист: хранилище браузера заполнено. Экспортируй персонажа в JSON или освободи место.');
        return ok;
    }

    function showStorageErrorOnce(message) {
        const now = Date.now();
        if (now - lastStorageAlertAt > 5000) {
            lastStorageAlertAt = now;
            alert(message);
        }
    }

    function makeCharacterId() {
        return `c${Date.now()}${Math.floor(Math.random() * 1000)}`;
    }

    function isUuid(id) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
    }

    function getRoute() {
        const hash = window.location.hash || '';
        if (hash.startsWith(ROUTE_CHARACTER_PREFIX)) {
            return { view: 'character', id: decodeURIComponent(hash.slice(ROUTE_CHARACTER_PREFIX.length)) };
        }
        return { view: 'menu', id: null };
    }

    function setRoute(view, id = null, replace = false) {
        const hash = view === 'character' && id ? `${ROUTE_CHARACTER_PREFIX}${encodeURIComponent(id)}` : ROUTE_MENU_HASH;
        const url = `${window.location.pathname}${window.location.search}${hash}`;
        const state = { pf2Route: true, view, id: id || null };
        try {
            if (replace || window.location.hash === hash) window.history.replaceState(state, document.title, url);
            else window.history.pushState(state, document.title, url);
        } catch (e) {
            console.warn('Не удалось обновить историю браузера', e);
            if (window.location.hash !== hash) window.location.hash = hash;
        }
    }

    async function applyRouteFromLocation(replace = false) {
        const route = getRoute();
        if (route.view === 'character' && route.id && characters.some(ch => String(ch.id) === String(route.id))) {
            await selectCharacter(route.id, { fromRoute: true, replaceRoute: replace });
        } else {
            await openCharacterMenu({ fromRoute: true, replaceRoute: replace });
        }
        document.body.classList.remove('app-booting');
        appRouteReady = true;
    }

    function updateCloudAuthUI(message = '') {
        const authStatus = document.getElementById('cloud-auth-status');
        const syncStatus = document.getElementById('cloud-sync-status');
        const loginBtn = document.getElementById('cloud-login-btn');
        const logoutBtn = document.getElementById('cloud-logout-btn');
        const userName = cloudUser?.user_metadata?.name || cloudUser?.email || '';
        if (authStatus) authStatus.innerText = cloudUser ? `Облако: ${userName}` : 'Локальное сохранение';
        if (syncStatus) syncStatus.innerText = message || (cloudUser ? 'Персонажи синхронизируются с Supabase' : 'Войдите через Google для синхронизации');
        if (loginBtn) loginBtn.style.display = cloudUser ? 'none' : '';
        if (logoutBtn) logoutBtn.style.display = cloudUser ? '' : 'none';
        setCloudAuthPanelOpen(cloudAuthPanelOpen);
    }

    function setCloudAuthPanelOpen(open) {
        cloudAuthPanelOpen = !!open;
        const bar = document.getElementById('cloud-auth-bar');
        const toggle = document.getElementById('cloud-panel-toggle');
        if (bar) bar.classList.toggle('open', cloudAuthPanelOpen);
        if (toggle) {
            toggle.classList.toggle('active', cloudAuthPanelOpen);
            toggle.setAttribute('aria-expanded', cloudAuthPanelOpen ? 'true' : 'false');
        }
    }

    function toggleCloudAuthPanel() {
        setCloudAuthPanelOpen(!cloudAuthPanelOpen);
    }

    function setCloudSyncStatus(message) {
        const syncStatus = document.getElementById('cloud-sync-status');
        if (syncStatus) syncStatus.innerText = message;
    }

    function getOAuthRedirectUrl() {
        const url = new URL(window.location.href);
        return `${url.origin}${url.pathname}`;
    }

    function clearOAuthReturnParams() {
        const url = new URL(window.location.href);
        let changed = false;
        ['code', 'state', 'error', 'error_code', 'error_description', 'scope', 'authuser', 'prompt'].forEach(key => {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        });
        if (url.hash) {
            url.hash = '';
            changed = true;
        }
        if (changed) window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }

    function getSheetUpdatedAt(sheet) {
        const ts = Number(sheet?.[LOCAL_SHEET_UPDATED_AT_KEY] || 0);
        return Number.isFinite(ts) ? ts : 0;
    }

    async function finishOAuthReturnIfNeeded() {
        const url = new URL(window.location.href);
        const authCode = url.searchParams.get('code');
        const authError = url.searchParams.get('error_description') || url.searchParams.get('error');
        if (authError) {
            updateCloudAuthUI(`Ошибка входа: ${authError}`);
            clearOAuthReturnParams();
            return;
        }
        if (!authCode || !supabaseClient) return;
        setCloudSyncStatus('Завершаю вход...');
        const { data, error } = await supabaseClient.auth.exchangeCodeForSession(authCode);
        if (error) {
            console.warn('Supabase OAuth callback error', error);
            updateCloudAuthUI('Не удалось завершить вход через Google');
            clearOAuthReturnParams();
            return;
        }
        cloudUser = data?.session?.user || cloudUser;
        clearOAuthReturnParams();
    }

    async function initSupabase() {
        if (!window.supabase?.createClient) {
            updateCloudAuthUI('Supabase недоступен, работает локальное сохранение');
            return;
        }
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
        });
        await finishOAuthReturnIfNeeded();
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.warn('Supabase session error', error);
            updateCloudAuthUI('Не удалось проверить вход, работаем локально');
            return;
        }
        cloudUser = data?.session?.user || null;
        updateCloudAuthUI();
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            cloudUser = session?.user || null;
            if (!cloudUser && event !== 'SIGNED_OUT') {
                updateCloudAuthUI('Войдите через Google для синхронизации');
                characters = readCharacters();
                renderCharacterMenu();
                return;
            }
            updateCloudAuthUI(cloudUser ? 'Загружаю персонажей...' : 'Вы вышли, включено локальное сохранение');
            if (cloudUser) await loadCloudCharacters(true);
            else {
                characters = readCharacters();
                renderCharacterMenu();
            }
        });
        if (cloudUser) await loadCloudCharacters(false);
    }

    async function signInWithGoogle() {
        if (!supabaseClient) {
            alert('Supabase не загрузился. Проверь интернет и открой страницу заново.');
            return;
        }
        setCloudSyncStatus('Открываю вход через Google...');
        const options = {
            redirectTo: getOAuthRedirectUrl(),
            queryParams: { prompt: 'select_account' },
            skipBrowserRedirect: true
        };
        const { data, error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options });
        if (error) {
            console.warn('Google sign in error', error);
            alert('Не удалось открыть вход через Google.');
            return;
        }
        if (data?.url) {
            window.location.assign(data.url);
        } else {
            alert('Supabase не вернул ссылку для входа через Google.');
        }
    }

    async function signOutCloud() {
        if (!supabaseClient) return;
        await flushCloudSave();
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.warn('Supabase sign out error', error);
            alert('Не удалось выйти из аккаунта.');
            return;
        }
        cloudUser = null;
        characters = readCharacters();
        updateCloudAuthUI();
        renderCharacterMenu();
    }

    function cloudRowToCharacter(row) {
        const sheet = normalizeLoadedSheet(row.sheet || {});
        const meta = getCharacterMetaFromSheet(sheet);
        return {
            id: row.id,
            name: row.name || meta.name,
            meta: meta.meta,
            updatedAt: row.updated_at ? Date.parse(row.updated_at) || Date.now() : Date.now(),
            cloud: true
        };
    }

    function cacheCloudRows(rows) {
        const localOrder = readCharacters().map(ch => String(ch.id));
        const orderedRows = rows.slice().sort((a, b) => {
            const ai = localOrder.indexOf(String(a.id));
            const bi = localOrder.indexOf(String(b.id));
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
        const cloudCharacters = orderedRows.slice(0, MAX_CHARACTERS).map(row => {
            const cloudSheet = normalizeLoadedSheet(row.sheet || {});
            let localSheet = null;
            localSheet = readCharacterSheet(row.id);
            const localUpdatedAt = getSheetUpdatedAt(localSheet);
            const cloudUpdatedAt = row.updated_at ? Date.parse(row.updated_at) || 0 : 0;
            const shouldKeepLocal = localUpdatedAt > cloudUpdatedAt;
            const sheet = shouldKeepLocal ? normalizeLoadedSheet(localSheet || cloudSheet) : cloudSheet;
            writeCharacterSheet(row.id, sheet);
            if (row.avatar) safeStorageSet(characterAvatarKey(row.id), row.avatar, false);
            else safeStorageRemove(characterAvatarKey(row.id));
            if (shouldKeepLocal) return { ...cloudRowToCharacter(row), ...getCharacterMetaFromSheet(sheet), updatedAt: localUpdatedAt };
            return cloudRowToCharacter(row);
        });
        characters = cloudCharacters;
        writeCharacters();
    }

    async function uploadLocalCharactersToCloud(localList, freeSlots) {
        const uploaded = [];
        for (const ch of localList.slice(0, freeSlots)) {
            let sheet = null;
            sheet = normalizeLoadedSheet(readCharacterSheet(ch.id) || createBlankSheetData(ch.name || 'Герой'));
            const avatar = localStorage.getItem(characterAvatarKey(ch.id)) || '';
            const row = await createCloudCharacter(sheet, avatar);
            if (row) uploaded.push(row);
        }
        return uploaded;
    }

    async function loadCloudCharacters(reloadCurrent = true) {
        if (!supabaseClient || !cloudUser) return;
        cloudLoading = true;
        const localBeforeCloud = readCharacters().filter(ch => !isUuid(ch.id));
        setCloudSyncStatus('Загружаю персонажей...');
        const { data, error } = await supabaseClient
            .from('characters')
            .select('id,name,sheet,avatar,updated_at')
            .order('updated_at', { ascending: false });
        cloudLoading = false;
        if (error) {
            console.warn('Supabase load characters error', error);
            updateCloudAuthUI('Не удалось загрузить облако, открыт локальный кэш');
            characters = readCharacters();
            renderCharacterMenu();
            return;
        }
        let rows = data || [];
        if (localBeforeCloud.length && rows.length < MAX_CHARACTERS) {
            setCloudSyncStatus('Переношу локальных персонажей в облако...');
            const uploaded = await uploadLocalCharactersToCloud(localBeforeCloud, MAX_CHARACTERS - rows.length);
            rows = [...uploaded, ...rows].slice(0, MAX_CHARACTERS);
        }
        cacheCloudRows(rows);
        const savedActive = localStorage.getItem(ACTIVE_CHARACTER_KEY);
        if (!activeCharacterId && savedActive && characters.some(ch => String(ch.id) === String(savedActive))) activeCharacterId = savedActive;
        if (!activeCharacterId || !characters.some(ch => String(ch.id) === String(activeCharacterId))) activeCharacterId = characters[0]?.id || null;
        if (activeCharacterId) safeStorageSet(ACTIVE_CHARACTER_KEY, activeCharacterId, false);
        updateCloudAuthUI('Облако загружено');
        renderCharacterMenu();
        if (reloadCurrent && activeCharacterId && !document.body.classList.contains('main-menu-open')) loadAll(false);
        if (appRouteReady && document.body.classList.contains('main-menu-open')) applyRouteFromLocation(true);
    }

    async function createCloudCharacter(sheet, avatar = '') {
        if (!supabaseClient || !cloudUser) return null;
        const meta = getCharacterMetaFromSheet(sheet);
        const { data, error } = await supabaseClient
            .from('characters')
            .insert({ user_id: cloudUser.id, name: meta.name, sheet, avatar })
            .select('id,name,sheet,avatar,updated_at')
            .single();
        if (error) {
            console.warn('Supabase create character error', error);
            alert('Не удалось создать персонажа в облаке. Создам локально.');
            return null;
        }
        return data;
    }

    async function ensureCloudCharacter(id, sheet, avatar = '') {
        if (!cloudUser || !supabaseClient) return id;
        if (isUuid(id)) return id;
        const row = await createCloudCharacter(sheet, avatar);
        if (!row) return id;
        const oldId = id;
        const newId = row.id;
        writeCharacterSheet(newId, normalizeLoadedSheet(row.sheet || sheet));
        if (avatar || row.avatar) safeStorageSet(characterAvatarKey(newId), row.avatar || avatar, false);
        characters = characters.map(ch => String(ch.id) === String(oldId) ? cloudRowToCharacter(row) : ch);
        if (String(activeCharacterId) === String(oldId)) activeCharacterId = newId;
        safeStorageSet(ACTIVE_CHARACTER_KEY, activeCharacterId || '', false);
        writeCharacters();
        return newId;
    }

    function scheduleCloudSave(sheet = null) {
        if (cloudLoading || !cloudUser || !supabaseClient || !activeCharacterId) return;
        clearTimeout(cloudSyncTimer);
        const id = activeCharacterId;
        const payload = sheet || captureSheetState();
        cloudSyncTimer = setTimeout(() => saveCharacterToCloud(id, payload), 700);
    }

    async function flushCloudSave() {
        if (!cloudSyncTimer) return;
        clearTimeout(cloudSyncTimer);
        cloudSyncTimer = null;
        if (cloudUser && supabaseClient && activeCharacterId) await saveCharacterToCloud(activeCharacterId, captureSheetState());
    }

    async function saveCharacterToCloud(id, sheet) {
        if (!cloudUser || !supabaseClient || !id) return;
        setCloudSyncStatus('Сохраняю...');
        const avatar = localStorage.getItem(characterAvatarKey(id)) || '';
        const cloudId = await ensureCloudCharacter(id, sheet, avatar);
        const meta = getCharacterMetaFromSheet(sheet);
        const { error } = await supabaseClient
            .from('characters')
            .update({ name: meta.name, sheet, avatar, updated_at: new Date().toISOString() })
            .eq('id', cloudId);
        if (error) {
            console.warn('Supabase save character error', error);
            updateCloudAuthUI('Не удалось сохранить в облако, локальная копия сохранена');
            return;
        }
        const idx = characters.findIndex(ch => String(ch.id) === String(cloudId));
        if (idx >= 0) characters[idx] = { ...characters[idx], ...meta, updatedAt: Date.now(), cloud: true };
        writeCharacters();
        updateCloudAuthUI('Сохранено в облако');
        renderCharacterMenu();
    }

    function createBlankSheetData(name = 'Новый герой') {
        const defaultLevel = 1;
        const defaultCon = 0;
        const defaultAncestryHP = 8;
        const defaultClassHP = 10;
        const defaultMaxHP = Math.max(0, defaultAncestryHP + (defaultClassHP + defaultCon) * defaultLevel);
        return {
            skillProf: {}, saveProf: {}, heroPoints: 0, itemBonuses: {}, lores: { 1: '', 2: '', 3: '' },
            abilities: { str: 0, dex: 0, con: defaultCon, int: 0, wis: 0, cha: 0 },
            partialBoosts: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
            dyingLevel: 0, firstRun: true, attacks: [], attackTagsHiddenById: {}, attackNotes: '', attackQuickFeatIds: [],
            attackQuickFeatSelectionCustom: false, attackMapPenaltyCount: 0, attackCourageCount: 0,
            attackMapSettings: { enabled: true, penalty: -5 }, attackDcSettings: { stat: 'str', bonus: 0 }, lastDeathCheck: null,
            spells: [], spellSlotsSpent: {}, spellSettings: { traditions: { arcane: false, occult: false, primal: false, divine: false }, castingType: 'prepared', stat: 'int', prof: 0, item: 0, focusMax: 1, focusSpent: 0 },
            proficiencies: { armor: {}, weapon: {} },
            feats: {}, myFeats: [], currentFeatTab: 'my',
            equipmentItems: [], equipmentBackpack: [], equipmentSettings: { backpackEnabled: false, bulkBonus: 0, coins: { pp: 0, gp: 0, sp: 0, cp: 0 } }, currentEquipmentTab: 'carried',
            headerCollapsed: false, hpKeypadOpen: false, personalitySectionCollapsed: { origin: false, personality: false, proficiency: false },
            'persona-ethnos': '', 'persona-nationality': '', 'persona-birthplace': '', 'persona-age': '',
            'persona-gender': '', 'persona-height': '', 'persona-weight': '', 'persona-appearance': '',
            'persona-attitude': '', 'persona-deity': '', 'persona-edicts': '', 'persona-anathema': '',
            'persona-likes': '', 'persona-dislikes': '', 'persona-catchphrases': '',
            'persona-note-1': '', 'persona-note-2': '', 'persona-note-3': '', 'persona-note-4': '',
            'persona-note-5': '', 'persona-note-6': '',
            'prof-languages': '',
            'in-name': name, 'in-anc': '', 'in-cls': '', 'in-lvl': defaultLevel, 'in-speed': 25, 'in-exp': 0,
            'in-hp-cur': defaultMaxHP, 'in-hp-anc': defaultAncestryHP, 'in-hp-cls': defaultClassHP, 'in-wounds': 0,
            'in-ac-item': 0, 'in-ac-pen': 0, 'in-ac-cap': 0, 'in-ac-prof': 0,
            'use-magic': false, 'use-focus': false, 'focus-points-max': 1, 'has-shield': false, 'sh-bonus': 0, 'sh-hard': 0, 'sh-hp-max': 0, 'sh-hp-cur': 0,
            'shield-raised': false, 'use-shield-damage': false, 'hp-critical-damage': false
        };
    }

    function resetSheetRuntimeState() {
        skillProf = {}; saveProf = { fort: 0, ref: 0, will: 0, perc: 0 };
        heroPoints = 0; itemBonuses = {}; lores = { 1: '', 2: '', 3: '' };
        abilities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
        partialBoosts = { str: false, dex: false, con: false, int: false, wis: false, cha: false };
        dyingLevel = 0; firstRun = true; lastDeathCheck = null; attacks = []; activeCritAttacks = {};
        attackTagsHiddenById = {}; attackNotes = ''; attackQuickFeatIds = []; attackQuickFeatSelectionCustom = false;
        attackTagsExpanded = false; attackMapPenaltyCount = 0; attackCourageCount = 0; attackMapSettings = { enabled: true, penalty: -5 }; attackDcSettings = { stat: 'str', bonus: 0 };
        notificationsCollapsed = false; headerCollapsed = false; hpKeypadOpen = false; mobileReorderMode = null;
        selectedMobileReorder = null; feats = {}; myFeats = []; currentFeatTab = 'my';
        equipmentItems = []; equipmentBackpack = []; equipmentSettings = { backpackEnabled: false, bulkBonus: 0, coins: { pp: 0, gp: 0, sp: 0, cp: 0 } }; currentEquipmentTab = 'carried';
        proficiencies = { armor: {}, weapon: {} };
        spells = []; spellSlotsSpent = {}; spellSettings = { traditions: { arcane: false, occult: false, primal: false, divine: false }, castingType: 'prepared', stat: 'int', prof: 0, item: 0, focusMax: 1, focusSpent: 0 }; currentSpellId = null;
        personalitySectionCollapsed = { origin: false, personality: false, proficiency: false }; currentPersonalityNoteIndex = 1;
    }

    function fieldElements(id) {
        const safe = (window.CSS && CSS.escape) ? CSS.escape(id) : String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return Array.from(document.querySelectorAll(`[id="${safe}"]`));
    }

    function setFieldValueAll(id, value) {
        fieldElements(id).forEach(el => {
            if (el.type === 'checkbox') el.checked = !!value;
            else el.value = value ?? '';
        });
    }

    function getPreferredField(id) {
        const els = fieldElements(id).filter(el => el.type !== 'file');
        return els.find(el => el.offsetParent !== null || el.getClientRects().length) || els[0] || null;
    }

    function getFieldValue(id) {
        const el = getPreferredField(id);
        if (!el) return '';
        return el.type === 'checkbox' ? !!el.checked : el.value;
    }

    function applySheetDataToFields(s) {
        Object.entries(s || {}).forEach(([k, v]) => {
            if (fieldElements(k).length) setFieldValueAll(k, v);
        });
        Object.keys(abilities).forEach(key => setFieldValueAll(`score-${key}`, abilities[key] ?? 0));
    }

    function captureSheetState() {
        normalizeEquipmentData();
        const savedAttacks = attacks.filter(a => !a.equipmentSourceId);
        const hiddenTagsSnapshot = { ...attackTagsHiddenById };
        attacks.forEach(a => {
            if (a?.tagsHidden) hiddenTagsSnapshot[a.id] = true;
        });
        normalizeSpellData();
        const s = { skillProf, saveProf, heroPoints, itemBonuses, lores, abilities, partialBoosts, dyingLevel, firstRun, attacks: savedAttacks, attackTagsHiddenById: hiddenTagsSnapshot, attackNotes, attackQuickFeatIds, attackQuickFeatSelectionCustom, attackMapPenaltyCount, attackCourageCount, attackMapSettings, attackDcSettings: normalizeAttackDcSettings(attackDcSettings), proficiencies: normalizeProficiencies(proficiencies), spells, spellSlotsSpent, spellSettings: normalizeSpellSettings(spellSettings), lastDeathCheck, feats, myFeats, currentFeatTab, equipmentItems, equipmentBackpack, equipmentSettings, currentEquipmentTab, headerCollapsed, hpKeypadOpen, personalitySectionCollapsed };
        const ids = new Set();
        document.querySelectorAll('input, select, textarea').forEach(el => {
            if (!el.id || el.type === 'file' || ids.has(el.id)) return;
            ids.add(el.id);
            s[el.id] = getFieldValue(el.id);
        });
        s[LOCAL_SHEET_UPDATED_AT_KEY] = Date.now();
        return s;
    }

    function normalizeLoadedSheet(s) {
        s = s || createBlankSheetData();
        return { ...createBlankSheetData(s['in-name'] || 'Герой'), ...s };
    }

    function repairLoadedFeats() {
        myFeats.forEach(item => {
            if (item.showInAttacks && item.sourceSlotId && feats[item.sourceSlotId]) feats[item.sourceSlotId].showInAttacks = true;
            if (item.showInAttacks === undefined) item.showInAttacks = false;
        });
        if (feats['lvl1-origin-features'] && !feats['lvl1-ancestry-feature']) feats['lvl1-ancestry-feature'] = feats['lvl1-origin-features'];
        if (feats['lvl1-class-start'] && !feats['lvl1-class-feat']) feats['lvl1-class-feat'] = feats['lvl1-class-start'];
    }


    function getCharacterMetaFromSheet(s) {
        const name = String(s?.['in-name'] || '').trim() || 'Герой';
        const anc = String(s?.['in-anc'] || '').trim() || 'Народ';
        const cls = String(s?.['in-cls'] || '').trim() || 'Класс';
        const lvl = clampLevel(s?.['in-lvl'] || 1);
        return { name, meta: `${anc} — ${cls} ${lvl}`, updatedAt: Date.now() };
    }

    function getCharacterHPFromSheet(s) {
        const lvl = clampLevel(s?.['in-lvl'] || 1);
        const con = parseInt(s?.abilities?.con) || 0;
        const anc = parseInt(s?.['in-hp-anc']) || 0;
        const cls = parseInt(s?.['in-hp-cls']) || 0;
        const max = Math.max(0, anc + (cls + con) * lvl);
        let cur = parseInt(s?.['in-hp-cur']);
        if (!Number.isFinite(cur)) cur = max;
        cur = Math.max(0, Math.min(max, cur));
        return { cur, max };
    }

    function getCharacterHPColorClass(hp) {
        const pct = hp?.max > 0 ? hp.cur / hp.max : 0;
        if (pct <= 0.34) return 'hp-bad';
        if (pct <= 0.67) return 'hp-warn';
        return 'hp-good';
    }

    function updateActiveCharacterMeta(s = null) {
        if (!activeCharacterId) return;
        const idx = characters.findIndex(c => String(c.id) === String(activeCharacterId));
        if (idx < 0) return;
        const sheet = s || captureSheetState();
        const { avatar, ...rest } = characters[idx];
        characters[idx] = { ...rest, ...getCharacterMetaFromSheet(sheet) };
        writeCharacters();
    }

    function migrateCharacterStorage() {
        characters = readCharacters();
        if (characters.length) return;
        const legacy = localStorage.getItem(LEGACY_SHEET_KEY);
        if (!legacy) return;
        const id = makeCharacterId();
        const avatar = localStorage.getItem(LEGACY_AVATAR_KEY) || '';
        let sheet = {};
        try { sheet = normalizeLoadedSheet(JSON.parse(legacy)); } catch(e) { sheet = createBlankSheetData('Герой'); }
        writeCharacterSheet(id, sheet);
        if (avatar) safeStorageSet(characterAvatarKey(id), avatar, false);
        characters = [{ id, ...getCharacterMetaFromSheet(sheet) }];
        activeCharacterId = id;
        writeCharacters();
        safeStorageSet(ACTIVE_CHARACTER_KEY, id, false);
    }

    function renderCharacterMenu() {
        const list = document.getElementById('character-list');
        const delBtn = document.getElementById('character-delete-btn');
        const uploadBtn = document.getElementById('character-upload-btn');
        const countEl = document.getElementById('character-count');
        if (!list) return;
        if (!characters.length && characterDeleteSelectMode) {
            characterDeleteSelectMode = false;
            mobileReorderMode = null;
            selectedMobileReorder = null;
        }
        if (countEl) countEl.innerText = `${characters.length}/${MAX_CHARACTERS}`;
        if (uploadBtn) {
            const canAdd = characters.length < MAX_CHARACTERS;
            uploadBtn.disabled = !canAdd;
            uploadBtn.title = canAdd ? 'Загрузить персонажа' : 'Достигнут лимит персонажей';
        }
        if (delBtn) {
            const hasCharacters = characters.length > 0;
            if (!hasCharacters) characterDeleteSelectMode = false;
            delBtn.disabled = !hasCharacters;
            delBtn.classList.toggle('active', hasCharacters && characterDeleteSelectMode);
            delBtn.innerText = '✕';
            delBtn.title = hasCharacters ? (characterDeleteSelectMode ? 'Отменить удаление' : 'Удалить персонажа') : 'Нет персонажей для удаления';
        }
        const reorderActive = mobileReorderMode === 'characters';
        const addCardHtml = (!characterDeleteSelectMode && !reorderActive && characters.length < MAX_CHARACTERS)
            ? `<button type="button" class="character-add-card" onclick="addCharacter()" title="Добавить персонажа"><span class="character-add-avatar">+</span></button>`
            : '';
        if (!characters.length) {
            list.innerHTML = addCardHtml;
            syncMobileReorderButtons();
            return;
        }
        list.innerHTML = characters.map((ch, idx) => {
            const avatarData = localStorage.getItem(characterAvatarKey(ch.id)) || ch.avatar || '';
            const avatar = avatarData ? `<img src="${avatarData}" alt="">` : '👤';
            const picked = reorderActive && selectedMobileReorder && selectedMobileReorder.type === 'characters' && selectedMobileReorder.idx === idx;
            const cls = `${characterDeleteSelectMode ? 'delete-select' : ''} ${picked ? 'reorder-picked' : ''}`.trim();
            const click = characterDeleteSelectMode ? `deleteCharacter('${ch.id}')` : (reorderActive ? `handleReorderTap(event, 'characters', ${idx})` : `selectCharacter('${ch.id}')`);
            const sheet = readCharacterSheet(ch.id);
            const meta = sheet ? getCharacterMetaFromSheet(sheet) : { name: ch.name || 'Герой', meta: ch.meta || 'Народ — Класс 1' };
            const hp = sheet ? getCharacterHPFromSheet(sheet) : { cur: 0, max: 0 };
            const hpClass = getCharacterHPColorClass(hp);
            const draggable = (!characterDeleteSelectMode && !reorderActive && window.innerWidth >= 1000) ? 'true' : 'false';
            const dragHandleClick = window.innerWidth < 1000 ? `handleCharacterDragHandleClick(event, ${idx})` : `event.stopPropagation()`;
            const dragHandleTitle = window.innerWidth < 1000 ? 'Нажми для перемещения' : 'Зажми и перетащи';
            return `<div class="character-card ${cls}" data-reorder-type="characters" data-reorder-index="${idx}" onclick="${click}" ondragover="characterDragOver(event)" ondrop="characterDrop(event, ${idx})"><div class="character-drag" draggable="${draggable}" onclick="${dragHandleClick}" ondragstart="characterDragStart(event, ${idx})" ondragend="characterDragEnd(event)" title="${dragHandleTitle}">☰</div><div class="character-avatar">${avatar}</div><div class="character-text"><div class="character-name">${escapeHtml(meta.name || ch.name || 'Герой')}</div><div class="character-meta">${escapeHtml(meta.meta || 'Народ — Класс 1')}</div><div class="character-hp ${hpClass}"><span class="character-hp-value">${hp.cur}/${hp.max}</span></div></div><div class="character-card-actions"><button type="button" class="character-json-btn" onclick="exportCharacterJSON('${ch.id}', event)" title="Сохранить JSON"><span class="character-btn-icon">💾</span></button><button type="button" class="character-clone-btn" onclick="cloneCharacter('${ch.id}', event)" title="Копировать персонажа"><span class="character-btn-icon">⎘</span></button></div></div>`;
        }).join('') + addCardHtml;
        syncMobileReorderButtons();
    }

    function characterDragStart(e, idx) {
        if (window.innerWidth < 1000 || characterDeleteSelectMode || mobileReorderMode === 'characters') {
            e.preventDefault();
            return;
        }
        draggedCharacterIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        const card = e.currentTarget ? e.currentTarget.closest('.character-card') : null;
        setTimeout(() => { if (card) card.style.opacity = '0.5'; }, 0);
    }

    function characterDragEnd(e) {
        const card = e.currentTarget ? e.currentTarget.closest('.character-card') : null;
        if (card) card.style.opacity = '1';
        draggedCharacterIdx = null;
    }

    function characterDragOver(e) {
        if (characterDeleteSelectMode) return;
        e.preventDefault();
    }

    function characterDrop(e, targetIdx) {
        if (characterDeleteSelectMode) return;
        e.preventDefault();
        e.stopPropagation();
        if (draggedCharacterIdx === null || draggedCharacterIdx === targetIdx) return;
        const item = characters.splice(draggedCharacterIdx, 1)[0];
        characters.splice(targetIdx, 0, item);
        draggedCharacterIdx = null;
        suppressNextClickAfterReorder = true;
        writeCharacters();
        renderCharacterMenu();
        setTimeout(() => { suppressNextClickAfterReorder = false; }, 120);
    }

    async function openCharacterMenu(options = {}) {
        const { fromRoute = false, replaceRoute = false } = options || {};
        if (activeCharacterId) {
            saveAll(false);
            await flushCloudSave();
        }
        characterDeleteSelectMode = false;
        document.body.classList.add('main-menu-open');
        renderCharacterMenu();
        if (!fromRoute) setRoute('menu', null, replaceRoute);
    }

    function toggleCharacterDeleteMode() {
        if (!characters.length) {
            characterDeleteSelectMode = false;
            mobileReorderMode = null;
            selectedMobileReorder = null;
            renderCharacterMenu();
            return;
        }
        characterDeleteSelectMode = !characterDeleteSelectMode;
        if (characterDeleteSelectMode) {
            mobileReorderMode = null;
            selectedMobileReorder = null;
        }
        renderCharacterMenu();
    }

    async function addCharacter() {
        if (characters.length >= MAX_CHARACTERS) {
            alert('Пока можно создать не больше 10 персонажей.');
            return;
        }
        if (activeCharacterId) saveAll(false);
        characterDeleteSelectMode = false;
        mobileReorderMode = null;
        selectedMobileReorder = null;
        const sheet = createBlankSheetData(`Персонаж ${characters.length + 1}`);
        const row = cloudUser ? await createCloudCharacter(sheet) : null;
        const id = row?.id || makeCharacterId();
        writeCharacterSheet(id, sheet);
        characters.push(row ? cloudRowToCharacter(row) : { id, ...getCharacterMetaFromSheet(sheet) });
        writeCharacters();
        document.body.classList.add('main-menu-open');
        setRoute('menu', null, true);
        renderCharacterMenu();
    }

    async function cloneCharacter(id, event = null) {
        if (event) event.stopPropagation();
        if (characterDeleteSelectMode) return;
        if (characters.length >= MAX_CHARACTERS) {
            alert('Пока можно создать не больше 10 персонажей.');
            return;
        }
        if (activeCharacterId) saveAll(false);
        const source = characters.find(ch => String(ch.id) === String(id));
        const sourceSheet = normalizeLoadedSheet(readCharacterSheet(id) || createBlankSheetData(source?.name || 'Герой'));
        const sheet = JSON.parse(JSON.stringify(sourceSheet));
        const baseName = String(sheet['in-name'] || source?.name || 'Герой').trim() || 'Герой';
        sheet['in-name'] = `${baseName} копия`;
        const avatar = localStorage.getItem(characterAvatarKey(id)) || source?.avatar || '';
        const row = cloudUser ? await createCloudCharacter(sheet, avatar) : null;
        const newId = row?.id || makeCharacterId();
        writeCharacterSheet(newId, sheet);
        if (avatar) safeStorageSet(characterAvatarKey(newId), avatar, false);
        characters.push(row ? cloudRowToCharacter(row) : { id: newId, ...getCharacterMetaFromSheet(sheet) });
        writeCharacters();
        renderCharacterMenu();
    }

    async function deleteCharacter(id) {
        if (!characterDeleteSelectMode) return;
        if (cloudUser && supabaseClient && isUuid(id)) {
            const { error } = await supabaseClient.from('characters').delete().eq('id', id);
            if (error) {
                console.warn('Supabase delete character error', error);
                alert('Не удалось удалить персонажа из облака.');
                return;
            }
        }
        safeStorageRemove(characterSheetKey(id));
        safeStorageRemove(characterAvatarKey(id));
        characters = characters.filter(ch => String(ch.id) !== String(id));
        if (!characters.length) {
            characterDeleteSelectMode = false;
            mobileReorderMode = null;
            selectedMobileReorder = null;
        }
        if (String(activeCharacterId) === String(id)) activeCharacterId = null;
        writeCharacters();
        safeStorageSet(ACTIVE_CHARACTER_KEY, activeCharacterId || '', false);
        renderCharacterMenu();
        if (!characters.length || !activeCharacterId) setRoute('menu', null, true);
    }

    async function selectCharacter(id, options = {}) {
        if (suppressNextClickAfterReorder) {
            suppressNextClickAfterReorder = false;
            return;
        }
        const { fromRoute = false, replaceRoute = false } = options || {};
        if (!characters.some(ch => String(ch.id) === String(id))) {
            await openCharacterMenu({ fromRoute: true });
            return;
        }
        if (activeCharacterId && String(activeCharacterId) !== String(id)) {
            saveAll(false);
            await flushCloudSave();
        }
        activeCharacterId = id;
        safeStorageSet(ACTIVE_CHARACTER_KEY, id, false);
        characterDeleteSelectMode = false;
        if (mobileReorderMode === 'characters') {
            mobileReorderMode = null;
            selectedMobileReorder = null;
        }
        document.body.classList.remove('main-menu-open');
        loadAll(false);
        if (!fromRoute) setRoute('character', id, replaceRoute);
    }

    function loadSheetData(s) {
        isLoadingSheet = true;
        resetSheetRuntimeState();
        s = normalizeLoadedSheet(s);
        Object.assign(skillProf, s.skillProf || {}); Object.assign(saveProf, s.saveProf || {});
        heroPoints = s.heroPoints || 0; Object.assign(itemBonuses, s.itemBonuses || {});
        Object.assign(lores, s.lores || {}); Object.assign(abilities, s.abilities || {}); Object.assign(partialBoosts, s.partialBoosts || {});
        dyingLevel = s.dyingLevel || 0; firstRun = s.firstRun !== undefined ? s.firstRun : true;
        lastDeathCheck = s.lastDeathCheck || null; headerCollapsed = !!s.headerCollapsed; hpKeypadOpen = !!s.hpKeypadOpen;
        personalitySectionCollapsed = { origin: false, personality: false, proficiency: false, ...(s.personalitySectionCollapsed || {}) };
        attackTagsHiddenById = { ...(s.attackTagsHiddenById || {}) };
        attacks = Array.isArray(s.attacks) ? s.attacks.filter(a => !a.equipmentSourceId) : [];
        attacks.forEach(a => {
            if (a?.tagsHidden) attackTagsHiddenById[a.id] = true;
            else if (attackTagsHiddenById[a.id]) a.tagsHidden = true;
        });
        attackNotes = s.attackNotes || '';
        attackQuickFeatIds = Array.isArray(s.attackQuickFeatIds) ? s.attackQuickFeatIds.map(String) : [];
        attackQuickFeatSelectionCustom = !!s.attackQuickFeatSelectionCustom;
        attackMapPenaltyCount = clampAttackMapPenaltyCount(s.attackMapPenaltyCount);
        attackCourageCount = clampAttackCourageCount(s.attackCourageCount);
        attackMapSettings = normalizeAttackMapSettings(s.attackMapSettings);
        attackDcSettings = normalizeAttackDcSettings(s.attackDcSettings);
        proficiencies = normalizeProficiencies(s.proficiencies);
        attacks.forEach(a => { a.weaponGroup = normalizeWeaponGroup(a.weaponGroup); });
        spells = Array.isArray(s.spells) ? s.spells : [];
        spellSlotsSpent = s.spellSlotsSpent || {};
        spellSettings = normalizeSpellSettings(s.spellSettings);
        normalizeSpellData();
        feats = s.feats || {}; myFeats = Array.isArray(s.myFeats) ? s.myFeats : [];
        currentFeatTab = s.currentFeatTab || 'my';
        equipmentItems = Array.isArray(s.equipmentItems) ? s.equipmentItems : [];
        equipmentBackpack = Array.isArray(s.equipmentBackpack) ? s.equipmentBackpack : [];
        equipmentSettings = normalizeEquipmentSettings(s.equipmentSettings);
        currentEquipmentTab = s.currentEquipmentTab || (equipmentSettings.backpackEnabled ? 'backpack' : 'carried');
        normalizeEquipmentData();
        repairLoadedFeats();
        applySheetDataToFields(s);
        const lvlEl = getPreferredField('in-lvl');
        if (lvlEl) setFieldValueAll('in-lvl', clampLevel(lvlEl.value));
        const avatar = activeCharacterId ? localStorage.getItem(characterAvatarKey(activeCharacterId)) : '';
        showAv(avatar || '');
        applyHeaderCollapsedState(); applyHpKeypadState(); syncSheetSettings(); syncAttackNotesPreview(); renderPersonalitySections(); renderPersonalityNotes(); renderProficiencies(); renderMagic(); renderAttackQuickFeats(); renderEquipment();
        snapshotLevelUpReadyState();
        isLoadingSheet = false;
        calculate();
    }

    function saveAll(shouldCalculate = true) {
        if (isLoadingSheet || !activeCharacterId) return;
        const lvlEl = getPreferredField('in-lvl');
        if (lvlEl) setFieldValueAll('in-lvl', clampLevel(lvlEl.value));
        const s = captureSheetState();
        applySheetDataToFields(s);
        syncSheetSettings();
        if (writeCharacterSheet(activeCharacterId, s)) {
            updateActiveCharacterMeta(s);
            scheduleCloudSave(s);
        }
        if (shouldCalculate) calculate();
    }

    function loadAll(showMenuOnReady = false) {
        migrateCharacterStorage();
        characters = readCharacters();
        const savedActive = localStorage.getItem(ACTIVE_CHARACTER_KEY);
        if (!activeCharacterId && savedActive && characters.some(ch => String(ch.id) === String(savedActive))) activeCharacterId = savedActive;
        if (!activeCharacterId || !characters.some(ch => String(ch.id) === String(activeCharacterId))) {
            activeCharacterId = characters[0]?.id || null;
        }
        if (!activeCharacterId) {
            document.body.classList.add('main-menu-open');
            renderCharacterMenu();
            return;
        }
        safeStorageSet(ACTIVE_CHARACTER_KEY, activeCharacterId, false);
        let sheet = null;
        sheet = readCharacterSheet(activeCharacterId);
        loadSheetData(sheet || createBlankSheetData());
        updateActiveCharacterMeta();
        renderCharacterMenu();
        document.body.classList.toggle('main-menu-open', !!showMenuOnReady);
    }

    function handleImg(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = e => { document.getElementById('crop-preview').src = e.target.result; closeModal('avatarMenuModal'); openModal('cropModal'); };
            reader.readAsDataURL(input.files[0]);
        }
    }

    function confirmCrop() {
        const img = document.getElementById('crop-preview'), canvas = document.getElementById('cropCanvas'), ctx = canvas.getContext('2d');
        const size = Math.min(img.naturalWidth, img.naturalHeight);
        canvas.width = 400; canvas.height = 400;
        ctx.drawImage(img, (img.naturalWidth-size)/2, (img.naturalHeight-size)/2, size, size, 0, 0, 400, 400);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (activeCharacterId) {
            safeStorageSet(characterAvatarKey(activeCharacterId), dataUrl, false);
            updateActiveCharacterMeta();
            scheduleCloudSave();
        }
        showAv(dataUrl);
        closeModal('cropModal');
    }

    function startImportCharacterAsNew() {
        if (characters.length >= MAX_CHARACTERS) {
            alert('Пока можно создать не больше 10 персонажей.');
            return;
        }
        characterDeleteSelectMode = false;
        mobileReorderMode = null;
        selectedMobileReorder = null;
        renderCharacterMenu();
        const input = document.getElementById('jsonNewInput');
        if (input) input.click();
    }

    function exportCharacterJSON(id, event) {
        if (event) event.stopPropagation();
        exportJSON(id);
    }

    function exportJSON(id = activeCharacterId) {
        if (!id) return;
        if (String(id) === String(activeCharacterId)) saveAll(false);
        let sheet = null;
        sheet = readCharacterSheet(id);
        const avatar = localStorage.getItem(characterAvatarKey(id)) || '';
        const ch = characters.find(x => String(x.id) === String(id)) || { id, ...getCharacterMetaFromSheet(sheet, avatar) };
        const fullData = JSON.stringify({
            version: 2,
            character: { ...ch, sheet, avatar },
            sheet,
            avatar
        });
        const safeName = String(ch.name || sheet?.['in-name'] || 'Hero').replace(/[\\/:*?"<>|]+/g, '_');
        const filename = `PF2e_${safeName}.json`;
        const blob = new Blob([fullData], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
    }

    function importJSON(input, forceNew = false) {
        const shouldCreateNewCharacter = !!forceNew;
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = async e => {
                try {
                    const data = JSON.parse(e.target.result);
                    const imported = data.character || {};
                    const sheet = normalizeLoadedSheet(imported.sheet || data.sheet || data);
                    const avatar = imported.avatar || data.avatar || '';
                    let id = shouldCreateNewCharacter ? null : activeCharacterId;
                    let createdAsNew = false;
                    if (!id) {
                        if (characters.length >= MAX_CHARACTERS) {
                            alert('Пока можно создать не больше 10 персонажей.');
                            return;
                        }
                        const row = cloudUser ? await createCloudCharacter(sheet, avatar) : null;
                        id = row?.id || makeCharacterId();
                        characters.push(row ? cloudRowToCharacter(row) : { id, ...getCharacterMetaFromSheet(sheet) });
                        createdAsNew = true;
                    }
                    if (!shouldCreateNewCharacter) {
                        activeCharacterId = id;
                        safeStorageSet(ACTIVE_CHARACTER_KEY, id, false);
                    }
                    writeCharacterSheet(id, sheet);
                    if (avatar) safeStorageSet(characterAvatarKey(id), avatar, false);
                    else safeStorageRemove(characterAvatarKey(id));
                    const idx = characters.findIndex(ch => String(ch.id) === String(id));
                    if (idx >= 0) {
                        const { avatar: oldAvatar, ...rest } = characters[idx];
                        characters[idx] = { ...rest, ...getCharacterMetaFromSheet(sheet), ...(cloudUser && isUuid(id) ? { cloud: true } : {}) };
                    }
                    writeCharacters();
                    closeModal('avatarMenuModal');
                    if (shouldCreateNewCharacter) {
                        characterDeleteSelectMode = false;
                        mobileReorderMode = null;
                        selectedMobileReorder = null;
                        document.body.classList.add('main-menu-open');
                        setRoute('menu', null, true);
                        renderCharacterMenu();
                    } else {
                        document.body.classList.remove('main-menu-open');
                        loadAll(false);
                        setRoute('character', id, true);
                        if (cloudUser && !createdAsNew) await saveCharacterToCloud(id, sheet);
                    }
                } catch (err) {
                    alert('Не удалось загрузить JSON.');
                } finally {
                    input.value = '';
                }
            };
            reader.readAsText(input.files[0]);
        }
    }
    
    function showAv(s) {
        const img = document.getElementById('avatar-img');
        const plus = document.getElementById('avatar-plus');
        const portraitImg = document.getElementById('personality-portrait-img');
        const portraitFallback = document.getElementById('personality-portrait-fallback');
        if (!img || !plus) return;
        if (s) {
            img.src = s;
            img.style.display = 'block';
            plus.style.display = 'none';
            if (portraitImg) {
                portraitImg.src = s;
                portraitImg.style.display = 'block';
            }
            if (portraitFallback) portraitFallback.style.display = 'none';
        } else {
            img.removeAttribute('src');
            img.style.display = 'none';
            plus.style.display = 'block';
            if (portraitImg) {
                portraitImg.removeAttribute('src');
                portraitImg.style.display = 'none';
            }
            if (portraitFallback) portraitFallback.style.display = 'block';
        }
    }
    function openModal(id) { document.getElementById(id).style.display = 'flex'; }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }
    
    window.addEventListener('DOMContentLoaded', async () => {
        init(true);
        if (window.innerWidth >= 1000 && currentPage === 0) {
            switchPage(1);
        }
        await applyRouteFromLocation(!window.location.hash);
        initSupabase().then(() => applyRouteFromLocation(true)).catch(err => {
            console.warn('Supabase init error', err);
            updateCloudAuthUI('Supabase недоступен, работает локальное сохранение');
        });
        requestAnimationFrame(updateAttackTagsOverflow);
        syncMobileReorderButtons();
    });
    window.addEventListener('popstate', () => { applyRouteFromLocation(false); });
    window.addEventListener('hashchange', () => { applyRouteFromLocation(false); });
    window.addEventListener('pagehide', () => {
        if (activeCharacterId) saveAll(false);
    });
    window.addEventListener('beforeunload', () => {
        if (activeCharacterId) saveAll(false);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && activeCharacterId) saveAll(false);
    });
