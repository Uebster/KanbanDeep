// js/kanban.js - VERSÃO REFATORADA E FINAL

import { getCurrentUser, updateUser, getAllUsers as authGetAllUsers } from './auth.js';
import { 
    getUserProfile, getFullBoardData, getBoard, saveBoard, deleteBoard, 
    getColumn, saveColumn, deleteColumn, getCard, saveCard, deleteCard,
    getAllUsers, getAllGroups, getGroup, saveGroup, getSystemBoardTemplates, getUserBoardTemplates,
    getSystemTagTemplates, getUserTagTemplates, saveUserBoardTemplates
} from './storage.js';
import { showFloatingMessage, initDraggableElements, updateUserAvatar, initUIControls, showConfirmationDialog, showDialogMessage, initCustomSelects, applyUserTheme, showIconPickerDialog, ICON_LIBRARY, showContextMenu, showCustomColorPickerDialog } from './ui-controls.js';
import { t, initTranslations, applyTranslations, loadLanguage } from './translations.js';
import { addCardAssignmentNotification, addCardDueNotification } from './notifications.js';

// ===== ESTADO GLOBAL DO MÓDULO =====
let currentUser = null;
let allUsers = [];
let boards = [];
let currentBoard = null;
let draggedElement = null;
let currentBoardFilter = 'personal';
let undoStack = [];
let redoStack = [];
let clipboard = null; // Para copiar/colar
let originalPreferences = {}; // Para restaurar ao cancelar
let tagColorMap = new Map();
let originalKanbanTheme = null;
let originalKanbanFont = null;
let originalKanbanFontSize = null;
let originalShowTitle = null;
let originalShowIcon = null;
let originalShowTags = null;
let originalShowDate = null;
let originalShowStatus = null;
let originalShowAssignment = null;
let originalShowCardDetails = null;
let originalEnableCardTooltip = null; // Para a nova preferência
let kanbanIsSaved = true;

let tooltipElement = null;
let tooltipTimeout = null;
let isDragging = false;

// Variáveis do Tour Guiado
let isTourActive = false;
let currentTourStep = 0;
let tourCreatedItems = {
    boardId: null,
    columnId: null,
    cardId: null,
};

function translatePreferencesDialog() {
    const dialog = document.getElementById('preferences-dialog');
    if (!dialog) return;

    // Helper function to safely set text content if the element exists.
    const safeSetText = (selector, translationKey) => {
        const element = dialog.querySelector(selector);
        if (element) {
            element.textContent = t(translationKey);
        }
    };

    safeSetText('h3', 'preferences.title');
    safeSetText('label[for="pref-theme"]', 'preferences.theme');
    safeSetText('label[for="pref-language"]', 'preferences.language');
    safeSetText('label[for="pref-font-family"]', 'preferences.font');
    safeSetText('label[for="pref-font-size"]', 'preferences.fontSize');
    // Corrected selector for the color palette label
    safeSetText('label[data-i18n="preferences.primaryColor"]', 'preferences.primaryColor');
    safeSetText('legend[data-i18n="preferences.displayOnBoard"]', 'preferences.displayOnBoard');
    safeSetText('legend[data-i18n="preferences.displayOnCard"]', 'preferences.displayOnCard');
    safeSetText('label[for="pref-default-tag-template"]', 'preferences.defaultTagSet');
    safeSetText('label[for="pref-enable-card-tooltip"]', 'preferences.enableCardTooltip');
}
// ===== INICIALIZAÇÃO =====

// A lógica de inicialização agora está DENTRO da função exportada.
// O DOMContentLoaded foi REMOVIDO daqui.
export async function initKanbanPage() {

    currentUser = getCurrentUser();
    if (!currentUser) {
        showFloatingMessage(t('ui.userNotLoggedIn'), 'error');
        setTimeout(() => { window.location.href = 'list-users.html'; }, 2000);
        return;
    }
    
    await initTranslations(); // Carrega o idioma antes de tudo

    // Movemos para cá para garantir que as traduções estejam prontas para o tooltip do avatar
    if (currentUser) {
        updateUserAvatar(currentUser);
    }

    // 2. Carregamento de Dados
    await loadData(); // <-- AGUARDA o carregamento dos dados

    // 3. Configuração da UI e Eventos
    setupEventListeners();
    initDraggableElements();
    tooltipElement = document.getElementById('card-tooltip');
    checkAllCardDueDates(); // Verifica os cartões com vencimento próximo (agora com userId)

    // 4. Renderização Inicial
    initUIControls();
    renderBoardSelector();
    renderCurrentBoard();
    initCustomSelects(); // Aplica o estilo customizado ao select principal de quadros
    saveState(); // Salva o estado inicial para o Desfazer
    applyUserTheme();
}

/**
 * Carrega todos os dados necessários da aplicação (quadros e usuários).
 */
async function loadData() {
    allUsers = getAllUsers();
    
    const userProfile = getUserProfile(currentUser.id);
    const userBoardIds = userProfile.boardIds || [];
    const personalBoards = userBoardIds.map(id => getFullBoardData(id)).filter(Boolean);

    // --- NOVA LÓGICA PARA CARREGAR QUADROS DE GRUPO ---
    const allGroups = getAllGroups();
    const memberGroups = allGroups.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    
    const groupBoardIds = memberGroups.flatMap(g => g.boardIds || []);
    const groupBoards = groupBoardIds.map(id => getFullBoardData(id)).filter(Boolean);

    // Combina quadros pessoais e de grupo, evitando duplicatas
    const allBoardMap = new Map();
    personalBoards.forEach(b => allBoardMap.set(b.id, b));
    groupBoards.forEach(b => allBoardMap.set(b.id, b));
    boards = Array.from(allBoardMap.values());

    tagColorMap.clear();
    const systemTags = getSystemTagTemplates();
    const userTags = getUserTagTemplates(currentUser.id);
    systemTags.forEach(t => t.tags.forEach(tag => tagColorMap.set(tag.name, tag.color)));
    userTags.forEach(t => t.tags.forEach(tag => tagColorMap.set(tag.name, tag.color)));

    const lastBoardId = localStorage.getItem(`currentBoardId_${currentUser.id}`);
    currentBoard = boards.find(b => b.id === lastBoardId) || boards[0];
}

/**
 * Configura todos os event listeners da página.
 */
function setupEventListeners() {

    // --- Menus ---
    document.getElementById('user-avatar-btn')?.addEventListener('click', (e) => toggleDropdown(e, 'profile-dropdown'));
    document.getElementById('boards-dropdown-btn')?.addEventListener('click', (e) => toggleDropdown(e, 'boards-dropdown'));
    document.getElementById('actions-dropdown-btn')?.addEventListener('click', (e) => toggleDropdown(e, 'actions-dropdown'));

    // --- Ações dos menus ---
    document.getElementById('switch-user-btn')?.addEventListener('click', () => window.location.href = 'list-users.html');
    document.getElementById('user-profile-btn')?.addEventListener('click', () => window.location.href = 'profile.html');
    document.getElementById('add-board-btn')?.addEventListener('click', () => showBoardDialog());
document.getElementById('add-column-btn')?.addEventListener('click', () => {
    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.noBoardForColumn'), 'error');
        return;
    }
    showColumnDialog();
});

document.getElementById('add-card-btn')?.addEventListener('click', () => {
    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.noBoardSelected'), 'error');
        return;
    }
    if (currentBoard.columns.length === 0) {
        showFloatingMessage(t('kanban.feedback.noColumnForCard'), 'error');
        return;
    }
    showCardDialog(null, currentBoard.columns[0].id);
});
    document.getElementById('board-select')?.addEventListener('change', switchBoard);
    document.getElementById('edit-items-btn')?.addEventListener('click', showEditDialog);
    document.getElementById('undo-btn')?.addEventListener('click', undoAction);
    document.getElementById('redo-btn')?.addEventListener('click', redoAction);
    document.getElementById('start-tour-btn')?.addEventListener('click', startTour);
    document.getElementById('export-img')?.addEventListener('click', () => handleExportImage());
    document.getElementById('save-as-template-btn')?.addEventListener('click', saveBoardAsTemplate);
    document.getElementById('print-btn')?.addEventListener('click', handlePrintBoard);
    document.getElementById('my-groups-btn')?.addEventListener('click', () => window.location.href = 'groups.html');
    document.getElementById('notifications-btn')?.addEventListener('click', () => window.location.href = 'notifications.html');
    document.getElementById('templates-btn')?.addEventListener('click', () => window.location.href = 'templates.html');
    document.getElementById('preferences-btn')?.addEventListener('click', showPreferencesDialog);
    document.getElementById('friends-btn')?.addEventListener('click', () => window.location.href = 'friends.html');
    // --- Diálogos (Modais) ---
    document.getElementById('board-save-btn')?.addEventListener('click', handleSaveBoard);
    document.getElementById('column-save-btn')?.addEventListener('click', handleSaveColumn);
    document.getElementById('column-delete-btn')?.addEventListener('click', () => handleDeleteColumn(document.getElementById('column-dialog').dataset.editingId));
    document.getElementById('card-save-btn')?.addEventListener('click', handleSaveCard);
    document.querySelectorAll('dialog .btn.cancel').forEach(btn => {
        // Adiciona um listener genérico para fechar diálogos com o botão "Cancelar", mas ignora o de preferências,
        // que tem sua própria lógica customizada.
        if (btn.id !== 'pref-cancel-btn') {
            btn.addEventListener('click', () => btn.closest('dialog').close());
        }
    });

    // --- Atalhos e Contexto ---
    document.addEventListener('keydown', handleKeyDown);
    const columnsContainer = document.getElementById('columns-container');
    columnsContainer.addEventListener('contextmenu', handleContextMenu);
    // --- NOVA LÓGICA DE DRAG & DROP ---
    columnsContainer.addEventListener('dragstart', handleDragStart);
    columnsContainer.addEventListener('dragend', handleDragEnd);
    columnsContainer.addEventListener('dragover', handleDragOver);
    columnsContainer.addEventListener('dragleave', handleDragLeave);
    columnsContainer.addEventListener('drop', handleDrop);

    // --- NOVA LÓGICA PARA FILTRO DE QUADROS ---
    document.querySelectorAll('#board-filter-toggle .filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleFilterChange(e.currentTarget.dataset.filter));
    });

    // --- LISTENERS PARA O DIÁLOGO DE PREFERÊNCIAS (ANEXADOS UMA ÚNICA VEZ) ---
    const preferencesDialog = document.getElementById('preferences-dialog');
    if (preferencesDialog) {
        // Listener para fechar com ESC ou clique no backdrop, disparado por ui-controls.js
        preferencesDialog.addEventListener('cancel', (e) => {
            if (!kanbanIsSaved) {
                e.preventDefault(); // Impede o fechamento se houver alterações não salvas
                handlePreferencesCancel();
            }
        });

        // Listener para a paleta de cores
        preferencesDialog.querySelector('#color-palette-container').addEventListener('click', (e) => {
            const swatch = e.target.closest('.color-swatch');
            if (!swatch) return;
            kanbanIsSaved = false;
            // Lógica de preview da cor
            preferencesDialog.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));
            swatch.classList.add('active');
            if (swatch.dataset.action === 'remove-primary') {
                document.body.classList.add('no-primary-effects');
            } else {
                document.body.classList.remove('no-primary-effects');
                document.documentElement.style.setProperty('--primary', swatch.dataset.hex);
                document.documentElement.style.setProperty('--primary-rgb', swatch.dataset.rgb);
            }
        });
    }
}

// ===== LÓGICA DO TOUR GUIADO =====

const tourSteps = [
    { element: '#user-avatar-btn', title: 'tour.step1.title', text: 'tour.step1.text', position: 'right', context: null },
    { element: '#user-profile-btn', title: 'tour.step_profile.title', text: 'tour.step_profile.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { element: '#my-groups-btn', title: 'tour.step2.title', text: 'tour.step2.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { element: '#friends-btn', title: 'tour.step_friends.title', text: 'tour.step_friends.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { element: '#templates-btn', title: 'tour.step3.title', text: 'tour.step3.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { element: '#notifications-btn', title: 'tour.step4.title', text: 'tour.step4.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { element: '#preferences-btn', title: 'tour.step5.title', text: 'tour.step5.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { element: '#boards-dropdown-btn', title: 'tour.step6.title', text: 'tour.step6.text', position: 'bottom', context: null },
    { element: '#board-filter-toggle', title: 'tour.step7.title', text: 'tour.step7.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { element: () => document.querySelector('#boards-dropdown .no-boards-message') || document.querySelector('#board-select + .select-selected'), title: 'tour.step_board_selector.title', text: 'tour.step_board_selector.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { element: '#add-board-btn', title: 'tour.step8.title', text: 'tour.step8.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { element: '#add-column-btn', title: 'tour.step9.title', text: 'tour.step9.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { element: '#add-card-btn', title: 'tour.step10.title', text: 'tour.step10.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { element: '#actions-dropdown-btn', title: 'tour.step11.title', text: 'tour.step11.text', position: 'bottom', context: null },
    { element: '#save-as-template-btn', title: 'tour.step_save_template.title', text: 'tour.step_save_template.text', position: 'left', preAction: () => document.getElementById('actions-dropdown').classList.add('show'), context: 'actions-dropdown' },
    { element: '#print-btn', title: 'tour.step13.title', text: 'tour.step13.text', position: 'left', preAction: () => document.getElementById('actions-dropdown').classList.add('show'), context: 'actions-dropdown' },
    { element: '#export-img', title: 'tour.step12.title', text: 'tour.step12.text', position: 'left', preAction: () => document.getElementById('actions-dropdown').classList.add('show'), context: 'actions-dropdown' },
    { element: '#kanban-title', title: 'tour.step14.title', text: 'tour.step14.text', position: 'bottom', preAction: createTourBoard, undoAction: undoTourBoard, context: null, isCreation: true },
    { element: '#kanban-title', title: 'tour.step15.title', text: 'tour.step15.text', position: 'bottom', context: null, noHighlight: true },
    { element: '#kanban-title', title: 'tour.step16.title', text: 'tour.step16.text', position: 'bottom', preAction: createTourColumn, undoAction: undoTourColumn, context: null, noHighlight: true, isCreation: true },
    { element: '.card', title: 'tour.step17.title', text: 'tour.step17.text', position: 'bottom', preAction: createTourCard, undoAction: undoTourCard, context: null, isCreation: true }
];

function startTour() {
    isTourActive = true;
    currentTourStep = 0;
    document.getElementById('tour-overlay').classList.remove('hidden');
    showTourStep(currentTourStep);
}

function endTour(wasSkipped = false) {
    isTourActive = false;
    document.getElementById('tour-overlay').classList.add('hidden');
    document.getElementById('tour-popover').classList.add('hidden');

    // Limpa os itens criados pelo tour APENAS se o usuário pular
    if (wasSkipped) {
        if (tourCreatedItems.cardId) undoTourCard();
        if (tourCreatedItems.columnId) undoTourColumn();
        if (tourCreatedItems.boardId) undoTourBoard();
    }

    const highlighted = document.querySelector('.tour-highlight');
    if (highlighted) {
        highlighted.classList.remove('tour-highlight');
    }
    closeAllDropdowns();

    // Marca que o tour foi visto para não mostrar novamente
    if (!currentUser.preferences.hasSeenTour) {
        currentUser.preferences.hasSeenTour = true;
        updateUser(currentUser.id, { preferences: currentUser.preferences });
    }
}

async function showTourStep(index, direction = 'forward') { // Adicionado 'direction'
    const oldHighlight = document.querySelector('.tour-highlight');
    if (oldHighlight) {
        oldHighlight.classList.remove('tour-highlight');
    }

    const currentStep = tourSteps[index];

    // Lógica aprimorada para evitar o "flash" dos menus.
    // Só fecha todos os menus se estivermos saindo de um menu para outro, ou para uma área sem menu.
    const previousStep = index > 0 ? tourSteps[index - 1] : null;
    if (!previousStep || currentStep.context !== previousStep.context) {
        closeAllDropdowns();
    }

    // Ação de pré-execução (abrir menus, criar itens)
    if (currentStep.preAction) {
        // Ações de criação (isCreation: true) só rodam ao avançar.
        // Outras ações (abrir menus) rodam sempre.
        if (!currentStep.isCreation || direction === 'forward') {
        currentStep.preAction();
        }
    }

    // Aguarda um pequeno instante para garantir que a preAction (que pode criar elementos) termine.
    await new Promise(resolve => setTimeout(resolve, 100));

    let targetElement;
    if (typeof currentStep.element === 'function') {
        targetElement = currentStep.element();
    } else {
        targetElement = document.querySelector(currentStep.element);
    }
    targetElement = targetElement || document.getElementById('app');
    if (!targetElement) {
        console.warn(`Elemento do tour não encontrado: ${currentStep.element}`);
        endTour();
        return;
    }

    const popover = document.getElementById('tour-popover');
    popover.querySelector('#tour-title').textContent = t(currentStep.title);
    popover.querySelector('#tour-text').textContent = t(currentStep.text);
    popover.querySelector('#tour-step-counter').textContent = `${index + 1} / ${tourSteps.length}`;

    const prevBtn = popover.querySelector('#tour-prev-btn');
    const nextBtn = popover.querySelector('#tour-next-btn');
    const skipBtn = popover.querySelector('#tour-skip-btn');

    prevBtn.textContent = t('tour.button.prev');
    nextBtn.textContent = (index === tourSteps.length - 1) ? t('tour.button.finish') : t('tour.button.next');
    skipBtn.textContent = t('tour.button.skip');

    prevBtn.style.display = (index === 0) ? 'none' : 'inline-flex';

    prevBtn.onclick = (e) => {
        e.stopPropagation();
        // Ação de desfazer do passo ATUAL antes de ir para o anterior
        const stepToUndo = tourSteps[index];
        if (stepToUndo.undoAction) {
            stepToUndo.undoAction();
        }
        showTourStep(index - 1, 'backward'); // Informa que estamos voltando
    };
    nextBtn.onclick = (e) => { e.stopPropagation(); (index === tourSteps.length - 1) ? endTour(false) : showTourStep(index + 1, 'forward'); };
    skipBtn.onclick = (e) => { e.stopPropagation(); endTour(true); };

    if (!currentStep.noHighlight) {
        targetElement.classList.add('tour-highlight');
    }
    positionPopover(targetElement, popover, currentStep.position);
    popover.classList.remove('hidden');
}

function positionPopover(target, popover, position) {
    const targetRect = target.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const arrow = popover.querySelector('.tour-arrow');
    arrow.className = 'tour-arrow hidden'; // Reset classes e mantém escondido

    let top, left;
    const offset = 15; // Distância entre o popover e o elemento

    switch (position) {
        case 'top':
            top = targetRect.top - popoverRect.height - offset;
            left = targetRect.left + (targetRect.width / 2) - (popoverRect.width / 2);
            break;
        case 'bottom':
            top = targetRect.bottom + offset;
            left = targetRect.left + (targetRect.width / 2) - (popoverRect.width / 2);
            break;
        case 'left':
            top = targetRect.top + (targetRect.height / 2) - (popoverRect.height / 2);
            left = targetRect.left - popoverRect.width - offset;
            break;
        case 'right':
            top = targetRect.top + (targetRect.height / 2) - (popoverRect.height / 2);
            left = targetRect.right + offset;
            break;
        case 'center':
            top = window.innerHeight / 2 - popoverRect.height / 2;
            left = window.innerWidth / 2 - popoverRect.width / 2;
            arrow.classList.add('hidden');
            break;
    }

    // Ajusta para não sair da tela
    if (left < 10) left = 10;
    if (top < 10) top = 10;
    if (left + popoverRect.width > window.innerWidth - 10) left = window.innerWidth - popoverRect.width - 10;
    if (top + popoverRect.height > window.innerHeight - 10) top = window.innerHeight - popoverRect.height - 10;

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
}

function createTourBoard() {
    const boardData = {
        title: t('tour.item.boardTitle'),
        icon: '🚀',
        ownerId: currentUser.id,
        visibility: 'private',
        columnIds: [],
        columns: []
    };
    const newBoard = saveBoard(boardData);
    tourCreatedItems.boardId = newBoard.id; // Salva o ID para o "desfazer"
    boards.push(newBoard); // Adiciona à lista em memória
    currentBoard = newBoard; // Define como quadro atual
    localStorage.setItem(`currentBoardId_${currentUser.id}`, newBoard.id);
    renderBoardSelector();
    renderCurrentBoard();
    initCustomSelects();
}

function createTourColumn() {
    if (!currentBoard) return;
    const columnData = {
        title: t('tour.item.columnTitle'),
        color: '#9b59b6',
        textColor: '#ffffff',
        cardIds: [],
        cards: []
    };
    const newColumn = saveColumn(columnData);
    tourCreatedItems.columnId = newColumn.id; // Salva o ID
    currentBoard.columnIds.push(newColumn.id);
    currentBoard.columns.push(newColumn);
    saveBoard(currentBoard);
    renderCurrentBoard();
}

function createTourCard() {
    if (!currentBoard || currentBoard.columns.length === 0) return;
    const targetColumn = currentBoard.columns[0];
    const cardData = {
        title: t('tour.item.cardTitle'),
        description: t('tour.item.cardDescription'),
        creatorId: currentUser.id,
        assignedTo: currentUser.id,
        isComplete: false,
        tags: [t('tour.item.cardTag1'), t('tour.item.cardTag2')], // Certifique-se que essas tags existam em algum template
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Vence em 3 dias
        createdAt: new Date().toISOString()
    };
    const newCard = saveCard(cardData);
    tourCreatedItems.cardId = newCard.id; // Salva o ID
    targetColumn.cardIds.push(newCard.id);
    targetColumn.cards.push(newCard);
    saveColumn(targetColumn);
    renderCurrentBoard();
}

/**
 * Funções para DESFAZER as criações do tour.
 */
function undoTourBoard() {
    if (tourCreatedItems.boardId) {
        deleteBoard(tourCreatedItems.boardId);
        tourCreatedItems.boardId = null;
        loadData(); // Recarrega todos os quadros
        renderBoardSelector();
        renderCurrentBoard();
        initCustomSelects();
    }
}

function undoTourColumn() {
    if (tourCreatedItems.columnId && tourCreatedItems.boardId) {
        const board = getBoard(tourCreatedItems.boardId);
        if (board) {
            board.columnIds = board.columnIds.filter(id => id !== tourCreatedItems.columnId);
            saveBoard(board);
        }
        deleteColumn(tourCreatedItems.columnId);
        tourCreatedItems.columnId = null;
        currentBoard = getFullBoardData(tourCreatedItems.boardId);
        renderCurrentBoard();
    }
}

function undoTourCard() {
    if (tourCreatedItems.cardId && tourCreatedItems.columnId) {
        const column = getColumn(tourCreatedItems.columnId);
        if (column) {
            column.cardIds = column.cardIds.filter(id => id !== tourCreatedItems.cardId);
            saveColumn(column);
        }
        deleteCard(tourCreatedItems.cardId);
        tourCreatedItems.cardId = null;
        currentBoard = getFullBoardData(tourCreatedItems.boardId);
        renderCurrentBoard();
    }
}

function showSearchDialog() {
    const dialog = document.getElementById('search-dialog');
    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.selectBoardForSearch'), 'error');
        return;
    }

    const creatorSelect = document.getElementById('search-creator');
    const assigneeSelect = document.getElementById('search-assignee');
    const tagSelect = document.getElementById('search-tags');

    // --- Popula os filtros com base na visibilidade do quadro (NOVA LÓGICA) ---
    const boardTags = new Set();
    currentBoard.columns.forEach(col => {
        col.cards.forEach(card => {
            if (card.tags) card.tags.forEach(tag => boardTags.add(tag));
        });
    });

    let relevantUsers = new Map();
    relevantUsers.set(currentUser.id, currentUser); // Sempre inclui o usuário atual

    if (currentBoard.visibility === 'public') {
        const userProfile = getUserProfile(currentUser.id);
        if (userProfile && userProfile.friends) {
            userProfile.friends.forEach(friendId => {
                const friend = allUsers.find(u => u.id === friendId);
                if (friend) relevantUsers.set(friend.id, friend);
            });
        }
    } else if (currentBoard.visibility === 'group' && currentBoard.groupId) {
        const group = getGroup(currentBoard.groupId);
        if (group && group.memberIds) {
            group.memberIds.forEach(memberId => {
                const member = allUsers.find(u => u.id === memberId);
                if (member) relevantUsers.set(member.id, member);
            });
        }
    }

    // Popula Criador
    creatorSelect.innerHTML = `<option value="">${t('kanban.dialog.search.anyCreator')}</option>`;
    relevantUsers.forEach(user => {
        creatorSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
    });

    // Popula Atribuído a
    assigneeSelect.innerHTML = `<option value="">${t('kanban.dialog.search.anyAssignee')}</option>`;
    relevantUsers.forEach(user => {
        assigneeSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
    });

    // Popula Etiquetas (lógica mantida, mas simplificada)
    tagSelect.innerHTML = `<option value="">${t('kanban.dialog.search.allTags')}</option>`;
    [...boardTags].sort().forEach(tag => {
        tagSelect.innerHTML += `<option value="${tag}">${tag}</option>`;
    });

    // Anexa os listeners
    document.getElementById('search-apply-btn').onclick = applySearchFilters;
    document.getElementById('search-reset-btn').onclick = resetSearchFilters;
    document.getElementById('search-cancel-btn').onclick = () => dialog.close();
    
    dialog.showModal();
}

function applySearchFilters() {
    const filters = {
        text: document.getElementById('search-text').value.toLowerCase(),
        creator: document.getElementById('search-creator').value,
        status: document.getElementById('search-status').value,
        assignee: document.getElementById('search-assignee').value,
        dueDate: document.getElementById('search-due-date').value,
        tag: document.getElementById('search-tags').value,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let visibleCount = 0;

    currentBoard.columns.forEach(column => {
        column.cards.forEach(card => {
            const cardEl = document.querySelector(`.card[data-card-id="${card.id}"]`);
            if (!cardEl) return;

            let isVisible = true;

            // Filtro de Texto
            if (filters.text && !(card.title.toLowerCase().includes(filters.text) || (card.description && card.description.toLowerCase().includes(filters.text)))) {
                isVisible = false;
            }

            // Filtro de Criador
            if (isVisible && filters.creator && card.creatorId !== filters.creator) {
                isVisible = false;
            }

            // Filtro de Status
            if (isVisible && filters.status) {
                if (filters.status === 'completed' && !card.isComplete) isVisible = false;
                if (filters.status === 'active' && card.isComplete) isVisible = false;
            }

            // Filtro de Atribuído a
            if (isVisible && filters.assignee && card.assignedTo !== filters.assignee) {
                isVisible = false;
            }

            // Filtro de Etiqueta
            if (isVisible && filters.tag && (!card.tags || !card.tags.includes(filters.tag))) {
                isVisible = false;
            }

            // Filtro de Data de Vencimento
            if (isVisible && filters.dueDate) {
                if (!card.dueDate) {
                    isVisible = false;
                } else {
                    const dueDate = new Date(card.dueDate);
                    dueDate.setHours(0, 0, 0, 0);
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay());

                    if (filters.dueDate === 'overdue' && dueDate >= today) {
                        isVisible = false;
                    }
                    if (filters.dueDate === 'today' && dueDate.getTime() !== today.getTime()) {
                        isVisible = false;
                    }
                    if (filters.dueDate === 'week' && (dueDate < weekStart || dueDate > new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000))) {
                        isVisible = false;
                    }
                }
            }

            cardEl.style.display = isVisible ? 'block' : 'none';
            if (isVisible) {
                visibleCount++;
            }
        });
    });

    showFloatingMessage(t('kanban.feedback.cardsFound', { count: visibleCount }), 'info');
    document.getElementById('search-dialog').close();
}

function resetSearchFilters() {
    const dialog = document.getElementById('search-dialog');
    dialog.querySelector('#search-text').value = '';
    dialog.querySelector('#search-creator').selectedIndex = 0;
    dialog.querySelector('#search-status').selectedIndex = 0;
    dialog.querySelector('#search-assignee').selectedIndex = 0;
    dialog.querySelector('#search-due-date').selectedIndex = 0;
    dialog.querySelector('#search-tags').selectedIndex = 0;

    // Mostra todos os cartões novamente
    document.querySelectorAll('.card').forEach(cardEl => {
        cardEl.style.display = 'block';
    });

    showFloatingMessage(t('kanban.feedback.filtersCleared'), 'info');
    dialog.close();
}

function handleFilterChange(filterType) {
    if (currentBoardFilter === filterType) return; // Não faz nada se o filtro já está ativo

    currentBoardFilter = filterType;

    // Atualiza a classe 'active' nos botões
    document.querySelectorAll('#board-filter-toggle .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filterType);
    });

    // Renderiza o seletor com os quadros filtrados
    renderBoardSelector();
    initCustomSelects(); // Garante que o novo seletor seja estilizado

    // Após filtrar, seleciona e renderiza o primeiro quadro da nova lista
    const selector = document.getElementById('board-select');
    if (selector.options.length > 0) {
        const firstBoardId = selector.options[0].value;
        currentBoard = boards.find(b => b.id === firstBoardId);
        localStorage.setItem(`currentBoardId_${currentUser.id}`, firstBoardId);
    } else {
        currentBoard = null; // Nenhum quadro na seleção
    }
    renderCurrentBoard();
    saveState();
}

// ===== LÓGICA DE PREFERÊNCIAS - CÓDIGO CORRIGIDO =====

document.getElementById('preferences-btn')?.addEventListener('click', showPreferencesDialog);

// ===== LÓGICA DE RENDERIZAÇÃO =====

function renderBoardSelector() {
    const selector = document.getElementById('board-select');
    const boardsDropdown = document.getElementById('boards-dropdown');
    
    if (!selector || !boardsDropdown) return;

    // --- NOVA LÓGICA DE FILTRAGEM ---
    const filteredBoards = boards.filter(board => {
        if (currentBoardFilter === 'personal') {
            // Quadros pessoais são os que não têm groupId
            return !board.groupId;
        }
        if (currentBoardFilter === 'group') {
            // Quadros de grupo são os que têm groupId
            return !!board.groupId;
        }
        return true; // Fallback
    });

    selector.innerHTML = '';
    
    if (filteredBoards.length === 0) {
        // Esconde o select e mostra mensagem
        selector.closest('.custom-select').style.display = 'none';
        
        // Remove mensagem anterior se existir
        const existingMessage = boardsDropdown.querySelector('.no-boards-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Cria e adiciona mensagem
        const message = document.createElement('p');
        message.className = 'no-boards-message';
        message.textContent = currentBoardFilter === 'personal'
            ? t('kanban.feedback.noPersonalBoards')
            : t('kanban.feedback.noGroupBoards');
        message.style.padding = '10px';
        message.style.color = 'var(--text-muted)';
        message.style.textAlign = 'center';
        
        // CORREÇÃO: Insere a mensagem antes do elemento <select> (que está escondido).
        // O seletor é um filho direto do dropdown, o que evita o erro "NotFoundError"
        // que ocorria ao tentar inserir antes de um elemento que não é filho direto.
        const referenceNode = selector.closest('.custom-select');
        boardsDropdown.insertBefore(message, referenceNode);
    } else {
        // Mostra o select e remove mensagem se existir
        selector.closest('.custom-select').style.display = 'block';
        
        const existingMessage = boardsDropdown.querySelector('.no-boards-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // --- LÓGICA DE AGRUPAMENTO PARA QUADROS DE GRUPO ---
        if (currentBoardFilter === 'group') {
            const boardsByGroup = filteredBoards.reduce((acc, board) => {
                const groupId = board.groupId;
                if (!acc[groupId]) acc[groupId] = [];
                acc[groupId].push(board);
                return acc;
            }, {});

            const sortedGroupIds = Object.keys(boardsByGroup).sort((a, b) => {
                const groupA = getGroup(a)?.name || '';
                const groupB = getGroup(b)?.name || '';
                return groupA.localeCompare(groupB);
            });

            sortedGroupIds.forEach(groupId => {
                const group = getGroup(groupId);
                if (group) {
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = group.name;
                    selector.appendChild(optgroup);

                    boardsByGroup[groupId].forEach(board => {
                        const option = document.createElement('option');
                        option.value = board.id;
                        option.textContent = board.title;
                        if (currentBoard && board.id === currentBoard.id) {
                            option.selected = true;
                        }
                        optgroup.appendChild(option);
                    });
                }
            });
        } else {
            // Preenche o select com os quadros pessoais
            filteredBoards.forEach(board => {
                const option = document.createElement('option');
                option.value = board.id;
                option.textContent = board.title;
                if (currentBoard && board.id === currentBoard.id) {
                    option.selected = true;
                }
                selector.appendChild(option);
            });
        }
    }
}

function renderCurrentBoard() {
    if (!currentBoard) {
        document.getElementById('kanban-title').textContent = t('kanban.feedback.noBoardSelectedTitle');
        document.getElementById('columns-container').innerHTML = `<p>${t('kanban.feedback.noBoardSelected')}</p>`;

        // NOVO: Iniciar o tour automaticamente na primeira vez
        if (!currentUser.preferences.hasSeenTour) {
            startTour();
        }

        return;
    }

    const titleElement = document.getElementById('kanban-title');
    const userPrefs = currentUser.preferences || {};

    let groupInfo = '';
    if (currentBoard.groupId) {
        const group = getGroup(currentBoard.groupId);
        if (group) {
            // O span ajudará na estilização
            groupInfo = ` <span class="board-group-name">(${group.name})</span>`;
        }
    }


    const iconHtml = userPrefs.showBoardIcon !== false ? `<span class="board-icon">${currentBoard.icon || '📋'}</span>` : '';
    // Se showBoardTitle for falso, tanto o título quanto o nome do grupo são escondidos.
    const titleHtml = userPrefs.showBoardTitle !== false ? `<span class="board-title-text">${currentBoard.title}${groupInfo}</span>` : '';

    titleElement.innerHTML = `${iconHtml}${titleHtml}`.trim();
    titleElement.style.display = (userPrefs.showBoardIcon === false && userPrefs.showBoardTitle === false) ? 'none' : 'flex';    
    const columnsContainer = document.getElementById('columns-container');
    columnsContainer.innerHTML = ''; // Limpa o conteúdo anterior

    // Itera sobre os IDs para manter a ordem correta ao arrastar colunas
    currentBoard.columnIds.forEach(columnId => {
        const column = currentBoard.columns.find(c => c.id === columnId);
        if (column) {
            const columnEl = createColumnElement(column);
            columnsContainer.appendChild(columnEl);
        }
    });

}

function createColumnElement(column) {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.columnId = column.id;
    columnEl.style.setProperty('--column-color', column.color || '#4b4b4bff');
    columnEl.style.setProperty('--column-text-color', column.textColor || 'var(--text)');
    

    columnEl.innerHTML = `
        <div class="column-header" draggable="true">
            <h3>${column.title}</h3>
            <button class="paste-card-btn" style="display: none;" title="${t('kanban.button.pasteCard')}">📋</button>
        </div>
        <div class="cards-container" data-column-id="${column.id}">
            ${column.cards.map(card => createCardElement(card).outerHTML).join('')}
        </div>
        <button class="add-card-btn">+ ${t('kanban.button.addCard')}</button>
    `;
    
    // Adiciona listeners de tooltip aos cartões dentro da coluna
    columnEl.querySelectorAll('.card').forEach(cardEl => {
        cardEl.addEventListener('mouseenter', (e) => {
            // Só mostra o tooltip se a preferência estiver ativa e não estiver arrastando
            if (!isDragging && currentUser.preferences.enableCardTooltip === true) {
                tooltipTimeout = setTimeout(() => showTooltip(cardEl.dataset.cardId, e), 1500);
            }
        });
        cardEl.addEventListener('mouseleave', () => {
            clearTimeout(tooltipTimeout);
            hideTooltip();
        });
    });

    columnEl.querySelector('.add-card-btn').addEventListener('click', () => {
        showCardDialog(null, column.id);
    });

    columnEl.querySelector('.paste-card-btn').addEventListener('click', (e) => {
        handlePasteCard(column.id);
    });

    return columnEl;
}

// Em kanban.js
function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.dataset.cardId = card.id;
    cardEl.draggable = true;

    // NOVA LÓGICA: Aplica cores customizadas ao cartão, se existirem.
    // Usa 'var(--bg-card)' e 'var(--text)' como fallbacks se as cores não estiverem definidas.
    if (card.backgroundColor) {
        cardEl.style.backgroundColor = card.backgroundColor;
    }
    if (card.textColor) {
        cardEl.style.color = card.textColor;
    }

    // Constrói a linha da etiqueta (se houver)
    let tagLineHtml = '';
    if (card.tags && card.tags.length > 0) {
        const tagColor = getTagColor(card.tags[0]);
        tagLineHtml = `<div class="card-tag-line" style="background-color: ${tagColor};"></div>`;
    }

    // Constrói a data (se houver)
    let dueDateHtml = '';
    if (card.dueDate) {
        const date = new Date(card.dueDate);
        dueDateHtml = `<span class="card-due-date-display" title="${t('kanban.card.dueDateTitle', { date: date.toLocaleString() })}">${date.toLocaleDateString()}</span>`;
    }

    // Constrói a caixa de status
    const statusCheck = card.isComplete ? '✔' : '';
    const statusBoxHtml = `<div class="card-status-box" title="${card.isComplete ? t('kanban.card.statusCompleted') : t('kanban.card.statusActive')}">${statusCheck}</div>`;

    // Constrói o avatar do usuário atribuído (se houver)
    let assignedToHtml = '';
    const assignee = card.assignedTo ? allUsers.find(u => u.id === card.assignedTo) : null;
    if (assignee) {
        if (assignee.avatar) {
            assignedToHtml = `<img src="${assignee.avatar}" alt="${assignee.name}" class="card-assignee-avatar" title="${t('kanban.card.assignedToTitle', { name: assignee.name })}">`;
        } else {
            const initials = assignee.name.charAt(0).toUpperCase();
            // Usar uma cor de fundo consistente baseada no ID do usuário
            const hue = assignee.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
            assignedToHtml = `<div class="card-assignee-avatar" style="background-color: hsl(${hue}, 65%, 65%);" title="Atribuído a: ${assignee.name}">${initials}</div>`;
        }
    }

    // Aplica as preferências de visualização
    const userPrefs = currentUser.preferences || {};
    const showDetails = userPrefs.showCardDetails !== false;

    // Constrói o HTML do hover-info
    const creator = allUsers.find(u => u.id === card.creatorId);
    const hoverInfoHtml = `
        <div class="card-hover-info">
            <p><strong>${t('kanban.card.hover.description')}</strong> ${card.description || t('kanban.card.hover.noDescription')}</p>
            ${creator ? `<p><strong>${t('kanban.card.hover.creator')}</strong> ${creator.name}</p>` : ''}
            ${assignee ? `<p><strong>${t('kanban.card.hover.assignedTo')}</strong> ${assignee.name}</p>` : ''}
        </div>
    `;

    cardEl.innerHTML = `
        <div class="card-content">
            <div class="card-header-details">
                ${userPrefs.showDate !== false ? dueDateHtml : ''}
            </div>
            <div class="card-status-container">
                ${userPrefs.showStatus !== false ? statusBoxHtml : ''}
            </div>
            <p class="card-title">${card.title}</p>
            ${userPrefs.showTags !== false ? tagLineHtml : ''}
        </div>
        <div class="card-footer-details">
            ${userPrefs.showAssignment !== false ? assignedToHtml : ''}
        </div>
        ${userPrefs.showCardDetails !== false ? hoverInfoHtml : ''}
    `;
    
    return cardEl;
}

// --- NOVAS FUNÇÕES DE TOOLTIP ---

/**
 * Mostra o tooltip com os detalhes de um cartão.
 * @param {string} cardId O ID do cartão.
 * @param {MouseEvent} event O evento do mouse para posicionamento.
 */
function showTooltip(cardId, event) {
    const { card } = findCardAndColumn(cardId);
    if (!card || !tooltipElement) return;

    const creator = allUsers.find(u => u.id === card.creatorId);
    const assignee = allUsers.find(u => u.id === card.assignedTo);

    // Formata os dados adicionais para o tooltip
    const statusText = card.isComplete ? t('kanban.dialog.details.statusCompleted') : t('kanban.dialog.details.statusActive');

    tooltipElement.innerHTML = `
        <div class="tooltip-title">${card.title}</div>
        <div class="tooltip-details">
            ${card.description ? `<p><strong>${t('kanban.dialog.details.description')}</strong> ${card.description.replace(/\n/g, '<br>')}</p>` : ''}
            <hr style="margin: 8px 0; border-color: var(--border);">
            <p><strong>${t('kanban.dialog.details.status')}</strong> ${statusText}</p>
            ${card.dueDate ? `<p><strong>${t('kanban.dialog.details.dueDate')}</strong> ${new Date(card.dueDate).toLocaleString()}</p>` : ''}
            ${creator ? `<p><strong>${t('kanban.card.hover.creator')}</strong> ${creator.name}</p>` : ''}
            ${assignee ? `<p><strong>${t('kanban.card.hover.assignedTo')}</strong> ${assignee.name}</p>` : ''}
            ${card.tags && card.tags.length > 0 ? `<p><strong>${t('kanban.dialog.details.tags')}</strong> ${card.tags.join(', ')}</p>` : ''}
        </div>
    `;

    tooltipElement.style.left = `${event.clientX + 15}px`;
    tooltipElement.style.top = `${event.clientY + 15}px`;
    tooltipElement.classList.add('visible');
}

function hideTooltip() {
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    if (tooltipElement) tooltipElement.classList.remove('visible');
}

// Adicione esta NOVA FUNÇÃO em kanban.js
function showEditDialog() {
    const dialog = document.getElementById('edit-dialog');
    const boardSelect = document.getElementById('edit-select-board');
    const columnSelect = document.getElementById('edit-select-column');
    const cardSelect = document.getElementById('edit-select-card');
    const columnGroup = document.getElementById('edit-column-group');
    const cardGroup = document.getElementById('edit-card-group');
    const editBtn = document.getElementById('edit-dialog-edit-btn');
    const deleteBtn = document.getElementById('edit-dialog-delete-btn');

    // Reseta o estado
    columnGroup.style.display = 'none';
    cardGroup.style.display = 'none';
    editBtn.disabled = true;
    deleteBtn.disabled = true;

    // Popula o select de quadros
    boardSelect.innerHTML = `<option value="">${t('kanban.dialog.edit.selectBoardPlaceholder')}</option>`;
    boards.forEach(board => {
        boardSelect.innerHTML += `<option value="${board.id}">${board.title}</option>`;
    });

    boardSelect.onchange = () => {
        const boardId = boardSelect.value;
        columnGroup.style.display = 'none';
        cardGroup.style.display = 'none';
        columnSelect.innerHTML = `<option value="">${t('kanban.dialog.edit.selectColumnPlaceholder')}</option>`;
        if (!boardId) {
            editBtn.disabled = true;
            deleteBtn.disabled = true;
            return;
        }

        const selectedBoard = boards.find(b => b.id === boardId);
        editBtn.disabled = false;
        deleteBtn.disabled = false;
        columnGroup.style.display = 'block';

        selectedBoard.columns.forEach(col => {
            columnSelect.innerHTML += `<option value="${col.id}">${col.title}</option>`;
        });
    };

    columnSelect.onchange = () => {
        const columnId = columnSelect.value;
        cardGroup.style.display = 'none';
        cardSelect.innerHTML = `<option value="">${t('kanban.dialog.edit.selectCardPlaceholder')}</option>`;
        if (!columnId) return;

        // CORREÇÃO: Busca a coluna dentro do quadro selecionado no diálogo, não no quadro atual.
        const boardId = boardSelect.value;
        const selectedBoard = boards.find(b => b.id === boardId);
        if (!selectedBoard) return; // Segurança

        const selectedColumn = selectedBoard.columns.find(c => c.id === columnId);
        if (!selectedColumn) return; // Segurança

        cardGroup.style.display = 'block';

        selectedColumn.cards.forEach(card => {
            cardSelect.innerHTML += `<option value="${card.id}">${card.title}</option>`;
        });
    };

    editBtn.onclick = () => {
        const cardId = cardSelect.value;
        const columnId = columnSelect.value;
        const boardId = boardSelect.value;
        if (cardId) showCardDialog(cardId);
        else if (columnId) showColumnDialog(columnId);
        else if (boardId) showBoardDialog(boardId);
        dialog.close();
    };

    deleteBtn.onclick = () => {
        const cardId = cardSelect.value;
        const columnId = columnSelect.value;
        const boardId = boardSelect.value;
        if (cardId) handleDeleteCard(cardId);
        else if (columnId) handleDeleteColumnFromMenu(columnId);
        else if (boardId) {
            currentBoard = boards.find(b => b.id === boardId); // Garante que o currentBoard é o correto
            handleDeleteBoard();
        }
        dialog.close();
    };
    
    document.getElementById('edit-dialog-cancel-btn').onclick = () => dialog.close();

    dialog.showModal();
}

// ===== LÓGICA DE MENUS (DROPDOWNS) =====

function toggleDropdown(e, dropdownId) {
    e.stopPropagation();
    const dropdown = document.getElementById(dropdownId);
    const isVisible = dropdown.classList.contains('show');
    closeAllDropdowns();
    if (!isVisible) {
        dropdown.classList.add('show');
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown.show').forEach(d => d.classList.remove('show'));
}


// ===== LÓGICA DE DIÁLOGOS (MODAIS) =====

function showBoardDialog(boardId = null) {
    const dialog = document.getElementById('board-dialog');
    const board = boardId ? boards.find(b => b.id === boardId) : null;
    
    dialog.dataset.editingId = boardId;

    // A linha que causava o erro agora vai funcionar:
    document.getElementById('board-dialog-title').textContent = board ? t('kanban.dialog.board.editTitle') : t('kanban.dialog.board.createTitle');
    
    const visibilitySelect = document.getElementById('board-visibility');
    const groupContainer = document.getElementById('board-group-container');
    const groupSelect = document.getElementById('board-group-select');

    // Popula o select de visibilidade dinamicamente
    visibilitySelect.innerHTML = `
        <option value="private">${t('kanban.dialog.board.visibilityPrivate')}</option>
        <option value="friends">${t('kanban.dialog.board.visibilityFriends')}</option>
        <option value="public">${t('kanban.dialog.board.visibilityPublic')}</option>
    `;

    // --- NOVA LÓGICA DE VALIDAÇÃO DE GRUPO ---
    const allGroups = getAllGroups();
    const creatableInGroups = allGroups.filter(g => {
        const isAdmin = g.adminId === currentUser.id;
        const canCreate = g.permissions?.createBoards && g.memberIds.includes(currentUser.id);
        return isAdmin || canCreate;
    });

    // Adiciona a opção de Grupo apenas se o usuário puder criar em algum
    if (creatableInGroups.length > 0) {
        visibilitySelect.innerHTML += `<option value="group">${t('kanban.dialog.board.visibilityGroup')}</option>`;
    }

    visibilitySelect.onchange = () => {
        const selectedVisibility = visibilitySelect.value;
        if (selectedVisibility === 'group') {
            // Esta verificação é uma segurança extra, mas a opção não deveria existir se não houver grupos.
            if (creatableInGroups.length === 0) {
                showDialogMessage(dialog, t('kanban.feedback.noGroupCreatePermission'), 'warning');
                visibilitySelect.value = board ? board.visibility : 'private'; // Reverte
                groupContainer.style.display = 'none';
            } else {
                groupSelect.innerHTML = '';
                creatableInGroups.forEach(g => {
                    groupSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`;
                });
                groupContainer.style.display = 'block';
            }
        } else {
            groupContainer.style.display = 'none';
        }
    };

    // Lógica do Ícone
    const iconInput = document.getElementById('board-icon-input');
    iconInput.value = board ? board.icon || '📋' : '📋';
    document.getElementById('btn-choose-board-icon').onclick = () => {
        showIconPickerDialog((selectedIcon) => {
            iconInput.value = selectedIcon;
        });
    };

    const templateSelect = document.getElementById('board-template-select');

    // Esconde/mostra o seletor de ícone baseado na seleção de template
    templateSelect.onchange = () => {
        const iconGroup = document.getElementById('board-icon-input').closest('.form-group');
        // Usa 'none' para esconder, e 'flex' para mostrar, mantendo o layout do CSS
        iconGroup.style.display = templateSelect.value ? 'none' : 'flex'; 
    };

    document.getElementById('board-title-input').value = board ? board.title : '';
    document.getElementById('board-description-input').value = board ? board.description || '' : '';
    visibilitySelect.value = board ? board.visibility : 'private';

    // Se estiver editando um quadro de grupo, mostra o seletor
    if (board && board.visibility === 'group' && board.groupId) {
        groupContainer.style.display = 'block';
        groupSelect.innerHTML = `<option value="${board.groupId}">${getGroup(board.groupId)?.name || t('kanban.dialog.board.unknownGroup')}</option>`;
        groupSelect.disabled = true; // Não pode mudar o grupo de um quadro existente
        visibilitySelect.disabled = true;
    } else {
        groupSelect.disabled = false;
        visibilitySelect.disabled = false;
        groupContainer.style.display = 'none'; // Esconde por padrão
    }

    const userTemplates = getUserBoardTemplates(currentUser.id);
    const systemTemplates = getSystemBoardTemplates();
    
    templateSelect.innerHTML = `<option value="">${t('kanban.dialog.board.templateEmpty')}</option>`;
    if (userTemplates.length > 0) {
        templateSelect.innerHTML += `<optgroup label="${t('kanban.dialog.board.myTemplates')}">`;
        userTemplates.forEach(t => templateSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
        templateSelect.innerHTML += '</optgroup>';
    }
    if (systemTemplates.length > 0) {
        templateSelect.innerHTML += `<optgroup label="${t('kanban.dialog.board.systemTemplates')}">`;
        systemTemplates.forEach(template => templateSelect.innerHTML += `<option value="${template.id}">${t(template.name)}</option>`);
        templateSelect.innerHTML += '</optgroup>';
    }
    
    // Esconde o select de template se estiver editando um quadro existente
    templateSelect.parentElement.style.display = boardId ? 'none' : 'block';
    
    // Reseta o feedback de erro
    dialog.querySelector('.feedback')?.classList.remove('show');
    
    // Inicializa os selects customizados APÓS popular os dados
    initCustomSelects();

    dialog.showModal();
}

function handleSaveBoard() {
    const dialog = document.getElementById('board-dialog');
    let title = document.getElementById('board-title-input').value.trim();
    const templateId = document.getElementById('board-template-select').value;

    if (!title && !templateId) {
        showDialogMessage(dialog, t('kanban.dialog.titleRequired'), 'error');
        return;
    }

    showConfirmationDialog(
        t('kanban.confirm.saveBoard'),
        (confirmationDialog) => {
            saveState(); // Salva o estado para o Desfazer
            const boardId = dialog.dataset.editingId;
            const description = document.getElementById('board-description-input').value.trim();
            const icon = document.getElementById('board-icon-input').value;
            const visibility = document.getElementById('board-visibility').value;
            let savedBoard = null;

            if (boardId && boardId !== 'null') {
                const boardData = getBoard(boardId);
                if (!boardData) return false;
                boardData.title = title;
                boardData.description = description;
                boardData.icon = icon;
                // A visibilidade e o grupo não podem ser alterados na edição por esta UI.
                savedBoard = saveBoard(boardData);
            } else { // Criando um novo quadro
                const allTemplates = [...getUserBoardTemplates(currentUser.id), ...getSystemBoardTemplates()];
                const selectedTemplate = allTemplates.find(t => t.id === templateId);
                if (selectedTemplate && !title) title = `${selectedTemplate.name} ${t('kanban.board.copySuffix')}`;
                const newColumns = selectedTemplate ? selectedTemplate.columns.map(colTmpl => saveColumn({ title: t(colTmpl.name), color: colTmpl.color, cardIds: [] })) : [];
                const newBoardData = { 
                    title, 
                    description, 
                    icon: selectedTemplate ? selectedTemplate.icon : icon, 
                    ownerId: currentUser.id, 
                    visibility: visibility, 
                    columnIds: newColumns.map(c => c.id) 
                };

                // --- NOVA LÓGICA PARA GRUPO ---
                if (visibility === 'group') {
                    const groupId = document.getElementById('board-group-select').value;
                    if (!groupId) {
                        showDialogMessage(confirmationDialog, t('kanban.feedback.selectGroupForBoard'), 'error');
                        return false; // Impede o fechamento do diálogo
                    }
                    newBoardData.groupId = groupId;
                }
                
                savedBoard = saveBoard(newBoardData);

                // --- ATUALIZA O GRUPO COM O NOVO QUADRO ---
                if (savedBoard.groupId) {
                    const group = getGroup(savedBoard.groupId);
                    if (group) {
                        if (!group.boardIds) group.boardIds = [];
                        group.boardIds.push(savedBoard.id);
                        saveGroup(group);
                    }
                }
            }

            if (savedBoard) {
              showDialogMessage(confirmationDialog, t('kanban.feedback.boardSaved'), 'success');

              // --- CORREÇÃO: Se um quadro de grupo foi criado, muda o filtro ---
              // Verifica se é um quadro novo (boardId é nulo) e se tem um groupId
              if ((!boardId || boardId === 'null') && savedBoard.groupId) {
                  currentBoardFilter = 'group';
                  // Atualiza a classe 'active' nos botões de filtro
                  document.querySelectorAll('#board-filter-toggle .filter-btn').forEach(btn => {
                      btn.classList.toggle('active', btn.dataset.filter === 'group');
                  });
              }
              showSuccessAndRefresh(dialog, savedBoard.id);
              return true; // Fecha o diálogo de confirmação
            }
            return false; // Mantém o diálogo de confirmação aberto em caso de erro
        }
    );
}

function showColumnDialog(columnId = null) {
    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.noBoardForColumn'), 'error');
        return;
    }
    const dialog = document.getElementById('column-dialog');
    const column = columnId ? findColumn(columnId) : null;

    dialog.dataset.editingId = columnId;
    document.getElementById('column-title-input').value = column ? column.title : '';
    document.getElementById('column-description').value = column ? column.description || '' : '';

    const colorTrigger = document.getElementById('column-color-trigger');
    const textColorTrigger = document.getElementById('column-text-color-trigger');

    const initialColor = column ? column.color || '#3c3c3c' : '#3c3c3c';
    colorTrigger.style.backgroundColor = initialColor;
    colorTrigger.dataset.color = initialColor;
    colorTrigger.onclick = () => {
        showCustomColorPickerDialog(colorTrigger.dataset.color, (newColor) => {
            colorTrigger.style.backgroundColor = newColor;
            colorTrigger.dataset.color = newColor;
        });
    };

    const initialTextColor = column ? column.textColor || '#e0e0e0' : '#e0e0e0';
    textColorTrigger.style.backgroundColor = initialTextColor;
    textColorTrigger.dataset.color = initialTextColor;
    textColorTrigger.onclick = () => {
        showCustomColorPickerDialog(textColorTrigger.dataset.color, (newColor) => {
            textColorTrigger.style.backgroundColor = newColor;
            textColorTrigger.dataset.color = newColor;
        });
    };

    // NOVA LÓGICA: Botão para resetar as cores da coluna
    const resetBtn = document.getElementById('reset-column-colors-btn');
    resetBtn.onclick = () => {
        const defaultBg = 'var(--bg-column-header)';
        const defaultText = 'var(--text)';

        colorTrigger.style.backgroundColor = defaultBg;
        colorTrigger.dataset.color = defaultBg;

        textColorTrigger.style.backgroundColor = defaultText;
        textColorTrigger.dataset.color = defaultText;
    };
    dialog.querySelector('.btn.danger').style.display = columnId ? 'inline-block' : 'none';
    dialog.showModal();
}

// Em kanban.js
function handleSaveColumn() {
    const dialog = document.getElementById('column-dialog');
    const title = document.getElementById('column-title-input').value.trim();
    if (!title) {
        showDialogMessage(dialog, t('kanban.dialog.titleRequired'), 'error');
        return;
    }

    showConfirmationDialog(
        t('kanban.confirm.saveColumn'),
        (confirmationDialog) => {
            saveState(); // Salva o estado para o Desfazer
            const columnId = dialog.dataset.editingId;
            
            const bgColor = document.getElementById('column-color-trigger').dataset.color;
            const textColor = document.getElementById('column-text-color-trigger').dataset.color;

            const columnData = { 
                title, 
                description: document.getElementById('column-description').value, 
                // Se a cor for uma variável CSS (padrão), salva null para que a coluna herde o tema.
                // Caso contrário, salva a cor customizada.
                color: bgColor.startsWith('var(') ? null : bgColor,
                textColor: textColor.startsWith('var(') ? null : textColor
            };

            if (columnId && columnId !== 'null') {
                const existingColumn = getColumn(columnId);
                if (existingColumn) {
                    Object.assign(existingColumn, columnData);
                    saveColumn(existingColumn);
                }
            } else { // Criando uma nova coluna
                const newColumn = saveColumn({ ...columnData, cardIds: [] });
                // Busca o quadro do storage para garantir que estamos atualizando a versão mais recente
                const boardData = getBoard(currentBoard.id);
                if (boardData) {
                    boardData.columnIds.push(newColumn.id);
                    saveBoard(boardData);
                }
            }
            showDialogMessage(confirmationDialog, t('kanban.feedback.columnSaved'), 'success');
            showSuccessAndRefresh(dialog, currentBoard.id);
            return true;
        }
    );
}

/**
 * Mostra uma mensagem de sucesso, espera, fecha o diálogo e atualiza a UI.
 * É a função padrão para finalizar operações de salvamento bem-sucedidas.
 * @param {HTMLElement|null} dialog O diálogo a ser manipulado. Pode ser nulo se a ação não vier de um diálogo.
 * @param {string} boardToFocusId O ID do quadro que deve estar em foco após a atualização.
 */
function showSuccessAndRefresh(dialog, boardToFocusId) {
  const delay = dialog ? 1500 : 100; // Delay menor se não houver diálogo
  if (dialog) {
    dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);
  }

  setTimeout(() => {
    // --- LÓGICA DE ATUALIZAÇÃO SEGURA (CORRIGIDA) ---
    // Recarrega a lista de quadros (pessoais e de grupo) para garantir que temos os dados mais recentes.
    const userProfile = getUserProfile(currentUser.id);
    const personalBoards = (userProfile.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
    const allGroups = getAllGroups();
    const memberGroups = allGroups.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    const groupBoardIds = memberGroups.flatMap(g => g.boardIds || []);
    const groupBoards = groupBoardIds.map(id => getFullBoardData(id)).filter(Boolean);
    const allBoardMap = new Map();
    personalBoards.forEach(b => allBoardMap.set(b.id, b));
    groupBoards.forEach(b => allBoardMap.set(b.id, b));
    boards = Array.from(allBoardMap.values());

    // Define o quadro atual como o que foi salvo/editado
    currentBoard = boards.find(b => b.id === boardToFocusId) || boards[0];
    if (currentBoard) {
      localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard.id);
    }

    // Renderiza a tela com os dados frescos
    renderBoardSelector();
    initCustomSelects(); // ATUALIZAÇÃO: Garante que o select customizado seja reconstruído.
    renderCurrentBoard();

    // Fecha o diálogo e reabilita os botões, se houver um diálogo
    if (dialog) {
      dialog.close();
      dialog.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
  }, delay);
}

function showCardDialog(cardId = null, columnId) {
    const dialog = document.getElementById('card-dialog');
    const result = cardId ? findCardAndColumn(cardId) : null;
    const card = result ? result.card : null;
        // Se estamos editando, o columnId vem do resultado da busca.
    // Se estamos criando, ele vem do parâmetro da função.
    const targetColumnId = result ? result.column.id : columnId;

    dialog.dataset.editingId = cardId;
    dialog.dataset.originalColumnId = targetColumnId; // Guarda a coluna original

    document.getElementById('card-title-input').value = card ? card.title : '';
    document.getElementById('card-description').value = card ? card.description || '' : '';
    
    // Reseta o feedback de erro
    dialog.querySelector('.feedback').classList.remove('show');

    // Lógica para separar data e hora
    if (card && card.dueDate) {
        const dateObj = new Date(card.dueDate);
        // Ajusta para o fuso horário local para evitar bugs de um dia a menos
        const localIsoString = new Date(dateObj.getTime() - (dateObj.getTimezoneOffset() * 60000)).toISOString();
        document.getElementById('card-due-date').value = localIsoString.split('T')[0];
        document.getElementById('card-due-time').value = localIsoString.split('T')[1].substring(0, 5);
    } else {
        document.getElementById('card-due-date').value = '';
        document.getElementById('card-due-time').value = '';
    }

    // NOVA LÓGICA: Cores do Cartão
    const cardBgColorTrigger = document.getElementById('card-bg-color-trigger');
    const cardTextColorTrigger = document.getElementById('card-text-color-trigger');

    // Define a cor inicial do seletor de fundo
    const initialBgColor = card ? card.backgroundColor || 'var(--bg-card)' : 'var(--bg-card)';
    cardBgColorTrigger.style.backgroundColor = initialBgColor;
    cardBgColorTrigger.dataset.color = initialBgColor;
    cardBgColorTrigger.onclick = () => {
        showCustomColorPickerDialog(cardBgColorTrigger.dataset.color, (newColor) => {
            cardBgColorTrigger.style.backgroundColor = newColor;
            cardBgColorTrigger.dataset.color = newColor;
        });
    };

    // Define a cor inicial do seletor de texto
    const initialTextColor = card ? card.textColor || 'var(--text)' : 'var(--text)';
    cardTextColorTrigger.style.backgroundColor = initialTextColor;
    cardTextColorTrigger.dataset.color = initialTextColor;
    cardTextColorTrigger.onclick = () => {
        showCustomColorPickerDialog(cardTextColorTrigger.dataset.color, (newColor) => {
            cardTextColorTrigger.style.backgroundColor = newColor;
            cardTextColorTrigger.dataset.color = newColor;
        });
    };

    // NOVA LÓGICA: Botão para resetar as cores
    const resetBtn = document.getElementById('reset-card-colors-btn');
    resetBtn.onclick = () => {
        const defaultBg = 'var(--bg-card)';
        const defaultText = 'var(--text)';

        cardBgColorTrigger.style.backgroundColor = defaultBg;
        cardBgColorTrigger.dataset.color = defaultBg;

        cardTextColorTrigger.style.backgroundColor = defaultText;
        cardTextColorTrigger.dataset.color = defaultText;
    };

        // Lógica do select de coluna
    const columnSelectGroup = document.getElementById('card-column-select-group');
    const columnSelect = document.getElementById('card-column-select');
    columnSelect.innerHTML = '';
    currentBoard.columns.forEach(col => {
        const option = document.createElement('option');
        option.value = col.id;
        option.textContent = col.title;
        if (col.id === targetColumnId) {
            option.selected = true;
        }
        columnSelect.appendChild(option);
    });

    // O select só aparece se houver mais de uma coluna, ou se estivermos criando
    // um cartão a partir do menu principal (quando cardId é nulo).
    columnSelectGroup.style.display = (currentBoard.columns.length > 1 || !cardId) ? 'block' : 'none';

    // Popula o select de etiquetas (COM LÓGICA CORRIGIDA)
    const tagSelect = document.getElementById('card-tags');
    tagSelect.innerHTML = ''; // Limpa antes de popular

    const userPrefs = currentUser.preferences || {};
    const defaultTemplateId = userPrefs.defaultTagTemplateId;

    let activeTagTemplate = null;

    if (defaultTemplateId) {
        // Procura primeiro nos templates do usuário
        activeTagTemplate = getUserTagTemplates(currentUser.id).find(t => t.id === defaultTemplateId);
        // Se não encontrar, procura nos do sistema
        if (!activeTagTemplate) {
            activeTagTemplate = getSystemTagTemplates().find(t => t.id === defaultTemplateId);
        }
    }

    // Se ainda não encontrou (ou não havia ID), usa o primeiro template do sistema como fallback
    if (!activeTagTemplate) {
        const systemTemplates = getSystemTagTemplates();
        if (systemTemplates.length > 0) {
            activeTagTemplate = systemTemplates[0];
        }
    }

        // Popula o select com as etiquetas do template ativo
    if (activeTagTemplate && activeTagTemplate.tags) {
        activeTagTemplate.tags.forEach(tag => {
            const option = document.createElement('option');
           option.value = tag.name;
            option.textContent = tag.name;
            if (card && card.tags?.includes(tag.name)) {
                option.selected = true;
            }
            tagSelect.appendChild(option);
        });
    } else {
        // Caso não haja nenhum template, mostra uma mensagem
        tagSelect.innerHTML = `<option value="">${t('kanban.dialog.card.noTagSets')}</option>`;
    }
    
    // Popula o select "Atribuir a:" com nomes de usuários
    const assigneeSelect = document.getElementById('card-assigned-to');
    assigneeSelect.innerHTML = `<option value="">${t('kanban.dialog.card.noAssignee')}</option>`;

    let assignableUsers = new Map();
    assignableUsers.set(currentUser.id, currentUser); // Sempre pode atribuir a si mesmo

    if (currentBoard.visibility === 'public') {
        // Se for público, adiciona os amigos do usuário atual
        const userProfile = getUserProfile(currentUser.id);
        if (userProfile.friends) {
            userProfile.friends.forEach(friendId => {
                const friend = allUsers.find(u => u.id === friendId);
                if (friend) assignableUsers.set(friend.id, friend);
            });
        }
    } else if (currentBoard.visibility === 'group' && currentBoard.groupId) {
        // Se for de grupo, adiciona os membros do grupo
        const group = getGroup(currentBoard.groupId);
        if (group && group.memberIds) {
            group.memberIds.forEach(memberId => {
                const member = allUsers.find(u => u.id === memberId);
                if (member) assignableUsers.set(member.id, member);
            });
        }
    }

    // Popula o select com os usuários filtrados
    assignableUsers.forEach(user => {
        if (user) {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            if (card && card.assignedTo === user.id) {
                option.selected = true;
            }
            assigneeSelect.appendChild(option);
        }
    });

    // Inicializa os selects customizados APÓS popular os dados
    initCustomSelects();

    dialog.showModal();
}

function handleSaveCard() {
    const title = document.getElementById('card-title-input').value.trim();
    const dialog = document.getElementById('card-dialog');
    if (!title) { showDialogMessage(dialog, t('kanban.dialog.titleRequired'), 'error'); return; }

    showConfirmationDialog(
        t('kanban.confirm.saveCard'),
        (confirmationDialog) => {
            const cardId = dialog.dataset.editingId;
            const newColumnId = document.getElementById('card-column-select').value;
            const dateValue = document.getElementById('card-due-date').value;
            const timeValue = document.getElementById('card-due-time').value;
            let combinedDateTime = dateValue ? (timeValue ? `${dateValue}T${timeValue}:00` : `${dateValue}T00:00:00`) : null;
            
            const bgColor = document.getElementById('card-bg-color-trigger').dataset.color;
            const textColor = document.getElementById('card-text-color-trigger').dataset.color;

            const cardData = {
                title, 
                description: document.getElementById('card-description').value.trim(), 
                dueDate: combinedDateTime, 
                tags: Array.from(document.getElementById('card-tags').selectedOptions).map(opt => opt.value), 
                assignedTo: document.getElementById('card-assigned-to').value,
                // Se a cor for uma variável CSS (padrão), salva null para que o cartão herde o tema.
                // Caso contrário, salva a cor customizada.
                backgroundColor: bgColor.startsWith('var(') ? null : bgColor,
                textColor: textColor.startsWith('var(') ? null : textColor
            };

            const previousAssignee = getCard(cardId)?.assignedTo;
            if (cardId && cardId !== 'null') {
                const originalCard = getCard(cardId);
                if (!originalCard) return false;
                const sourceColumn = currentBoard.columns.find(c => c.cardIds.includes(cardId));
                
                Object.assign(originalCard, cardData);
                saveCard(originalCard);

                if (sourceColumn && sourceColumn.id !== newColumnId) {
                    sourceColumn.cardIds = sourceColumn.cardIds.filter(id => id !== cardId);
                    saveColumn(sourceColumn);
                    const targetColumn = currentBoard.columns.find(c => c.id === newColumnId);
                    if (targetColumn) {
                        targetColumn.cardIds.push(cardId);
                        saveColumn(targetColumn);
                    }
                }
            } else {
                cardData.creatorId = currentUser.id;
                cardData.isComplete = false;
                const newCard = saveCard(cardData);
                const targetColumn = currentBoard.columns.find(c => c.id === newColumnId);
                if (targetColumn) {
                    targetColumn.cardIds.push(newCard.id);
                    saveColumn(targetColumn);
                }
            }

            // Enviar notificação se a atribuição mudou para um novo usuário
            const newAssigneeId = cardData.assignedTo;
            if (newAssigneeId && newAssigneeId !== previousAssignee) {
                // Importe a função addCardAssignmentNotification se ainda não o fez
                // import { addCardAssignmentNotification } from './notifications.js';
                addCardAssignmentNotification(
                    currentUser.name, // Nome de quem atribuiu
                    newAssigneeId,    // ID de quem recebeu a tarefa
                    cardData.title,   // Título do cartão
                    currentBoard.title // Nome do quadro
                );
            }

            saveState(); // Salva o estado APÓS as modificações
            showDialogMessage(confirmationDialog, t('kanban.feedback.cardSaved'), 'success');
            showSuccessAndRefresh(dialog, currentBoard.id);
            return true;
        }
    );
}

// ===== LÓGICA DE EXPORTAÇÃO E IMPRESSÃO =====

function handleExportImage() {
    showFloatingMessage(t('kanban.feedback.preparingExport'), 'info');
    const boardArea = document.getElementById('main-area');
    
    // Para esta função funcionar, a biblioteca html2canvas precisa ser importada no seu HTML:
    // <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    if (typeof html2canvas === 'undefined') {
        showFloatingMessage(t('kanban.feedback.exportError'), 'error');
        console.error("html2canvas não está carregada. Adicione o script ao seu HTML.");
        return;
    }

    html2canvas(boardArea, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        useCORS: true,
        scale: 1.5 // Aumenta a resolução da imagem
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${currentBoard.title.replace(/ /g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(err => {
        console.error("Erro ao exportar imagem:", err);
        showFloatingMessage(t('kanban.feedback.exportFail'), 'error');
    });
}

function handlePrintBoard() {
    const boardTitle = currentBoard.title;
    const userName = currentUser.name;
    const printDate = new Date().toLocaleString('pt-BR');

    // --- NOVA LÓGICA ---
    // 1. Gerar estilos customizados para as colunas
    let columnStyles = '';
    currentBoard.columns.forEach(column => {
        // O seletor de atributo é mais robusto que um ID, pois o innerHTML não copia IDs únicos
        columnStyles += `
            .column[data-column-id="${column.id}"] .cards-container {
                background-color: ${column.color || '#f9f9f9'} !important;
            }
        `;
    });

    // 2. Clonar a área do quadro para não afetar a página principal
    const boardAreaClone = document.getElementById('main-area').cloneNode(true);
    // Remover botões e elementos interativos da cópia
    boardAreaClone.querySelectorAll('.paste-card-btn, .add-card-btn, .card-hover-info').forEach(el => el.remove());

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>${t('kanban.print.title', { title: boardTitle })}</title>
                <style>
                    body { font-family: Segoe UI, sans-serif; background-color: white !important; color: black; -webkit-print-color-adjust: exact; color-adjust: exact; }
                    #main-area { padding: 20px; }
                    #kanban-title { text-align: center; font-size: 24px; margin-bottom: 20px; color: black; }
                    #columns-container { display: flex; gap: 15px; overflow-x: auto; }
                    .column { border: 1px solid #ccc; border-radius: 8px; width: 300px; background-color: #f0f0f0; page-break-inside: avoid; vertical-align: top; display: inline-block; }
                    .column-header { background-color: #e0e0e0; padding: 10px; font-weight: bold; text-align: center; border-bottom: 1px solid #ccc; border-radius: 8px 8px 0 0; }
                    .cards-container { padding: 10px; min-height: 50px; }
                    .card { border: 1px solid #ddd; border-radius: 4px; padding: 10px; margin-bottom: 10px; background-color: white; page-break-inside: avoid; box-shadow: 0 1px 2px rgba(0,0,0,0.1); text-align: center; }
                    .card-title { font-weight: bold; color: black; }
                    .print-footer { text-align: center; font-size: 12px; color: #666; padding: 20px 0 10px 0; border-top: 1px solid #ccc; margin-top: 30px; }
                    ${columnStyles}
                </style>
            </head>
            <body>
                <div id="main-area">${boardAreaClone.innerHTML}</div>
                <div class="print-footer">${t('kanban.print.printedBy', { name: userName, date: printDate })}</div>
            </body>
        </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500); // Delay para garantir que o conteúdo seja renderizado
}

// ===== LÓGICA DE DRAG-AND-DROP =====

function handleDragStart(e) {
    hideTooltip(); // Esconde qualquer tooltip ao começar a arrastar
    isDragging = true;

    const targetCard = e.target.closest('.card');
    const targetColumnHeader = e.target.closest('.column-header');

    if (targetCard) {
        draggedElement = targetCard;
        e.dataTransfer.setData('text/plain', draggedElement.dataset.cardId);
    } else if (targetColumnHeader) {
        draggedElement = targetColumnHeader.closest('.column');
        e.dataTransfer.setData('text/plain', draggedElement.dataset.columnId);
    } else {
        return; // Não é um elemento arrastável
    }

    if (draggedElement) {
        // Adiciona um pequeno delay para o navegador registrar o início do arraste antes de aplicar a classe
        setTimeout(() => {
            draggedElement.classList.add('dragging');
        }, 0);
        e.dataTransfer.effectAllowed = 'move';
    }
}

function handleDragEnd(e) {
    isDragging = false;
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
    }
    // Remove o realce de todas as colunas
    document.querySelectorAll('.column.drag-over').forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    const targetColumn = e.target.closest('.column');
    if (targetColumn) {
        // Remove a classe de outras colunas para ter apenas um alvo por vez
        document.querySelectorAll('.column.drag-over').forEach(col => {
            if (col !== targetColumn) col.classList.remove('drag-over');
        });
        targetColumn.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const targetColumn = e.target.closest('.column');
    // Só remove a classe se o mouse realmente saiu da coluna (e não apenas de um elemento filho)
    if (targetColumn && !targetColumn.contains(e.relatedTarget)) {
        targetColumn.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedElement) return;

    const targetColumnEl = e.target.closest('.column');
    if (!targetColumnEl) return;

    targetColumnEl.classList.remove('drag-over');

    const isCard = draggedElement.classList.contains('card');
    const isColumn = draggedElement.classList.contains('column');

    if (isCard) {
        const cardId = draggedElement.dataset.cardId;
        const sourceColumnId = draggedElement.closest('.column').dataset.columnId;
        const targetColumnId = targetColumnEl.dataset.columnId;

        const sourceColumn = currentBoard.columns.find(c => c.id === sourceColumnId);
        const targetColumn = currentBoard.columns.find(c => c.id === targetColumnId);
        if (!sourceColumn || !targetColumn) return;

        // Move o elemento no DOM para feedback visual imediato
        const cardsContainer = targetColumnEl.querySelector('.cards-container');
        const afterElement = getDragAfterElement(cardsContainer, e.clientY, false);
        if (afterElement) {
            cardsContainer.insertBefore(draggedElement, afterElement);
        } else {
            cardsContainer.appendChild(draggedElement);
        }

        // Atualiza o modelo de dados
        const originalCardIndex = sourceColumn.cardIds.indexOf(cardId);
        if (originalCardIndex === -1) return;

        const [removedCardObject] = sourceColumn.cards.splice(originalCardIndex, 1);
        sourceColumn.cardIds.splice(originalCardIndex, 1);

        const newIndex = afterElement ? Array.from(cardsContainer.children).indexOf(afterElement) : targetColumn.cardIds.length;

        targetColumn.cardIds.splice(newIndex, 0, cardId);
        targetColumn.cards.splice(newIndex, 0, removedCardObject);

        saveColumn(sourceColumn);
        if (sourceColumnId !== targetColumnId) saveColumn(targetColumn);

    } else if (isColumn) {
        const columnId = draggedElement.dataset.columnId;
        const columnsContainer = document.getElementById('columns-container');
        const afterElement = getDragAfterElement(columnsContainer, e.clientX, true);

        // Move no DOM
        if (afterElement) {
            columnsContainer.insertBefore(draggedElement, afterElement);
        } else {
            columnsContainer.appendChild(draggedElement);
        }

        // Reordena os IDs no objeto do quadro
        const newOrderIds = Array.from(columnsContainer.children).map(col => col.dataset.columnId);
        currentBoard.columnIds = newOrderIds;
        saveBoard(currentBoard);
    }
    
    saveState(); // Salva o estado APÓS a modificação
}

function getDragAfterElement(container, coordinate, isHorizontal) {
    const draggableElements = [...container.querySelectorAll('.card:not(.dragging), .column:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = isHorizontal 
            ? coordinate - box.left - box.width / 2 
            : coordinate - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/**
 * Itera sobre todos os cartões do usuário e envia notificações de vencimento.
 */
function checkAllCardDueDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    boards.forEach(board => {
        board.columns.forEach(column => {
            column.cards.forEach(card => {
                // Só notifica se o cartão tiver data, um responsável e não tiver sido notificado ainda
                if (card.dueDate && card.assignedTo && !card.dueDateNotified) {
                    const dueDate = new Date(card.dueDate);
                    dueDate.setHours(0, 0, 0, 0);

                    const diffTime = dueDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    // Notifica se estiver atrasado ou vencendo em até 2 dias
                    if (diffDays <= 2) { // Notifica se estiver atrasado ou vencendo em até 2 dias
                        addCardDueNotification(card.assignedTo, card.title, board.title, card.id, card.dueDate);
                        card.dueDateNotified = true; // Marca como notificado
                        saveCard(card); // Salva a alteração no cartão
                    }
                }
            });
        });
    });
}

// --- LÓGICA DO MENU DE CONTEXTO (BOTÃO DIREITO) ---

/**
 * Lida com o evento de clique com o botão direito no container das colunas.
 */
function handleContextMenu(e) {
    const cardEl = e.target.closest('.card');
    const columnHeaderEl = e.target.closest('.column-header');

    if (cardEl) {
        createCardContextMenu(e, cardEl);
    } else if (columnHeaderEl) {
        createColumnContextMenu(e, columnHeaderEl.parentElement);
    }
}

/**
 * Cria e exibe o menu de contexto para um cartão.
 */
function createCardContextMenu(event, cardEl) {
    const cardId = cardEl.dataset.cardId;
    const { card } = findCardAndColumn(cardId);
    
    const menuItems = [
        { label: t('kanban.contextMenu.card.edit'), icon: '✏️', action: () => showCardDialog(cardId) },
        { label: t('kanban.contextMenu.card.details'), icon: 'ℹ️', action: () => showDetailsDialog(cardId) },
        { label: card.isComplete ? t('kanban.contextMenu.card.markPending') : t('kanban.contextMenu.card.markComplete'), icon: card.isComplete ? '⚪' : '✅', action: () => toggleCardComplete(cardId) },
        { isSeparator: true },
        { label: t('kanban.contextMenu.card.copy'), icon: '📋', action: () => handleCopyCard(cardId) },
        { label: t('kanban.contextMenu.card.cut'), icon: '✂️', action: () => handleCutCard(cardId) },
        { isSeparator: true },
        { label: t('kanban.contextMenu.card.delete'), icon: '🗑️', action: () => handleDeleteCard(cardId), isDestructive: true },
    ];

    showContextMenu(event, menuItems);
}

/**
 * Cria e exibe o menu de contexto para uma coluna.
 */
function createColumnContextMenu(event, columnEl) {
    const columnId = columnEl.dataset.columnId;

    const menuItems = [
        { label: t('kanban.contextMenu.column.edit'), icon: '✏️', action: () => showColumnDialog(columnId) },
        { label: t('kanban.contextMenu.column.details'), icon: 'ℹ️', action: () => showDetailsDialog(null, columnId) },
        { label: t('kanban.contextMenu.column.cut'), icon: '✂️', action: () => handleCutColumn(columnId) },
        { label: t('kanban.contextMenu.column.copy'), icon: '📋', action: () => handleCopyColumn(columnId) },
        { isSeparator: true },
        { label: t('kanban.contextMenu.column.delete'), icon: '🗑️', action: () => handleDeleteColumnFromMenu(columnId), isDestructive: true },
    ];

    showContextMenu(event, menuItems);
}


// --- LÓGICA DO DIÁLOGO DE DETALHES ---

/**
 * Mostra o diálogo de detalhes para um cartão ou coluna.
 */
function showDetailsDialog(cardId = null, columnId = null) {
    const dialog = document.getElementById('details-dialog');
    const titleEl = document.getElementById('details-title');
    const contentEl = document.getElementById('details-content');
    contentEl.innerHTML = ''; // Limpa o conteúdo anterior

    if (cardId) {
        const { card } = findCardAndColumn(cardId);
        titleEl.textContent = t('kanban.dialog.details.cardTitle', { title: card.title });
        
        const creator = allUsers.find(u => u.id === card.creatorId);
        const assignee = allUsers.find(u => u.id === card.assignedTo);
        
        let detailsHtml = '<ul>';
        if (creator) detailsHtml += `<li><strong>${t('kanban.dialog.details.creator')}</strong> ${creator.name}</li>`;
        if (assignee) detailsHtml += `<li><strong>${t('kanban.dialog.details.assignee')}</strong> ${assignee.name}</li>`;
        detailsHtml += `<li><strong>${t('kanban.dialog.details.status')}</strong> ${card.isComplete ? t('kanban.dialog.details.statusCompleted') : t('kanban.dialog.details.statusActive')}</li>`;
        if (card.dueDate) detailsHtml += `<li><strong>${t('kanban.dialog.details.dueDate')}</strong> ${new Date(card.dueDate).toLocaleString()}</li>`;
        if (card.tags && card.tags.length > 0) detailsHtml += `<li><strong>${t('kanban.dialog.details.tags')}</strong> ${card.tags.join(', ')}</li>`;
        if (card.description) detailsHtml += `<li><strong>${t('kanban.dialog.details.description')}</strong><p>${card.description.replace(/\n/g, '<br>')}</p></li>`;
        detailsHtml += '</ul>';
        
        contentEl.innerHTML = detailsHtml;

    } else if (columnId) {
        const column = findColumn(columnId);
        titleEl.textContent = t('kanban.dialog.details.columnTitle', { title: column.title });
        
        let detailsHtml = '<ul>';
        if (column.description) detailsHtml += `<li><strong>${t('kanban.dialog.details.description')}</strong><p>${column.description.replace(/\n/g, '<br>')}</p></li>`;
        // No futuro, poderíamos adicionar criador, etc. à coluna
        detailsHtml += '</ul>';
        
        contentEl.innerHTML = detailsHtml;
    }

    dialog.showModal();
}

// ===== LÓGICA DE AÇÕES E UTILIDADES =====

function switchBoard(e) {
    const boardId = e.target.value;
    currentBoard = boards.find(b => b.id === boardId);
    localStorage.setItem(`currentBoardId_${currentUser.id}`, boardId);
    undoStack = [];
    redoStack = [];
    renderCurrentBoard();
    saveState();
}


function handleDeleteColumnFromMenu(columnId){
    showConfirmationDialog(
        t('kanban.confirm.deleteColumn'),
        (confirmationDialog) => {
            const boardData = getBoard(currentBoard.id);
            boardData.columnIds = boardData.columnIds.filter(id => id !== columnId);
            saveBoard(boardData);
            deleteColumn(columnId); // Deleta a coluna e seus cartões
            currentBoard = getFullBoardData(currentBoard.id);
            renderCurrentBoard();
            saveState(); // Salva o estado APÓS a modificação
            showDialogMessage(confirmationDialog, t('kanban.feedback.columnDeleted'), 'success');
            return true;
        },
        null,
        t('ui.yesDelete'),
        t('ui.no')
    );
}

function toggleCardComplete(cardId) {
    const { card } = findCardAndColumn(cardId);
    if (card) {
        card.isComplete = !card.isComplete;
        saveCard(card); // Salva a alteração no armazenamento
        saveState();
        renderCurrentBoard(); // Redesenha a tela para refletir a mudança
    }
}

function handleDeleteBoard() {
    if (!currentBoard) return;
    showConfirmationDialog(
        t('kanban.confirm.deleteBoard', { boardTitle: currentBoard.title }),
        (dialog) => {
            // Não salva estado para o Desfazer, pois é uma ação destrutiva maior
            undoStack = [];
            redoStack = [];
            deleteBoard(currentBoard.id);

            // --- CORREÇÃO: Recarrega TODOS os quadros (pessoais e de grupo) ---
            const userProfile = getUserProfile(currentUser.id);
            const personalBoards = (userProfile.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
            const allGroups = getAllGroups();
            const memberGroups = allGroups.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
            const groupBoards = memberGroups.flatMap(g => g.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
            const allBoardMap = new Map();
            personalBoards.forEach(b => allBoardMap.set(b.id, b));
            groupBoards.forEach(b => allBoardMap.set(b.id, b));
            boards = Array.from(allBoardMap.values());

            currentBoard = boards[0] || null;
            localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : null);
            
            renderBoardSelector();
            initCustomSelects(); // ATUALIZAÇÃO: Garante que o select customizado seja reconstruído.
            renderCurrentBoard();
            showDialogMessage(dialog, t('kanban.feedback.boardDeleted'), 'success');
            return true;
        },
        null,
        t('ui.yesDelete'),
        t('ui.no')
    );
}

function handleDeleteColumn(columnId) {
    if (!columnId) return;

    showConfirmationDialog(
        t('kanban.confirm.deleteColumn'),
        (confirmationDialog) => {
            const boardData = getBoard(currentBoard.id);
            boardData.columnIds = boardData.columnIds.filter(id => id !== columnId);
            saveBoard(boardData);
            deleteColumn(columnId); // Deleta a coluna e seus cartões
            currentBoard = getFullBoardData(currentBoard.id);
            saveState();
            renderCurrentBoard();
            document.getElementById('column-dialog').close(); // Close the original column dialog
            showDialogMessage(confirmationDialog, t('kanban.feedback.columnDeleted'), 'success');
            return true;
        },
        null,
        t('ui.yesDelete'),
        t('ui.no')
    );
}

function handleDeleteCard(cardId) {
    showConfirmationDialog(
        t('kanban.confirm.deleteCard'),
        (dialog) => {
            const columnData = getColumn(currentBoard.columns.find(c => c.cardIds.includes(cardId)).id);
            columnData.cardIds = columnData.cardIds.filter(id => id !== cardId);
            saveColumn(columnData);
            deleteCard(cardId);
            currentBoard = getFullBoardData(currentBoard.id);
            renderCurrentBoard();
            saveState();
            showDialogMessage(dialog, t('kanban.feedback.cardDeleted'), 'success');
            return true;
        },
        null,
        t('ui.yesDelete'),
        t('ui.no')
    );
}

function saveState() {
    redoStack = [];
    undoStack.push(JSON.stringify(currentBoard));
    if (undoStack.length > 50) {
        undoStack.shift();
    }
}

function undoAction() {
    if (undoStack.length <= 1) {
        showFloatingMessage(t('kanban.feedback.nothingToUndo'), 'info');
        return;
    }
    const currentState = undoStack.pop();
    redoStack.push(currentState);
    
    const previousState = JSON.parse(undoStack[undoStack.length - 1]);
    currentBoard = previousState;

    // ATUALIZAÇÃO: Garante que a lista de quadros em memória também seja atualizada.
    const boardIndex = boards.findIndex(b => b.id === currentBoard.id);
    if (boardIndex !== -1) {
        boards[boardIndex] = currentBoard;
    } else {
        // Isso não deveria acontecer, mas como segurança:
        boards.push(currentBoard);
    }

    renderCurrentBoard();
    saveBoard(currentBoard);
}

function redoAction() {
    if (redoStack.length === 0) {
        showFloatingMessage(t('kanban.feedback.nothingToRedo'), 'info');
        return;
    }
    const nextStateString = redoStack.pop();
    undoStack.push(nextStateString);
    
    const redoneState = JSON.parse(nextStateString);
    currentBoard = redoneState;

    // ATUALIZAÇÃO: Garante que a lista de quadros em memória também seja atualizada.
    const boardIndex = boards.findIndex(b => b.id === currentBoard.id);
    if (boardIndex !== -1) {
        boards[boardIndex] = currentBoard;
    } else {
        // Isso não deveria acontecer, mas como segurança:
        boards.push(currentBoard);
    }

    renderCurrentBoard();
    saveBoard(currentBoard);
}

function handleKeyDown(e) {
    // Atalhos específicos da página Kanban
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoAction();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoAction();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'v' && clipboard) {
        e.preventDefault();
        handlePaste();
    }
    
    // A lógica do "Enter" foi removida daqui.
    // Agora ela é gerenciada globalmente pelo ui-controls.js,
    // que é a abordagem correta.
}

/**
 * Copia um cartão para a área de transferência interna.
 * @param {string} cardId - O ID do cartão a ser copiado.
 */
function handleCopyCard(cardId) {
    const { card, column } = findCardAndColumn(cardId);
    if (card) {
        clipboard = {
            type: 'card',
            mode: 'copy',
            sourceColumnId: column.id, // Guarda a coluna de origem
            // Clona o cartão, reseta o ID, adiciona (Cópia) e define o usuário atual como criador
            data: { 
                ...card, 
                id: null, 
                title: `${card.title} ${t('kanban.board.copySuffix')}`,
                creatorId: currentUser.id, 
                createdAt: new Date().toISOString() 
            }
        };
        showFloatingMessage(t('kanban.feedback.cardCopied'), 'info');
        updatePasteButtons();
    }
}

/**
 * Recorta um cartão para a área de transferência, marcando-o para ser movido.
 * @param {string} cardId - O ID do cartão a ser recortado.
 */
function handleCutCard(cardId) {
    const { card, column } = findCardAndColumn(cardId);
    if (card) {
        clipboard = {
            type: 'card',
            mode: 'cut',
            sourceCardId: cardId,
            sourceColumnId: column.id,
            data: card
        };
        showFloatingMessage(t('kanban.feedback.cardCut'), 'info');
        updatePasteButtons();
    }
}

/**
 * Cola um cartão da área de transferência em uma nova coluna.
 * @param {string} targetColumnId - O ID da coluna de destino.
 */
function handlePasteCard(targetColumnId) {
    if (!clipboard || clipboard.type !== 'card') {
        showFloatingMessage(t('kanban.feedback.noCardToPaste'), 'warning');
        return;
    }

    const targetColumn = findColumn(targetColumnId);
    if (!targetColumn) return;

    if (clipboard.mode === 'cut') {
        const sourceColumn = getColumn(clipboard.sourceColumnId);
        if (sourceColumn) {
            // Sempre remove da origem
            const cardIndex = sourceColumn.cardIds.indexOf(clipboard.sourceCardId);
            if (cardIndex > -1) {
                sourceColumn.cardIds.splice(cardIndex, 1);
                saveColumn(sourceColumn);
            }
        }
        // Sempre adiciona ao destino
        targetColumn.cardIds.push(clipboard.sourceCardId);
        saveColumn(targetColumn);
    } else { // 'copy'
        const newCard = saveCard(clipboard.data);
        targetColumn.cardIds.push(newCard.id);
        saveColumn(targetColumn);
    }

    saveState();
    clipboard = null;
    showFloatingMessage(t('kanban.feedback.cardPasted'), 'success');
    showSuccessAndRefresh(null, currentBoard.id);
}

/**
 * Busca a cor de uma etiqueta no mapa de cores pré-carregado.
 * @param {string} tagName - O nome da etiqueta.
 * @returns {string} A cor hexadecimal da etiqueta ou uma cor padrão.
 */
function getTagColor(tagName) {
    return tagColorMap.get(tagName) || '#6c757d'; // Retorna a cor encontrada ou um cinza padrão
}

function findCardAndColumn(cardId) {
    for (const column of currentBoard.columns) {
        const card = column.cards.find(c => c.id === cardId);
        if (card) return { card, column };
    }
    return null;
}

function findColumn(columnId) {
    return currentBoard.columns.find(c => c.id === columnId);
}

/**
 * Atualiza a visibilidade dos botões de "colar" nas colunas.
 */
function updatePasteButtons() {
    const pasteButtons = document.querySelectorAll('.paste-card-btn');
    const display = (clipboard && clipboard.type === 'card') ? 'inline-block' : 'none';
    pasteButtons.forEach(btn => {
        btn.style.display = display;
    });
}

/**
 * Lida com a ação de colar via atalho de teclado (Ctrl+V).
 * Cola o item na primeira coluna do quadro atual.
 */
function handlePaste() {
    if (clipboard && clipboard.type === 'card') {
        // Cola sempre na primeira coluna do quadro ATUAL
        if (currentBoard.columns.length > 0) {
            const targetColumnId = currentBoard.columns[0].id;
            handlePasteCard(targetColumnId);
        } else {
            showFloatingMessage(t('kanban.feedback.createColumnToPaste'), 'warning');
        }
    } else if (clipboard && clipboard.type === 'column') {
        handlePasteColumn();
    }
}

function handleCopyColumn(columnId) {
    const columnToCopy = findColumn(columnId);
    if (columnToCopy) {
        const cardsToCopy = columnToCopy.cards.map(card => ({
            ...card,
            id: null, // Reseta o ID para criar um novo
            creatorId: currentUser.id,
            createdAt: new Date().toISOString()
        }));

        clipboard = {
            type: 'column',
            mode: 'copy',
            data: {
                ...columnToCopy,
                id: null, // Reseta o ID da coluna
                title: `${columnToCopy.title} ${t('kanban.board.copySuffix')}`,
                cards: cardsToCopy // Armazena os dados completos dos cartões a serem criados
            }
        };
        showFloatingMessage(t('kanban.feedback.columnCopied'), 'info');
        // Não precisa de updatePasteButtons, pois a colagem de coluna é via Ctrl+V
    }
}

function handleCutColumn(columnId) {
    const columnToCut = findColumn(columnId);
    if (columnToCut) {
        clipboard = {
            type: 'column',
            mode: 'cut',
            sourceColumnId: columnId,
            sourceBoardId: currentBoard.id,
            data: columnToCut
        };
        showFloatingMessage(t('kanban.feedback.columnCut'), 'info');
    }
}

// Adicione esta função se ela não existir, ou substitua a antiga
async function saveBoardAsTemplate() {
    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.noBoardForTemplate'), 'warning');
        return;
    }

    // Usa um diálogo customizado em vez do prompt nativo
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('kanban.dialog.template.title')}</h3>
        <div class="form-group">
            <label for="template-name-input">${t('kanban.dialog.template.nameLabel')}</label>
            <input type="text" id="template-name-input" value="${currentBoard.title}">
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">Cancelar</button>
            <button class="btn btn-primary">Salvar</button>
        </div>
    `;
    document.body.appendChild(dialog);
    initDraggableElements(); // Garante que o novo diálogo seja arrastável
    dialog.showModal();

    const confirmBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');
    const nameInput = dialog.querySelector('#template-name-input');

    cancelBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());

    confirmBtn.addEventListener('click', () => {
        const templateName = nameInput.value.trim();
        if (!templateName) {
            showDialogMessage(dialog, t('kanban.dialog.templateNameRequired'), 'error');
            return;
        }

        const existingTemplates = getUserBoardTemplates(currentUser.id);
        if (existingTemplates.some(t => t.name.toLowerCase() === templateName.toLowerCase())) {
            showDialogMessage(dialog, t('kanban.feedback.templateNameExists'), 'error');
            return;
        }

        const newTemplate = {
            id: 'user-board-' + Date.now(),
            name: templateName,
            icon: currentBoard.icon || '📋',
            description: t('kanban.template.descriptionFromBoard', { boardTitle: currentBoard.title }),
            columns: currentBoard.columns.map(col => ({ name: col.title, color: col.color }))
        };

        existingTemplates.push(newTemplate);
        saveUserBoardTemplates(currentUser.id, existingTemplates);

        showDialogMessage(dialog, t('kanban.feedback.templateSaved', { templateName: newTemplate.name }), 'success');
        setTimeout(() => dialog.close(), 1500);
    });
}

function handlePasteColumn() {
    if (!clipboard || clipboard.type !== 'column') {
        showFloatingMessage(t('kanban.feedback.noColumnToPaste'), 'warning');
        return;
    }

    if (clipboard.mode === 'cut') {
        // Lógica para MOVER a coluna
        const { sourceColumnId, sourceBoardId } = clipboard;

        // Não pode colar no mesmo quadro de onde recortou
        if (sourceBoardId === currentBoard.id) {
            showFloatingMessage(t('kanban.feedback.pasteColumnSameBoard'), 'info');
            clipboard = null; // Limpa o clipboard para evitar ações repetidas
            return;
        }

        // Remove a coluna do quadro de origem
        const sourceBoard = getBoard(sourceBoardId);
        if (sourceBoard) {
            sourceBoard.columnIds = sourceBoard.columnIds.filter(id => id !== sourceColumnId);
            saveBoard(sourceBoard);
        }

        // Adiciona a coluna ao quadro atual
        const targetBoard = getBoard(currentBoard.id);
        targetBoard.columnIds.push(sourceColumnId);
        saveBoard(targetBoard);

        showFloatingMessage(t('kanban.feedback.columnMoved'), 'success');

    } else { // 'copy'
        // Lógica para COPIAR a coluna
        const columnData = clipboard.data;
        const newCardIds = columnData.cards.map(cardData => saveCard(cardData).id);
        const newColumn = saveColumn({ ...columnData, cardIds: newCardIds });
        const boardData = getBoard(currentBoard.id);
        boardData.columnIds.push(newColumn.id);
        saveBoard(boardData);
        showFloatingMessage(t('kanban.feedback.columnPasted'), 'success');
    }

    saveState(); // Salva o estado para o Desfazer
    clipboard = null; // Limpa a área de transferência
    showSuccessAndRefresh(null, currentBoard.id);
}

function handlePreferencesCancel() {
    const dialog = document.getElementById('preferences-dialog');
    if (kanbanIsSaved) {
        dialog.close();
    } else {
        showConfirmationDialog(
            t('kanban.confirm.discardChanges'),
            (confirmationDialog) => { // onConfirm
                restoreKanbanOriginalSettings();
                dialog.close();
                showDialogMessage(confirmationDialog, t('kanban.feedback.changesDiscarded'), 'info');
                return true; // Fecha o diálogo de confirmação
            },
            null, // onCancel: Usa o comportamento padrão do ui-controls, que fecha a confirmação e retorna.
            t('ui.yesDiscard'),
            t('ui.no')
        );
    }
}

//Preferências

/**
 * Exibe o diálogo de preferências, populando-o com os dados do usuário.
 * Se `isTour` for verdadeiro, apenas exibe o diálogo sem anexar os listeners de salvamento.
 * @param {boolean} isTour - Indica se a chamada é do tour.
 */
function showPreferencesDialog(isTour = false) {
    const dialog = document.getElementById('preferences-dialog');
    const user = getCurrentUser();
    const prefs = user.preferences || {};

    // Traduz todos os labels do diálogo
    translatePreferencesDialog();

    // Salva o estado original para a função "Cancelar"
    originalPreferences = {
        theme: user.theme || 'auto',
        language: user.language || 'pt-BR',
        fontFamily: prefs.fontFamily || 'Segoe UI, Inter, sans-serif',
        fontSize: prefs.fontSize || 'medium',
        primaryColor: prefs.primaryColor,
        showBoardIcon: prefs.showBoardIcon !== false,
        showBoardTitle: prefs.showBoardTitle !== false,
        showTags: prefs.showTags !== false,
        showDate: prefs.showDate !== false,
        showStatus: prefs.showStatus !== false,
        showAssignment: prefs.showAssignment !== false,
        showCardDetails: prefs.showCardDetails !== false,
        enableCardTooltip: prefs.enableCardTooltip === true, // Nova preferência
        smartHeader: prefs.smartHeader === true,
        defaultTagTemplateId: prefs.defaultTagTemplateId || 'system-tags-prio'
    };

    // Preenche os campos do diálogo com os valores atuais
    dialog.querySelector('#pref-theme').value = originalPreferences.theme;
    dialog.querySelector('#pref-language').value = originalPreferences.language;
    dialog.querySelector('#pref-font-family').value = originalPreferences.fontFamily;
    dialog.querySelector('#pref-font-size').value = originalPreferences.fontSize;
    dialog.querySelector('#pref-board-show-icon').checked = originalPreferences.showBoardIcon;
    dialog.querySelector('#pref-board-show-title').checked = originalPreferences.showBoardTitle;
    dialog.querySelector('#pref-card-show-tags').checked = originalPreferences.showTags;
    dialog.querySelector('#pref-card-show-date').checked = originalPreferences.showDate;
    dialog.querySelector('#pref-card-show-status').checked = originalPreferences.showStatus;
    dialog.querySelector('#pref-card-show-assignment').checked = originalPreferences.showAssignment;
    dialog.querySelector('#pref-card-show-details').checked = originalPreferences.showCardDetails;
    dialog.querySelector('#pref-smart-header').checked = originalPreferences.smartHeader;
    dialog.querySelector('#pref-enable-card-tooltip').checked = originalPreferences.enableCardTooltip; // Define o estado do novo checkbox

    // Popula e seleciona o template de tags
    populateTagTemplatesSelect(originalPreferences.defaultTagTemplateId);

    // Popula e seleciona a cor primária
    const paletteContainer = dialog.querySelector('#color-palette-container');
    paletteContainer.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));
    if (originalPreferences.primaryColor === 'none') {
        paletteContainer.querySelector('[data-action="remove-primary"]')?.classList.add('active');
    } else if (originalPreferences.primaryColor?.hex) {
        paletteContainer.querySelector(`[data-hex="${originalPreferences.primaryColor.hex}"]`)?.classList.add('active');
    } else {
        paletteContainer.querySelector('[data-hex="#4cd4e6"]')?.classList.add('active'); // Padrão
    }

    // Inicializa os selects customizados APÓS popular os dados
    // Isso garante que o seletor de template de tags seja estilizado.
    // A função initCustomSelects agora lida com a reinicialização.
    initCustomSelects();

    kanbanIsSaved = true; // Reseta o estado de salvamento ao abrir

    // Anexa os listeners de salvamento/cancelamento apenas se não for o tour
    if (!isTour) {
        setupPreferencesControlsListeners(dialog);
    }

    dialog.showModal();
}

function setupPreferencesControlsListeners(dialog) {
    const fieldsToTrack = [
        { id: 'pref-theme', action: (e) => applyThemeFromSelect(e.target.value) },
        { id: 'pref-font-family', action: (e) => applyFontFamily(e.target.value) },
        { id: 'pref-font-size', action: (e) => applyFontSize(e.target.value, true) }, // Corrigido: era 'action'
        { id: 'pref-language', action: async (e) => {
            await loadLanguage(e.target.value);
            applyTranslations(); // Aplica em elementos com data-i18n
            // Recria o select de templates de tags para traduzir as opções
            const selectedTemplateId = dialog.querySelector('#pref-default-tag-template').value;
            populateTagTemplatesSelect(selectedTemplateId);
            initCustomSelects(); // Re-inicializa para traduzir as opções dos selects
        } },
        { id: 'pref-default-tag-template', action: null },
        { id: 'pref-card-show-tags', action: applyCardPreview },
        { id: 'pref-card-show-date', action: applyCardPreview },
        { id: 'pref-card-show-status', action: applyCardPreview },
        { id: 'pref-card-show-details', action: applyCardPreview },
        { id: 'pref-enable-card-tooltip', action: applyCardPreview }, // Adiciona ao rastreamento de alterações
        { id: 'pref-card-show-assignment', action: applyCardPreview },
        { id: 'pref-board-show-title', action: applyTitlePreview },
        { id: 'pref-board-show-icon', action: applyTitlePreview },
        { id: 'pref-smart-header', action: applyUserTheme } // Aplica o tema para ativar/desativar
    ];

    fieldsToTrack.forEach(field => {
        const element = dialog.querySelector(`#${field.id}`);
        if (element) {
            element.addEventListener('change', (e) => {
                kanbanIsSaved = false;
                if (field.action) field.action(e);
            });
        }
    });

    dialog.querySelector('#pref-save-btn').onclick = () => handleSavePreferences(dialog);
    dialog.querySelector('#pref-cancel-btn').onclick = handlePreferencesCancel;
}

function restoreKanbanOriginalSettings() {
    // Restaura o estado visual usando a função global e os dados originais
    const user = getCurrentUser();
    user.theme = originalPreferences.theme;
    user.preferences = { ...user.preferences, ...originalPreferences };
    applyUserTheme();
    renderCurrentBoard(); // Redesenha o quadro com as prefs visuais originais
}

function handleSavePreferences(preferencesDialog) {
    showConfirmationDialog(
        t('preferences.confirm.save'),
        (confirmationDialog) => { // onConfirm
            if (savePreferencesData()) {
                showDialogMessage(confirmationDialog, t('kanban.feedback.prefsSaved'), 'success');
                preferencesDialog.close(); // Fecha o diálogo de preferências
                return true; // Fecha o diálogo de confirmação
            } else {
                showDialogMessage(confirmationDialog, t('kanban.feedback.prefsError'), 'error');
                return false; // Mantém o diálogo de confirmação aberto
            }
        }
    );
}

function savePreferencesData() {
    const dialog = document.getElementById('preferences-dialog');
    const user = getCurrentUser();
    
    const activeSwatch = dialog.querySelector('#color-palette-container .color-swatch.active');
    let primaryColor = null;
    if (activeSwatch) {
        primaryColor = activeSwatch.dataset.action === 'remove-primary' 
            ? 'none' 
            : { hex: activeSwatch.dataset.hex, rgb: activeSwatch.dataset.rgb };
    }

    const updatedUser = {
        ...user,
        theme: dialog.querySelector('#pref-theme').value,
        language: dialog.querySelector('#pref-language').value,
        preferences: {
            ...user.preferences,
            fontFamily: dialog.querySelector('#pref-font-family').value,
            fontSize: dialog.querySelector('#pref-font-size').value,
            showTags: dialog.querySelector('#pref-card-show-tags').checked,
            showDate: dialog.querySelector('#pref-card-show-date').checked,
            showStatus: dialog.querySelector('#pref-card-show-status').checked,
            showAssignment: dialog.querySelector('#pref-card-show-assignment').checked,
            defaultTagTemplateId: dialog.querySelector('#pref-default-tag-template').value,
            showBoardIcon: dialog.querySelector('#pref-board-show-icon').checked,
            showBoardTitle: dialog.querySelector('#pref-board-show-title').checked,
            showCardDetails: dialog.querySelector('#pref-card-show-details').checked,
            enableCardTooltip: dialog.querySelector('#pref-enable-card-tooltip').checked, // Salva a nova preferência
            smartHeader: dialog.querySelector('#pref-smart-header').checked,
            primaryColor: primaryColor
        }
    };

    if (updateUser(user.id, updatedUser)) {
        currentUser = updatedUser; // ATUALIZAÇÃO: Garante que a variável local seja atualizada.
        // Atualizar os valores originais
        kanbanIsSaved = true;
        applyUserTheme(); // Aplica globalmente
        renderCurrentBoard(); // Renderiza o quadro com as novas prefs
        return true;
    } else {
        return false;
    }
}

function populateTagTemplatesSelect(selectedId = null) {
    const select = document.getElementById('pref-default-tag-template');
    if (!select) return;
    
    select.innerHTML = `<option value="">${t('preferences.tagTemplate.none')}</option>`;
    
    const userTagTemplates = getUserTagTemplates(currentUser.id);
    const systemTagTemplates = getSystemTagTemplates();
    
    // Adicionar templates do usuário
    if (userTagTemplates.length > 0) {
        const optgroupUser = document.createElement('optgroup');
        optgroupUser.label = t('preferences.tagTemplate.mySets');
        userTagTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            if (template.id === selectedId) option.selected = true;
            optgroupUser.appendChild(option);
        });
        select.appendChild(optgroupUser);
    }
    
    // Adicionar templates do sistema
    if (systemTagTemplates.length > 0) {
        const optgroupSystem = document.createElement('optgroup');
        optgroupSystem.label = t('preferences.tagTemplate.systemSets');
        systemTagTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = t(template.name); // Traduz o nome do template do sistema
            if (template.id === selectedId) option.selected = true;
            optgroupSystem.appendChild(option);
        });
        select.appendChild(optgroupSystem);
    }
}

function applyFontFamily(fontFamily) {
    // Aplica a fonte a todos os elementos
    const allElements = document.querySelectorAll('*');
    for (let i = 0; i < allElements.length; i++) {
        allElements[i].style.fontFamily = fontFamily;
    }
    
    // Remove estilos anteriores de placeholder se existirem
    const existingStyle = document.getElementById('universal-font-style');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    // Aplica a fonte também aos placeholders
    const style = document.createElement('style');
    style.id = 'universal-font-style';
    style.textContent = `
        ::placeholder {
            font-family: ${fontFamily} !important;
        }
        :-ms-input-placeholder {
            font-family: ${fontFamily} !important;
        }
        ::-ms-input-placeholder {
            font-family: ${fontFamily} !important;
        }
        
        /* Força a fonte em elementos específicos que podem resistir */
        input, textarea, select, button {
            font-family: ${fontFamily} !important;
        }
    `;
    document.head.appendChild(style);
}

function applyFontSize(size, isPreview = false) {
    const sizeMap = { small: '0.85rem', medium: '1rem', large: '1.15rem', 'x-large': '1.3rem' };
    const fontSizeValue = sizeMap[size] || '1rem';
    document.documentElement.style.fontSize = fontSizeValue;
}

function applyTitlePreview() {
    const titleElement = document.getElementById('kanban-title');
    if (!titleElement || !currentBoard) return;

    // O diálogo é clonado, então precisamos pegar o que está atualmente no DOM.
    const dialog = document.querySelector('#preferences-dialog');
    
    const showTitle = dialog.querySelector('#pref-board-show-title').checked;
    const showIcon = dialog.querySelector('#pref-board-show-icon').checked;

    const iconHtml = showIcon ? `<span class="board-icon">${currentBoard.icon || '📋'}</span>` : '';
    const titleHtml = showTitle ? `<span class="board-title-text">${currentBoard.title}</span>` : '';

    titleElement.innerHTML = `${iconHtml}${titleHtml}`.trim();
    titleElement.style.display = (showTitle || showIcon) ? 'flex' : 'none';
}

function applyCardPreview() {
    const dialog = document.querySelector('#preferences-dialog');
    if (!dialog) return;

    // Atualiza o objeto de preferências do usuário em memória (temporariamente)
    // para que a função renderCurrentBoard use os valores de preview.
    currentUser.preferences.showTags = dialog.querySelector('#pref-card-show-tags').checked;
    currentUser.preferences.showDate = dialog.querySelector('#pref-card-show-date').checked;
    currentUser.preferences.showStatus = dialog.querySelector('#pref-card-show-status').checked;
    currentUser.preferences.showAssignment = dialog.querySelector('#pref-card-show-assignment').checked;
    currentUser.preferences.showCardDetails = dialog.querySelector('#pref-card-show-details').checked;

    // Simplesmente redesenha o quadro. A função createCardElement já
    // contém a lógica para mostrar/esconder os elementos com base nessas preferências.
    renderCurrentBoard();
}

function applyThemeFromSelect(themeValue) {
    document.body.classList.remove('light-mode', 'dark-mode', 'dark-gray-mode', 'light-gray-mode');

    let themeToApply = themeValue;
    if (themeToApply === 'auto') {
        // Para a pré-visualização, 'auto' deve reverter para o padrão visual do sistema, que é 'dark-gray'.
        // A lógica final de qual tema 'auto' representa é tratada no salvamento e no applyUserTheme.
        themeToApply = 'dark-gray';
    }
    
    switch (themeToApply) {
        case 'light': 
            document.body.classList.add('light-mode'); 
            break;
        case 'dark': 
            document.body.classList.add('dark-mode');
            break;
        case 'light-gray': 
            document.body.classList.add('light-gray-mode'); 
            break;
        case 'dark-gray':
        default:
            break;
    }
}
