// js/kanban.js - VERSÃO REFATORADA E FINAL

import { getCurrentUser, updateUser, hasPermission } from './auth.js';
import { 
    archiveBoard as archiveBoardInStorage,
    trashBoard as trashBoardInStorage,
    archiveColumn as archiveColumnInStorage,
    trashColumn as trashColumnInStorage,
    archiveCard as archiveCardInStorage,
    trashCard as trashCardInStorage,
    getUserProfile, 
    saveUserProfile, 
    getFullBoardData, 
    getBoard, 
    saveBoard, 
    getColumn, 
    saveColumn, 
    getCard, 
    saveCard, 
    deleteGroup,
    getAllUsers, getAllGroups, getGroup, saveGroup, getSystemBoardTemplates, getUserBoardTemplates,
    getSystemTagTemplates, getUserTagTemplates, saveUserBoardTemplates 
} from './storage.js';
import { showFloatingMessage, initDraggableElements, updateUserAvatar, closeAllDropdowns,
    initUIControls, showConfirmationDialog, showDialogMessage, initCustomSelects,
    applyUserTheme, showIconPickerDialog, ICON_LIBRARY, showContextMenu, showCustomColorPickerDialog, 
    makeDraggable, initSmartHeader, disableSmartHeader, applySmartHeaderState } from './ui-controls.js';
import { t, initTranslations, applyTranslations, loadLanguage } from './translations.js';
import { addCardAssignmentNotification, addCardDueNotification } from './notifications.js';

// ===== ESTADO GLOBAL DO MÓDULO =====
let currentUser = null;
let allUsers = [];
let boards = [];
let allGroups = [];
let currentBoard = null; // O quadro atualmente exibido
let draggedElement = null;
let currentBoardFilter = 'personal';
let undoStack = [];
let redoStack = [];
let clipboard = null; // Para copiar/colar
let originalPreferences = {}; // Para restaurar ao cancelar
let tagColorMap = new Map();
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
    currentUser = await getCurrentUser();
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

    // --- CORREÇÃO DEFINITIVA: Lógica de carregamento do quadro inicial ---
    // 1. Carrega o último filtro usado pelo usuário. O padrão é 'personal'.
    currentBoardFilter = localStorage.getItem(`kanbanFilter_${currentUser.id}`) || 'personal';
    document.querySelectorAll('#board-filter-toggle .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentBoardFilter);
    });

    // 2. Filtra os quadros visíveis com base no filtro carregado.
    const filteredBoards = boards.filter(board => {
        if (currentBoardFilter === 'personal') return !board.groupId;
        if (currentBoardFilter === 'group') return !!board.groupId;
        return true;
    });

    // 3. Tenta encontrar o último quadro que o usuário estava vendo.
    const lastBoardId = localStorage.getItem(`currentBoardId_${currentUser.id}`);
    let initialBoard = filteredBoards.find(b => b.id === lastBoardId);

    // 4. Se o último quadro não existe mais ou não pertence ao filtro atual,
    //    seleciona o primeiro quadro disponível na lista filtrada.
    if (!initialBoard) {
        initialBoard = filteredBoards[0] || null;
    }
    
    currentBoard = initialBoard;

    // 5. Salva o ID do quadro que será efetivamente exibido, garantindo consistência.
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
    allUsers = await getAllUsers();
    const userProfile = await getUserProfile(currentUser.id);

    // Carrega todos os quadros de todos os grupos dos quais o usuário é membro (agora em escopo global)
    allGroups = await getAllGroups();
    const memberGroups = allGroups.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    const groupBoardIds = memberGroups.flatMap(g => g.boardIds || []);

    // Combina todos os IDs de quadros (pessoais e de grupo) em um conjunto para evitar duplicatas
    const allVisibleBoardIds = new Set([...(userProfile?.boardIds || []), ...groupBoardIds]);

    const allBoardMap = new Map();

    // Itera sobre todos os IDs de quadros visíveis e aplica a lógica de permissão
    for (const boardId of allVisibleBoardIds) {
        const board = await getFullBoardData(boardId);
        if (!board) continue;

        const owner = await getUserProfile(board.ownerId);
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
    const systemTags = await getSystemTagTemplates();
    const userTags = await getUserTagTemplates(currentUser.id);
    systemTags.forEach(t => t.tags.forEach(tag => tagColorMap.set(tag.name, tag.color)));
    userTags.forEach(t => t.tags.forEach(tag => tagColorMap.set(tag.name, tag.color)));
}

/**
 * Configura todos os event listeners da página.
 */
function setupEventListeners() {
    // ✅ SOLUÇÃO DEFINITIVA: DELEGAÇÃO DE EVENTOS
    // Adiciona um único listener ao container pai que nunca é destruído.
    // Este listener "observa" cliques em qualquer checkbox de checklist que apareça dentro dele.
    document.getElementById('columns-container').addEventListener('change', async (e) => {
        // Verifica se o elemento que disparou o evento é um checkbox de checklist dentro de um cartão
        if (e.target.matches('.card-checklist-item input[type="checkbox"]')) {
            e.stopPropagation(); // Impede que o clique se propague para outros elementos (como o card)

            const checkbox = e.target;
            const cardEl = checkbox.closest('.card');
            if (!cardEl) return;

            const cardId = cardEl.dataset.cardId;
            const itemIndex = parseInt(checkbox.dataset.index, 10);

            // 1. Busca o dado mais recente do storage
            const cardToUpdate = await getCard(cardId);
            if (!cardToUpdate || !cardToUpdate.checklist || !cardToUpdate.checklist[itemIndex]) {
                console.error('Delegação: Cartão ou item do checklist não encontrado para atualização.');
                return;
            }

            // 2. Atualiza o estado do item
            cardToUpdate.checklist[itemIndex].completed = checkbox.checked;

            // 3. Salva no storage (a "fonte da verdade")
            await saveCard(cardToUpdate);

            // 4. Atualiza o estado em memória (currentBoard)
            const result = findCardAndColumn(cardId);
            if (result && result.card) {
                result.card.checklist = cardToUpdate.checklist;
            }

            // 5. Atualiza a UI do cartão específico (sumário e estilo do item)
            updateCardChecklistUI(cardEl, cardToUpdate.checklist);

            // 6. Fornece feedback ao usuário
            showFloatingMessage(
                checkbox.checked ? t('kanban.feedback.checklistItemCompleted') : t('kanban.feedback.checklistItemPending'),
                'success'
            );
        }
    });

    document.getElementById('add-board-btn')?.addEventListener('click', async () => {
        if (currentBoardFilter === 'group' && !await hasPermission(null, 'createBoards')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }
        await showBoardDialog();
    });
    
    document.getElementById('add-column-btn')?.addEventListener('click', async () => {
        if (!currentBoard) {
            showFloatingMessage(t('kanban.feedback.noBoardForColumn'), 'error');
            return;
        }
        if (!await hasPermission(currentUser, currentBoard, 'createColumns')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }
        await showColumnDialog();
    });
    
    document.getElementById('add-card-btn')?.addEventListener('click', async () => {
        if (!currentBoard) {
            showFloatingMessage(t('kanban.feedback.noBoardSelected'), 'error');
            return;
        }
        if (currentBoard.columns.length === 0) {
            showFloatingMessage(t('kanban.feedback.noColumnForCard'), 'error');
            return;
        }
        if (!await hasPermission(currentUser, currentBoard, 'createCards')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }
        await showCardDialog(null, currentBoard.columns[0].id);
    });

    document.getElementById('board-select')?.addEventListener('change', switchBoard);
    document.getElementById('edit-items-btn')?.addEventListener('click', () => showManagerDialog());
    document.getElementById('undo-btn')?.addEventListener('click', undoAction);
    document.getElementById('redo-btn')?.addEventListener('click', redoAction);
    document.getElementById('start-tour-btn')?.addEventListener('click', startTour);
    document.getElementById('export-img')?.addEventListener('click', () => handleExportImage());
    document.getElementById('save-as-template-btn')?.addEventListener('click', () => saveBoardAsTemplate());
    document.getElementById('search-cards-btn')?.addEventListener('click', () => showSearchDialog());
    document.getElementById('print-btn')?.addEventListener('click', handlePrintBoard);
    // --- Diálogos (Modais) ---
    document.getElementById('board-save-btn')?.addEventListener('click', async () => await handleSaveBoard());
    document.getElementById('column-save-btn')?.addEventListener('click', async () => await handleSaveColumn());
    document.getElementById('column-delete-btn')?.addEventListener('click', async () => await handleDeleteColumn(document.getElementById('column-dialog').dataset.editingId));    // CORREÇÃO: O listener do botão de salvar cartão é configurado uma única vez aqui.
    // A função handleSaveCard agora não precisa mais ser aninhada dentro de showCardDialog.
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

                // --- LÓGICA DE PRÉ-VISUALIZAÇÃO DA WINDOW-BAR ---
                const darkerColor = shadeColor(swatch.dataset.hex, -20); // Escurece a cor em 20%
                document.querySelector('.window-bar')?.style.setProperty('background-color', darkerColor);
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
            { id: 'pref-card-show-checklist', action: applyCardPreview },
            { id: 'pref-card-show-assignment', action: applyCardPreview },
            { id: 'pref-board-show-title', action: applyTitlePreview }, // Corrigido
            { id: 'pref-board-show-icon', action: applyTitlePreview },
            { id: 'pref-smart-header', action: (e) => applySmartHeaderState(e.target.checked) }
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
    document.body.classList.add('tour-active'); // Adiciona a classe para desativar o fechamento de menus
    currentTourStep = 0;
    document.getElementById('tour-overlay').classList.remove('hidden');
    showTourStep(currentTourStep);
}

async function endTour(wasSkipped = false) {
    isTourActive = false;
    // Reativa o Smart Header, que verificará as preferências do usuário.
    initSmartHeader();
    document.body.classList.remove('tour-active'); // Remove a classe, reativando o comportamento normal dos menus
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
    if (typeof closeAllDropdowns === 'function') {
        closeAllDropdowns();
    }

    // Marca que o tour foi visto para não mostrar novamente
    if (!currentUser.preferences.hasSeenTour) {
        currentUser.preferences.hasSeenTour = true;
        await updateUser(currentUser.id, { preferences: currentUser.preferences });
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
    if ((!previousStep || currentStep.context !== previousStep.context) && typeof closeAllDropdowns === 'function') closeAllDropdowns();

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

async function createTourBoard() {
    const boardData = {
        title: t('tour.item.boardTitle'),
        icon: '🚀',
        ownerId: currentUser.id,
        visibility: 'private',
        columnIds: [],
        columns: []
    };
    const newBoard = await saveBoard(boardData);
    tourCreatedItems.boardId = newBoard.id; // Salva o ID para o "desfazer"
    boards.push(newBoard); // Adiciona à lista em memória
    currentBoard = newBoard; // Define como quadro atual
    localStorage.setItem(`currentBoardId_${currentUser.id}`, newBoard.id);
    await renderBoardSelector();
    await renderCurrentBoard();
    initCustomSelects();
}

async function createTourColumn() {
    if (!currentBoard) return;
    const columnData = {
        title: t('tour.item.columnTitle'),
        color: '#9b59b6',
        textColor: '#ffffff',
        cardIds: [],
        cards: []
    };
    const newColumn = await saveColumn(columnData);
    tourCreatedItems.columnId = newColumn.id; // Salva o ID
    currentBoard.columnIds.push(newColumn.id);
    currentBoard.columns.push(newColumn);
    await saveBoard(currentBoard);
    await renderCurrentBoard();
}

async function createTourCard() {
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
    const newCard = await saveCard(cardData);
    tourCreatedItems.cardId = newCard.id; // Salva o ID
    targetColumn.cardIds.push(newCard.id);
    targetColumn.cards.push(newCard);
    await saveColumn(targetColumn);
    await renderCurrentBoard();
}

/**
 * Funções para DESFAZER as criações do tour.
 */
async function undoTourBoard() {
    // CORREÇÃO: Verifica se o ID existe antes de tentar qualquer operação.
    // Isso torna a função segura mesmo se o usuário pular o tour antes da criação.
    if (tourCreatedItems.boardId) {
        deleteBoard(tourCreatedItems.boardId);
        tourCreatedItems.boardId = null;
        await loadData(); // Recarrega todos os quadros
        await renderBoardSelector();
        await renderCurrentBoard();
        initCustomSelects();
    }
}

async function undoTourColumn() {
    // CORREÇÃO: Verifica se o ID existe.
    if (tourCreatedItems.columnId && tourCreatedItems.boardId) {
        const board = await getBoard(tourCreatedItems.boardId);
        if (board) {
            board.columnIds = board.columnIds.filter(id => id !== tourCreatedItems.columnId);
            await saveBoard(board);
        }
        await deleteColumn(tourCreatedItems.columnId);
        tourCreatedItems.columnId = null;
        currentBoard = await getFullBoardData(tourCreatedItems.boardId);
        await renderCurrentBoard();
    }
}

async function undoTourCard() {
    // CORREÇÃO: Verifica se o ID existe.
    if (tourCreatedItems.cardId && tourCreatedItems.columnId) {
        const column = await getColumn(tourCreatedItems.columnId);
        if (column) {
            column.cardIds = column.cardIds.filter(id => id !== tourCreatedItems.cardId);
            await saveColumn(column);
        }
        await deleteCard(tourCreatedItems.cardId);
        tourCreatedItems.cardId = null;
        currentBoard = await getFullBoardData(tourCreatedItems.boardId);
        await renderCurrentBoard();
    }
}

async function showSearchDialog() {
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
    await populateFilterOptions(dialog.querySelector('#search-global-pane'), false); // Filtros globais

    // Anexa os listeners
    resetBtn.onclick = await resetSearchFilters;
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
async function populateFilterOptions(container, boardSpecific) {
    // CORREÇÃO: Impede a execução se nenhum quadro estiver selecionado.
    if (boardSpecific && !currentBoard) {
        // Não mostra mensagem, pois o diálogo de busca já lida com isso.
        return;
    }

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
        for (const board of boards) {
            const fullBoard = await getFullBoardData(board.id);
            if (fullBoard) {
                fullBoard.columns.forEach(col => {
                    col.cards.forEach(card => {
                        if (card.tags) card.tags.forEach(tag => boardTags.add(tag));
                    });
                });
            }
        }
    }

    let relevantUsers = new Map();
    relevantUsers.set(currentUser.id, currentUser); // Sempre inclui o usuário atual

    if (boardSpecific && currentBoard.visibility === 'public') {
        const userProfile = await getUserProfile(currentUser.id);
        if (userProfile && userProfile.friends) {
            for (const friendId of userProfile.friends) {
                const friend = allUsers.find(u => u.id === friendId); // allUsers is already loaded
                if (friend) relevantUsers.set(friend.id, friend);
            }
        } 
    } else if (boardSpecific && currentBoard.visibility === 'group' && currentBoard.groupId) {
        const group = await getGroup(currentBoard.groupId);
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
async function executeGlobalSearch() {
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
    for (const board of boards) {
        const fullBoard = await getFullBoardData(board.id); // Garante que temos todos os dados
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
    }

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

async function resetSearchFilters() {
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

    // Salva a preferência de filtro do usuário
    localStorage.setItem(`kanbanFilter_${currentUser.id}`, filterType);

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
            if (groupId && !acc[groupId]) acc[groupId] = [];
                acc[groupId].push(board);
                return acc;
            }, {});

            const sortedGroupIds = Object.keys(boardsByGroup).sort((a, b) => {
                const groupA = allGroups.find(g => g.id === a)?.name || '';
                const groupB = allGroups.find(g => g.id === b)?.name || '';
                return groupA.localeCompare(groupB);
            });

            sortedGroupIds.forEach(groupId => {
                const group = allGroups.find(g => g.id === groupId);
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
        const group = allGroups.find(g => g.id === currentBoard.groupId);
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

    columnEl.querySelector('.add-card-btn').addEventListener('click', async () => {
        if (!await hasPermission(currentBoard, 'createCards')) {
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
    if (card.tags && card.tags.length > 0 && (currentUser.preferences?.showTags !== false)) { // Verifica se a preferência de mostrar tags está ativa
        if (card.tags.length === 1) {
            const tagColor = getTagColor(card.tags[0]);
            // Uma única etiqueta: ocupa a largura total, como a antiga linha de tag
            tagLineHtml = `<div class="card-single-tag-line" style="background-color: ${tagColor};" title="${card.tags[0]}"></div>`;
        } else {
            // Múltiplas etiquetas: pílulas que dividem o espaço
            const tagsHtml = card.tags.slice(0, 8).map(tag => {
                const tagColor = getTagColor(tag);
                return `<div class="card-tag-pill" style="background-color: ${tagColor};" title="${tag}"></div>`;
            }).join('');
            tagLineHtml = `<div class="card-tags-container">${tagsHtml}</div>`;
        }
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
            ${tagLineHtml}
        </div>
        <div class="card-footer-left">
            <!-- O sumário do checklist e outros ícones de rodapé esquerdo vão aqui -->
        </div>
        <div class="card-footer-details">
            ${userPrefs.showAssignment !== false ? assignedToHtml : ''}
        </div>
        ${userPrefs.showCardDetails !== false ? hoverInfoHtml : ''}
    `;
    
    // ✅ PASSO 4 (REFEITO): Renderiza o checklist diretamente no cartão
    if (card.checklist && card.checklist.length > 0) {
        const userPrefs = currentUser.preferences || {};
        const isChecklistVisible = userPrefs.showChecklist !== false;

        const completedCount = card.checklist.filter(item => item.completed).length;
        const totalCount = card.checklist.length;

        // 1. Cria o container para o checklist
        const checklistContainer = document.createElement('div');
        checklistContainer.className = 'card-checklist-container';
        if (!isChecklistVisible) {
            checklistContainer.classList.add('hidden-by-preference');
        }

        card.checklist.forEach((item, index) => {
            const itemEl = document.createElement('label');
            itemEl.className = 'checkbox-container card-checklist-item';
            itemEl.innerHTML = `
                ${item.text}
                <input type="checkbox" data-index="${index}" ${item.completed ? 'checked' : ''}>
                <span class="checkmark"></span>
            `;
            if (item.completed) itemEl.classList.add('completed');
            checklistContainer.appendChild(itemEl);
        });

        // 2. Insere o checklist no corpo do cartão, após o conteúdo principal
        cardEl.querySelector('.card-content').appendChild(checklistContainer);

        // O listener de evento individual foi removido daqui.
        // A lógica agora é centralizada no #columns-container usando delegação de eventos.
    }

    // Adiciona o sumário no rodapé, se houver checklist, independentemente da preferência de exibição
    if (card.checklist && card.checklist.length > 0) {
        const completedCount = card.checklist.filter(item => item.completed).length;
        const totalCount = card.checklist.length;
        const summaryIcon = (completedCount === totalCount && totalCount > 0) ? '✅' : '☑️';
        const summaryEl = document.createElement('div');
        summaryEl.className = 'card-checklist-summary';
        summaryEl.innerHTML = `<span>${summaryIcon} ${completedCount}/${totalCount}</span>`;
        cardEl.querySelector('.card-footer-left').appendChild(summaryEl);
    }
    
    // ✅ CORREÇÃO DEFINITIVA: Garante que a UI do checklist seja atualizada
    // mesmo que o cartão seja redesenhado por outra função.
    updateCardChecklistUI(cardEl, card.checklist);
    return cardEl;
}

/**
 * Atualiza a UI do checklist de um cartão sem re-renderizar tudo
 */
function updateCardChecklistUI(cardEl, checklist) {
    if (!cardEl || !checklist) return;
    
    // Atualiza o sumário no rodapé
    const completedCount = checklist.filter(item => item.completed).length;
    const totalCount = checklist.length;
    const summaryIcon = (completedCount === totalCount && totalCount > 0) ? '✅' : '☑️';
    
    let summaryEl = cardEl.querySelector('.card-checklist-summary');
    if (!summaryEl && totalCount > 0) { // Cria se não existir e houver itens
        summaryEl = document.createElement('div');
        summaryEl.className = 'card-checklist-summary';
        cardEl.querySelector('.card-footer-left').appendChild(summaryEl);
    }
    
    if (summaryEl) {
        summaryEl.innerHTML = `<span>${summaryIcon} ${completedCount}/${totalCount}</span>`;
    }
    
    // Atualiza os checkboxes individuais
    cardEl.querySelectorAll('.card-checklist-item input[type="checkbox"]').forEach((checkbox, index) => {
        if (index < checklist.length) {
            checkbox.checked = checklist[index].completed;
            const label = checkbox.closest('.card-checklist-item');
            if (label) label.classList.toggle('completed', checkbox.checked);
        }
    });
}

// --- NOVAS FUNÇÕES DE TOOLTIP ---

/**
 * Mostra o tooltip com os detalhes de um cartão.
 * @param {string} cardId O ID do cartão.
 * @param {MouseEvent} event O evento do mouse para posicionamento.
 */
async function showTooltip(cardId, event) {
    const result = findCardAndColumn(cardId);
    // CORREÇÃO: Verifica se o resultado (e o cartão) existem antes de prosseguir.
    if (!result || !result.card || !tooltipElement) return;
    const { card } = result;

    const creator = allUsers.find(u => u.id === card.creatorId);
    const assignee = allUsers.find(u => u.id === card.assignedTo);

    // Formata os dados adicionais para o tooltip
    const statusText = card.isComplete ? t('kanban.dialog.details.statusCompleted') : t('kanban.dialog.details.statusActive');

    // ✅ NOVO: Adiciona o sumário do checklist ao tooltip
    let checklistSummaryHtml = '';
    if (card.checklist && card.checklist.length > 0) {
        const completedCount = card.checklist.filter(item => item.completed).length;
        const totalCount = card.checklist.length;
        const icon = (completedCount === totalCount && totalCount > 0) ? '✅' : '☑️';
        checklistSummaryHtml = `
            <div class="tooltip-checklist-summary">${icon} ${completedCount}/${totalCount} ${t('kanban.dialog.card.checklistTitle')}</div>
        `;
    }

    tooltipElement.innerHTML = `
        <div class="tooltip-title">${card.title}</div>
        <div class="tooltip-details">
            ${card.description ? `<p><strong>${t('kanban.dialog.details.description')}</strong> ${card.description.replace(/\n/g, '<br>')}</p>` : ''}
            <p><strong>${t('kanban.dialog.details.status')}</strong> ${statusText}</p>
            ${card.dueDate ? `<p><strong>${t('kanban.dialog.details.dueDate')}</strong> ${new Date(card.dueDate).toLocaleString()}</p>` : ''}
            ${creator ? `<p><strong>${t('kanban.card.hover.creator')}</strong> ${creator.name}</p>` : ''}
            ${assignee ? `<p><strong>${t('kanban.card.hover.assignedTo')}</strong> ${assignee.name}</p>` : ''}
            ${card.tags && card.tags.length > 0 ? `<p><strong>${t('kanban.dialog.details.tags')}</strong> ${card.tags.join(', ')}</p>` : ''}
        </div>
        ${checklistSummaryHtml}
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
 * Exibe o novo diálogo gerenciador com abas e configura listeners de eventos delegados.
 */
function showManagerDialog() {
    const dialog = document.getElementById('manager-dialog');
    if (!dialog) return;

    // --- DELEGAÇÃO DE EVENTOS ---
    // Remove listener antigo para evitar duplicação se a função for chamada novamente
    dialog.removeEventListener('click', handleManagerActions);
    // Adiciona um único listener ao diálogo
    dialog.addEventListener('click', handleManagerActions);
    // --------------------------

    const tabs = dialog.querySelectorAll('.nav-item');
    const contents = dialog.querySelectorAll('.manager-tab-content');

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const contentId = tab.dataset.tab;
            document.getElementById(contentId).classList.add('active');

            if (contentId === 'manager-boards') {
                populateManagerBoards();
            } else if (contentId === 'manager-columns') {
                populateManagerColumns();
            } else if (contentId === 'manager-cards') {
                populateManagerCards();
            }
        };
    });

    tabs[0].click();
    dialog.showModal();
}

/**
 * Manipulador de eventos delegado para todas as ações dentro do diálogo do gerenciador.
 * @param {Event} e - O evento de clique.
 */
async function handleManagerActions(e) {
    const button = e.target.closest('button[data-action], a[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    const dialog = document.getElementById('manager-dialog');

    // Encontra o 'board' relevante para a ação, se aplicável (para colunas e cartões)
    // CORREÇÃO: A lógica para encontrar o quadro foi simplificada e tornada mais robusta.
    let board = null;
    const listElement = button.closest('.manager-item-list');
    if (listElement && listElement.dataset.boardId) {
        board = boards.find(b => b.id === listElement.dataset.boardId);
    }
    
    if (!board && action.includes('board')) {
        board = boards.find(b => b.id === id);
    }
    
    if (!board && (action.includes('column') || action.includes('card') || action.includes('board'))) {
        // Para cartões e colunas, o quadro é essencial. Para quadros, o próprio quadro é essencial.
        // Se não encontrarmos, não podemos prosseguir.
        showDialogMessage(dialog, t('kanban.feedback.boardNotFound'), 'error');
        return;
    }

    // Verifica a permissão com base na ação e no item
    const hasPerm = {
        'edit-board': await hasPermission(currentUser, board, 'editBoards'),
        'archive-board': await hasPermission(currentUser, board, 'editBoards'),
        'delete-board': await hasPermission(currentUser, board, 'editBoards'),
        'edit-column': await hasPermission(currentUser, board, 'editColumns'),
        'archive-column': await hasPermission(currentUser, board, 'editColumns'),
        'delete-column': await hasPermission(currentUser, board, 'editColumns'),
        'edit-card': await hasPermission(currentUser, board, 'editCards'), // Editar cartão requer permissão de editar cartão
        'archive-card': await hasPermission(currentUser, board, 'editColumns'),
        'delete-card': await hasPermission(currentUser, board, 'editColumns'),
    }[action];

    if (!hasPerm) {
        showDialogMessage(dialog, t('kanban.feedback.noPermission'), 'error');
        return;
    }

    // Executa a ação
    switch (action) {
        case 'edit-board':
            await showBoardDialog(id);
            break;
        case 'archive-board':
            await handleArchiveBoard(id, true); // Passa true para closeManagerDialog
            break;
        case 'delete-board':
            await handleDeleteBoard(id, true); // Passa true para closeManagerDialog
            break;
        case 'edit-column':
            showColumnDialog(id);
            break;
        case 'archive-column':
            await handleArchiveColumn(id, board, true); // Passa o contexto do quadro
            break;
        case 'delete-column':
            await handleDeleteColumn(id, board, true); // Passa o contexto do quadro
            break;
        case 'edit-card':
            showCardDialog(id);
            break;
        case 'archive-card':
            await handleArchiveCard(id, true, true); // Passa o closeManagerDialog
            break;
        case 'delete-card':
            await handleDeleteCard(id, true, true); // Passa o closeManagerDialog
            break;
    }
}

// ===== FUNÇÕES OFICIAIS DE ARQUIVAR/EXCLUIR (LÓGICA DE NEGÓCIO) =====

/**
 * Arquiva um quadro, movendo-o para a seção de arquivados.
 * @param {string} boardId - O ID do quadro a ser arquivado.
 * @returns {Promise<boolean>} - True se a operação foi bem-sucedida.
 */
async function archiveBoard(boardId) {
    const boardToArchive = boards.find(b => b.id === boardId);
    if (!boardToArchive) return false;

    // A função de storage já lida com o desmembramento e arquivamento dos filhos.
    const archived = await archiveBoardInStorage(boardId, currentUser.id);
    if (!archived) return false;

    // Atualiza a UI
    const boardIndex = boards.findIndex(b => b.id === boardId);
    if (boardIndex > -1) boards.splice(boardIndex, 1);
    
    if (currentBoard && currentBoard.id === boardId) {
        currentBoard = boards.find(b => !b.isArchived) || null;
        localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');
    }
    
    await showSuccessAndRefresh(null, currentBoard?.id);
    return true;
}

/**
 * Exclui um quadro, movendo-o para a lixeira.
 * @param {string} boardId - O ID do quadro a ser movido para a lixeira.
 * @returns {Promise<boolean>} - True se a operação foi bem-sucedida.
 */
export async function deleteBoard(boardId) {
    const boardToDelete = boards.find(b => b.id === boardId);
    if (!boardToDelete) return false;

    // CHAMA A NOVA FUNÇÃO EXPLÍCITA PARA MOVER PARA A LIXEIRA
    const deleted = await trashBoardInStorage(boardId, currentUser.id);
    if (!deleted) return false;

    // Atualiza a UI
    const boardIndex = boards.findIndex(b => b.id === boardId);
    if (boardIndex > -1) boards.splice(boardIndex, 1);

    if (currentBoard && currentBoard.id === boardId) {
        currentBoard = boards.find(b => !b.isArchived) || null;
        localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');
    }

    await showSuccessAndRefresh(null, currentBoard?.id);
    return true;
}

/**
 * Arquiva um cartão, movendo-o para a seção de arquivados.
 * @param {string} cardId - O ID do cartão a ser arquivado.
 * @returns {Promise<boolean>} - True se a operação foi bem-sucedida.
 */
async function archiveCard(cardId, boardContext) {
    const result = findCardAndColumn(cardId, boardContext);
    if (!result) return false;
    const { card, column, board } = result; // board is now returned from findCardAndColumn

    // Lógica de negócio (logs, contadores, etc.)
    if (board.groupId) {
        const group = await getGroup(board.groupId);
        if (group) {
            group.taskCount = Math.max(0, (group.taskCount || 0) - 1);
            if (card.isComplete) group.completedTaskCount = Math.max(0, (group.completedTaskCount || 0) - 1);
            await saveGroup(group);
        }
    }
    const success = await archiveCardInStorage(cardId, currentUser.id, { columnId: column.id, boardId: board.id, columnTitle: column.title, boardTitle: board.title });
    if (success && currentBoard && currentBoard.id === board.id) {
        const colInMemory = currentBoard.columns.find(c => c.id === column.id);
        if (colInMemory) {
            colInMemory.cards = colInMemory.cards.filter(c => c.id !== cardId);
            colInMemory.cardIds = colInMemory.cardIds.filter(id => id !== cardId);
        }
    }
    return success;
}

/**
 * Exclui um cartão, movendo-o para a lixeira.
 * @param {string} cardId - O ID do cartão a ser excluído.
 * @returns {Promise<boolean>} - True se a operação foi bem-sucedida.
 */
async function deleteCard(cardId) {
    const result = findCardAndColumn(cardId);
    if (!result) return false;
    const { card, column, board } = result; // board is now returned from findCardAndColumn

    // Lógica de negócio (logs, contadores, etc.)
    if (board.groupId) {
        const group = await getGroup(board.groupId);
        if (group) {
            group.taskCount = Math.max(0, (group.taskCount || 0) - 1);
            if (card.isComplete) group.completedTaskCount = Math.max(0, (group.completedTaskCount || 0) - 1);
            await saveGroup(group);
        }
    }
    const success = await trashCardInStorage(cardId, currentUser.id, { columnId: column.id, boardId: board.id, columnTitle: column.title, boardTitle: board.title });
    if (success && currentBoard && currentBoard.id === board.id) {
        const colInMemory = currentBoard.columns.find(c => c.id === column.id);
        if (colInMemory) {
            colInMemory.cards = colInMemory.cards.filter(c => c.id !== cardId);
            colInMemory.cardIds = colInMemory.cardIds.filter(id => id !== cardId);
        }
    }
    return success;
}


// ===== LÓGICA DE MENUS (DROPDOWNS) =====

/**
 * Popula a aba "Quadros" do diálogo gerenciador.
 */
async function populateManagerBoards() {
    const listContainer = document.getElementById('manager-boards-list');
    listContainer.innerHTML = ''; // Limpa a lista

    const visibleBoards = [];
    for (const board of boards) {
        let isVisible = false;
        if (!board.groupId) {
            isVisible = true;
        } else {
            const group = await getGroup(board.groupId);
            if (group) {
                if (group.adminId === currentUser.id) {
                    isVisible = true;
                } else if (group.memberIds.includes(currentUser.id)) {
                    isVisible = board.visibility === 'group' || (board.visibility === 'private' && board.ownerId === currentUser.id);
                }
            }
        }
        if (isVisible) {
            visibleBoards.push(board);
        }
    }

    const personalBoards = visibleBoards.filter(b => b && !b.groupId);
    const groupBoards = visibleBoards.filter(b => b.groupId);

    if (personalBoards.length === 0 && groupBoards.length === 0) {
        listContainer.innerHTML = `<p>${t('kanban.feedback.noPersonalBoards')}</p>`;
        return;
    }

    const createItemElement = (board) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'manager-item';
        let titleHtml = `<span>${board.icon || '📋'} ${board.title}</span>`;
        if (board.groupId) {
            const group = allGroups.find(g => g.id === board.groupId);
            if (group) {
                titleHtml += ` <span class="board-group-name">(${group.name})</span>`;
            }
        }

        itemEl.innerHTML = `
            <div class="manager-item-title">${titleHtml}</div>
            <div class="manager-item-actions">
                <button class="btn btn-sm alternative1" data-action="archive-board" data-id="${board.id}" title="${t('kanban.contextMenu.column.archive')}">🗄️</button>
                <button class="btn btn-sm edit" data-action="edit-board" data-id="${board.id}" title="${t('kanban.contextMenu.board.edit')}">✏️</button>
                <button class="btn btn-sm danger" data-action="delete-board" data-id="${board.id}" title="${t('kanban.contextMenu.board.delete')}">🗑️</button>
            </div>
        `;
        return itemEl;
    };

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
    select.innerHTML = `<option value="">${t('kanban.dialog.edit.selectBoard')}</option>`;

    // Reutiliza a mesma lógica de filtro da aba de quadros
    const visibleBoards = boards.filter(board => {
    // Quadros pessoais são sempre visíveis
    if (!board.groupId) return true;
    
    // Para quadros de grupo, verifica se o usuário é membro
    const group = allGroups.find(g => g.id === board.groupId);
    if (!group) return false;
    
    return group.memberIds.includes(currentUser.id);
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
            const group = allGroups.find(g => g.id === board.groupId);
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
    listContainer.dataset.boardId = board.id; // Adiciona o ID do quadro para o event handler

    if (!board.columns || board.columns.length === 0) {
        listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.feedback.noColumnsInBoard')}</div>`;
        return;
    }

    board.columns.forEach(column => {
        const itemEl = document.createElement('div');
        itemEl.className = 'manager-item';
        itemEl.innerHTML = `
            <span>${column.title}</span>
            <div class="manager-item-actions">
                <button class="btn btn-sm alternative1" data-action="archive-column" data-id="${column.id}" title="${t('kanban.contextMenu.column.archive')}">🗄️</button>
                <button class="btn btn-sm edit" data-action="edit-column" data-id="${column.id}" title="${t('kanban.contextMenu.column.edit')}">✏️</button>
                <button class="btn btn-sm danger" data-action="delete-column" data-id="${column.id}" title="${t('kanban.contextMenu.column.delete')}">🗑️</button>
            </div>
        `;
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
    const visibleBoards = boards.filter(b => !b.groupId || allGroups.find(g => g.id === b.groupId));
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
            const groupName = allGroups.find(g => g.id === board.groupId)?.name || '';
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

    initCustomSelects(); // Estiliza o select de quadros

    // 3. Adiciona listeners
    boardSelect.onchange = () => {
        const boardId = boardSelect.value;
        columnSelect.innerHTML = `<option value="">${t('kanban.dialog.edit.selectColumnPlaceholder')}</option>`;
        listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.dialog.edit.selectColumn')}</div>`;
        if (boardId) {
            const board = boards.find(b => b.id === boardId);
            listContainer.dataset.boardId = board.id; // Adiciona o ID do quadro para o event handler
            (board?.columns || []).forEach(col => {
                columnSelect.innerHTML += `<option value="${col.id}">${col.title}</option>`;
            });
        }
        // CORREÇÃO DEFINITIVA: Usa setTimeout para garantir que o DOM seja atualizado
        // antes de tentar reinicializar o select customizado, evitando a race condition.
        setTimeout(() => initCustomSelects(), 0);
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
    listContainer.dataset.boardId = board.id; // Adiciona o ID do quadro para o event handler
    listContainer.dataset.columnId = column.id; // Adiciona o ID da coluna

    if (!column.cards || column.cards.length === 0) {
        listContainer.innerHTML = `<div class="manager-list-placeholder">${t('kanban.feedback.noCardsInColumn')}</div>`;
        return;
    }

    column.cards.forEach(card => {
        const itemEl = document.createElement('div');
        itemEl.className = 'manager-item';
        itemEl.innerHTML = `
            <span>${card.title}</span>
            <div class="manager-item-actions">
                <button class="btn btn-sm alternative1" data-action="archive-card" data-id="${card.id}" title="${t('kanban.contextMenu.card.archive')}">🗄️</button>
                <button class="btn btn-sm edit" data-action="edit-card" data-id="${card.id}" title="${t('kanban.contextMenu.card.edit')}">✏️</button>
                <button class="btn btn-sm danger" data-action="delete-card" data-id="${card.id}" title="${t('kanban.contextMenu.card.delete')}">🗑️</button>
            </div>
        `;
        listContainer.appendChild(itemEl);
    });
}

// ===== LÓGICA DE DIÁLOGOS (MODAIS) =====

async function showBoardDialog(boardId = null) {
    const dialog = document.getElementById('board-dialog');

    const board = boardId ? boards.find(b => b.id === boardId) : null;

    dialog.dataset.editingId = boardId;

    // A linha que causava o erro agora vai funcionar: (Comentário antigo, mas ainda relevante para o contexto)
    document.getElementById('board-dialog-title').textContent = board ? t('kanban.dialog.board.editTitle') : t('kanban.dialog.board.createTitle');
    
    const visibilitySelect = document.getElementById('board-visibility');
    const groupContainer = document.getElementById('board-group-container');
    const groupSelect = document.getElementById('board-group-select');
    const groupAlert = document.getElementById('board-group-alert');
    const saveBtn = dialog.querySelector('#board-save-btn');

    // --- NOVA LÓGICA DE VALIDAÇÃO DE GRUPO ---
    const allGroupsData = await getAllGroups() || [];
    // Filtra apenas os grupos dos quais o usuário é membro e tem permissão para criar quadros
    const creatableInGroups = allGroupsData.filter(g => {
        const isAdmin = g.adminId === currentUser.id;
        // Verifica se o usuário é membro e tem permissão padrão ou individual para criar quadros
        const canCreate = g.memberIds?.includes(currentUser.id) && (g.memberPermissions?.[currentUser.id]?.createBoards ?? g.defaultPermissions?.createBoards);
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
            groupSelect.innerHTML = `<option value="${board.groupId}">${(await getGroup(board.groupId))?.name || t('kanban.board.unknownGroup')}</option>`;
            groupSelect.disabled = true;
        }
        iconInput.value = board.icon || '📋';
    } else { // Criando um novo quadro
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
            if (creatableInGroups.length === 0 && !board) { // Se estiver criando e não houver grupos elegíveis
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
        } else { // Para quadros PESSOAIS, as opções de visibilidade são mais amplas.
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

    const userTemplates = await getUserBoardTemplates(currentUser.id);
    const systemTemplates = await getSystemBoardTemplates();
    
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
    
    // Inicializa os selects customizados APÓS popular todos os dados.
    // Isso evita a dessincronização e o erro reportado.
    setTimeout(() => {
        initCustomSelects();
    }, 0);

    dialog.showModal();
}

async function handleSaveBoard() {
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
        async (confirmationDialog) => {
            const boardId = dialog.dataset.editingId;
            const description = document.getElementById('board-description-input').value.trim();
            const icon = document.getElementById('board-icon-input').value;
            let savedBoard = null;

            if (boardId && boardId !== 'null') {
                const boardData = await getBoard(boardId);
                if (!boardData) return false;

                // Adiciona log de edição se algo mudou
                const hasChanged = boardData.title !== title || 
                                 (boardData.description || '') !== description || 
                                 (boardData.icon || '📋') !== icon;

                if (hasChanged) {
                    if (!boardData.activityLog) boardData.activityLog = [];
                    boardData.activityLog.push({
                        action: 'edited',
                        userId: currentUser.id,
                        timestamp: new Date().toISOString()
                    });
                }

                boardData.title = title;
                boardData.description = description;
                boardData.icon = icon;
                savedBoard = await saveBoard(boardData);
            } else { // Criando um novo quadro
                const allTemplates = [...(await getUserBoardTemplates(currentUser.id)), ...(await getSystemBoardTemplates())];
                const selectedTemplate = allTemplates.find(t => t.id === templateId);
                if (selectedTemplate && !title) title = `${t(selectedTemplate.name)} ${t('kanban.board.copySuffix')}`;
                
                const visibility = document.getElementById('board-visibility').value;
                const newColumns = selectedTemplate ? await Promise.all(selectedTemplate.columns.map(colTmpl => saveColumn({ title: t(colTmpl.name), color: colTmpl.color, cardIds: [] }))) : [];
                const newBoardData = { 
                    title, 
                    description, 
                    icon: selectedTemplate ? selectedTemplate.icon : icon, 
                    ownerId: currentUser.id, 
                    visibility: visibility, 
                    columnIds: newColumns.map(c => c.id) 
                };
                // Adiciona o log de criação
                newBoardData.activityLog = [{
                    action: 'created',
                    userId: currentUser.id,
                    timestamp: new Date().toISOString()
                }];

                // Se for um quadro de grupo, atribui o groupId
                if (isGroupContext) {
                    newBoardData.groupId = document.getElementById('board-group-select').value;
                }
                savedBoard = await saveBoard(newBoardData);

                // --- ATUALIZA O GRUPO COM O NOVO QUADRO ---
                if (savedBoard.groupId) {
                    const group = await getGroup(savedBoard.groupId);
                    if (group) {
                        if (!group.boardIds) group.boardIds = [];
                        group.boardIds.push(savedBoard.id);
                        await saveGroup(group);
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
                await showSuccessAndRefresh(dialog, savedBoard.id);
                return true; // Fecha o diálogo de confirmação
            }
            showDialogMessage(confirmationDialog, t('kanban.feedback.boardSaveFailed'), 'error');
            return false; // Mantém o diálogo de confirmação aberto em caso de erro
        }
    );
}

async function showColumnDialog(columnId = null) {
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

async function handleSaveColumn() {
    const dialog = document.getElementById('column-dialog');
    const title = document.getElementById('column-title-input').value.trim();
    if (!title) {
        showDialogMessage(dialog, t('kanban.dialog.titleRequired'), 'error');
        return;
    }
    
    // Desabilita os botões para evitar cliques múltiplos
    const saveBtn = dialog.querySelector('#column-save-btn');
    const cancelBtn = dialog.querySelector('.btn.cancel');
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        await saveState(); // Salva o estado para o Desfazer
        const columnId = dialog.dataset.editingId;

        const bgColor = document.getElementById('column-color-trigger').dataset.color;
        const textColor = document.getElementById('column-text-color-trigger').dataset.color;

        const columnData = { 
            title, 
            description: document.getElementById('column-description').value, 
            color: bgColor.startsWith('var(') ? null : bgColor,
            textColor: textColor.startsWith('var(') ? null : textColor
        };

        if (columnId && columnId !== 'null') {
            const existingColumn = await getColumn(columnId);
            if (existingColumn) {
                const hasChanged = existingColumn.title !== columnData.title ||
                                 (existingColumn.description || '') !== (columnData.description || '') ||
                                 (existingColumn.color || null) !== columnData.color ||
                                 (existingColumn.textColor || null) !== columnData.textColor;

                if (hasChanged) {
                    const logEntry = { action: 'edited', userId: currentUser.id, timestamp: new Date().toISOString() };
                    if (!existingColumn.activityLog) existingColumn.activityLog = [];
                    existingColumn.activityLog.push(logEntry);
                }
                Object.assign(existingColumn, columnData);
                await saveColumn(existingColumn);
            }
        } else { // Criando uma nova coluna
            let newColumn = await saveColumn({ ...columnData, cardIds: [] });
            newColumn.activityLog = [{ action: 'created', userId: currentUser.id, timestamp: new Date().toISOString() }];
            newColumn = await saveColumn(newColumn);
            const boardData = await getBoard(currentBoard.id);
            if (boardData) {
                if (!boardData.columnIds) boardData.columnIds = [];
                boardData.columnIds.push(newColumn.id);
                await saveBoard(boardData);
                if (!currentBoard.columns) currentBoard.columns = [];
                if (!currentBoard.columnIds) currentBoard.columnIds = [];
                currentBoard.columns.push(newColumn);
            }
        }
        showDialogMessage(dialog, t('kanban.feedback.columnSaved'), 'success');
        await showSuccessAndRefresh(dialog, currentBoard.id);
    } catch (error) {
        console.error("Error saving column:", error);
        showDialogMessage(dialog, t('ui.error'), 'error');
    } finally {
        // Reabilita os botões após a operação
        if (saveBtn) saveBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

async function showSuccessAndRefresh(dialog, boardToFocusId) {
    const delay = dialog ? 1500 : 100;

    if (dialog) {
        dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);
    }

    setTimeout(async () => {
        // 1. Força a recarga completa de todos os dados para garantir a consistência.
        await loadData();

        // 2. Filtra os quadros visíveis com base no filtro atual da UI.
        const visibleBoards = boards.filter(board => {
            if (currentBoardFilter === 'personal') return !board.groupId;
            if (currentBoardFilter === 'group') return !!board.groupId;
            return true;
        });

        // 3. Tenta encontrar o quadro que deveria estar em foco.
        let boardToSelect = visibleBoards.find(b => b.id === boardToFocusId);

        // Se o quadro focado não foi encontrado (ex: foi excluído/arquivado) ou não há mais quadros,
        // seleciona o primeiro quadro da lista visível.
        if (!boardToSelect) {
            boardToSelect = visibleBoards[0] || null;
        }

        currentBoard = boardToSelect;
        localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');

        // 4. Renderiza a UI com os dados 100% atualizados.
        renderBoardSelector();
        renderCurrentBoard();
        initCustomSelects(); // Garante que o select de quadros seja re-estilizado.

        // 5. Fecha o diálogo, se houver.
        if (dialog) {
            dialog.close();
            // Não precisa reabilitar os botões, pois o diálogo será fechado.
        }
    }, delay);
}

async function showCardDialog(cardId = null, columnId) {
    const dialog = document.getElementById('card-dialog');
    const result = cardId ? findCardAndColumn(cardId) : null;
    const card = result ? result.card : null;
        // Se estamos editando, o columnId vem do resultado da busca.

    // ETAPA 8: VERIFICAÇÃO DE PERMISSÃO PARA EDIÇÃO
    const canEdit = await hasPermission(currentUser, currentBoard, 'editCards');

    // Habilita/desabilita todos os campos de uma vez
    const fields = [
        'card-title-input', 'card-description', 'card-due-date', 'card-due-time',
        'card-column-select', 'card-tags', 'card-assigned-to'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !canEdit;
    });

    // Lida com os botões de cor e o botão de salvar
    dialog.querySelector('#card-bg-color-trigger').style.pointerEvents = canEdit ? 'auto' : 'none';
    dialog.querySelector('#card-text-color-trigger').style.pointerEvents = canEdit ? 'auto' : 'none';
    dialog.querySelector('#reset-card-colors-btn').style.display = canEdit ? 'inline-block' : 'none';
    dialog.querySelector('#card-save-btn').style.display = canEdit ? 'inline-block' : 'none';


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
        activeTagTemplate = (await getUserTagTemplates(currentUser.id)).find(t => t.id === defaultTemplateId);
        // Se não encontrar, procura nos do sistema
        if (!activeTagTemplate) {
            activeTagTemplate = (await getSystemTagTemplates()).find(t => t.id === defaultTemplateId);
        }
    }

    // Se ainda não encontrou (ou não havia ID), usa o primeiro template do sistema como fallback
    if (!activeTagTemplate) {
        const systemTemplates = await getSystemTagTemplates();
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
        const userProfile = await getUserProfile(currentUser.id);
        if (userProfile.friends) {
            userProfile.friends.forEach(friendId => {
                const friend = allUsers.find(u => u.id === friendId);
                if (friend) assignableUsers.set(friend.id, friend);
            });
        }
    } else if (currentBoard.visibility === 'group' && currentBoard.groupId) {
        // Se for de grupo, adiciona os membros do grupo
        const group = await getGroup(currentBoard.groupId);
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

        // ✅ PASSO 2: Adiciona a lógica para o editor de checklist
    setupChecklistEditor(card);

    // Inicializa os selects customizados APÓS popular os dados
    initCustomSelects();

    dialog.showModal();
}

function setupChecklistEditor(card) {
    const checklistTitle = document.getElementById('checklist-title');
    const editorContainer = document.getElementById('checklist-editor');
    const addButton = document.getElementById('add-checklist-item-btn');
    const limit = 8;

    // Limpa o container antes de popular
    editorContainer.innerHTML = '';

    const toggleEditorVisibility = () => {
        const hasItems = editorContainer.children.length > 0;
        editorContainer.classList.toggle('hidden', !hasItems);
    };

    const updateCounter = () => {
        const totalCount = editorContainer.children.length;
        const completedCount = editorContainer.querySelectorAll('.checklist-item-checkbox:checked').length;
        // Exibe o contador de concluídos/total, sem o limite.
        checklistTitle.textContent = `${t('kanban.dialog.card.checklistTitle')} (${completedCount}/${totalCount})`;
        addButton.disabled = totalCount >= limit;
        addButton.title = totalCount >= limit ? t('templateEditor.limitReached') : '';
    };

    const createChecklistItemElement = (item = { id: '', text: '', completed: false }) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'checklist-item editor-item';
        itemEl.dataset.id = item.id || '';

        itemEl.innerHTML = `
            <input type="checkbox" class="checklist-item-checkbox" ${item.completed ? 'checked' : ''}>
            <input type="text" class="checklist-item-text" value="${item.text}" placeholder="${t('templateEditor.itemNamePlaceholder')}">
            <button type="button" class="remove-btn" title="${t('templateEditor.removeItemTitle')}">&times;</button>
        `;

        const checkbox = itemEl.querySelector('.checklist-item-checkbox');
        const textInput = itemEl.querySelector('.checklist-item-text');

        const applyStyle = () => {
            textInput.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
            textInput.style.opacity = checkbox.checked ? '0.6' : '1';
        };

        // Adiciona listener para atualizar o contador e o estilo ao clicar no checkbox
        checkbox.addEventListener('change', () => {
            applyStyle();
            updateCounter();
        });

        itemEl.querySelector('.remove-btn').addEventListener('click', () => {
            itemEl.remove();
            updateCounter();
            toggleEditorVisibility();
        });

        applyStyle();
        return itemEl;
    };

    // Popula com itens existentes do cartão
    (card?.checklist || []).forEach(item => editorContainer.appendChild(createChecklistItemElement(item)));

    // Ação do botão de adicionar
    addButton.onclick = () => {
        if (editorContainer.children.length < limit) {
            editorContainer.appendChild(createChecklistItemElement());
            updateCounter();
            toggleEditorVisibility();
        }
    };

    updateCounter();
    toggleEditorVisibility();
}

/**
 * Manipula o salvamento de um cartão (novo ou existente).
 * Esta função agora é chamada diretamente pelo listener de evento configurado em setupEventListeners.
 */
async function handleSaveCard() {
    const title = document.getElementById('card-title-input').value.trim();
    const dialog = document.getElementById('card-dialog');
    if (!title) { showDialogMessage(dialog, t('kanban.dialog.titleRequired'), 'error'); return; }

    // Desabilita os botões para evitar cliques múltiplos
    const saveBtn = dialog.querySelector('#card-save-btn');
    const cancelBtn = dialog.querySelector('.btn.cancel');
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    try {
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
            backgroundColor: bgColor.startsWith('var(') ? null : bgColor,
            textColor: textColor.startsWith('var(') ? null : textColor
        };

    // ✅ PASSO 3: Valida e coleta os dados do checklist
    const checklistEditorItems = document.querySelectorAll('#checklist-editor .editor-item');
    
    // Verifica se algum item do checklist tem o nome vazio.
    const hasEmptyItem = Array.from(checklistEditorItems).some(itemEl => itemEl.querySelector('input[type="text"]').value.trim() === '');
    if (hasEmptyItem) {
        showDialogMessage(dialog, t('templateEditor.itemNameRequired'), 'error');
        if (saveBtn) saveBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        return; // Impede o salvamento
    }

    const checklistItems = [];
    checklistEditorItems.forEach(itemEl => {
        const input = itemEl.querySelector('input[type="text"]');
        const checkbox = itemEl.querySelector('input[type="checkbox"]');
        
        // A validação acima já garante que o input não é vazio, mas mantemos o trim para limpar espaços.
        checklistItems.push({
            id: itemEl.dataset.id || `chk-${Date.now()}-${Math.random()}`,
            text: input.value.trim(),
            completed: checkbox.checked
        });
    });
    cardData.checklist = checklistItems;

        const previousAssignee = (await getCard(cardId))?.assignedTo;
        if (cardId && cardId !== 'null') {
            const originalCard = await getCard(cardId);
            if (!originalCard) return;
            const sourceColumn = currentBoard.columns.find(c => c.cardIds.includes(cardId));
            
            Object.assign(originalCard, cardData);
            await saveCard(originalCard);

            if (sourceColumn && sourceColumn.id !== newColumnId) {
                sourceColumn.cardIds = sourceColumn.cardIds.filter(id => id !== cardId);
                await saveColumn(sourceColumn);
                const targetColumn = currentBoard.columns.find(c => c.id === newColumnId);
                if (targetColumn) {
                    targetColumn.cardIds.push(cardId);
                    await saveColumn(targetColumn);
                }
            }
        } else { // Criando um novo cartão
            cardData.creatorId = currentUser.id;
            cardData.isComplete = false;
            const newCard = await saveCard(cardData);

            newCard.activityLog = [{ action: 'created', userId: currentUser.id, timestamp: new Date().toISOString() }];
            await saveCard(newCard);

            const targetColumn = currentBoard.columns.find(c => c.id === newColumnId);
            if (targetColumn) {
                targetColumn.cardIds.push(newCard.id);
                await saveColumn(targetColumn);
            }

            if (currentBoard.groupId) {
                const group = await getGroup(currentBoard.groupId);
                if (group) {
                    group.taskCount = (group.taskCount || 0) + 1;
                    await saveGroup(group);
                }
            }
        }

        const newAssigneeId = cardData.assignedTo;
        if (newAssigneeId && newAssigneeId !== previousAssignee) {
            addCardAssignmentNotification(
                currentUser.name,
                newAssigneeId,
                cardData.title,
                currentBoard.title
            );
        }

        await saveState();
        showDialogMessage(dialog, t('kanban.feedback.cardSaved'), 'success');
        await showSuccessAndRefresh(dialog, currentBoard.id);
    } catch (error) {
        console.error("Error saving card:", error);
        showDialogMessage(dialog, t('ui.error'), 'error');
    } finally {
        // Reabilita os botões após a operação
        if (saveBtn) saveBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

// ===== LÓGICA DE EXPORTAÇÃO E IMPRESSÃO =====

function handleExportImage() {
    // CORREÇÃO: Impede a exportação se nenhum quadro estiver selecionado.
    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.noBoardSelected'), 'error');
        return;
    }
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
    // CORREÇÃO: Impede a impressão se nenhum quadro estiver selecionado.
    if (!currentBoard) {
        showFloatingMessage(t('kanban.feedback.noBoardSelected'), 'error');
        return;
    }

    const boardTitle = currentBoard.title;
    const userName = currentUser.name;
    const printDate = new Date().toLocaleString('pt-BR');

    // --- NOVA LÓGICA ---
    // 1. Gerar estilos customizados para as colunas
    let columnStyles = '';
    currentBoard.columns.forEach(async (column) => {
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

async function handleDragStart(e) {
    // 🔥 CORREÇÃO: Fecha qualquer menu dropdown aberto ao iniciar o arraste.
    closeAllDropdowns();

    hideTooltip();
    isDragging = true;

    // ETAPA 3: VERIFICAÇÃO DE PERMISSÃO PARA ARRASTAR
    const isCardDrag = e.target.closest('.card');
    const isColumnDrag = e.target.closest('.column-header');
    let requiredPermission = null;
    let dragIsAllowed = true; // Assumimos que é permitido por padrão

    if (isCardDrag) requiredPermission = 'createCards';
    if (isColumnDrag) requiredPermission = 'editColumns';

    if (requiredPermission && !await hasPermission(currentUser, currentBoard, requiredPermission)) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        dragIsAllowed = false; // Marca que o arraste não é permitido
        // 🔥 CORREÇÃO DEFINITIVA: NÃO interrompemos a função com 'return'.
        // Deixamos o código continuar para que nosso 'ghost' customizado seja criado,
        // mas no final, não aplicaremos o estilo 'dragging' ao elemento original,
        // fazendo com que a operação seja visualmente cancelada.
    } else if (!isCardDrag && !isColumnDrag) {
        isDragging = false;
        return;
    }

    const targetCard = e.target.closest('.card');
    const targetColumnHeader = e.target.closest('.column-header');

    if (targetCard) {
        draggedElement = targetCard;
    } else if (targetColumnHeader) {
        draggedElement = targetColumnHeader.closest('.column');
    } else {
        return;
    }

    e.dataTransfer.setData('text/plain', draggedElement.dataset.cardId || draggedElement.dataset.columnId);
    e.dataTransfer.effectAllowed = 'move';

    // 🔥 CORREÇÃO CRÍTICA: IMPEDIR O DRAG GHOST NATIVO
    // Cria um elemento invisível MUITO pequeno para substituir completamente o ghost nativo
    const dragImage = document.createElement('div');
    dragImage.style.width = '1px';
    dragImage.style.height = '1px';
    dragImage.style.position = 'absolute';
    dragImage.style.left = '-1000px'; // Coloca MUITO fora da tela
    dragImage.style.top = '-1000px';
    dragImage.style.opacity = '0.01'; // Quase invisível
    dragImage.style.pointerEvents = 'none';
    dragImage.style.zIndex = '-1000';
    document.body.appendChild(dragImage);

    // 🔥 CORREÇÃO DO CURSOR: Aplica o cursor 'grabbing' diretamente na imagem de arrasto.
    dragImage.style.cursor = 'grabbing';

    // 🔥 SOLUÇÃO DEFINITIVA: Usar o elemento invisível como ghost
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    
    // Remove o elemento invisível imediatamente após ser usado pelo browser
    setTimeout(() => {
        if (dragImage.parentNode) {
            dragImage.parentNode.removeChild(dragImage);
        }
    }, 0);

    // 🔥 MELHORIA: Criar o ghost customizado APÓS lidar com o ghost nativo
    const ghost = draggedElement.cloneNode(true);
    const rect = draggedElement.getBoundingClientRect();
    ghost.style.transition = 'none'; // Garante que o fantasma não tenha transições

    ghost.style.width = `${rect.width}px`;
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '10000';
    ghost.style.pointerEvents = 'none';
    ghost.style.margin = '0';
    
    // Remove qualquer conteúdo desnecessário do clone
    ghost.querySelectorAll('.paste-card-btn').forEach(el => el.remove());

    if (draggedElement.classList.contains('column')) {
        ghost.classList.add('column-drag-ghost');
        ghost.style.height = `${rect.height}px`;

        // 🔥 CORREÇÃO: Itera sobre os cartões DENTRO do fantasma da coluna
        // e neutraliza qualquer transformação para evitar que mudem de tamanho.
        ghost.querySelectorAll('.card').forEach(cardInGhost => {
            cardInGhost.style.transform = 'none';
            // Garante que a altura do cartão dentro do fantasma seja automática para acomodar o conteúdo.
            cardInGhost.style.height = 'auto';
        });
    } else {
        ghost.classList.add('card-drag-ghost');
    }

    document.body.appendChild(ghost);

    // 🔥 CORREÇÃO DO CURSOR: Posicionamento preciso do fantasma.
    // Armazena o deslocamento (offset) inicial do mouse em relação ao canto superior esquerdo do elemento que está sendo arrastado.
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const moveGhost = (event) => {
        if (!event.clientX || !event.clientY) return;

        // Posiciona o fantasma na posição do mouse, subtraindo o deslocamento inicial,
        // fazendo com que o cursor mantenha sua posição relativa ao elemento arrastado.
        ghost.style.left = `${event.clientX - offsetX}px`;
        ghost.style.top = `${event.clientY - offsetY}px`;
    };
    document.addEventListener('dragover', moveGhost);

    // 🔥 CORREÇÃO: Limpeza mais robusta no final do arrasto
    const cleanup = () => {
        document.removeEventListener('dragover', moveGhost);
        if (ghost.parentNode) {
            ghost.parentNode.removeChild(ghost);
        }
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
        }
        // 🔥 CORREÇÃO DO CURSOR: Remove a classe do body na limpeza final.
        document.body.classList.remove('is-dragging');
    };
    draggedElement.addEventListener('dragend', cleanup, { once: true });

    // Apenas aplica o estilo de "arrastando" se a permissão foi concedida.
    if (dragIsAllowed) {
        setTimeout(() => {
            draggedElement.classList.add('dragging');
            document.body.classList.add('is-dragging');
        }, 0);
    }
}

function handleDragEnd(e) {
    isDragging = false;
    
    // Garante que a classe seja removida, mesmo que o cleanup falhe
    document.body.classList.remove('is-dragging');

    // 🔥 CORREÇÃO: Limpeza adicional para garantir que tudo seja resetado
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement.style.opacity = ''; // Remove qualquer opacidade residual
    }
    
    document.querySelectorAll('.column.drag-over, .column.drop-shadow').forEach(col => {
        col.classList.remove('drag-over', 'drop-shadow');
    });
    
    // 🔥 CORREÇÃO: Esconder qualquer tooltip que possa ter aparecido
    hideTooltip();
}

function handleDragEnter(e) {}
function handleDragOver(e) {
    e.preventDefault();
    const targetColumn = e.target.closest('.column');
    if (!draggedElement) return;

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
async function handleDrop(e) {
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

        // VERIFICA PERMISSÃO ANTES DE SOLTAR
        if (!await hasPermission(currentUser, currentBoard, 'createCards')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }

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

        // VERIFICA PERMISSÃO ANTES DE SOLTAR
        if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }

        if (fromIndex === -1 || toIndex === -1) return; // Segurança

        // Adiciona o log de movimentação na própria coluna
        const movedColumn = findColumn(movedColumnId);
        // ETAPA 10: Adiciona log de reordenação de coluna
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

// --- LÓGICA DO MENU DE CONTEXTO (BOTÃO DIREITO) ---

/**
 * Lida com o evento de clique com o botão direito no container das colunas.
 */
async function handleContextMenu(e) {
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
async function createCardContextMenu(event, cardEl) {
    // A verificação de permissão foi movida para as funções de manipulação (handle*)
    // para uma segurança mais robusta. O menu agora é sempre construído da mesma forma.
    const cardId = cardEl.dataset.cardId;
    const { card } = findCardAndColumn(cardId);
    
    const menuItems = [
        // ✅ FASE 2: Adiciona a opção de Checklist no menu de contexto
        { 
            label: t('kanban.dialog.card.checklistTitle'), 
            icon: '📝', 
            action: () => showChecklistDialog(cardId) 
        },
        { label: t('kanban.contextMenu.card.edit'), icon: '✏️', action: () => handleEditCardFromMenu(cardId) },
        { label: t('kanban.contextMenu.card.details'), icon: '👁️', action: () => showDetailsDialog(cardId) },
        {
            label: card.isComplete ? t('kanban.contextMenu.card.markPending') : t('kanban.contextMenu.card.markComplete'), 
            icon: card.isComplete ? '⚪' : '✅', 
            action: () => toggleCardComplete(cardId) 
        },
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
async function createColumnContextMenu(event, columnEl) {
    // A verificação de permissão foi movida para as funções de manipulação (handle*)
    // para uma segurança mais robusta.
    const columnId = columnEl.dataset.columnId;

    const menuItems = [
        { label: t('kanban.contextMenu.column.edit'), icon: '✏️', action: () => handleEditColumnFromMenu(columnId) },
        { label: t('kanban.contextMenu.column.details'), icon: '👁️', action: () => showDetailsDialog(null, columnId) },
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
            action: () => handleArchiveColumn(columnId),
        },
        { isSeparator: true },
        { label: t('kanban.contextMenu.column.delete'), icon: '🗑️', action: () => handleDeleteColumn(columnId), isDestructive: true }
    ];

    showContextMenu(event, menuItems);
}

/**
 * ✅ FASE 2: Mostra um diálogo dedicado para gerenciar o checklist de um cartão.
 * @param {string} cardId - O ID do cartão.
 */
async function showChecklistDialog(cardId) {
    const card = await getCard(cardId);
    if (!card) return;

    const dialog = document.getElementById('checklist-dialog');
    dialog.dataset.cardId = cardId;

    const dialogTitle = dialog.querySelector('#checklist-dialog-title');
    const editorContainer = dialog.querySelector('#checklist-dialog-editor');
    const addButton = dialog.querySelector('#add-checklist-dialog-item-btn');
    const saveButton = dialog.querySelector('#checklist-dialog-save-btn');
    const limit = 8;

    editorContainer.innerHTML = '';

    const toggleEditorVisibility = () => {
        const hasItems = editorContainer.children.length > 0;
        editorContainer.classList.toggle('hidden', !hasItems);
    };

    const updateCounter = () => {
        const totalCount = editorContainer.children.length;
        const completedCount = editorContainer.querySelectorAll('.checklist-item-checkbox:checked').length;
        dialogTitle.textContent = `${t('kanban.dialog.card.checklistTitle')} (${completedCount}/${totalCount})`;
        addButton.disabled = totalCount >= limit;
        addButton.title = totalCount >= limit ? t('templateEditor.limitReached') : '';
    };

    const createItemElement = (item = { id: '', text: '', completed: false }) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'checklist-item editor-item';
        itemEl.dataset.id = item.id || '';

        itemEl.innerHTML = `
            <input type="checkbox" class="checklist-item-checkbox" ${item.completed ? 'checked' : ''}>
            <input type="text" class="checklist-item-text" value="${item.text}" placeholder="${t('templateEditor.itemNamePlaceholder')}">
            <button type="button" class="remove-btn" title="${t('templateEditor.removeItemTitle')}">&times;</button>
        `;

        const checkbox = itemEl.querySelector('.checklist-item-checkbox');
        const textInput = itemEl.querySelector('.checklist-item-text');
        
        const applyStyle = () => {
            textInput.style.textDecoration = checkbox.checked ? 'line-through' : 'none';
            textInput.style.opacity = checkbox.checked ? '0.6' : '1';
        };

        checkbox.addEventListener('change', () => {
            applyStyle();
            updateCounter();
        });

        itemEl.querySelector('.remove-btn').addEventListener('click', () => {
            itemEl.remove();
            updateCounter();
            toggleEditorVisibility();
        });

        applyStyle();
        return itemEl;
    };

    (card.checklist || []).forEach(item => editorContainer.appendChild(createItemElement(item)));

    addButton.onclick = () => {
        if (editorContainer.children.length < limit) {
            editorContainer.appendChild(createItemElement());
            updateCounter();
            toggleEditorVisibility();
        }
    };

    saveButton.onclick = async () => {
        const itemElements = editorContainer.querySelectorAll('.editor-item');
        const hasEmptyItem = Array.from(itemElements).some(itemEl => itemEl.querySelector('.checklist-item-text').value.trim() === '');

        if (hasEmptyItem) {
            showDialogMessage(dialog, t('templateEditor.itemNameRequired'), 'error');
            return;
        }

        const newChecklist = Array.from(itemElements).map(itemEl => ({
            id: itemEl.dataset.id || `chk-${Date.now()}-${Math.random()}`,
            text: itemEl.querySelector('.checklist-item-text').value.trim(),
            completed: itemEl.querySelector('.checklist-item-checkbox').checked
        }));

        card.checklist = newChecklist;
        await saveCard(card);
        
        const result = findCardAndColumn(cardId);
        if (result && result.card) {
            result.card.checklist = newChecklist;
        }

        showDialogMessage(dialog, t('kanban.feedback.cardSaved'), 'success');
        setTimeout(() => {
            dialog.close();
            renderCurrentBoard();
        }, 1500);
    };

    updateCounter();
    toggleEditorVisibility();
    dialog.showModal();
}

async function handleCopyColumn(columnId) {
    // ETAPA 9: VERIFICAÇÃO DE PERMISSÃO
    // Copiar uma coluna é essencialmente criar uma nova, então a permissão 'createColumns' é necessária.
    if (!await hasPermission(currentUser, currentBoard, 'createColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    const columnToCopy = findColumn(columnId);
    if (columnToCopy) {
        // Deep copy dos cartões é necessário para criar novas instâncias.
        const cardsToCopy = columnToCopy.cards.map(card => ({
            ...card,
            id: null, // Reseta o ID para criar um novo
            creatorId: currentUser.id, // O copiador se torna o criador
            createdAt: new Date().toISOString(),
            activityLog: [] // Log de atividades começa do zero
        }));

        clipboard = {
            type: 'column',
            mode: 'copy',
            data: {
                ...columnToCopy, // Copia propriedades como cor, descrição
                id: null,
                title: `${columnToCopy.title} ${t('kanban.board.copySuffix')}`,
                cards: cardsToCopy
            }
        };
        showFloatingMessage(t('kanban.feedback.columnCopied'), 'info');
    }
}

async function handleCutColumn(columnId) {
    if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

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
 * Mostra o diálogo de detalhes para um cartão ou coluna.
 */
async function showDetailsDialog(cardId = null, columnId = null) { // --- LÓGICA DO DIÁLOGO DE DETALHES ---
    const dialog = document.getElementById('details-dialog');
    const titleEl = document.getElementById('details-title');
    const contentContainer = document.getElementById('details-content');
    contentContainer.innerHTML = ''; // Limpa o conteúdo anterior

    if (columnId) {
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
    } else if (cardId) {
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
 * ✅ NOVO: Renderiza a aba de log de atividades de um cartão.
 * @param {object} card - O objeto do cartão.
 * @param {HTMLElement} container - O elemento onde o log será renderizado.
 */
function renderActivityLog(card, container) {
    const log = card.activityLog || [];
    if (log.length === 0) {
        container.innerHTML = `<p class="activity-log-empty">${t('activityLog.empty')}</p>`;
        return;
    }

    const sortedLog = log.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let logHtml = '<ul class="activity-log-list">';
    sortedLog.forEach(entry => {
        const user = allUsers.find(u => u.id === entry.userId)?.name || 'Sistema';
        const date = new Date(entry.timestamp).toLocaleString();
        const fromLocation = entry.from === 'trash' ? t('archive.tabs.trash') : t('archive.tabs.archived');

        // Substituições para as chaves de tradução
        const replacements = {
            user: `<strong>${user}</strong>`,
            from: fromLocation,
            fromColumn: `<strong>${entry.fromColumn}</strong>`,
            toColumn: `<strong>${entry.toColumn}</strong>`,
            fromBoard: `<strong>${entry.fromBoard}</strong>`,
            toBoard: `<strong>${entry.toBoard}</strong>`
        };

        const message = t(`activityLog.action.${entry.action}`, replacements);
        logHtml += `<li class="activity-log-item"><div class="log-message">${message}</div><div class="log-date">${date}</div></li>`;
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

// ===== FUNÇÕES DE SUPORTE (handle*) COM DIÁLOGOS DE CONFIRMAÇÃO =====

/**
 * Função de suporte para arquivar quadro (com diálogo de confirmação).
 * @param {string} boardId O ID do quadro.
 * @param {boolean} [closeManagerDialog=false] Se true, fecha o manager-dialog no sucesso.
 */
async function handleArchiveBoard(boardId, closeManagerDialog = false) {
    const board = boards.find(b => b.id === boardId);
    if (!board) return;

    // ETAPA 2: Verifica se o quadro tem cartões
    const hasCards = board.columns.some(col => col.cardIds && col.cardIds.length > 0);

    if (!hasCards) {
        // Se não tiver cartões, mostra um diálogo de confirmação simples.
        showConfirmationDialog(
            t('archive.confirm.archiveBoard', { boardName: board.title }),
            async (dialog) => {
                // ✅ CORREÇÃO: Aplica a mesma lógica de atualização da UI em memória.
                const boardIndex = boards.findIndex(b => b.id === boardId);
                if (boardIndex > -1) {
                    boards.splice(boardIndex, 1);
                    if (currentBoard && currentBoard.id === boardId) {
                        currentBoard = boards.find(b => !b.isArchived) || null;
                        localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');
                    }
                }
                renderBoardSelector();
                renderCurrentBoard();
                initCustomSelects();

                // ✅ AGORA, opera no storage em segundo plano.
                if (await archiveBoardInStorage(boardId, currentUser.id, false)) { // false para markAsCompleted
                    // ✅ CORREÇÃO: Remove a referência do quadro do seu dono (usuário ou grupo)
                    if (board.ownerId && !board.groupId) {
                        const userProfile = await getUserProfile(board.ownerId);
                        if (userProfile && userProfile.boardIds) {
                            userProfile.boardIds = userProfile.boardIds.filter(id => id !== boardId);
                            await saveUserProfile(userProfile);
                        }
                    } else if (board.groupId) {
                        const group = await getGroup(board.groupId);
                        if (group && group.boardIds) {
                            group.boardIds = group.boardIds.filter(id => id !== boardId);
                            await saveGroup(group);
                        }
                    }

                    showDialogMessage(dialog, t('archive.feedback.boardArchived'), 'success');
                    if (closeManagerDialog) document.getElementById('manager-dialog')?.close();
                    return true; // Fecha o diálogo de confirmação.
                } else {
                    showDialogMessage(dialog, t('archive.feedback.archiveFailed'), 'error');
                    await showSuccessAndRefresh(dialog, null); // Fallback em caso de erro.
                    return false;
                }
            }
        );
        return; // Encerra a função aqui para não mostrar o outro diálogo.
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('archive.confirm.archiveBoardTitle')}</h3>
        <p>${t('archive.confirm.archiveBoardMessage', { boardName: board.title })}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn cancel">${t('ui.cancel')}</button>
            <button class="btn alternative1" data-archive-as="open">${t('archive.buttons.archiveOpen')}</button>
            <button class="btn confirm" data-archive-as="completed">${t('archive.buttons.archiveCompleted')}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    makeDraggable(dialog);
    dialog.showModal();

    const handleArchive = async (archiveAs) => {
        dialog.querySelectorAll('button').forEach(b => b.disabled = true);

        // ✅ CORREÇÃO: ATUALIZA O ESTADO DA UI EM MEMÓRIA PRIMEIRO
        const boardIndex = boards.findIndex(b => b.id === boardId);
        if (boardIndex > -1) {
            boards.splice(boardIndex, 1); // Remove o quadro da lista principal
            // Se o quadro arquivado era o atual, define o próximo quadro visível como o novo atual
            if (currentBoard && currentBoard.id === boardId) {
                currentBoard = boards.find(b => !b.isArchived) || null;
                localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');
            }
        }
        // Renderiza a UI imediatamente com o estado atualizado
        renderBoardSelector();
        renderCurrentBoard();
        initCustomSelects();

        // ✅ AGORA, opera no storage em segundo plano
        if (await archiveBoardInStorage(boardId, currentUser.id, archiveAs === 'completed')) {
            // ✅ CORREÇÃO: Remove a referência do quadro do seu dono (usuário ou grupo)
            if (board.ownerId && !board.groupId) {
                const userProfile = await getUserProfile(board.ownerId);
                if (userProfile && userProfile.boardIds) {
                    userProfile.boardIds = userProfile.boardIds.filter(id => id !== boardId);
                    await saveUserProfile(userProfile);
                }
            } else if (board.groupId) {
                const group = await getGroup(board.groupId);
                if (group && group.boardIds) {
                    group.boardIds = group.boardIds.filter(id => id !== boardId);
                    await saveGroup(group);
                }
            }

            showDialogMessage(dialog, t('archive.feedback.boardArchived'), 'success');
            if (closeManagerDialog) document.getElementById('manager-dialog')?.close();
            setTimeout(() => dialog.close(), 1500);
        } else {
            // Se a operação de storage falhar, recarrega tudo como um fallback de segurança
            showDialogMessage(dialog, t('archive.feedback.archiveFailed'), 'error');
            await showSuccessAndRefresh(dialog, null);
        }
    };

    dialog.querySelector('.btn.cancel').onclick = () => dialog.close();
    dialog.querySelector('[data-archive-as="open"]').onclick = () => handleArchive('open');
    dialog.querySelector('[data-archive-as="completed"]').onclick = () => handleArchive('completed');
    dialog.addEventListener('close', () => dialog.remove());
}

/**
 * Função de suporte para excluir quadro (com diálogo de confirmação).
 * @param {string} boardId O ID do quadro.
 * @param {boolean} [closeManagerDialog=false] Se true, fecha o manager-dialog no sucesso.
 */
async function handleDeleteBoard(boardId, closeManagerDialog = false) {
    const boardToDelete = boards.find(b => b.id === boardId);
    if (!boardToDelete) return;

    showConfirmationDialog(
        t('kanban.confirm.deleteBoard', { boardTitle: boardToDelete.title }),
        async (dialog) => {
            // ✅ CORREÇÃO: ATUALIZA ESTADO PRIMEIRO
            const boardIndex = boards.findIndex(b => b.id === boardId);
            if (boardIndex > -1) {
                boards.splice(boardIndex, 1);
                // ✅ ATUALIZA UI IMEDIATAMENTE
                renderBoardSelector();
                if (currentBoard && currentBoard.id === boardId) {
                    currentBoard = boards.length > 0 ? boards[0] : null;
                    localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : '');
                    renderCurrentBoard();
                }
                initCustomSelects();
            }

            // ✅ AGORA opera no storage
            if (await trashBoardInStorage(boardId, currentUser.id)) {
                // ✅ CORREÇÃO: Remove a referência do quadro do seu dono (usuário ou grupo)
                if (boardToDelete.ownerId && !boardToDelete.groupId) {
                    const userProfile = await getUserProfile(boardToDelete.ownerId);
                    if (userProfile && userProfile.boardIds) {
                        userProfile.boardIds = userProfile.boardIds.filter(id => id !== boardId);
                        await saveUserProfile(userProfile);
                    }
                } else if (boardToDelete.groupId) {
                    const group = await getGroup(boardToDelete.groupId);
                    if (group && group.boardIds) {
                        group.boardIds = group.boardIds.filter(id => id !== boardId);
                        await saveGroup(group);
                    }
                }

                showDialogMessage(dialog, t('kanban.feedback.boardMovedToTrash'), 'success');
                if (closeManagerDialog) document.getElementById('manager-dialog')?.close();
                return true; // Fecha o diálogo de confirmação
            }
            // ✅ FALLBACK: Se storage falhar, recarrega tudo
            await showSuccessAndRefresh(dialog, currentBoard?.id);
            return false;
        }, null, t('ui.yesDelete'), t('ui.no')
    );
}

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

/**
 * Função de suporte para arquivar coluna (com diálogo de confirmação).
 * @param {string} columnId O ID da coluna.
 * @param {boolean} [closeManagerDialog=false] Se true, fecha o manager-dialog no sucesso.
 */
async function handleArchiveColumn(columnId, boardContext = null, fromManager = false) {
    // ETAPA 5: VERIFICAÇÃO DE PERMISSÃO
    // Garante que o usuário não possa arquivar se não tiver permissão para editar colunas.
    if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    const boardForContext = boardContext || currentBoard;
    const column = findColumn(columnId, boardForContext);
    if (!column) return;

    // ETAPA 2: Verifica se a coluna tem cartões
    const hasCards = column.cardIds && column.cardIds.length > 0;

    if (!hasCards) {
        // Se não tiver cartões, mostra um diálogo de confirmação simples.
        showConfirmationDialog(
            t('kanban.confirm.archiveEmptyColumn', { columnTitle: column.title }),
            async (dialog) => {
                // ✅ CORREÇÃO: Aplica a mesma lógica de atualização da UI em memória.
                if (currentBoard && currentBoard.id === boardForContext.id) {
                    currentBoard.columns = currentBoard.columns.filter(c => c.id !== columnId);
                    currentBoard.columnIds = currentBoard.columnIds.filter(id => id !== columnId);
                    // ✅ CORREÇÃO: Salva o estado do quadro após remover a coluna da memória.
                    await saveBoard(currentBoard);
                    renderCurrentBoard();
                }

                // ✅ AGORA, opera no storage em segundo plano.
                const context = { boardId: boardForContext.id, boardTitle: boardForContext.title };
                if (await archiveColumnInStorage(columnId, currentUser.id, context, false)) { // false para markAsCompleted
                    showDialogMessage(dialog, t('archive.feedback.columnArchived'), 'success');
                    if (fromManager) document.getElementById('manager-dialog')?.close();
                    return true; // Fecha o diálogo de confirmação.
                } else {
                    showDialogMessage(dialog, t('archive.feedback.archiveFailed'), 'error');
                    await showSuccessAndRefresh(dialog, currentBoard.id); // Fallback em caso de erro.
                    return false;
                }
            }
        );
        return; // Encerra a função aqui.
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('archive.confirm.archiveColumnTitle')}</h3>
        <p>${t('archive.confirm.archiveColumnMessage', { columnTitle: column.title })}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn cancel">${t('ui.cancel')}</button>
            <button class="btn alternative1" data-archive-as="open">${t('archive.buttons.archiveOpen')}</button>
            <button class="btn confirm" data-archive-as="completed">${t('archive.buttons.archiveCompleted')}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    makeDraggable(dialog);
    dialog.showModal();

    const handleArchive = async (archiveAs) => {
        dialog.querySelectorAll('button').forEach(b => b.disabled = true);

        // ✅ CORREÇÃO: ATUALIZA O ESTADO DA UI EM MEMÓRIA PRIMEIRO
        if (currentBoard && currentBoard.id === boardForContext.id) {
            currentBoard.columns = currentBoard.columns.filter(c => c.id !== columnId);
            currentBoard.columnIds = currentBoard.columnIds.filter(id => id !== columnId);
            // ✅ CORREÇÃO: Salva o estado do quadro após remover a coluna da memória.
            await saveBoard(currentBoard);
            // Renderiza o quadro imediatamente com a coluna removida
            renderCurrentBoard();
        }

        // ✅ AGORA, opera no storage em segundo plano
        const context = { boardId: boardForContext.id, boardTitle: boardForContext.title };
        if (await archiveColumnInStorage(columnId, currentUser.id, context, archiveAs === 'completed')) {
            showDialogMessage(dialog, t('archive.feedback.columnArchived'), 'success');
            if (fromManager) document.getElementById('manager-dialog')?.close();
            setTimeout(() => dialog.close(), 1500);
        } else {
            // Se a operação de storage falhar, recarrega tudo como um fallback de segurança
            showDialogMessage(dialog, t('archive.feedback.archiveFailed'), 'error');
            await showSuccessAndRefresh(dialog, currentBoard.id);
        }
    };

    dialog.querySelector('.btn.cancel').onclick = () => dialog.close();
    dialog.querySelector('[data-archive-as="open"]').onclick = () => handleArchive('open');
    dialog.querySelector('[data-archive-as="completed"]').onclick = () => handleArchive('completed');
    dialog.addEventListener('close', () => dialog.remove());
}

/**
 * Função de suporte para excluir coluna (com diálogo de confirmação).
 * @param {string} columnId O ID da coluna.
 * @param {boolean} [closeManagerDialog=false] Se true, fecha o manager-dialog no sucesso.
 */
async function handleDeleteColumn(columnId, boardContext = null, fromManager = false) {
    // ETAPA 7: VERIFICAÇÃO DE PERMISSÃO
    // Garante que o usuário não possa excluir uma coluna se não tiver permissão para editá-las.
    if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    const boardForContext = boardContext || currentBoard;
    const column = findColumn(columnId, boardForContext);
    if (!column) return;

    showConfirmationDialog(
        t('kanban.confirm.deleteColumn'),
        async (dialog) => {
            // ✅ CORREÇÃO: ATUALIZA ESTADO PRIMEIRO
            if (currentBoard && currentBoard.id === boardForContext.id) {
                currentBoard.columns = currentBoard.columns.filter(c => c.id !== columnId);
                currentBoard.columnIds = currentBoard.columnIds.filter(id => id !== columnId);
                // ✅ CORREÇÃO: SALVA O QUADRO PAI ATUALIZADO
                await saveBoard(currentBoard);
                // ✅ CORREÇÃO: ATUALIZA UI IMEDIATAMENTE
                renderCurrentBoard();
            }

            // ✅ AGORA opera no storage
            const success = await trashColumnInStorage(columnId, currentUser.id, { boardId: boardForContext.id, boardTitle: boardForContext.title });
            if (success) {
                showDialogMessage(dialog, t('kanban.feedback.columnMovedToTrash'), 'success');
                if (fromManager) document.getElementById('manager-dialog')?.close();
                return true;
            } 
            // ✅ FALLBACK: Se storage falhar, recarrega do storage
            await showSuccessAndRefresh(dialog, currentBoard.id);
            return false;
        },
        null,
        t('ui.yesDelete'),
        t('ui.no')
    );
}

async function toggleCardComplete(cardId) {
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
        await saveCard(card); // Salva a alteração no armazenamento
        await saveState();

        // FASE 2: Atualiza contador de tarefas concluídas do grupo
        if (currentBoard.groupId) {
            const group = await getGroup(currentBoard.groupId);
            if (group) {
                if (card.isComplete) {
                    group.completedTaskCount = (group.completedTaskCount || 0) + 1;
                } else {
                    group.completedTaskCount = Math.max(0, (group.completedTaskCount || 0) - 1);
                }
                await saveGroup(group);
            }
        }
        renderCurrentBoard(); // Redesenha a tela para refletir a mudança
    }
}

/**
 * Move um quadro inteiro e todo o seu conteúdo para a lixeira.
 * @param {string} boardId O ID do quadro a ser movido para a lixeira.
 */
async function trashEntireBoard(boardId) {
    // CORREÇÃO: A variável 'board' não estava definida. É preciso buscar o quadro primeiro.
    const board = await getBoard(boardId);
    if (!board) {
        showFloatingMessage(t('archive.feedback.itemNotFound'), 'error');
        return;
    }

    // A lógica de desmembramento está em archiveBoard.
    // Chamamos a função centralizada com o boardId correto.
    await archiveBoard(boardId, currentUser.id, 'deleted');

    // 4. Remove a referência do quadro da sua lista de origem (perfil do usuário ou grupo)
    // Agora a variável 'board' existe e esta lógica funcionará.
    if (board.groupId) {
        const group = await getGroup(board.groupId);
        if (group && group.boardIds) {
            group.boardIds = group.boardIds.filter(id => id !== boardId);
            await saveGroup(group);
        }
    } else {
        const userProfile = await getUserProfile(currentUser.id);
        if (userProfile && userProfile.boardIds) {
            userProfile.boardIds = userProfile.boardIds.filter(id => id !== boardId);
            await saveUserProfile(userProfile);
        }
    }
}

async function handleDeleteCard(cardId, closeManagerDialog = false) {
    // ETAPA 6: VERIFICAÇÃO DE PERMISSÃO
    // Garante que o usuário não possa excluir um cartão se não tiver permissão para editar colunas.
    if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    const result = findCardAndColumn(cardId);
    if (!result) return false;
    const { card, column } = result;

    showConfirmationDialog(
        t('kanban.confirm.deleteCard'),
        async (dialog) => {
            if (closeManagerDialog) document.getElementById('manager-dialog')?.close();
            
            // Adiciona log antes de excluir
            const logEntry = {
                action: 'trashed',
                userId: currentUser.id,
                timestamp: new Date().toISOString()
            };
            if (!card.activityLog) card.activityLog = [];
            card.activityLog.push(logEntry);
            await saveCard(card);

            // Chama a função CORRETA de exclusão
            if (await deleteCard(cardId)) {
                // Remove da coluna atual
                // ✅ CORREÇÃO: A lógica de remoção da memória já está em deleteCard,
                // mas salvamos a coluna para garantir a remoção do cardId.
                column.cardIds = column.cardIds.filter(id => id !== cardId);
                await saveColumn(column);
                
                showDialogMessage(dialog, t('kanban.feedback.cardMovedToTrash'), 'success');
                await showSuccessAndRefresh(dialog, currentBoard.id);
                return true;
            }
            return false;
        },
        null,
        t('ui.yesDelete'),
        t('ui.no')
    );
}

async function handleArchiveCard(cardId, closeManagerDialog = false) {
    // ETAPA 5: VERIFICAÇÃO DE PERMISSÃO
    // Garante que o usuário não possa arquivar um cartão se não tiver permissão para editar colunas.
    if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    const result = findCardAndColumn(cardId);
    if (!result) return false;
    const { card, column } = result;

    // NOVO: Diálogo de confirmação com opções
    const confirmationDialog = document.createElement('dialog');
    confirmationDialog.className = 'draggable';
    confirmationDialog.innerHTML = `
        <h3 class="drag-handle">${t('archive.confirm.archiveCardTitle')}</h3>
        <p>${t('archive.confirm.archiveCardMessage', { cardTitle: card.title })}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn cancel">${t('ui.cancel')}</button>
            <button class="btn alternative1" data-archive-as="open">${t('archive.buttons.archiveOpen')}</button>
            <button class="btn confirm" data-archive-as="completed">${t('archive.buttons.archiveCompleted')}</button>
        </div>
    `;
    document.body.appendChild(confirmationDialog);
    makeDraggable(confirmationDialog);
    confirmationDialog.showModal();

    const handleArchive = async (archiveAs) => {
        confirmationDialog.querySelectorAll('button').forEach(b => b.disabled = true);

        if (archiveAs === 'completed' && !card.isComplete) {
            card.isComplete = true;
            card.completedAt = new Date().toISOString();
            if (!card.activityLog) card.activityLog = [];
            card.activityLog.push({ action: 'completed', userId: currentUser.id, timestamp: new Date().toISOString() });
        }

        if (await archiveCardInStorage(cardId, currentUser.id, { columnId: column.id, boardId: currentBoard.id, columnTitle: column.title, boardTitle: currentBoard.title }, archiveAs === 'completed')) {
            column.cardIds = column.cardIds.filter(id => id !== cardId);
            // ✅ CORREÇÃO: Salva a coluna de origem após remover o cartão arquivado.
            await saveColumn(column);
            showDialogMessage(confirmationDialog, t('archive.feedback.cardArchived'), 'success');
            if (closeManagerDialog) document.getElementById('manager-dialog')?.close();
            await showSuccessAndRefresh(confirmationDialog, currentBoard.id);
        } else {
            showDialogMessage(confirmationDialog, t('archive.feedback.archiveFailed'), 'error');
            confirmationDialog.querySelectorAll('button').forEach(b => b.disabled = false);
        }
    };

    confirmationDialog.querySelector('.btn.cancel').onclick = () => confirmationDialog.close();
    confirmationDialog.querySelector('[data-archive-as="open"]').onclick = () => handleArchive('open');
    confirmationDialog.querySelector('[data-archive-as="completed"]').onclick = () => handleArchive('completed');
    confirmationDialog.addEventListener('close', () => confirmationDialog.remove());
}

async function saveState() {
    // Limpa a pilha de refazer sempre que uma nova ação é salva.
    redoStack = [];
    // Adiciona o estado atual do quadro (convertido para string) à pilha de desfazer.
    undoStack.push(JSON.stringify(currentBoard));
    // Limita o tamanho da pilha para 50 estados para não consumir muita memória.
    if (undoStack.length > 50) {
        undoStack.shift(); // Remove o estado mais antigo.
    }
}

async function undoAction() {
    if (undoStack.length <= 1) {
        showFloatingMessage(t('kanban.feedback.nothingToUndo'), 'info');
        return;
    }
    
    // Remove o estado atual e o coloca na pilha de refazer
    const currentState = undoStack.pop();
    redoStack.push(currentState);
    
    // O novo estado atual é o que estava antes no topo da pilha
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

    await renderCurrentBoard();
    await saveBoard(currentBoard);
}


async function redoAction() {
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

    await renderCurrentBoard();
    await saveBoard(currentBoard);
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
async function handleCopyCard(cardId) {
    if (!await hasPermission(currentUser, currentBoard, 'createCards')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }
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
async function handleCutCard(cardId) {
    if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    const { card, column } = findCardAndColumn(cardId);
    if (card) {
        clipboard = {
            type: 'card',
            mode: 'cut',
            sourceCardId: cardId,
            sourceColumnId: column.id,
            sourceBoardId: currentBoard.id, // Adiciona o board de origem
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
async function handlePasteCard(targetColumnId, boardContext = null) {
    const targetColumn = findColumn(targetColumnId);
    if (!targetColumn) return;

    // A verificação de permissão para colar (criar) é feita aqui
    if (!await hasPermission(currentUser, currentBoard, 'createCards')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }

    if (clipboard.mode === 'cut') {
        const sourceBoard = await getBoard(clipboard.sourceBoardId);
        const sourceColumn = await getColumn(clipboard.sourceColumnId);
        if (sourceColumn) {
            const cardIndex = sourceColumn.cardIds.indexOf(clipboard.sourceCardId);
            if (cardIndex > -1) {
                sourceColumn.cardIds.splice(cardIndex, 1);
                // ✅ CORREÇÃO: Salva a coluna de origem após remover o cartão recortado.
                await saveColumn(sourceColumn);
            }
        }
        targetColumn.cardIds.push(clipboard.sourceCardId);
        await saveColumn(targetColumn);

        // Adiciona o log de movimentação
        const movedCard = await getCard(clipboard.sourceCardId);
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
            if (logEntry) { // Apenas adiciona o log se houve uma movimentação real
                if (!movedCard.activityLog) movedCard.activityLog = [];
                movedCard.activityLog.push(logEntry);
                await saveCard(movedCard);
            }
        }
    } else { // 'copy'
        const newCard = await saveCard(clipboard.data);
        newCard.activityLog = [{
            action: 'created_from_copy',
            userId: currentUser.id,
            timestamp: new Date().toISOString()
        }];
        await saveCard(newCard); // Salva novamente com o log

        // CORREÇÃO BUG: Atualiza contador de tarefas do grupo ao copiar cartão.
        if (currentBoard.groupId) {
            const group = await getGroup(currentBoard.groupId);
            if (group) {
                group.taskCount = (group.taskCount || 0) + 1;
                await saveGroup(group);
            }
        }

        targetColumn.cardIds.push(newCard.id);
        await saveColumn(targetColumn);
    }

    await saveState(); // Salva o estado apenas uma vez
    clipboard = null;
    showFloatingMessage(t('kanban.feedback.cardPasted'), 'success'); // Esta mensagem já existe
    await showSuccessAndRefresh(null, currentBoard.id);
}
/**
 * Busca a cor de uma etiqueta no mapa de cores pré-carregado.
 * @param {string} tagName - O nome da etiqueta.
 * @returns {string} A cor hexadecimal da etiqueta ou uma cor padrão.
 */
function getTagColor(tagName) {
    return tagColorMap.get(tagName) || '#6c757d'; // Retorna a cor encontrada ou um cinza padrão
}

function findCardAndColumn(cardId, boardContext) {
    const board = boardContext || currentBoard;
    if (!board || !board.columns) {
        console.warn('Board ou colunas não encontrados para card:', cardId);
        return null;
    }
    
    for (const column of board.columns) {
        const card = column.cards.find(c => c.id === cardId);
        if (card) {
            return { card, column, board };
        }
    }
    
    console.warn('Card não encontrado em nenhuma coluna:', cardId);
    return null;
}

function findColumn(columnId, boardContext) {
    const board = boardContext || currentBoard;
    if (!board || !board.columns) return null;
    return board.columns.find(c => c.id === columnId);
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
async function handlePaste() {
    if (clipboard && clipboard.type === 'card') {
        // Cola sempre na primeira coluna do quadro ATUAL
        if (currentBoard.columns.length > 0) {
            const targetColumnId = currentBoard.columns[0].id;
            handlePasteCard(targetColumnId);
        } else {
            showFloatingMessage(t('kanban.feedback.createColumnToPaste'), 'warning');
        }
    } else if (clipboard && clipboard.type === 'column') {
        await handlePasteColumn();
    }
}

async function handleEditCardFromMenu(cardId) {
    if (!await hasPermission(currentUser, currentBoard, 'editCards')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }
    showCardDialog(cardId);
}

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

    confirmBtn.addEventListener('click', async () => {
        const templateName = nameInput.value.trim();
        if (!templateName) {
            showDialogMessage(dialog, t('kanban.dialog.templateNameRequired'), 'error');
            return;
        }

        const existingTemplates = await getUserBoardTemplates(currentUser.id);
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
        await saveUserBoardTemplates(currentUser.id, existingTemplates);

        showDialogMessage(dialog, t('kanban.feedback.templateSaved', { templateName: newTemplate.name }), 'success');
        setTimeout(() => dialog.close(), 1500);
    });
}

async function handleEditColumnFromMenu(columnId) {
    // ETAPA 4: VERIFICAÇÃO DE PERMISSÃO
    if (!await hasPermission(currentUser, currentBoard, 'editColumns')) {
        showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
        return;
    }
    showColumnDialog(columnId);
}

async function handlePasteColumn() {
    if (!clipboard || clipboard.type !== 'column') {
        showFloatingMessage(t('kanban.feedback.noColumnToPaste'), 'warning');
        return;
    }

    if (clipboard.mode === 'cut') {
        // ETAPA 4: VERIFICAÇÃO DE PERMISSÃO
        // Para mover (recortar/colar), o usuário precisa de permissão de edição no quadro de origem E no de destino.
        if (!await hasPermission(currentUser, await getBoard(clipboard.sourceBoardId), 'editColumns') || !await hasPermission(currentUser, currentBoard, 'editColumns')) {
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

        const movedColumn = await getColumn(sourceColumnId);
        const sourceBoard = await getBoard(sourceBoardId);

        // Remove a coluna do quadro de origem
        if (sourceBoard) {
            sourceBoard.columnIds = sourceBoard.columnIds.filter(id => id !== sourceColumnId);
            await saveBoard(sourceBoard);
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
            await saveColumn(movedColumn);
        }

        // Adiciona a coluna ao quadro atual
        const targetBoard = await getBoard(currentBoard.id);
        targetBoard.columnIds.push(sourceColumnId);
        await saveBoard(targetBoard);

        showFloatingMessage(t('kanban.feedback.columnMoved'), 'success');

    } else { // 'copy'
        // ETAPA 4: VERIFICAÇÃO DE PERMISSÃO
        if (!await hasPermission(currentUser, currentBoard, 'createColumns')) {
            showFloatingMessage(t('kanban.feedback.noPermission'), 'error');
            return;
        }

        // Lógica para COPIAR a coluna
        const columnData = clipboard.data;
        // CORREÇÃO: Cria novos cartões independentes com logs de atividade
        const newCards = await Promise.all(columnData.cards.map(async cardData => {
            const newCard = {
                ...cardData,
                id: null, // Garante um novo ID
                title: `${cardData.title} ${t('kanban.board.copySuffix')}`,
                activityLog: [
                    // Apenas o log específico de cópia de coluna é necessário.
                    { action: 'created_from_column_copy', userId: currentUser.id, timestamp: new Date().toISOString() } // Log de cópia de coluna
                ]
            };
            return await saveCard(newCard);
        }));
        const newColumn = await saveColumn({ ...columnData, cardIds: newCards.map(c => c.id) });

        // Adiciona o log de criação a partir de cópia
        newColumn.activityLog = [{
            action: 'created_from_copy',
            userId: currentUser.id,
            timestamp: new Date().toISOString()
        }];
        await saveColumn(newColumn); // Salva novamente com o log

        const boardData = await getBoard(currentBoard.id);
        boardData.columnIds.push(newColumn.id);
        await saveBoard(boardData);
        showFloatingMessage(t('kanban.feedback.columnPasted'), 'success');
    }

    await saveState(); // Salva o estado para o Desfazer
    clipboard = null; // Limpa a área de transferência
    await showSuccessAndRefresh(null, currentBoard.id);
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
async function showPreferencesDialog(isTour = false) {
    const dialog = document.getElementById('preferences-dialog');
    const user = await getCurrentUser();
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
        showChecklist: prefs.showChecklist !== false, // ✅ FASE 3
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
    dialog.querySelector('#pref-card-show-checklist').checked = originalPreferences.showChecklist; // ✅ FASE 3
    dialog.querySelector('#pref-enable-card-tooltip').checked = originalPreferences.enableCardTooltip; // Define o estado do novo checkbox

    // Popula e seleciona o template de tags
    await populateTagTemplatesSelect(originalPreferences.defaultTagTemplateId);

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

async function restoreKanbanOriginalSettings() {
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
    applySmartHeaderState(originalPreferences.smartHeader);

    // 3. Redesenha o quadro para aplicar as preferências de exibição de cartão/quadro
    await renderCurrentBoard();
}

async function handleSavePreferences(preferencesDialog) {
    showConfirmationDialog(
        t('preferences.confirm.save'),
        (confirmationDialog) => {
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

async function savePreferencesData() {
    const dialog = document.getElementById('preferences-dialog');
    const user = await getCurrentUser();
    
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
            showChecklist: dialog.querySelector('#pref-card-show-checklist').checked, // ✅ FASE 3
            enableCardTooltip: dialog.querySelector('#pref-enable-card-tooltip').checked, // Salva a nova preferência
            smartHeader: dialog.querySelector('#pref-smart-header').checked,
            primaryColor: primaryColor
        }
    };

    if (await updateUser(user.id, updatedUser)) {
        currentUser = updatedUser; // ATUALIZAÇÃO: Garante que a variável local seja atualizada.
        // Atualizar os valores originais
        kanbanIsSaved = true;
        applyUserTheme(); // Aplica globalmente
        initSmartHeader(); // ATUALIZAÇÃO: Aplica a preferência do Smart Header
        await renderCurrentBoard(); // Renderiza o quadro com as novas prefs
        return true;
    } else {
        return false;
    }
}

/**
 * Escurece ou clareia uma cor hexadecimal.
 * @param {string} color - A cor em formato hex (ex: #RRGGBB).
 * @param {number} percent - A porcentagem para clarear (positivo) ou escurecer (negativo).
 * @returns {string} A nova cor em formato hex.
 */
function shadeColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;  G = (G < 255) ? G : 255;  B = (B < 255) ? B : 255;

    return `#${(R.toString(16).padStart(2, '0'))}${(G.toString(16).padStart(2, '0'))}${(B.toString(16).padStart(2, '0'))}`;
}
async function populateTagTemplatesSelect(selectedId = null) {
    const select = document.getElementById('pref-default-tag-template');
    if (!select) return;

    // CORREÇÃO: Garante que estamos usando a versão mais atual do usuário,
    // assim como é feito na página de perfil, para carregar os templates corretamente.
    const user = await getCurrentUser();
    
    select.innerHTML = `<option value="">${t('preferences.tagTemplate.none')}</option>`;
    
    const userTagTemplates = await getUserTagTemplates(user.id);
    const systemTagTemplates = await getSystemTagTemplates();
    
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
    currentUser.preferences.showChecklist = dialog.querySelector('#pref-card-show-checklist').checked;

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
