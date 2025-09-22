// js/kanban.js - VERSÃO REFATORADA E FINAL

import { getCurrentUser, updateUser, getAllUsers as authGetAllUsers } from './auth.js';
import { archiveBoard,
    getUserProfile, saveUserProfile, getFullBoardData, getBoard, saveBoard, deleteBoard, 
    getColumn, saveColumn, deleteColumn, getCard, saveCard, deleteCard, archiveCard,
    getAllUsers, getAllGroups, getGroup, saveGroup, getSystemBoardTemplates, getUserBoardTemplates,
    getSystemTagTemplates, getUserTagTemplates, saveUserBoardTemplates
} from './storage.js';
import { showFloatingMessage, initDraggableElements, updateUserAvatar, 
    initUIControls, showConfirmationDialog, showDialogMessage, initCustomSelects, 
    applyUserTheme, showIconPickerDialog, ICON_LIBRARY, showContextMenu, showCustomColorPickerDialog, 
    makeDraggable, initSmartHeader, disableSmartHeader } from './ui-controls.js';
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

    // --- CORREÇÃO: Lógica para definir o quadro inicial ---
    // Filtra os quadros com base no filtro ativo ('personal' por padrão).
    const filteredBoards = boards.filter(board => {
        if (currentBoardFilter === 'personal') return !board.groupId;
        if (currentBoardFilter === 'group') return !!board.groupId;
        return true;
    });

    const lastBoardId = localStorage.getItem(`currentBoardId_${currentUser.id}`);
    
    // Tenta encontrar o último quadro visualizado DENTRO da lista filtrada.
    let initialBoard = filteredBoards.find(b => b.id === lastBoardId);

    // Se o último quadro não pertencer a este filtro, pega o primeiro da lista filtrada.
    if (!initialBoard) {
        initialBoard = filteredBoards[0] || null;
    }
    
    currentBoard = initialBoard;

    // Atualiza o localStorage com um ID de quadro válido para o contexto atual.
    localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');

    // 3. Configuração da UI e Eventos
    setupEventListeners();
    initDraggableElements();
    // NOVO: Impede que cliques no popover do tour fechem os menus.
    // E também no overlay, para que o usuário não possa fechar os menus clicando fora.
    document.getElementById('tour-overlay').addEventListener('click', e => e.stopPropagation());
    document.getElementById('tour-popover').addEventListener('click', e => e.stopPropagation());

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

    // Carrega todos os quadros de todos os grupos dos quais o usuário é membro
    const allGroups = getAllGroups();
    const memberGroups = allGroups.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    const groupBoardIds = memberGroups.flatMap(g => g.boardIds || []);

    // Combina todos os IDs de quadros (pessoais e de grupo) em um conjunto para evitar duplicatas
    const allVisibleBoardIds = new Set([...(userProfile.boardIds || []), ...groupBoardIds]);

    const allBoardMap = new Map();

    // Itera sobre todos os IDs de quadros visíveis e aplica a lógica de permissão
    for (const boardId of allVisibleBoardIds) {
        const board = getFullBoardData(boardId);
        if (!board) continue;

        const owner = getUserProfile(board.ownerId);
        const isOwner = board.ownerId === currentUser.id;
        const isPublic = board.visibility === 'public';
        const isFriendBoard = board.visibility === 'friends' && owner?.friends?.includes(currentUser.id);
        
        // CORREÇÃO: A visibilidade de um quadro de grupo agora é verificada explicitamente.
        // Um quadro só é visível para o grupo se ele pertencer ao grupo E sua visibilidade for 'group'.
        const isMemberOfBoardGroup = board.groupId && memberGroups.some(g => g.id === board.groupId);
        const isVisibleToGroup = isMemberOfBoardGroup && board.visibility === 'group';

        // Um quadro privado (visibility: 'private') agora só será visível se 'isOwner' for verdadeiro.
        if (isOwner || isPublic || isFriendBoard || isVisibleToGroup) {
            allBoardMap.set(board.id, board);
        }
    }

    boards = Array.from(allBoardMap.values());

    tagColorMap.clear();
    const systemTags = getSystemTagTemplates();
    const userTags = getUserTagTemplates(currentUser.id);
    systemTags.forEach(t => t.tags.forEach(tag => tagColorMap.set(tag.name, tag.color)));
    userTags.forEach(t => t.tags.forEach(tag => tagColorMap.set(tag.name, tag.color)));
}

/**
 * Configura todos os event listeners da página.
 */
function setupEventListeners() {

    document.getElementById('add-board-btn')?.addEventListener('click', () => {
        if (currentBoardFilter === 'group' && !hasPermission(null, 'createBoards')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }
        showBoardDialog();
    });
    
    document.getElementById('add-column-btn')?.addEventListener('click', () => {
        if (!currentBoard) {
            showFloatingMessage(t('kanban.feedback.noBoardForColumn'), 'error');
            return;
        }
        if (!hasPermission(currentBoard, 'createColumns')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
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
        if (!hasPermission(currentBoard, 'createCards')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }
        showCardDialog(null, currentBoard.columns[0].id);
    });

    document.getElementById('board-select')?.addEventListener('change', switchBoard);
    document.getElementById('edit-items-btn')?.addEventListener('click', showManagerDialog);
    document.getElementById('undo-btn')?.addEventListener('click', undoAction);
    document.getElementById('redo-btn')?.addEventListener('click', redoAction);
    document.getElementById('start-tour-btn')?.addEventListener('click', startTour);
    document.getElementById('export-img')?.addEventListener('click', () => handleExportImage());
    document.getElementById('save-as-template-btn')?.addEventListener('click', saveBoardAsTemplate);
    document.getElementById('search-cards-btn')?.addEventListener('click', showSearchDialog);
    document.getElementById('print-btn')?.addEventListener('click', handlePrintBoard);
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
    columnsContainer.addEventListener('dragleave', handleDragLeave); // <-- A linha que faltava
    columnsContainer.addEventListener('drop', handleDrop);

    // --- NOVA LÓGICA PARA FILTRO DE QUADROS ---
    document.querySelectorAll('#board-filter-toggle .filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => handleFilterChange(e.currentTarget.dataset.filter));
    });

    // --- LISTENERS PARA O DIÁLOGO DE PREFERÊNCIAS (ANEXADOS UMA ÚNICA VEZ) ---
    const preferencesDialog = document.getElementById('preferences-dialog');
    if (preferencesDialog) {
        // Listener para fechar com ESC ou clique no backdrop
        preferencesDialog.addEventListener('cancel', (e) => {
            if (!kanbanIsSaved) {
                e.preventDefault(); // Impede o fechamento padrão se houver alterações
                handlePreferencesCancel(); // Chama nossa lógica customizada de cancelamento
            }
        });

        // Listeners dos botões Salvar e Cancelar
        preferencesDialog.querySelector('#pref-save-btn').addEventListener('click', () => handleSavePreferences(preferencesDialog));
        preferencesDialog.querySelector('#pref-cancel-btn').addEventListener('click', () => handlePreferencesCancel());

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

        // Listeners para todos os campos que ativam a pré-visualização
        const fieldsToTrack = [
            { id: 'pref-theme', action: (e) => applyThemeFromSelect(e.target.value) },
            { id: 'pref-font-family', action: (e) => applyFontFamily(e.target.value) },
            { id: 'pref-font-size', action: (e) => applyFontSize(e.target.value, true) },
            { id: 'pref-language', action: async (e) => {
                await loadLanguage(e.target.value);
                applyTranslations();
                const selectedTemplateId = preferencesDialog.querySelector('#pref-default-tag-template').value;
                populateTagTemplatesSelect(selectedTemplateId);
                initCustomSelects();
            } },
            { id: 'pref-default-tag-template', action: null },
            { id: 'pref-card-show-tags', action: applyCardPreview },
            { id: 'pref-card-show-date', action: applyCardPreview },
            { id: 'pref-card-show-status', action: applyCardPreview },
            { id: 'pref-card-show-details', action: applyCardPreview },
            { id: 'pref-enable-card-tooltip', action: applyCardPreview },
            { id: 'pref-card-show-assignment', action: applyCardPreview },
            { id: 'pref-board-show-title', action: applyTitlePreview },
            { id: 'pref-board-show-icon', action: applyTitlePreview },
            { id: 'pref-smart-header', action: null }
        ];

        fieldsToTrack.forEach(field => {
            const element = preferencesDialog.querySelector(`#${field.id}`);
            if (element) {
                element.addEventListener('change', (e) => {
                    kanbanIsSaved = false;
                    if (field.action) {
                        field.action(e);
                    }
                });
            }
        });
    }
}

// ===== LÓGICA DO TOUR GUIADO =====

const tourSteps = [
    // Perfil
    { step: 1, element: '#user-avatar-btn', title: 'tour.step1.title', text: 'tour.step1.text', position: 'right', context: null, preAction: closeAllDropdowns },
    { step: 2, element: '#user-profile-btn', title: 'tour.step2.title', text: 'tour.step2.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { step: 3, element: '#my-groups-btn', title: 'tour.step3.title', text: 'tour.step3.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { step: 4, element: '#friends-btn', title: 'tour.step4.title', text: 'tour.step4.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { step: 5, element: '#templates-btn', title: 'tour.step5.title', text: 'tour.step5.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { step: 6, element: '#archive-btn', title: 'tour.step6.title', text: 'tour.step6.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { step: 7, element: '#notifications-btn', title: 'tour.step7.title', text: 'tour.step7.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    { step: 8, element: '#preferences-btn', title: 'tour.step8.title', text: 'tour.step8.text', position: 'right', preAction: () => document.getElementById('profile-dropdown').classList.add('show'), context: 'profile-dropdown' },
    // Quadros
    { step: 9, element: '#boards-dropdown-btn', title: 'tour.step9.title', text: 'tour.step9.text', position: 'bottom', context: null },
    { step: 10, element: '#board-filter-toggle', title: 'tour.step10.title', text: 'tour.step10.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { step: 11, element: () => document.querySelector('#boards-dropdown .no-boards-message') || document.querySelector('#board-select + .select-selected'), title: 'tour.step11.title', text: 'tour.step11.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { step: 12, element: '#add-board-btn', title: 'tour.step12.title', text: 'tour.step12.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { step: 13, element: '#add-column-btn', title: 'tour.step13.title', text: 'tour.step13.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    { step: 14, element: '#add-card-btn', title: 'tour.step14.title', text: 'tour.step14.text', position: 'bottom', preAction: () => document.getElementById('boards-dropdown').classList.add('show'), context: 'boards-dropdown' },
    // Ações
    { step: 15, element: '#actions-dropdown-btn', title: 'tour.step15.title', text: 'tour.step15.text', position: 'bottom', context: null },
    { step: 16, element: '#save-as-template-btn', title: 'tour.step16.title', text: 'tour.step16.text', position: 'left', preAction: () => document.getElementById('actions-dropdown').classList.add('show'), context: 'actions-dropdown' },
    { step: 17, element: '#print-btn', title: 'tour.step17.title', text: 'tour.step17.text', position: 'left', preAction: () => document.getElementById('actions-dropdown').classList.add('show'), context: 'actions-dropdown' },
    { step: 18, element: '#search-cards-btn', title: 'tour.step18.title', text: 'tour.step18.text', position: 'left', preAction: () => document.getElementById('actions-dropdown').classList.add('show'), context: 'actions-dropdown' },
    { step: 19, element: '#export-img', title: 'tour.step19.title', text: 'tour.step19.text', position: 'left', preAction: () => document.getElementById('actions-dropdown').classList.add('show'), context: 'actions-dropdown' },
    // Criação de Itens
    { step: 20, element: '#kanban-title', title: 'tour.step20.title', text: 'tour.step20.text', position: 'bottom', preAction: createTourBoard, undoAction: undoTourBoard, context: null, isCreation: true },
    { step: 21, element: '#kanban-title', title: 'tour.step21.title', text: 'tour.step21.text', position: 'bottom', context: null, noHighlight: true },
    { step: 22, element: '#kanban-title', title: 'tour.step22.title', text: 'tour.step22.text', position: 'bottom', preAction: createTourColumn, undoAction: undoTourColumn, context: null, noHighlight: true, isCreation: true },
    { step: 23, element: '.card', title: 'tour.step23.title', text: 'tour.step23.text', position: 'bottom', preAction: createTourCard, undoAction: undoTourCard, context: null, isCreation: true },
];

function startTour() {
    // Desativa o Smart Header para que ele não interfira no tour.
    disableSmartHeader();
    isTourActive = true;
    currentTourStep = 0;
    document.getElementById('tour-overlay').classList.remove('hidden');
    showTourStep(currentTourStep);
}

function endTour(wasSkipped = false) {
    isTourActive = false;
    // Reativa o Smart Header, que verificará as preferências do usuário.
    initSmartHeader();
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
    // CORREÇÃO: Verifica se o ID existe antes de tentar qualquer operação.
    // Isso torna a função segura mesmo se o usuário pular o tour antes da criação.
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
    // CORREÇÃO: Verifica se o ID existe.
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
    // CORREÇÃO: Verifica se o ID existe.
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
    // Lógica das abas
    const tabs = dialog.querySelectorAll('.details-tab-btn');
    const panes = dialog.querySelectorAll('.details-tab-pane');
    const applyBtn = document.getElementById('search-apply-btn');
    const resetBtn = document.getElementById('search-reset-btn');

    // Função para atualizar o botão principal
    const updateButtonAction = (tabId) => {
        if (tabId === 'search-filter-pane') {
            applyBtn.textContent = t('kanban.dialog.search.applyButton');
            applyBtn.onclick = applySearchFilters;
        } else {
            applyBtn.textContent = t('kanban.dialog.search.searchButton');
            applyBtn.onclick = executeGlobalSearch;
        }
        resetBtn.style.display = 'inline-flex'; // Botão de limpar sempre visível
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const targetPane = document.getElementById(tab.dataset.tab);
            targetPane.classList.add('active');
            updateButtonAction(tab.dataset.tab);
        });
    });

    // Popula os filtros para AMBAS as abas
    populateFilterOptions(dialog.querySelector('#search-filter-pane'), true); // Filtros do quadro atual
    populateFilterOptions(dialog.querySelector('#search-global-pane'), false); // Filtros globais

    // Anexa os listeners
    resetBtn.onclick = resetSearchFilters;
    dialog.querySelector('#search-cancel-btn').onclick = () => dialog.close();
    
    // Reseta para a primeira aba ao abrir
    tabs[0].click();
    dialog.showModal();
}

/**
 * Popula os dropdowns de filtro.
 * @param {HTMLElement} container - O painel (aba) que contém os selects.
 * @param {boolean} boardSpecific - Se true, popula tags apenas do quadro atual. Se false, popula com todos os usuários e tags.
 */
function populateFilterOptions(container, boardSpecific) {
    const creatorSelect = container.querySelector('select[id*="-creator"]');
    const assigneeSelect = container.querySelector('select[id*="-assignee"]');
    const tagSelect = container.querySelector('select[id*="-tags"]');

    const boardTags = new Set();
    if (boardSpecific && currentBoard) {
        currentBoard.columns.forEach(col => {
            col.cards.forEach(card => {
                if (card.tags) card.tags.forEach(tag => boardTags.add(tag));
            });
        });
    } else if (!boardSpecific) {
        // Para busca global, pega tags de todos os quadros
        boards.forEach(board => {
            const fullBoard = getFullBoardData(board.id);
            if (fullBoard) {
                fullBoard.columns.forEach(col => {
                    col.cards.forEach(card => {
                        if (card.tags) card.tags.forEach(tag => boardTags.add(tag));
                    });
                });
            }
        });
    }

    let relevantUsers = new Map();
    relevantUsers.set(currentUser.id, currentUser); // Sempre inclui o usuário atual

    if (boardSpecific && currentBoard.visibility === 'public') {
        const userProfile = getUserProfile(currentUser.id);
        if (userProfile && userProfile.friends) {
            userProfile.friends.forEach(friendId => {
                const friend = allUsers.find(u => u.id === friendId);
                if (friend) relevantUsers.set(friend.id, friend);
            });
        } 
    } else if (boardSpecific && currentBoard.visibility === 'group' && currentBoard.groupId) {
        const group = getGroup(currentBoard.groupId);
        if (group && group.memberIds) {
            group.memberIds.forEach(memberId => {
                const member = allUsers.find(u => u.id === memberId);
                if (member) relevantUsers.set(member.id, member);
            });
        }
    } else if (!boardSpecific) {
        // Para busca global, todos os usuários são relevantes
        allUsers.forEach(user => relevantUsers.set(user.id, user));
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
}

function applySearchFilters() {
    const dialog = document.getElementById('search-dialog');
    const filters = {
        text: document.getElementById('search-text').value.toLowerCase(),
        creator: document.getElementById('filter-creator').value,
        status: document.getElementById('filter-status').value,
        assignee: document.getElementById('filter-assignee').value,
        dueDate: document.getElementById('filter-due-date').value,
        tag: document.getElementById('filter-tags').value,
    };

    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.selectBoardForSearch'), 'error');
        return;
    }

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

    if (visibleCount === 0) {
        showDialogMessage(dialog, t('kanban.dialog.search.noCardsFound'), 'warning');
    } else {
        showDialogMessage(dialog, t('kanban.feedback.cardsFound', { count: visibleCount }), 'info');
        setTimeout(() => {
            dialog.close();
        }, 1500);
    }
}

/**
 * Executa uma busca global em todos os quadros visíveis e renderiza os resultados.
 */
function executeGlobalSearch() {
    const searchDialog = document.getElementById('search-dialog');
    const filters = {
        text: document.getElementById('global-search-text').value.toLowerCase(),
        creator: document.getElementById('global-search-creator').value,
        status: document.getElementById('global-search-status').value,
        assignee: document.getElementById('global-search-assignee').value,
        dueDate: document.getElementById('global-search-due-date').value,
        tag: document.getElementById('global-search-tags').value,
    };

    const searchResults = [];

    // Itera sobre todos os quadros visíveis para o usuário
    boards.forEach(board => {
        const fullBoard = getFullBoardData(board.id); // Garante que temos todos os dados
        if (!fullBoard) return;

        fullBoard.columns.forEach(column => {
            column.cards.forEach(card => {
                // Reutiliza a mesma lógica de verificação de visibilidade do filtro
                let isMatch = true;
                if (filters.text && !(card.title.toLowerCase().includes(filters.text) || (card.description && card.description.toLowerCase().includes(filters.text)))) isMatch = false;
                if (isMatch && filters.creator && card.creatorId !== filters.creator) isMatch = false;
                if (isMatch && filters.status) {
                    if (filters.status === 'completed' && !card.isComplete) isMatch = false;
                    if (filters.status === 'active' && card.isComplete) isMatch = false;
                }
                if (isMatch && filters.assignee && card.assignedTo !== filters.assignee) isMatch = false;
                if (isMatch && filters.tag && (!card.tags || !card.tags.includes(filters.tag))) isMatch = false;
                // A lógica de data é a mesma
                if (isMatch && filters.dueDate) {
                    if (!card.dueDate) { isMatch = false; }
                    else {
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const dueDate = new Date(card.dueDate); dueDate.setHours(0, 0, 0, 0);
                        const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
                        if (filters.dueDate === 'overdue' && dueDate >= today) isMatch = false;
                        if (filters.dueDate === 'today' && dueDate.getTime() !== today.getTime()) isMatch = false;
                        if (filters.dueDate === 'week' && (dueDate < weekStart || dueDate > new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000))) isMatch = false;
                    }
                }

                if (isMatch) {
                    searchResults.push({ card, board: fullBoard, column });
                }
            });
        });
    });

    searchDialog.close(); // Fecha o diálogo de busca
    showGlobalSearchResultsDialog(searchResults); // Abre o novo diálogo com os resultados
}

/**
 * Cria e exibe um novo diálogo com os resultados da busca global.
 * @param {Array} results - Um array de objetos {card, board, column}.
 */
function showGlobalSearchResultsDialog(results) {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('kanban.dialog.search.resultsTitle')}</h3>
        <div id="global-search-results-list" class="manager-item-list" style="max-height: 60vh;"></div>
        <div class="modal-actions">
            <button class="btn cancel">${t('ui.close')}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    makeDraggable(dialog);

    const resultsContainer = dialog.querySelector('#global-search-results-list');
    if (results.length === 0) {
        resultsContainer.innerHTML = `<p class="activity-log-empty">${t('kanban.feedback.cardsFound', { count: 0 })}</p>`;
    } else {
        results.forEach(({ card, board, column }) => {
            const resultEl = document.createElement('div');
            resultEl.className = 'manager-item search-result-item';
            resultEl.innerHTML = `
                <div class="manager-item-title">
                    <span>${card.title}</span>
                    <div class="item-meta">${t('kanban.dialog.search.searchResult', { board: board.title, column: column.title })}</div>
                </div>
            `;
            resultEl.onclick = () => {
                localStorage.setItem(`currentBoardId_${currentUser.id}`, board.id);
                window.location.href = 'kanban.html';
            };
            resultsContainer.appendChild(resultEl);
        });
    }

    dialog.querySelector('.btn.cancel').onclick = () => { dialog.close(); dialog.remove(); };
    dialog.showModal();
}

function resetSearchFilters() {
    const dialog = document.getElementById('search-dialog');
    
    // Aba de Filtro
    dialog.querySelector('#search-text').value = '';
    dialog.querySelector('#filter-creator').selectedIndex = 0;
    dialog.querySelector('#filter-status').selectedIndex = 0;
    dialog.querySelector('#filter-assignee').selectedIndex = 0;
    dialog.querySelector('#filter-due-date').selectedIndex = 0;
    dialog.querySelector('#filter-tags').selectedIndex = 0;

    // Aba de Busca Global
    dialog.querySelector('#global-search-text').value = '';
    dialog.querySelector('#global-search-creator').selectedIndex = 0;
    dialog.querySelector('#global-search-status').selectedIndex = 0;
    dialog.querySelector('#global-search-assignee').selectedIndex = 0;
    dialog.querySelector('#global-search-due-date').selectedIndex = 0;
    dialog.querySelector('#global-search-tags').selectedIndex = 0;

    // Mostra todos os cartões novamente
    document.querySelectorAll('.card').forEach(cardEl => {
        cardEl.style.display = 'block';
    });

    showDialogMessage(dialog, t('kanban.feedback.filtersCleared'), 'info');
    // Não fecha o diálogo para que o usuário possa aplicar novos filtros.
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

    // Atualiza o estado dos botões com base nas permissões do quadro
    updateHeaderButtonPermissions();
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
            // Se o tour estiver ativo, não mostra o tooltip para não interferir
            if (isTourActive) return;

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
        if (!hasPermission(currentBoard, 'createCards')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }
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

/**
 * Exibe o novo diálogo gerenciador com abas.
 */
function showManagerDialog() {
    const dialog = document.getElementById('manager-dialog');
    if (!dialog) return;

    const tabs = dialog.querySelectorAll('.nav-item');
    const contents = dialog.querySelectorAll('.manager-tab-content');

    // Lógica para trocar de aba
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const contentId = tab.dataset.tab;
            document.getElementById(contentId).classList.add('active');

            // Futuramente, aqui chamaremos a função para popular a lista da aba ativa
            if (contentId === 'manager-boards') {
                populateManagerBoards();
            } else if (contentId === 'manager-columns') {
                populateManagerColumns();
            } else if (contentId === 'manager-cards') {
                populateManagerCards();
            }
        };
    });

    // Abre o diálogo na primeira aba por padrão
    tabs[0].click();
    populateManagerBoards(); // Popula a primeira aba ao abrir

    dialog.showModal();
}

// ===== LÓGICA DE MENUS (DROPDOWNS) =====

/**
 * Popula a aba "Quadros" do diálogo gerenciador.
 */
function populateManagerBoards() {
    const listContainer = document.getElementById('manager-boards-list');
    listContainer.innerHTML = ''; // Limpa a lista

    // 1. Filtra os quadros que o usuário pode ver, respeitando a privacidade
    const visibleBoards = boards.filter(board => {
        if (!board.groupId) return true; // Quadros pessoais
        const group = getGroup(board.groupId);
        if (!group) return false;
        if (group.adminId === currentUser.id) return true; // Admin vê tudo do grupo
        // Membro vê quadros de grupo ou os privados que ele criou
        return board.visibility === 'group' || (board.visibility === 'private' && board.ownerId === currentUser.id);
    });

    // 2. Separa os quadros em pessoais e de grupo
    const personalBoards = visibleBoards.filter(b => !b.groupId);
    const groupBoards = visibleBoards.filter(b => b.groupId);

    if (personalBoards.length === 0 && groupBoards.length === 0) {
        listContainer.innerHTML = `<p>${t('kanban.feedback.noPersonalBoards')}</p>`; // Reutiliza a tradução
        return;
    }

    // 3. Função auxiliar para criar cada item da lista
    const createItemElement = (board) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'manager-item';

        // Adiciona o nome do grupo ao lado do título se for um quadro de grupo
        let titleHtml = `<span>${board.icon || '📋'} ${board.title}</span>`;
        if (board.groupId) {
            const group = getGroup(board.groupId);
            if (group) {
                titleHtml += ` <span class="board-group-name">(${group.name})</span>`;
            }
        }

        itemEl.innerHTML = `
            <div class="manager-item-title">${titleHtml}</div>
            <div class="manager-item-actions">
                <button class="btn btn-sm alternative1 archive-board-btn" data-id="${board.id}" title="${t('kanban.contextMenu.column.archive')}">🗄️</button>
                <button class="btn btn-sm edit" data-id="${board.id}">✏️</button>
                <button class="btn btn-sm danger" data-id="${board.id}">🗑️</button>
            </div>
        `;

        itemEl.querySelector('.archive-board-btn').onclick = () => {
            if (hasPermission(board, 'editBoards')) { // Reutiliza a permissão de edição para arquivar
                document.getElementById('manager-dialog').close();
                handleArchiveBoard(board.id);
            } else {
                showDialogMessage(document.getElementById('manager-dialog'), t('kanban.feedback.noPermission'), 'error');
            }
        };
        itemEl.querySelector('.btn.edit').onclick = () => {
            if (hasPermission(board, 'editBoards')) {
                document.getElementById('manager-dialog').close();
                showBoardDialog(board.id);
            } else {
                showDialogMessage(document.getElementById('manager-dialog'), t('kanban.feedback.noPermission'), 'error');
            }
        };

        itemEl.querySelector('.btn.danger').onclick = () => {
            if (hasPermission(board, 'editBoards')) {
                document.getElementById('manager-dialog').close();
                currentBoard = board; // Define o quadro a ser excluído
                handleDeleteBoard();
            } else {
                showDialogMessage(document.getElementById('manager-dialog'), t('kanban.feedback.noPermission'), 'error');
            }
        };
        return itemEl;
    };

    // 4. Renderiza as seções
    if (personalBoards.length > 0) {
        const heading = document.createElement('h5');
        heading.className = 'manager-list-heading';
        heading.textContent = t('kanban.dialog.manager.personalBoards');
        listContainer.appendChild(heading);
        personalBoards.forEach(board => listContainer.appendChild(createItemElement(board)));
    }

    if (groupBoards.length > 0) {
        const heading = document.createElement('h5');
        heading.className = 'manager-list-heading';
        heading.textContent = t('kanban.dialog.manager.groupBoards');
        listContainer.appendChild(heading);
        groupBoards.forEach(board => listContainer.appendChild(createItemElement(board)));
    }
}

/**
 * Popula a aba "Colunas" do diálogo gerenciador.
 */
function populateManagerColumns() {
    const boardSelectContainer = document.getElementById('manager-column-board-select-container');
    const listContainer = document.getElementById('manager-columns-list');
    
    // 1. Cria o seletor de quadros
    const select = document.createElement('select');
    select.innerHTML = `<option value="">${t('kanban.dialog.edit.selectBoardPlaceholder')}</option>`;

    // Reutiliza a mesma lógica de filtro da aba de quadros
    const visibleBoards = boards.filter(board => {
        if (!board.groupId) return true;
        const group = getGroup(board.groupId);
        if (!group) return false;
        if (group.adminId === currentUser.id) return true;
        return board.visibility === 'group' || (board.visibility === 'private' && board.ownerId === currentUser.id);
    });

    // CORREÇÃO: Aplica o mesmo padrão de agrupamento da aba "Quadros"
    const personalBoards = visibleBoards.filter(b => !b.groupId);
    const groupBoards = visibleBoards.filter(b => b.groupId);

    if (personalBoards.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = t('kanban.dialog.manager.personalBoards');
        personalBoards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.title;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    }

    if (groupBoards.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = t('kanban.dialog.manager.groupBoards');
        groupBoards.forEach(board => {
            const group = getGroup(board.groupId);
            const groupName = group ? ` (${group.name})` : '';
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = `${board.title}${groupName}`;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    }

    boardSelectContainer.innerHTML = ''; // Limpa o container
    boardSelectContainer.appendChild(select);
    initCustomSelects(); // Estiliza o novo select

    // 2. Adiciona o listener para quando um quadro for selecionado
    select.onchange = () => {
        const boardId = select.value;
        if (boardId) {
            const board = boards.find(b => b.id === boardId);
            renderManagerColumnList(board, listContainer);
        } else {
            listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.dialog.edit.selectBoard')}</div>`;
        }
    };

    listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.dialog.edit.selectBoard')}</div>`;
}

/**
 * Renderiza a lista de colunas para um quadro selecionado na aba "Colunas".
 * @param {object} board - O objeto do quadro selecionado.
 * @param {HTMLElement} listContainer - O elemento container da lista.
 */
function renderManagerColumnList(board, listContainer) {
    listContainer.innerHTML = '';

    if (!board.columns || board.columns.length === 0) {
        listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.feedback.noColumnForCard')}</div>`;
        return;
    }

    board.columns.forEach(column => {
        const itemEl = document.createElement('div');
        itemEl.className = 'manager-item';
        itemEl.innerHTML = `
            <span>${column.title}</span>
            <div class="manager-item-actions">
                <button class="btn btn-sm edit" data-id="${column.id}">✏️</button>
                <button class="btn btn-sm danger" data-id="${column.id}">🗑️</button>
            </div>
        `;

        itemEl.querySelector('.btn.edit').onclick = () => {
            if (hasPermission(board, 'editColumns')) {
                document.getElementById('manager-dialog').close();
                showColumnDialog(column.id);
            } else {
                showDialogMessage(document.getElementById('manager-dialog'), t('kanban.feedback.noPermission'), 'error');
            }
        };

        itemEl.querySelector('.btn.danger').onclick = () => {
            if (hasPermission(board, 'editColumns')) {
                document.getElementById('manager-dialog').close();
                handleDeleteColumnFromMenu(column.id);
            } else {
                showDialogMessage(document.getElementById('manager-dialog'), t('kanban.feedback.noPermission'), 'error');
            }
        };

        listContainer.appendChild(itemEl);
    });
}

/**
 * Popula a aba "Cartões" do diálogo gerenciador.
 */
function populateManagerCards() {
    const boardSelectContainer = document.getElementById('manager-card-board-select-container');
    const columnSelectContainer = document.getElementById('manager-card-column-select-container');
    const listContainer = document.getElementById('manager-cards-list');

    // 1. Cria e popula o seletor de quadros
    const boardSelect = document.createElement('select');
    boardSelect.innerHTML = `<option value="">${t('kanban.dialog.edit.selectBoardPlaceholder')}</option>`;
    
    // Reutiliza a mesma lógica de filtro e agrupamento
    const visibleBoards = boards.filter(b => !b.groupId || getGroup(b.groupId));
    const personalBoards = visibleBoards.filter(b => !b.groupId);
    const groupBoards = visibleBoards.filter(b => b.groupId);

    if (personalBoards.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = t('kanban.dialog.manager.personalBoards');
        personalBoards.forEach(board => optgroup.innerHTML += `<option value="${board.id}">${board.title}</option>`);
        boardSelect.appendChild(optgroup);
    }
    if (groupBoards.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = t('kanban.dialog.manager.groupBoards');
        groupBoards.forEach(board => {
            const groupName = getGroup(board.groupId)?.name || '';
            optgroup.innerHTML += `<option value="${board.id}">${board.title} (${groupName})</option>`;
        });
        boardSelect.appendChild(optgroup);
    }

    boardSelectContainer.innerHTML = '';
    boardSelectContainer.appendChild(boardSelect);

    // 2. Cria o seletor de colunas (inicialmente vazio)
    const columnSelect = document.createElement('select');
    columnSelect.innerHTML = `<option value="">${t('kanban.dialog.edit.selectColumnPlaceholder')}</option>`;
    columnSelectContainer.innerHTML = '';
    columnSelectContainer.appendChild(columnSelect);

    initCustomSelects(); // Estiliza os novos selects

    // 3. Adiciona listeners
    boardSelect.onchange = () => {
        const boardId = boardSelect.value;
        columnSelect.innerHTML = `<option value="">${t('kanban.dialog.edit.selectColumnPlaceholder')}</option>`;
        listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.dialog.edit.selectColumn')}</div>`;
        if (boardId) {
            const board = boards.find(b => b.id === boardId);
            board.columns.forEach(col => {
                columnSelect.innerHTML += `<option value="${col.id}">${col.title}</option>`;
            });
        }
        initCustomSelects(); // Re-estiliza o select de colunas
    };

    columnSelect.onchange = () => {
        const boardId = boardSelect.value;
        const columnId = columnSelect.value;
        if (boardId && columnId) {
            const board = boards.find(b => b.id === boardId);
            const column = board.columns.find(c => c.id === columnId);
            renderManagerCardList(board, column, listContainer);
        } else {
            listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.dialog.edit.selectColumn')}</div>`;
        }
    };

    listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.dialog.edit.selectBoard')}</div>`;
}

function renderManagerCardList(board, column, listContainer) {
    listContainer.innerHTML = '';
    if (!column.cards || column.cards.length === 0) {
        listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.feedback.noColumnForCard')}</div>`;
        return;
    }

    column.cards.forEach(card => {
        const itemEl = document.createElement('div');
        itemEl.className = 'manager-item';
        itemEl.innerHTML = `
            <span>${card.title}</span>
            <div class="manager-item-actions">
                <button class="btn btn-sm edit" data-id="${card.id}">✏️</button>
                <button class="btn btn-sm danger" data-id="${card.id}">🗑️</button>
            </div>
        `;
        itemEl.querySelector('.btn.edit').onclick = () => {
            document.getElementById('manager-dialog').close();
            showCardDialog(card.id);
        };
        itemEl.querySelector('.btn.danger').onclick = () => {
            if (hasPermission(board, 'editColumns')) {
                document.getElementById('manager-dialog').close();
                handleDeleteCard(card.id);
            } else {
                showDialogMessage(document.getElementById('manager-dialog'), t('kanban.feedback.noPermission'), 'error');
            }
        };
        listContainer.appendChild(itemEl);
    });
}

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
    const groupAlert = document.getElementById('board-group-alert');
    const saveBtn = dialog.querySelector('#board-save-btn');

    // --- NOVA LÓGICA DE VALIDAÇÃO DE GRUPO ---
    const allGroups = getAllGroups();
    const creatableInGroups = allGroups.filter(g => {
        const isAdmin = g.adminId === currentUser.id;
        const canCreate = g.permissions?.createBoards && g.memberIds.includes(currentUser.id);
        return isAdmin || canCreate;
    });

    // Lógica do Ícone e campos de texto
    const iconInput = document.getElementById('board-icon-input');
    document.getElementById('btn-choose-board-icon').onclick = () => {
        showIconPickerDialog((selectedIcon) => {
            iconInput.value = selectedIcon;
        });
    };
    const templateSelect = document.getElementById('board-template-select');
    templateSelect.onchange = () => {
        const iconGroup = document.getElementById('board-icon-input').closest('.form-group');
        iconGroup.style.display = templateSelect.value ? 'none' : 'flex'; 
    };

    document.getElementById('board-title-input').value = board ? board.title : '';
    document.getElementById('board-description-input').value = board ? board.description || '' : '';

    // --- LÓGICA DE VISIBILIDADE E GRUPO (REESTRUTURADA) ---
    // Reseta o estado dos seletores para evitar condições de corrida
    groupSelect.disabled = false;
    visibilitySelect.disabled = false;
    groupContainer.style.display = 'none';
    groupAlert.style.display = 'none';
    saveBtn.disabled = false;
    iconInput.value = '📋'; // Padrão

    // Garante que o seletor de visibilidade esteja visível por padrão
    visibilitySelect.parentElement.style.display = 'block';

    if (board) { // Editando um quadro existente
        visibilitySelect.value = board.visibility;
        visibilitySelect.disabled = true;
        if (board.visibility === 'group' && board.groupId) {
            // Se o quadro pertence a um grupo, a visibilidade é travada e o grupo é exibido
            groupSelect.innerHTML = `<option value="${board.groupId}">${getGroup(board.groupId)?.name || t('kanban.board.unknownGroup')}</option>`;
            groupSelect.disabled = true;
        }
        iconInput.value = board.icon || '📋';
    } else {
        // Criando um novo quadro
        if (currentBoardFilter === 'group') {
            // Para quadros de GRUPO, as opções de visibilidade são contextuais.
            visibilitySelect.innerHTML = `
                <option value="private">${t('kanban.dialog.board.visibilityPrivate')}</option>
                <option value="group">${t('kanban.dialog.board.visibilityGroup')}</option>
            `;
            visibilitySelect.value = 'group';
            visibilitySelect.disabled = false; // Permite ao usuário escolher
            
            groupContainer.style.display = 'block';
            
            // Popula o seletor de grupos
            if (creatableInGroups.length === 0) {
                groupSelect.innerHTML = `<option value="">${t('groups.reports.noEligibleGroups')}</option>`;
                groupSelect.disabled = true;
                dialog.dataset.groupCreationAllowed = "false"; // Flag para validação
            } else {
                groupSelect.innerHTML = '';
                creatableInGroups.forEach(g => {
                    groupSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`;
                });
                groupSelect.disabled = false;
                dialog.dataset.groupCreationAllowed = "true"; // Flag para validação
            }
        } else {
            // Para quadros PESSOAIS, as opções de visibilidade são mais amplas.
            visibilitySelect.innerHTML = `
                <option value="private">${t('kanban.dialog.board.visibilityPrivate')}</option>
                <option value="friends">${t('kanban.dialog.board.visibilityFriends')}</option>
                <option value="public">${t('kanban.dialog.board.visibilityPublic')}</option>
                <option value="group">${t('kanban.dialog.board.visibilityGroup')}</option>
            `;
            visibilitySelect.value = 'private'; // Padrão para o filtro pessoal
            groupContainer.style.display = 'none'; // Garante que o seletor de grupo nunca apareça
            dialog.dataset.groupCreationAllowed = "true";
        }
    }

    // Inicializa os selects customizados APÓS popular todos os dados.
    // Isso evita a dessincronização e o erro reportado.
    setTimeout(() => {
        initCustomSelects();
    }, 0);

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

    // --- CORREÇÃO: Validação de grupo aprimorada ---
    const groupContainer = document.getElementById('board-group-container');
    const isGroupContext = groupContainer.style.display === 'block';
    const boardId = dialog.dataset.editingId;

    // A validação só se aplica ao CRIAR um quadro no contexto de grupo.
    if ((!boardId || boardId === 'null') && isGroupContext) {
        if (dialog.dataset.groupCreationAllowed === "false") {
            showDialogMessage(dialog, t('kanban.feedback.noGroupCreatePermission'), 'error');
            return;
        }
    }

    showConfirmationDialog(
        t('kanban.confirm.saveBoard'),
        (confirmationDialog) => {
            const boardId = dialog.dataset.editingId;
            const description = document.getElementById('board-description-input').value.trim();
            const icon = document.getElementById('board-icon-input').value;
            let savedBoard = null;

            if (boardId && boardId !== 'null') {
                const boardData = getBoard(boardId);
                if (!boardData) return false;
                boardData.title = title;
                boardData.description = description;
                boardData.icon = icon;
                savedBoard = saveBoard(boardData);
            } else { // Criando um novo quadro
                const allTemplates = [...getUserBoardTemplates(currentUser.id), ...getSystemBoardTemplates()];
                const selectedTemplate = allTemplates.find(t => t.id === templateId);
                if (selectedTemplate && !title) title = `${t(selectedTemplate.name)} ${t('kanban.board.copySuffix')}`;
                
                const visibility = document.getElementById('board-visibility').value;
                const newColumns = selectedTemplate ? selectedTemplate.columns.map(colTmpl => saveColumn({ title: t(colTmpl.name), color: colTmpl.color, cardIds: [] })) : [];
                const newBoardData = { 
                    title, 
                    description, 
                    icon: selectedTemplate ? selectedTemplate.icon : icon, 
                    ownerId: currentUser.id, 
                    visibility: visibility, 
                    columnIds: newColumns.map(c => c.id) 
                };

                // Se for um quadro de grupo, atribui o groupId
                if (isGroupContext) {
                    newBoardData.groupId = document.getElementById('board-group-select').value;
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
                saveState(); // Salva o estado APÓS a modificação bem-sucedida
                showDialogMessage(confirmationDialog, t('kanban.feedback.boardSaved'), 'success');
              
                // Se um quadro de grupo foi criado, muda o filtro para 'group'
                if ((!boardId || boardId === 'null') && savedBoard.groupId) {
                    currentBoardFilter = 'group';
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
                    // Adiciona um log de edição se algo mudou
                    const hasChanged = existingColumn.title !== columnData.title ||
                                     (existingColumn.description || '') !== (columnData.description || '') ||
                                     (existingColumn.color || null) !== columnData.color ||
                                     (existingColumn.textColor || null) !== columnData.textColor;

                    if (hasChanged) {
                        const logEntry = {
                            action: 'edited',
                            userId: currentUser.id,
                            timestamp: new Date().toISOString()
                        };
                        if (!existingColumn.activityLog) existingColumn.activityLog = [];
                        existingColumn.activityLog.push(logEntry);
                    }
                    Object.assign(existingColumn, columnData);
                    saveColumn(existingColumn);
                }
            } else { // Criando uma nova coluna
                const newColumn = saveColumn({ ...columnData, cardIds: [] });
                // Busca o quadro do storage para garantir que estamos atualizando a versão mais recente
                // Adiciona o log de criação
                newColumn.activityLog = [{
                    action: 'created',
                    userId: currentUser.id,
                    timestamp: new Date().toISOString()
                }];
                saveColumn(newColumn);
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
    const groupBoards = memberGroups.flatMap(g => g.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
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

                // Adiciona o primeiro registro no log de atividades
                newCard.activityLog = [{
                    action: 'created',
                    userId: currentUser.id,
                    timestamp: new Date().toISOString()
                }];
                saveCard(newCard); // Salva novamente com o log

                const targetColumn = currentBoard.columns.find(c => c.id === newColumnId);
                if (targetColumn) {
                    targetColumn.cardIds.push(newCard.id);
                    saveColumn(targetColumn);
                }

                // FASE 2: Atualiza contador de tarefas do grupo
                if (currentBoard.groupId) {
                    const group = getGroup(currentBoard.groupId);
                    if (group) {
                        group.taskCount = (group.taskCount || 0) + 1;
                        saveGroup(group);
                    }
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
    // ETAPA 3: VERIFICAÇÃO DE PERMISSÃO PARA ARRASTAR
    // Se for um quadro de grupo, verifica se o usuário tem permissão para editar colunas.
    // Esta permissão controla a reorganização do quadro.
    if (currentBoard && currentBoard.groupId) {
        if (!hasPermission(currentBoard, 'editColumns')) {
            e.preventDefault(); // Impede o início do arraste.
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }
    }
    hideTooltip(); // Esconde qualquer tooltip ao começar a arrastar
    isDragging = true;

    const targetCard = e.target.closest('.card');
    const targetColumnHeader = e.target.closest('.column-header');

    // --- LÓGICA UNIFICADA DO FANTASMA (CORRIGIDA) ---
    if (targetCard) {
        draggedElement = targetCard;
    } else if (targetColumnHeader) {
        draggedElement = targetColumnHeader.closest('.column');
    } else {
        return;
    }

    e.dataTransfer.setData('text/plain', draggedElement.dataset.cardId || draggedElement.dataset.columnId);
    e.dataTransfer.effectAllowed = 'move';

    // 1. Cria o clone para ser o fantasma
    const ghost = draggedElement.cloneNode(true);
    const rect = draggedElement.getBoundingClientRect();
    ghost.style.width = `${rect.width}px`;

    if (draggedElement.classList.contains('column')) {
        ghost.classList.add('column-drag-ghost');
        ghost.style.height = `${rect.height}px`; // Garante que o fantasma não se achate
    } else {
        ghost.classList.add('card-drag-ghost');
    }
    document.body.appendChild(ghost);

    // 2. Esconde o fantasma padrão do navegador
    e.dataTransfer.setDragImage(new Image(), 0, 0);

    // 3. Adiciona um listener para mover nosso fantasma customizado
    const moveGhost = (event) => {
        ghost.style.left = `${event.clientX}px`;
        ghost.style.top = `${event.clientY}px`;
    };
    document.addEventListener('dragover', moveGhost);

    // 4. Limpa tudo no final do arrasto
    draggedElement.addEventListener('dragend', () => {
        document.removeEventListener('dragover', moveGhost);
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    }, { once: true });

    // 5. Aplica o estilo ao placeholder (o elemento original)
    setTimeout(() => {
        draggedElement.classList.add('dragging');
    }, 0);
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

    // Limpa os highlights anteriores para evitar múltiplos indicadores
    document.querySelectorAll('.column.drag-over, .column.drop-shadow').forEach(col => {
        col.classList.remove('drag-over', 'drop-shadow');
    });

    if (draggedElement.classList.contains('card')) {
        if (targetColumn) targetColumn.classList.add('drag-over');
    } else if (draggedElement.classList.contains('column')) {
        // Aplica a sombra na coluna que virá *depois* da que estamos arrastando
        if (targetColumn && targetColumn !== draggedElement) {
            targetColumn.classList.add('drop-shadow');
        }
    }
}

function handleDragLeave(e) {
    const targetColumn = e.target.closest('.column');
    // Só remove a classe se o mouse realmente saiu da coluna (e não apenas de um elemento filho)
    if (targetColumn && !targetColumn.contains(e.relatedTarget)) {
        targetColumn.classList.remove('drag-over', 'drop-shadow');
    }
}

/**
 * Lida com o evento de soltar um cartão ou coluna.
 * Esta função foi reescrita para ser mais robusta e evitar erros de inconsistência.
 */
function handleDrop(e) {
    e.preventDefault();
    // CORREÇÃO: Garante que o estado de "arrastando" seja finalizado ao soltar,
    // reativando o tooltip imediatamente.
    isDragging = false;
    if (!draggedElement) return;
    
    // Limpa todos os highlights visuais ao soltar
    document.querySelectorAll('.column.drag-over, .column.drop-shadow').forEach(col => col.classList.remove('drag-over', 'drop-shadow'));

    const targetColumnEl = e.target.closest('.column');
    if (targetColumnEl) targetColumnEl.classList.remove('drag-over');

    const isCard = draggedElement.classList.contains('card');
    const isColumn = draggedElement.classList.contains('column');

    if (isCard && targetColumnEl) {
        const cardId = draggedElement.dataset.cardId;
        const sourceColumnId = draggedElement.closest('.column').dataset.columnId;
        const targetColumnId = targetColumnEl.dataset.columnId;

        const sourceColumn = currentBoard.columns.find(c => c.id === sourceColumnId);
        const targetColumn = currentBoard.columns.find(c => c.id === targetColumnId);
        if (!sourceColumn || !targetColumn) return; // Aborta se as colunas não forem encontradas

        // 1. Encontra e remove o cartão do array de dados da coluna de origem
        const cardIndex = sourceColumn.cards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return; // Segurança: se o cartão não estiver nos dados, aborta
        const [movedCardObject] = sourceColumn.cards.splice(cardIndex, 1);
        sourceColumn.cardIds.splice(sourceColumn.cardIds.indexOf(cardId), 1);

        // 2. Adiciona o log de atividade
        if (sourceColumnId !== targetColumnId) {
            const logEntry = {
                action: 'moved',
                userId: currentUser.id,
                timestamp: new Date().toISOString(),
                fromColumn: sourceColumn.title,
                toColumn: targetColumn.title
            };
            if (!movedCardObject.activityLog) movedCardObject.activityLog = [];
            movedCardObject.activityLog.push(logEntry);
        }

        // 3. Adiciona o cartão nos dados da coluna de destino na posição correta
        const cardsContainer = targetColumnEl.querySelector('.cards-container');
        const afterElement = getDragAfterElement(cardsContainer, e.clientY, false);
        const newIndex = afterElement ? Array.from(cardsContainer.children).indexOf(afterElement) : targetColumn.cardIds.length;
        targetColumn.cardIds.splice(newIndex, 0, cardId);
        targetColumn.cards.splice(newIndex, 0, movedCardObject);

        // 4. Salva as alterações e redesenha a tela para garantir consistência
        saveColumn(sourceColumn);
        if (sourceColumnId !== targetColumnId) saveColumn(targetColumn);

    } else if (isColumn && targetColumnEl && targetColumnEl !== draggedElement) {
        // NOVA LÓGICA: "Largar uma coluna dentro da outra"
        const movedColumnId = draggedElement.dataset.columnId;
        const fromIndex = currentBoard.columnIds.indexOf(movedColumnId);
        const toIndex = currentBoard.columnIds.indexOf(targetColumnEl.dataset.columnId);

        if (fromIndex === -1 || toIndex === -1) return; // Segurança

        // Adiciona o log de movimentação na própria coluna
        const movedColumn = findColumn(movedColumnId);
        if (movedColumn) {
            const logEntry = {
                action: 'moved',
                userId: currentUser.id,
                timestamp: new Date().toISOString()
            };
            if (!movedColumn.activityLog) movedColumn.activityLog = [];
            movedColumn.activityLog.push(logEntry);
            saveColumn(movedColumn);
        }

        // Remove o ID da posição original e o insere na nova posição
        currentBoard.columnIds.splice(fromIndex, 1);
        currentBoard.columnIds.splice(toIndex, 0, movedColumnId);

        saveBoard(currentBoard);
    }

    saveState(); // Salva o estado APÓS a modificação
    // Redesenha o quadro para garantir que o DOM e os dados estejam 100% sincronizados
    renderCurrentBoard();
}

function getDragAfterElement(container, coordinate, isHorizontal) {
    const draggableElements = [...container.querySelectorAll('.card:not(.dragging), .column:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        // LÓGICA CORRIGIDA: O ponto de decisão não é mais o centro exato.
        // O 'offset' agora representa a distância do cursor ao início do elemento.
        // Isso torna a detecção muito mais natural, especialmente ao mover da direita para a esquerda.
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

/**
 * Verifica se o usuário atual tem uma permissão específica para um quadro.
 * @param {object | null} board - O objeto do quadro. Se for nulo, verifica permissões globais (como criar quadro de grupo).
 * @param {string} permission - A chave da permissão (ex: 'createColumns', 'editBoards').
 * @returns {boolean} - Retorna true se o usuário tiver a permissão.
 */
function hasPermission(board, permission) {
    // Caso especial: Verificar se o usuário pode criar quadros em QUALQUER grupo.
    // Isso é chamado quando board é null (ex: botão "Adicionar Quadro" no filtro de grupos).
    if (permission === 'createBoards' && !board) {
        const allGroups = getAllGroups();
        const creatableInGroups = allGroups.filter(g => {
            if (g.adminId === currentUser.id) return true; // Admin sempre pode.
            if (!g.memberIds?.includes(currentUser.id)) return false; // Precisa ser membro.

            // 1. Verifica permissão individual
            if (g.memberPermissions?.[currentUser.id]?.createBoards !== undefined) {
                return g.memberPermissions[currentUser.id].createBoards;
            }
            // 2. Usa a permissão padrão do grupo
            return g.defaultPermissions?.createBoards;
        });
        return creatableInGroups.length > 0;
    }

    // Se não for um quadro de grupo, o usuário sempre tem permissão.
    if (!board || !board.groupId) return true;

    const group = getGroup(board.groupId);
    if (!group) return false; // Quadro de grupo órfão, nega por segurança.

    // Admin sempre tem permissão.
    if (group.adminId === currentUser.id) return true;
    if (!group.memberIds?.includes(currentUser.id)) return false; // Se não for membro, não tem permissão.

    // 1. Verifica se há uma permissão individual definida para este usuário.
    if (group.memberPermissions?.[currentUser.id]?.[permission] !== undefined) {
        return group.memberPermissions[currentUser.id][permission];
    }

    // 2. Se não houver, usa a permissão padrão do grupo.
    return group.defaultPermissions?.[permission];
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
        { label: t('kanban.contextMenu.card.edit'), icon: '✏️', action: () => handleEditCardFromMenu(cardId) },
        { label: t('kanban.contextMenu.card.details'), icon: 'ℹ️', action: () => showDetailsDialog(cardId) },
        { label: card.isComplete ? t('kanban.contextMenu.card.markPending') : t('kanban.contextMenu.card.markComplete'), icon: card.isComplete ? '⚪' : '✅', action: () => toggleCardComplete(cardId) },
        { isSeparator: true },
        { label: t('kanban.contextMenu.card.copy'), icon: '📋', action: () => handleCopyCard(cardId) }, // Copiar é sempre permitido
        { label: t('kanban.contextMenu.card.cut'), icon: '✂️', action: () => handleCutCard(cardId) },
        { isSeparator: true },
        { label: t('kanban.contextMenu.card.archive'), icon: '🗄️', action: () => handleArchiveCard(cardId) },
        { label: t('kanban.contextMenu.card.delete'), icon: '🗑️', action: () => handleDeleteCard(cardId), isDestructive: true }
    ];

    showContextMenu(event, menuItems);
}

/**
 * Cria e exibe o menu de contexto para uma coluna.
 */
function createColumnContextMenu(event, columnEl) {
    const columnId = columnEl.dataset.columnId;
    if (!hasPermission(currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    const menuItems = [
        { label: t('kanban.contextMenu.column.edit'), icon: '✏️', action: () => handleEditColumnFromMenu(columnId) },
        { label: t('kanban.contextMenu.column.details'), icon: 'ℹ️', action: () => showDetailsDialog(null, columnId) },
        { isSeparator: true },
        { label: t('kanban.contextMenu.column.copy'), icon: '📋', action: () => handleCopyColumn(columnId) },
        { label: t('kanban.contextMenu.column.cut'), icon: '✂️', action: () => handleCutColumn(columnId) },
        { isSeparator: true },
        { 
            label: t('kanban.button.pasteCard'), 
            icon: '📋', 
            action: () => handlePasteCard(columnId),
            disabled: !clipboard || clipboard.type !== 'card'
        },
        { isSeparator: true },
        { 
            label: t('kanban.contextMenu.column.archive'), // Adicionar esta chave no pt-BR.json
            icon: '🗄️', 
            action: () => archiveColumn(columnId)
        },
        { isSeparator: true },
        { label: t('kanban.contextMenu.column.delete'), icon: '🗑️', action: () => handleDeleteColumnFromMenu(columnId), isDestructive: true }
    ];

    showContextMenu(event, menuItems);
}

function handleDeleteColumnFromMenu(columnId){
    if (!hasPermission(currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }
    // A mensagem de confirmação ainda faz sentido, pois para o usuário é uma "exclusão"
    showConfirmationDialog(t('kanban.confirm.deleteColumn'), (confirmationDialog) => {
            // Em vez de deletar, arquiva com o motivo 'deleted'
            archiveColumn(columnId, 'deleted');
            // A função archiveColumn já mostra a mensagem flutuante e atualiza a tela.
            confirmationDialog.close();
            return false; // Retorna false para que o showConfirmationDialog não tente fechar de novo ou mostrar outra mensagem.
        }, null, t('ui.yesDelete'), t('ui.no'));
}
/**
 * Copia uma coluna e seus cartões para a área de transferência interna.
 * @param {string} columnId O ID da coluna a ser copiada.
 */
function handleCopyColumn(columnId) {
    const columnToCopy = findColumn(columnId);
    if (columnToCopy) {
        // Deep copy dos cartões é necessário para criar novas instâncias
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
    }
}

/**
 * Recorta uma coluna, marcando-a para ser movida.
 * @param {string} columnId O ID da coluna a ser recortada.
 */
function handleCutColumn(columnId) {
    // A permissão já foi verificada na função que chama esta (createColumnContextMenu)
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

/**
 * Arquiva uma coluna, movendo-a da visão principal para a lista de arquivadas.
 * @param {string} columnId O ID da coluna a ser arquivada.
 * @param {string} reason O motivo do arquivamento ('archived' ou 'deleted').
 */
function archiveColumn(columnId, reason = 'archived') {
    if (!hasPermission(currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }
    saveState(); // Salva o estado antes de arquivar
    const column = findColumn(columnId);
    if (!column) return;

    // CORREÇÃO: Garante que a referência ao quadro seja salva junto com a coluna.
    column.boardId = currentBoard.id;
    // Adiciona a entrada de log apropriada
    const logEntry = {
        action: reason === 'deleted' ? 'trashed' : 'archived',
        userId: currentUser.id,
        timestamp: new Date().toISOString()
    };
    if (!column.activityLog) {
        column.activityLog = [];
    }
    column.activityLog.push(logEntry);

    // Adiciona metadados de arquivamento
    column.isArchived = true;
    column.archiveReason = reason;
    column.archivedAt = new Date().toISOString();
    column.archivedBy = currentUser.id;
    saveColumn(column);

    // Remove a coluna da lista ativa do quadro
    currentBoard.columnIds = currentBoard.columnIds.filter(id => id !== columnId);
    
    // Adiciona a coluna à lista de arquivadas do quadro
    if (!currentBoard.archivedColumnIds) currentBoard.archivedColumnIds = [];
    if (!currentBoard.archivedColumnIds.includes(columnId)) {
        currentBoard.archivedColumnIds.push(columnId);
    }
    saveBoard(currentBoard);

    showSuccessAndRefresh(null, currentBoard.id);
}

// --- LÓGICA DO DIÁLOGO DE DETALHES ---

/**
 * Mostra o diálogo de detalhes para um cartão ou coluna.
 */
function showDetailsDialog(cardId = null, columnId = null) {
    const dialog = document.getElementById('details-dialog');
    const titleEl = document.getElementById('details-title');
    const contentContainer = document.getElementById('details-content');
    contentContainer.innerHTML = ''; // Limpa o conteúdo anterior

    if (cardId) {
        const { card } = findCardAndColumn(cardId);
        titleEl.textContent = t('kanban.dialog.details.cardTitle', { title: card.title });
        
        // Cria a estrutura de abas
        contentContainer.innerHTML = `
            <div class="details-tabs">
                <button class="details-tab-btn active" data-tab="details-pane">${t('activityLog.details.tabDetails')}</button>
                <button class="details-tab-btn" data-tab="activity-pane">${t('activityLog.details.tabActivity')}</button>
            </div>
            <div id="details-pane" class="details-tab-pane active"></div>
            <div id="activity-pane" class="details-tab-pane"></div>
        `;

        renderCardDetails(card, contentContainer.querySelector('#details-pane'));
        renderActivityLog(card, contentContainer.querySelector('#activity-pane'));

        // Adiciona listeners para as abas
        contentContainer.querySelectorAll('.details-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                contentContainer.querySelectorAll('.details-tab-btn, .details-tab-pane').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                contentContainer.querySelector(`#${btn.dataset.tab}`).classList.add('active');
            });
        });

    } else if (columnId) {
        const column = findColumn(columnId);
        titleEl.textContent = t('kanban.dialog.details.columnTitle', { title: column.title });

        // Cria a estrutura de abas para colunas também
        contentContainer.innerHTML = `
            <div class="details-tabs">
                <button class="details-tab-btn active" data-tab="details-pane">${t('activityLog.details.tabDetails')}</button>
                <button class="details-tab-btn" data-tab="activity-pane">${t('activityLog.details.tabActivity')}</button>
            </div>
            <div id="details-pane" class="details-tab-pane active"></div>
            <div id="activity-pane" class="details-tab-pane"></div>
        `;

        renderColumnDetails(column, contentContainer.querySelector('#details-pane'));
        renderColumnActivityLog(column, contentContainer.querySelector('#activity-pane'));

        // Adiciona listeners para as abas
        contentContainer.querySelectorAll('.details-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                contentContainer.querySelectorAll('.details-tab-btn, .details-tab-pane').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');
                contentContainer.querySelector(`#${btn.dataset.tab}`).classList.add('active');
            });
        });
    }

    dialog.showModal();
}

/**
 * Renderiza a aba de detalhes de uma coluna.
 * @param {object} column - O objeto da coluna.
 * @param {HTMLElement} container - O elemento onde os detalhes serão renderizados.
 */
function renderColumnDetails(column, container) {
    let detailsHtml = '<ul>';
    if (column.description) detailsHtml += `<li><strong>${t('kanban.dialog.details.description')}</strong><p>${column.description.replace(/\n/g, '<br>')}</p></li>`;
    detailsHtml += '</ul>';
    container.innerHTML = detailsHtml;
}

/**
 * Renderiza a aba de detalhes de um cartão.
 * @param {object} card - O objeto do cartão.
 * @param {HTMLElement} container - O elemento onde os detalhes serão renderizados.
 */
function renderCardDetails(card, container) {
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
    
    container.innerHTML = detailsHtml;
}

/**
 * Renderiza a aba de log de atividades de um cartão.
 * @param {object} card - O objeto do cartão.
 * @param {HTMLElement} container - O elemento onde o log será renderizado.
 */
function renderActivityLog(card, container) {
    const log = card.activityLog || [];
    if (log.length === 0) {
        container.innerHTML = `<p class="activity-log-empty">${t('activityLog.empty')}</p>`;
        return;
    }

    // Ordena do mais recente para o mais antigo
    const sortedLog = log.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let logHtml = '<ul class="activity-log-list">';
    sortedLog.forEach(entry => {
        const user = allUsers.find(u => u.id === entry.userId)?.name || 'Sistema';
        const date = new Date(entry.timestamp).toLocaleString();
        const fromLocation = entry.from === 'trash' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        
        // CORREÇÃO: Adiciona todos os placeholders possíveis para a tradução.
        const replacements = {
            user: `<strong>${user}</strong>`,
            from: entry.fromColumn || fromLocation,
            to: entry.toColumn,
            fromBoard: entry.fromBoard,
            toBoard: entry.toBoard
        };
        
        const message = t(`activityLog.action.${entry.action}`, replacements)
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Converte markdown **bold** para <strong>

        logHtml += `
            <li class="activity-log-item">
                <div class="log-message">${message}</div>
                <div class="log-date">${date}</div>
            </li>
        `;
    });
    logHtml += '</ul>';
    container.innerHTML = logHtml;
}

/**
 * Renderiza a aba de log de atividades de uma coluna.
 * @param {object} column - O objeto da coluna.
 * @param {HTMLElement} container - O elemento onde o log será renderizado.
 */
function renderColumnActivityLog(column, container) {
    const log = column.activityLog || [];
    if (log.length === 0) {
        container.innerHTML = `<p class="activity-log-empty">${t('activityLog.emptyColumn')}</p>`;
        return;
    }

    const sortedLog = log.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let logHtml = '<ul class="activity-log-list">';
    sortedLog.forEach(entry => {
        const user = allUsers.find(u => u.id === entry.userId)?.name || 'Sistema';
        const date = new Date(entry.timestamp).toLocaleString();
        const fromLocation = entry.from === 'trash' ? t('archive.tabs.trash') : t('archive.tabs.archived');
        
        // CORREÇÃO: Adiciona todos os placeholders possíveis para a tradução.
        const replacements = {
            user: `<strong>${user}</strong>`,
            column: `<strong>${column.title}</strong>`,
            from: fromLocation,
            fromBoard: entry.fromBoard,
            toBoard: entry.toBoard
        };
        
        const message = t(`activityLog.action.column.${entry.action}`, replacements)
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        logHtml += `<li class="activity-log-item"><div class="log-message">${message}</div><div class="log-date">${date}</div></li>`;
    });
    logHtml += '</ul>';
    container.innerHTML = logHtml;
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
    updateHeaderButtonPermissions(); // Atualiza permissões ao trocar de quadro
}

function handleArchiveBoard(boardId) {
    const boardToArchive = boards.find(b => b.id === boardId);
    if (!boardToArchive) return;

    showConfirmationDialog(
        t('archive.confirm.archiveBoard', { boardName: boardToArchive.title }), // Adicionar tradução
        (dialog) => {
            const archived = archiveBoard(boardId, currentUser.id, 'archived');
            if (!archived) return false;

            // Atualiza o perfil do usuário para mover o quadro para a lista de arquivados
            const userProfile = getUserProfile(currentUser.id);
            userProfile.boardIds = (userProfile.boardIds || []).filter(id => id !== boardId);
            if (!userProfile.archivedBoardIds) userProfile.archivedBoardIds = [];
            if (!userProfile.archivedBoardIds.includes(boardId)) {
                userProfile.archivedBoardIds.push(boardId);
            }
            saveUserProfile(userProfile);
            
            // Recarrega os dados para atualizar a lista de quadros
            loadData().then(() => {
                // Seleciona o próximo quadro disponível que não esteja arquivado
                currentBoard = boards.find(b => !b.isArchived) || null; // Seleciona o próximo quadro disponível
                localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');
                renderBoardSelector();
                renderCurrentBoard();
                initCustomSelects();
            });
            showDialogMessage(dialog, t('archive.feedback.boardArchived'), 'success'); // Adicionar tradução
            return true;
        });
}
function toggleCardComplete(cardId) {
    const { card } = findCardAndColumn(cardId);
    if (card) {
        // Prepara o registro de log ANTES de alterar o estado
        const logEntry = {
            action: !card.isComplete ? 'completed' : 'reopened',
            userId: currentUser.id,
            timestamp: new Date().toISOString()
        };

        // Adiciona ou remove a data de conclusão
        if (!card.isComplete) {
            card.completedAt = new Date().toISOString();
        } else {
            delete card.completedAt;
        }

        // Adiciona o log ao cartão
        if (!card.activityLog) card.activityLog = [];
        card.activityLog.push(logEntry);

        card.isComplete = !card.isComplete;
        saveCard(card); // Salva a alteração no armazenamento
        saveState();

        // FASE 2: Atualiza contador de tarefas concluídas do grupo
        if (currentBoard.groupId) {
            const group = getGroup(currentBoard.groupId);
            if (group) {
                if (card.isComplete) {
                    group.completedTaskCount = (group.completedTaskCount || 0) + 1;
                } else {
                    group.completedTaskCount = Math.max(0, (group.completedTaskCount || 0) - 1);
                }
                saveGroup(group);
            }
        }
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
            const { card, column } = findCardAndColumn(cardId);
            if (!card || !column) return false;
            
            // Adiciona a ação 'trashed' ao log de atividades
            const logEntry = {
                action: 'trashed',
                userId: currentUser.id,
                timestamp: new Date().toISOString()
            };
            if (!card.activityLog) card.activityLog = [];
            card.activityLog.push(logEntry);
            saveCard(card); // Salva o log antes de arquivar

            // Arquiva com o motivo 'deleted' (move para a lixeira).
            archiveCard(cardId, currentUser.id, 'deleted', column.id, currentBoard.id);

            // FASE 2: Atualiza contadores de tarefas do grupo
            if (currentBoard.groupId) {
                const group = getGroup(currentBoard.groupId);
                if (group) {
                    group.taskCount = Math.max(0, (group.taskCount || 0) - 1);
                    if (card.isComplete) group.completedTaskCount = Math.max(0, (group.completedTaskCount || 0) - 1);
                    saveGroup(group);
                }
            }

            // Remove da visualização atual em memória
            column.cardIds = column.cardIds.filter(id => id !== cardId);
            column.cards = column.cards.filter(c => c.id !== cardId);
            
            saveState();
            showDialogMessage(dialog, t('kanban.feedback.cardDeleted'), 'success');
            showSuccessAndRefresh(dialog, currentBoard.id);
            return true;
        },
        null,
        t('ui.yesDelete'), t('ui.no')
    );
}

function handleArchiveCard(cardId) {
    if (!hasPermission(currentBoard, 'editColumns')) { // Archiving is an edit action
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }
    const { card, column } = findCardAndColumn(cardId);
    if (!card) return;

    showConfirmationDialog(t('archive.confirm.archiveCard', { cardTitle: card.title }), (dialog) => {
        // Adiciona a ação 'archived' ao log de atividades
        const logEntry = {
            action: 'archived',
            userId: currentUser.id,
            timestamp: new Date().toISOString()
        };
        if (!card.activityLog) card.activityLog = [];
        card.activityLog.push(logEntry);
        saveCard(card); // Salva o log antes de arquivar

        // CORREÇÃO BUG: Atualiza contadores de tarefas do grupo ao arquivar.
        if (currentBoard.groupId) {
            const group = getGroup(currentBoard.groupId);
            if (group) {
                group.taskCount = Math.max(0, (group.taskCount || 0) - 1);
                group.completedTaskCount = (group.completedTaskCount || 0) + 1;
                saveGroup(group);
            }
        }

        archiveCard(cardId, currentUser.id, 'archived', column.id, currentBoard.id);
        saveState();
        showDialogMessage(dialog, t('archive.feedback.cardArchived'), 'success');
        showSuccessAndRefresh(dialog, currentBoard.id);
        return true;
    });
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
        // Se não houver nada no clipboard, não faz nada.
        showFloatingMessage(t('kanban.feedback.noCardToPaste'), 'warning');
        return;
    }

    const targetColumn = findColumn(targetColumnId);
    if (!targetColumn) return;

    // ETAPA 4: VERIFICAÇÃO DE PERMISSÃO AO COLAR
    if (clipboard.mode === 'copy' && !hasPermission(currentBoard, 'createCards')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        clipboard = null; // Limpa o clipboard para evitar tentativas repetidas
        return;
    }

    if (clipboard.mode === 'cut') {
        const sourceBoard = getBoard(clipboard.sourceBoardId);
        const sourceColumn = getColumn(clipboard.sourceColumnId);
        if (sourceColumn) {
            const cardIndex = sourceColumn.cardIds.indexOf(clipboard.sourceCardId);
            if (cardIndex > -1) {
                sourceColumn.cardIds.splice(cardIndex, 1);
                saveColumn(sourceColumn);
            }
        }
        targetColumn.cardIds.push(clipboard.sourceCardId);
        saveColumn(targetColumn);

        // Adiciona o log de movimentação
        const movedCard = getCard(clipboard.sourceCardId);
        if (movedCard) {
            let logEntry;
            // Verifica se a movimentação foi entre quadros diferentes
            if (clipboard.sourceBoardId !== currentBoard.id) {
                logEntry = {
                    action: 'moved_board',
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    fromBoard: sourceBoard?.title || 'Quadro Desconhecido',
                    toBoard: currentBoard.title
                };
            } else if (sourceColumn.id !== targetColumn.id) { // Movimentação entre colunas no mesmo quadro
                logEntry = {
                    action: 'moved',
                    userId: currentUser.id,
                    timestamp: new Date().toISOString(),
                    fromColumn: sourceColumn.title,
                    toColumn: targetColumn.title
                };
            }
            if (!movedCard.activityLog) movedCard.activityLog = [];
            movedCard.activityLog.push(logEntry);
            saveCard(movedCard);
        }
    } else { // 'copy'
        const newCard = saveCard(clipboard.data);
        newCard.activityLog = [{
            action: 'created_from_copy',
            userId: currentUser.id,
            timestamp: new Date().toISOString()
        }];
        saveCard(newCard); // Salva novamente com o log

        // CORREÇÃO BUG: Atualiza contador de tarefas do grupo ao copiar cartão.
        if (currentBoard.groupId) {
            const group = getGroup(currentBoard.groupId);
            if (group) {
                group.taskCount = (group.taskCount || 0) + 1;
                saveGroup(group);
            }
        }

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

function handleEditCardFromMenu(cardId) {
    // A edição de cartão é sempre permitida para membros, então não precisa de verificação aqui,
    // mas a função existe para manter a consistência do fluxo.
    showCardDialog(cardId);
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

function handleEditColumnFromMenu(columnId) {
    // ETAPA 4: VERIFICAÇÃO DE PERMISSÃO
    if (!hasPermission(currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }
    showColumnDialog(columnId);
}

function handlePasteColumn() {
    if (!clipboard || clipboard.type !== 'column') {
        showFloatingMessage(t('kanban.feedback.noColumnToPaste'), 'warning');
        return;
    }

    if (clipboard.mode === 'cut') {
        // ETAPA 4: VERIFICAÇÃO DE PERMISSÃO
        // Para mover (recortar/colar), o usuário precisa de permissão de edição no quadro de origem E no de destino.
        if (!hasPermission(getBoard(clipboard.sourceBoardId), 'editColumns') || !hasPermission(currentBoard, 'editColumns')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }

        // Lógica para MOVER a coluna
        const { sourceColumnId, sourceBoardId } = clipboard;

        // Não pode colar no mesmo quadro de onde recortou
        if (sourceBoardId === currentBoard.id) {
            showFloatingMessage(t('kanban.feedback.pasteColumnSameBoard'), 'info');
            clipboard = null; // Limpa o clipboard para evitar ações repetidas
            return;
        }

        const movedColumn = getColumn(sourceColumnId);
        const sourceBoard = getBoard(sourceBoardId);

        // Remove a coluna do quadro de origem
        if (sourceBoard) {
            sourceBoard.columnIds = sourceBoard.columnIds.filter(id => id !== sourceColumnId);
            saveBoard(sourceBoard);
        }

        // Adiciona o log de movimentação entre quadros
        if (movedColumn) {
            const logEntry = {
                action: 'moved_board',
                userId: currentUser.id,
                timestamp: new Date().toISOString(),
                fromBoard: sourceBoard?.title || 'Quadro Desconhecido',
                toBoard: currentBoard.title
            };
            if (!movedColumn.activityLog) movedColumn.activityLog = [];
            movedColumn.activityLog.push(logEntry);
            saveColumn(movedColumn);
        }

        // Adiciona a coluna ao quadro atual
        const targetBoard = getBoard(currentBoard.id);
        targetBoard.columnIds.push(sourceColumnId);
        saveBoard(targetBoard);

        showFloatingMessage(t('kanban.feedback.columnMoved'), 'success');

    } else { // 'copy'
        // ETAPA 4: VERIFICAÇÃO DE PERMISSÃO
        if (!hasPermission(currentBoard, 'createColumns')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }

        // Lógica para COPIAR a coluna
        const columnData = clipboard.data;
        // CORREÇÃO: Cria novos cartões independentes com logs de atividade
        const newCards = columnData.cards.map(cardData => {
            const newCard = {
                ...cardData,
                id: null, // Garante um novo ID
                title: `${cardData.title} ${t('kanban.board.copySuffix')}`,
                activityLog: [{
                    action: 'created_from_column_copy', // Ação específica
                    userId: currentUser.id,
                    timestamp: new Date().toISOString()
                }]
            };
            return saveCard(newCard);
        });
        const newColumn = saveColumn({ ...columnData, cardIds: newCards.map(c => c.id) });

        // Adiciona o log de criação a partir de cópia
        newColumn.activityLog = [{
            action: 'created_from_copy',
            userId: currentUser.id,
            timestamp: new Date().toISOString()
        }];
        saveColumn(newColumn); // Salva novamente com o log

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

    dialog.showModal();
}



function restoreKanbanOriginalSettings() {
    // 1. Restaura o objeto currentUser em memória para o estado original
    currentUser.theme = originalPreferences.theme;
    currentUser.preferences = { ...currentUser.preferences, ...originalPreferences };

    // 2. Aplica as configurações visuais diretamente para reverter as pré-visualizações
    applyThemeFromSelect(originalPreferences.theme);
    applyFontFamily(originalPreferences.fontFamily);
    applyFontSize(originalPreferences.fontSize, true);

    // Restaura a cor primária
    const colorData = originalPreferences.primaryColor;
    if (colorData && colorData !== 'none' && colorData.hex && colorData.rgb) {
        document.body.classList.remove('no-primary-effects');
        document.documentElement.style.setProperty('--primary', colorData.hex);
        document.documentElement.style.setProperty('--primary-rgb', colorData.rgb);
    } else {
        document.body.classList.add('no-primary-effects');
    }

    // Restaura o header inteligente
    const isSmartHeaderEnabled = originalPreferences.smartHeader === true;
    document.body.classList.toggle('smart-header-enabled', isSmartHeaderEnabled);

    // 3. Redesenha o quadro para aplicar as preferências de exibição de cartão/quadro
    renderCurrentBoard();
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
    // CORREÇÃO: Usa a variável CSS global, que é a abordagem correta e mais performática,
    // alinhando-se com a implementação em profile.js e ui-controls.js.
    document.documentElement.style.setProperty('--app-font-family', fontFamily);
}

function applyFontSize(size, isPreview = false) {
    // CORREÇÃO: Usa os mesmos valores em 'rem' do profile.js para consistência.
    // A pré-visualização agora funciona corretamente.
    const sizeMap = { small: '0.75rem', medium: '1rem', large: '1.3rem', 'x-large': '1.6rem' };
    const fontSizeValue = sizeMap[size] || '1rem';
    document.documentElement.style.fontSize = fontSizeValue;
}

function applyTitlePreview() {
    const titleElement = document.getElementById('kanban-title');
    if (!titleElement || !currentBoard) return;

    // O diálogo não é clonado. Este comentário estava incorreto.
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

/**
 * Atualiza o estado (habilitado/desabilitado) dos botões de ação do cabeçalho
 * com base nas permissões do usuário para o quadro atual.
 */
function updateHeaderButtonPermissions() {
    const addColumnBtn = document.getElementById('add-column-btn');
    const addCardBtn = document.getElementById('add-card-btn');
    const editItemsBtn = document.getElementById('edit-items-btn');
    const saveTemplateBtn = document.getElementById('save-as-template-btn');

    if (!currentBoard) {
        [addColumnBtn, addCardBtn, editItemsBtn, saveTemplateBtn].forEach(btn => btn.disabled = true);
        return;
    }

    // CORREÇÃO: A verificação de permissão é feita no 'click', não no 'title'.
    // O botão não será mais desabilitado, mas o clique será interceptado.
    addColumnBtn.disabled = false; // Mantém o botão sempre habilitado visualmente.
    addColumnBtn.title = t('kanban.button.addColumn'); // Tooltip padrão.

    addCardBtn.disabled = false; // Mantém o botão sempre habilitado visualmente.
    addCardBtn.title = t('kanban.button.addCard'); // Tooltip padrão.

    // Habilita os outros botões. A permissão de criar/editar cartões é verificada no clique.
    [editItemsBtn, saveTemplateBtn].forEach(btn => btn.disabled = false);
}
