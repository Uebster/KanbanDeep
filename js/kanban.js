// js/kanban.js - VERSÃO REFATORADA E FINAL

import { getCurrentUser, updateUser } from './auth.js';
import { 
    getUserProfile, getFullBoardData, getBoard, saveBoard, deleteBoard, 
    getColumn, saveColumn, getCard, saveCard, deleteCard,
    getAllUsers, getAllGroups, getSystemBoardTemplates, getUserBoardTemplates, 
    getSystemTagTemplates, getUserTagTemplates, saveUserBoardTemplates
} from './storage.js';
import { showFloatingMessage, initDraggableElements, updateUserAvatar, initUIControls, showConfirmationDialog, showDialogMessage } from './ui-controls.js';
import { addCardAssignmentNotification } from './notifications.js';

// ===== ESTADO GLOBAL DO MÓDULO =====
let currentUser = null;
let allUsers = [];
let boards = [];
let currentBoard = null;
let draggedElement = null;
let undoStack = [];
let redoStack = [];
let clipboard = null; // Para copiar/colar
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
let kanbanIsSaved = true;
const ICON_LIBRARY = [
  '📋', '🏷️', '💼', '📚', '🛒', '🎮', '🔥', '📊', '🚀', '🎯', '💡', '🎉', '🏆', '⚙️', '🔧', '🏠', '❤️', '⭐', '📌', '📎', '📁', '📅', '⏰', '✅', '❌', '❓', '❗', '💰', '👥', '🧠'
];

// ===== INICIALIZAÇÃO =====

// A lógica de inicialização agora está DENTRO da função exportada.
// O DOMContentLoaded foi REMOVIDO daqui.
export function initKanbanPage() {

    currentUser = getCurrentUser();
    if (!currentUser) {
        showFloatingMessage('Usuário não logado. Redirecionando...', 'error');
        setTimeout(() => { window.location.href = 'list-users.html'; }, 2000);
        return;
    }
    
    if (currentUser) {
        updateUserAvatar(currentUser);
    }

    // 2. Carregamento de Dados
    loadData();

    // 3. Configuração da UI e Eventos
    setupEventListeners();
    initDraggableElements();

    // 4. Renderização Inicial
    initUIControls();
    renderBoardSelector();
    renderCurrentBoard();
    saveState(); // Salva o estado inicial para o Desfazer
    applyUserPreferences();
}

/**
 * Carrega o usuário atual e redireciona se não estiver logado.
 */
function setupUser() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'list-users.html';
    }
}

/**
 * Carrega todos os dados necessários da aplicação (quadros e usuários).
 */
async function loadData() {
    allUsers = getAllUsers();
    
    const userProfile = getUserProfile(currentUser.id);
    const userBoardIds = userProfile.boardIds || [];
    boards = userBoardIds.map(id => getFullBoardData(id)).filter(Boolean);

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
        showFloatingMessage('É preciso ter um quadro selecionado para criar colunas.', 'error');
        return;
    }
    showColumnDialog();
});

document.getElementById('add-card-btn')?.addEventListener('click', () => {
    if (!currentBoard) {
        showFloatingMessage('Crie ou selecione um quadro primeiro.', 'error');
        return;
    }
    if (currentBoard.columns.length === 0) {
        showFloatingMessage('É necessário criar ao menos uma coluna antes de adicionar um cartão.', 'error');
        return;
    }
    showCardDialog(null, currentBoard.columns[0].id);
});
    document.getElementById('board-select')?.addEventListener('change', switchBoard);
    document.getElementById('edit-items-btn')?.addEventListener('click', showEditDialog);
    document.getElementById('undo-btn')?.addEventListener('click', undoAction);
    document.getElementById('redo-btn')?.addEventListener('click', redoAction);
    document.getElementById('export-img')?.addEventListener('click', handleExportImage);
    document.getElementById('save-as-template-btn')?.addEventListener('click', saveBoardAsTemplate);
    document.getElementById('print-btn')?.addEventListener('click', handlePrintBoard);
    document.getElementById('my-groups-btn')?.addEventListener('click', () => window.location.href = 'groups.html');
    document.getElementById('notifications-btn')?.addEventListener('click', () => window.location.href = 'notifications.html');
    document.getElementById('templates-btn')?.addEventListener('click', () => window.location.href = 'templates.html');
document.getElementById('search-card-btn')?.addEventListener('click', () => {
    if (!currentBoard) {
        showFloatingMessage('Selecione um quadro primeiro', 'error');
        return;
    }
    showSearchDialog();
});

    // --- Diálogos (Modais) ---
    document.getElementById('board-save-btn')?.addEventListener('click', handleSaveBoard);
    document.getElementById('column-save-btn')?.addEventListener('click', handleSaveColumn);
    document.getElementById('column-delete-btn')?.addEventListener('click', () => handleDeleteColumn(document.getElementById('column-dialog').dataset.editingId));
    document.getElementById('card-save-btn')?.addEventListener('click', handleSaveCard);
    document.querySelectorAll('dialog .btn-secondary').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('dialog').close());
    });

    // --- Atalhos e Contexto ---
    document.addEventListener('keydown', handleKeyDown);
    document.getElementById('columns-container').addEventListener('contextmenu', handleContextMenu);
document.getElementById('exit-btn')?.addEventListener('click', confirmExit);


// Adicione esta linha na função setupEventListeners do kanban.js
document.getElementById('search-user-btn')?.addEventListener('click', showUserSearchDialog);
}

function showSearchDialog() {
    const dialog = document.getElementById('search-dialog');
    if (!currentBoard) {
        showFloatingMessage('Selecione um quadro para procurar cartões.', 'error');
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
    creatorSelect.innerHTML = '<option value="">Qualquer um</option>';
    relevantUsers.forEach(user => {
        creatorSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
    });

    // Popula Atribuído a
    assigneeSelect.innerHTML = '<option value="">Qualquer um</option>';
    relevantUsers.forEach(user => {
        assigneeSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
    });

    // Popula Etiquetas (lógica mantida, mas simplificada)
    tagSelect.innerHTML = '<option value="">Todas</option>';
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

    showFloatingMessage(`${visibleCount} cartões encontrados.`, 'info');
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

    showFloatingMessage('Filtros removidos.', 'info');
    dialog.close();
}

// Adicione esta função para buscar usuários
function showUserSearchDialog() {
    // Fechar diálogo anterior se existir
    const existingDialog = document.getElementById('user-search-dialog');
    if (existingDialog) {
        existingDialog.remove();
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'user-search-dialog';
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <div class="drag-handle" style="cursor: move; padding: 10px; color: var(--text); background-color: var(--bg-column-header); border-bottom: 1px solid var(--border);">
            <h3 style="margin: 0;">🔍 Buscar Usuários</h3>
        </div>
        <div style="padding: 20px;">
            <input type="text" id="user-search-input" placeholder="Digite o nome do usuário..." 
                          style="width: 100%; padding: 10px; border-radius: 6px; background-color: var(--bg-page); color: var(--text); border: 1px solid var(--border);">
            <div id="user-search-results" style="margin-top: 15px; max-height: 300px; overflow-y: auto;"></div>
            <div style="margin-top: 15px; text-align: right;">
                <button id="user-search-close" class="btn btn-secondary">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();
    initDraggableElements();

    const closeUserSearchDialog = () => {
        dialog.close();
        dialog.remove(); // Limpa o diálogo da tela
    };

    dialog.querySelector('#user-search-close').addEventListener('click', closeUserSearchDialog);
    
    const searchInput = document.getElementById('user-search-input');
    searchInput.focus();

    // Buscar usuários localmente, excluindo o usuário atual
    const localUsers = getAllUsers().filter(user => user.id !== currentUser.id);
    displayUserResults(localUsers);

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredUsers = localUsers.filter(user => 
            user.name.toLowerCase().includes(searchTerm) ||
            (user.username && user.username.toLowerCase().includes(searchTerm))
        );
        displayUserResults(filteredUsers);
    });
}

// Função para exibir resultados de usuários
function displayUserResults(users) {
    const resultsContainer = document.getElementById('user-search-results');
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '';

    if (users.length === 0) {
        resultsContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-muted);">Nenhum usuário encontrado</p>';
        return;
    }

    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'user-result-item';
        userEl.style.padding = '10px';
        userEl.style.borderBottom = '1px solid var(--border)';
        userEl.style.cursor = 'pointer';
        userEl.style.display = 'flex';
        userEl.style.alignItems = 'center';
        userEl.style.gap = '10px';
        userEl.onmouseover = () => userEl.style.backgroundColor = 'var(--bg-column)';
        userEl.onmouseout = () => userEl.style.backgroundColor = 'transparent';

        // Avatar do usuário
        const avatarEl = document.createElement('div');
        avatarEl.style.width = '40px';
        avatarEl.style.height = '40px';
        avatarEl.style.borderRadius = '50%';
        avatarEl.style.overflow = 'hidden';
        avatarEl.style.display = 'flex';
        avatarEl.style.alignItems = 'center';
        avatarEl.style.justifyContent = 'center';
        avatarEl.style.backgroundColor = '#007bff';
        avatarEl.style.color = 'white';
        avatarEl.style.fontWeight = 'bold';
        avatarEl.style.flexShrink = '0';

        if (user.avatar) {
            avatarEl.innerHTML = `<img src="${user.avatar}" alt="${user.name}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            avatarEl.textContent = user.name.charAt(0).toUpperCase();
        }

        // Informações do usuário
        const infoEl = document.createElement('div');
        infoEl.innerHTML = `
            <div style="font-weight: bold;">${user.name}</div>
            <div style="font-size: 0.9em; color: var(--text-muted);">@${user.username}</div>
        `;

        userEl.appendChild(avatarEl);
        userEl.appendChild(infoEl);

        // Evento de clique para abrir o perfil
        userEl.addEventListener('click', () => {
            window.location.href = `public-profile.html?userId=${user.id}`;
        });

        resultsContainer.appendChild(userEl);
    });
}

// ===== LÓGICA DE PREFERÊNCIAS - CÓDIGO CORRIGIDO =====

document.getElementById('preferences-btn')?.addEventListener('click', showPreferencesDialog);

// ===== LÓGICA DE RENDERIZAÇÃO =====

function renderBoardSelector() {
    const selector = document.getElementById('board-select');
    const boardsDropdown = document.getElementById('boards-dropdown');
    
    if (!selector || !boardsDropdown) return;
    
    selector.innerHTML = '';
    
    if (boards.length === 0) {
        // Esconde o select e mostra mensagem
        selector.style.display = 'none';
        
        // Remove mensagem anterior se existir
        const existingMessage = boardsDropdown.querySelector('.no-boards-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Cria e adiciona mensagem
        const message = document.createElement('p');
        message.className = 'no-boards-message';
        message.textContent = 'Nenhum quadro disponível';
        message.style.padding = '10px';
        message.style.color = 'var(--text-muted)';
        message.style.textAlign = 'center';
        
        // Insere a mensagem antes dos botões
        const buttons = boardsDropdown.querySelectorAll('button');
        if (buttons.length > 0) {
            boardsDropdown.insertBefore(message, buttons[0]);
        } else {
            boardsDropdown.appendChild(message);
        }
    } else {
        // Mostra o select e remove mensagem se existir
        selector.style.display = 'block';
        
        const existingMessage = boardsDropdown.querySelector('.no-boards-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Preenche o select com os quadros
        boards.forEach(board => {
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

function renderCurrentBoard() {
    if (!currentBoard) {
        document.getElementById('kanban-title').textContent = 'Nenhum quadro selecionado';
        document.getElementById('columns-container').innerHTML = '<p>Crie ou selecione um quadro para começar.</p>';
        return;
    }

    const titleElement = document.getElementById('kanban-title');
    const userPrefs = currentUser.preferences || {};

    const iconHtml = userPrefs.showBoardIcon === false ? '' : `<span class="board-icon">${currentBoard.icon || '📋'}</span>`;
    const titleHtml = userPrefs.showBoardTitle === false ? '' : `<span class="board-title-text">${currentBoard.title}</span>`;

    titleElement.innerHTML = `${iconHtml}${titleHtml}`.trim();
    // Se ambos estiverem escondidos, o título some. Se não, ele aparece.
    titleElement.style.display = (userPrefs.showBoardIcon === false && userPrefs.showBoardTitle === false) ? 'none' : 'block';

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

    // Adiciona a lógica de drag-and-drop para os novos elementos
    setupDragAndDrop();
}

function createColumnElement(column) {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.columnId = column.id;
    columnEl.draggable = true;
    columnEl.style.setProperty('--column-color', column.color || '#4b4b4bff');
    

    columnEl.innerHTML = `
        <div class="column-header">
            <h3>${column.title}</h3>
            <button class="paste-card-btn" style="display: none;" title="Colar Cartão">📋</button>
        </div>
        <div class="cards-container" data-column-id="${column.id}">
            ${column.cards.map(card => createCardElement(card).outerHTML).join('')}
        </div>
        <button class="add-card-btn">+ Adicionar Cartão</button>
    `;

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
        dueDateHtml = `<span class="card-due-date-display" title="${date.toLocaleString('pt-BR')}">${date.toLocaleDateString('pt-BR')}</span>`;
    }

    // Constrói a caixa de status
    const statusCheck = card.isComplete ? '✔' : '';
    const statusBoxHtml = `<div class="card-status-box" title="${card.isComplete ? 'Concluído' : 'Ativo'}">${statusCheck}</div>`;

    // Constrói o avatar do usuário atribuído (se houver)
    let assignedToHtml = '';
    const assignee = card.assignedTo ? allUsers.find(u => u.id === card.assignedTo) : null;
    if (assignee) {
        if (assignee.avatar) {
            assignedToHtml = `<img src="${assignee.avatar}" alt="${assignee.name}" class="card-assignee-avatar" title="Atribuído a: ${assignee.name}">`;
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
            <p><strong>Descrição:</strong> ${card.description || 'Nenhuma'}</p>
            ${creator ? `<p><strong>Criador:</strong> ${creator.name}</p>` : ''}
            ${assignee ? `<p><strong>Atribuído a:</strong> ${assignee.name}</p>` : ''}
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
    boardSelect.innerHTML = '<option value="">-- Selecione um quadro --</option>';
    boards.forEach(board => {
        boardSelect.innerHTML += `<option value="${board.id}">${board.title}</option>`;
    });

    boardSelect.onchange = () => {
        const boardId = boardSelect.value;
        columnGroup.style.display = 'none';
        cardGroup.style.display = 'none';
        columnSelect.innerHTML = '<option value="">-- Todas as colunas --</option>';
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
        cardSelect.innerHTML = '<option value="">-- Todos os cartões --</option>';
        if (!columnId) return;

        const selectedColumn = findColumn(columnId); // Assumindo que currentBoard é o quadro certo (precisa ajustar)
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
    document.getElementById('board-dialog-title').textContent = board ? 'Editar Quadro' : 'Criar Novo Quadro';
    
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
    document.getElementById('board-visibility').value = board ? board.visibility : 'private';

    const userTemplates = getUserBoardTemplates(currentUser.id);
    const systemTemplates = getSystemBoardTemplates();
    
    templateSelect.innerHTML = '<option value="">Começar com um quadro vazio</option>';
    if (userTemplates.length > 0) {
        templateSelect.innerHTML += '<optgroup label="Meus Templates">';
        userTemplates.forEach(t => templateSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
        templateSelect.innerHTML += '</optgroup>';
    }
    if (systemTemplates.length > 0) {
        templateSelect.innerHTML += '<optgroup label="Templates do Sistema">';
        systemTemplates.forEach(t => templateSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
        templateSelect.innerHTML += '</optgroup>';
    }
    
    // Esconde o select de template se estiver editando um quadro existente
    templateSelect.parentElement.style.display = boardId ? 'none' : 'block';
    
    // Reseta o feedback de erro
    dialog.querySelector('.feedback')?.classList.remove('show');
    
    dialog.showModal();
}

function handleSaveBoard() {
    const dialog = document.getElementById('board-dialog');
    let title = document.getElementById('board-title-input').value.trim();
    const templateId = document.getElementById('board-template-select').value;

    if (!title && !templateId) {
        showDialogMessage(dialog, 'O título é obrigatório.', 'error');
        return;
    }

    showConfirmationDialog(
        'Deseja salvar as alterações neste quadro?',
        (confirmationDialog) => {
            saveState(); // Salva o estado para o Desfazer
            const boardId = dialog.dataset.editingId;
            const icon = document.getElementById('board-icon-input').value;
            let savedBoard;

            if (boardId) {
                const boardData = getBoard(boardId);
                if (!boardData) return false;
                boardData.title = title;
                boardData.icon = icon;
                boardData.visibility = document.getElementById('board-visibility').value;
                savedBoard = saveBoard(boardData);
            } else { // Criando um novo quadro
                const allTemplates = [...getUserBoardTemplates(currentUser.id), ...getSystemBoardTemplates()];
                const selectedTemplate = allTemplates.find(t => t.id === templateId);
                if (selectedTemplate && !title) title = `${selectedTemplate.name} (Cópia)`;
                const newColumns = selectedTemplate ? selectedTemplate.columns.map(colTmpl => saveColumn({ title: colTmpl.name, color: colTmpl.color, cardIds: [] })) : [];
                const newBoardData = { title, icon: selectedTemplate ? selectedTemplate.icon : icon, ownerId: currentUser.id, visibility: document.getElementById('board-visibility').value, columnIds: newColumns.map(c => c.id) };
                savedBoard = saveBoard(newBoardData);
            }

            if (savedBoard) {
                showDialogMessage(confirmationDialog, 'Quadro salvo com sucesso!', 'success');
                showSuccessAndRefresh(dialog, savedBoard.id);
                return true; // Fecha o diálogo de confirmação
            }
            return false; // Mantém o diálogo de confirmação aberto em caso de erro
        }
    );
}

function showColumnDialog(columnId = null) {
    if (!currentBoard) {
        showFloatingMessage('Selecione um quadro antes de adicionar uma coluna.', 'error');
        return;
    }
    const dialog = document.getElementById('column-dialog');
    const column = columnId ? findColumn(columnId) : null;

    dialog.dataset.editingId = columnId;
    document.getElementById('column-title-input').value = column ? column.title : '';
    document.getElementById('column-description').value = column ? column.description || '' : '';
    document.getElementById('column-color-input').value = column ? column.color || '#282828' : '#282828';
    document.getElementById('column-text-color-input').value = column ? column.textColor || '#e0e0e0' : '#e0e0e0';

    dialog.querySelector('.btn-danger').style.display = columnId ? 'inline-block' : 'none';
    dialog.showModal();
}

// Em kanban.js
function handleSaveColumn() {
    const dialog = document.getElementById('column-dialog');
    const title = document.getElementById('column-title-input').value.trim();
    if (!title) {
        showDialogMessage(dialog, 'O nome da coluna é obrigatório.', 'error');
        return;
    }

    showConfirmationDialog(
        'Deseja salvar as alterações nesta coluna?',
        (confirmationDialog) => {
            saveState(); // Salva o estado para o Desfazer
            const columnId = dialog.dataset.editingId;
            const columnData = { title, description: document.getElementById('column-description').value, color: document.getElementById('column-color-input').value };

            if (columnId) {
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
            showDialogMessage(confirmationDialog, 'Coluna salva com sucesso!', 'success');
            showSuccessAndRefresh(dialog, currentBoard.id);
            return true;
        }
    );
}

/**
 * Mostra uma mensagem de sucesso, espera, fecha o diálogo e atualiza a UI.
 * É a função padrão para finalizar operações de salvamento bem-sucedidas.
 * @param {HTMLElement} dialog O diálogo a ser manipulado.
 * @param {string} boardToFocusId O ID do quadro que deve estar em foco após a atualização.
 */
function showSuccessAndRefresh(dialog, boardToFocusId) {
    dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);

    setTimeout(() => {
        // --- LÓGICA DE ATUALIZAÇÃO SEGURA ---
        // 1. Recarrega a lista de quadros do zero para garantir que temos os dados mais recentes.
        // Isso é crucial após criar um novo quadro.

        // Sincroniza TODOS os dados
        const userProfile = getUserProfile(currentUser.id);
        boards = (userProfile.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);

        // Define o quadro atual como o que foi salvo/editado
        currentBoard = boards.find(b => b.id === boardToFocusId) || boards[0];
        if (currentBoard) {
            localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard.id);
        }

        // Renderiza a tela com os dados frescos
        renderBoardSelector();
        renderCurrentBoard();

        // Fecha o diálogo e reabilita os botões
        dialog.close();
        dialog.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }, 1500);
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
    columnSelectGroup.style.display = (currentBoard.columns.length > 1 || !cardId) ? 'flex' : 'none';

    // Popula o select de etiquetas (igual ao do filtro de busca)
    const tagSelect = document.getElementById('card-tags');
    const userTagTemplates = getUserTagTemplates(currentUser.id);
    const systemTagTemplates = getSystemTagTemplates();
    const allTags = new Set();
    userTagTemplates.forEach(t => t.tags.forEach(tag => allTags.add(tag.name)));
    systemTagTemplates.forEach(t => t.tags.forEach(tag => allTags.add(tag.name)));
    
    tagSelect.innerHTML = '';
    [...allTags].sort().forEach(tagName => {
        const option = document.createElement('option');
        option.value = tagName;
        option.textContent = tagName;
        if (card && card.tags?.includes(tagName)) {
            option.selected = true;
        }
        tagSelect.appendChild(option);
    });
    
    // Popula o select "Atribuir a:" com nomes de usuários
    const assigneeSelect = document.getElementById('card-assigned-to');
    assigneeSelect.innerHTML = '<option value="">-- Ninguém --</option>';

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
    } else if (currentBoard.visibility === 'private') {
        // Se for privado, mostra uma mensagem e não adiciona mais ninguém
        const privateMessageOption = document.createElement('option');
        privateMessageOption.disabled = true;
        privateMessageOption.textContent = 'Quadro privado. Mude a visibilidade para atribuir a outros.';
        assigneeSelect.appendChild(privateMessageOption);
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

    dialog.showModal();
}

function handleSaveCard() {
    const title = document.getElementById('card-title-input').value.trim();
    const dialog = document.getElementById('card-dialog');
    if (!title) { showDialogMessage(dialog, 'O título é obrigatório.', 'error'); return; }

    showConfirmationDialog(
        'Deseja salvar as alterações neste cartão?',
        (confirmationDialog) => {
            const previousAssignee = getCard(dialog.dataset.editingId)?.assignedTo;
            saveState(); // Salva o estado para o Desfazer
            const cardId = dialog.dataset.editingId;
            const newColumnId = document.getElementById('card-column-select').value;
            const dateValue = document.getElementById('card-due-date').value;
            const timeValue = document.getElementById('card-due-time').value;
            let combinedDateTime = dateValue ? (timeValue ? `${dateValue}T${timeValue}:00` : `${dateValue}T00:00:00`) : null;
            const cardData = { title, description: document.getElementById('card-description').value.trim(), dueDate: combinedDateTime, tags: Array.from(document.getElementById('card-tags').selectedOptions).map(opt => opt.value), assignedTo: document.getElementById('card-assigned-to').value };

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

            showDialogMessage(confirmationDialog, 'Cartão salvo com sucesso!', 'success');
            showSuccessAndRefresh(dialog, currentBoard.id);
            return true;
        }
    );
}


// ===== LÓGICA DE DRAG-AND-DROP =====

function setupDragAndDrop() {
    const container = document.getElementById('columns-container');
    if (!container) return;

    // Usar delegação de eventos para performance e simplicidade
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('dragend', handleDragEnd);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
}

function handleDragStart(e) {
    // Garante que estamos arrastando um cartão ou coluna
    draggedElement = e.target.closest('.card, .column');
    if (draggedElement) {
        setTimeout(() => draggedElement.classList.add('dragging'), 0);
        e.dataTransfer.effectAllowed = 'move';
    }
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
    }
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedElement) return;

    const isCard = draggedElement.classList.contains('card');
    
    if (isCard) {
        const cardId = draggedElement.dataset.cardId;
        const sourceColumnId = draggedElement.closest('.column').dataset.columnId;
        const targetColumnEl = e.target.closest('.column');
        if (!targetColumnEl) return;
        const targetColumnId = targetColumnEl.dataset.columnId;

        // --- LÓGICA DE MANIPULAÇÃO DE DADOS CORRIGIDA ---
        // 1. Encontra as colunas e o índice original do cartão
        const sourceColumn = currentBoard.columns.find(c => c.id === sourceColumnId);
        const targetColumn = currentBoard.columns.find(c => c.id === targetColumnId);
        if (!sourceColumn || !targetColumn) return;

        const originalCardIndex = sourceColumn.cardIds.indexOf(cardId);
        if (originalCardIndex === -1) return; // Segurança: não encontrou o cartão

        saveState(); // Salva o estado ANTES de qualquer modificação

        // 2. Remove o cartão da coluna de origem (tanto o objeto quanto o ID)
        const [removedCardObject] = sourceColumn.cards.splice(originalCardIndex, 1);
        sourceColumn.cardIds.splice(originalCardIndex, 1);

        // 3. Encontra a nova posição na coluna de destino
        const afterElement = getDragAfterElement(targetColumnEl.querySelector('.cards-container'), e.clientY, false);
        const newIndex = afterElement ? targetColumn.cardIds.indexOf(afterElement.dataset.cardId) : targetColumn.cardIds.length;

        // 4. Adiciona o cartão na nova posição
        targetColumn.cardIds.splice(newIndex, 0, cardId);
        targetColumn.cards.splice(newIndex, 0, removedCardObject);

        // 5. Salva as colunas modificadas no armazenamento
        saveColumn(sourceColumn);
        if (sourceColumnId !== targetColumnId) saveColumn(targetColumn);
    } else {
        saveState(); // Salva o estado para o Desfazer
        const columnId = draggedElement.dataset.columnId;
        const afterElement = getDragAfterElement(document.getElementById('columns-container'), e.clientX, true);
        
        // Reordena os IDs no objeto do quadro
        const oldIndex = currentBoard.columnIds.indexOf(columnId);
        if (oldIndex > -1) currentBoard.columnIds.splice(oldIndex, 1);
        const newIndex = afterElement ? currentBoard.columnIds.indexOf(afterElement.dataset.columnId) : currentBoard.columnIds.length;
        currentBoard.columnIds.splice(newIndex, 0, columnId);

        // Salva o quadro com a nova ordem de colunas
        saveBoard(currentBoard);
    }
    
    renderCurrentBoard();
}

function getDragAfterElement(container, coordinate, isHorizontal) {
    const draggableElements = [...container.querySelectorAll('.card:not(.dragging), .column:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = isHorizontal ? coordinate - box.left - box.width / 2 : coordinate - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- LÓGICA DO MENU DE CONTEXTO (BOTÃO DIREITO) ---

/**
 * Lida com o evento de clique com o botão direito no container das colunas.
 */
function handleContextMenu(e) {
    e.preventDefault();
    closeAllContextMenus(); // Fecha qualquer menu anterior

    const cardEl = e.target.closest('.card');
    const columnHeaderEl = e.target.closest('.column-header');

    if (cardEl) {
        createCardContextMenu(cardEl, e.clientX, e.clientY);
    } else if (columnHeaderEl) {
        createColumnContextMenu(columnHeaderEl.parentElement, e.clientX, e.clientY);
    }
}

/**
 * Cria e exibe o menu de contexto para um cartão.
 */
function createCardContextMenu(cardEl, x, y) {
    const cardId = cardEl.dataset.cardId;
    const { card } = findCardAndColumn(cardId);
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    
    menu.innerHTML = `
        <button data-action="edit">✏️ Editar</button>
        <button data-action="details">ℹ️ Detalhes</button>      
        <button data-action="complete">${card.isComplete ? '⚪ Marcar como Pendente' : '✅ Marcar como Concluído'}</button>
        <hr>
        <button data-action="copy">📋 Copiar Cartão</button>
        <button data-action="cut">✂️ Recortar Cartão</button>
        <hr>
        <button data-action="delete" class="destructive">🗑️ Excluir</button>
    `;
    
    document.body.appendChild(menu);
    positionMenu(menu, x, y);

    // Adiciona listeners para as ações
    menu.querySelector('[data-action="edit"]').onclick = () => showCardDialog(cardId);
    menu.querySelector('[data-action="details"]').onclick = () => showDetailsDialog(cardId);
    menu.querySelector('[data-action="complete"]').onclick = () => toggleCardComplete(cardId);
    menu.querySelector('[data-action="copy"]').onclick = () => handleCopyCard(cardId);
    menu.querySelector('[data-action="cut"]').onclick = () => handleCutCard(cardId);
    menu.querySelector('[data-action="delete"]').onclick = () => handleDeleteCard(cardId);
}

/**
 * Cria e exibe o menu de contexto para uma coluna.
 */
function createColumnContextMenu(columnEl, x, y) {
    const columnId = columnEl.dataset.columnId;
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';

    menu.innerHTML = `
        <button data-action="edit">✏️ Editar</button>
        <button data-action="details">ℹ️ Detalhes</button>
        <button data-action="cut">✂️ Recortar Coluna</button>
        <button data-action="copy">📋 Copiar Coluna</button>
        <hr>
        <button data-action="delete" class="destructive">🗑️ Excluir</button>
    `;
    
    document.body.appendChild(menu);
    positionMenu(menu, x, y);

    // Adiciona listeners para as ações
    menu.querySelector('[data-action="edit"]').onclick = () => showColumnDialog(columnId);
    menu.querySelector('[data-action="details"]').onclick = () => showDetailsDialog(null, columnId);
    menu.querySelector('[data-action="cut"]').onclick = () => handleCutColumn(columnId);
    menu.querySelector('[data-action="copy"]').onclick = () => handleCopyColumn(columnId);
    menu.querySelector('[data-action="delete"]').onclick = () => handleDeleteColumnFromMenu(columnId);
}

/**
 * Fecha todos os menus de contexto abertos.
 */
function closeAllContextMenus() {
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
    document.removeEventListener('click', closeAllContextMenus);
}

/**
 * Posiciona o menu de contexto na tela, garantindo que ele não saia da área visível.
 */
function positionMenu(menu, x, y) {
    const { innerWidth, innerHeight } = window;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    if (x + menu.offsetWidth > innerWidth) {
        menu.style.left = `${innerWidth - menu.offsetWidth - 5}px`;
    }
    if (y + menu.offsetHeight > innerHeight) {
        menu.style.top = `${innerHeight - menu.offsetHeight - 5}px`;
    }

    // Adiciona um listener para fechar o menu ao clicar em qualquer outro lugar
    setTimeout(() => document.addEventListener('click', closeAllContextMenus, { once: true }), 0);
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
        titleEl.textContent = `Detalhes do Cartão: ${card.title}`;
        
        const creator = allUsers.find(u => u.id === card.creatorId);
        const assignee = allUsers.find(u => u.id === card.assignedTo);
        
        let detailsHtml = '<ul>';
        if (creator) detailsHtml += `<li><strong>Criador:</strong> ${creator.name}</li>`;
        if (assignee) detailsHtml += `<li><strong>Atribuído a:</strong> ${assignee.name}</li>`;
        detailsHtml += `<li><strong>Status:</strong> ${card.isComplete ? 'Concluído' : 'Ativo'}</li>`;
        if (card.dueDate) detailsHtml += `<li><strong>Vencimento:</strong> ${new Date(card.dueDate).toLocaleString('pt-BR')}</li>`;
        if (card.tags && card.tags.length > 0) detailsHtml += `<li><strong>Etiquetas:</strong> ${card.tags.join(', ')}</li>`;
        if (card.description) detailsHtml += `<li><strong>Descrição:</strong><p>${card.description.replace(/\n/g, '<br>')}</p></li>`;
        detailsHtml += '</ul>';
        
        contentEl.innerHTML = detailsHtml;

    } else if (columnId) {
        const column = findColumn(columnId);
        titleEl.textContent = `Detalhes da Coluna: ${column.title}`;
        
        let detailsHtml = '<ul>';
        if (column.description) detailsHtml += `<li><strong>Descrição/Instrução:</strong><p>${column.description.replace(/\n/g, '<br>')}</p></li>`;
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
        'Tem certeza que deseja excluir esta coluna e todos os seus cartões?',
        (confirmationDialog) => {
            saveState(); // Salva o estado para o Desfazer
            const boardData = getBoard(currentBoard.id);
            boardData.columnIds = boardData.columnIds.filter(id => id !== columnId);
            saveBoard(boardData);
            deleteColumn(columnId); // Deleta a coluna e seus cartões
            currentBoard = getFullBoardData(currentBoard.id);
            renderCurrentBoard();
            showDialogMessage(confirmationDialog, 'Coluna excluída com sucesso.', 'success');
            return true;
        },
        null,
        'Sim, Excluir',
        'Não'
    );
}

function toggleCardComplete(cardId) {
    saveState(); // Salva o estado para o Desfazer
    const { card } = findCardAndColumn(cardId);
    if (card) {
        card.isComplete = !card.isComplete;
        saveCard(card); // Salva a alteração no armazenamento
        renderCurrentBoard(); // Redesenha a tela para refletir a mudança
    }
}

function handleDeleteBoard() {
    if (!currentBoard) return;
    showConfirmationDialog(
        `Tem certeza de que deseja excluir o quadro "${currentBoard.title}"?`,
        (dialog) => {
            // Não salva estado para o Desfazer, pois é uma ação destrutiva maior
            undoStack = [];
            redoStack = [];
            deleteBoard(currentBoard.id);
            const userProfile = getUserProfile(currentUser.id);
            boards = (userProfile.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
            currentBoard = boards[0] || null;
            localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : null);
            renderBoardSelector();
            renderCurrentBoard();
            showDialogMessage(dialog, 'Quadro excluído com sucesso.', 'success');
            return true;
        },
        null,
        'Sim, Excluir',
        'Não'
    );
}

function handleDeleteColumn(columnId) {
    if (!columnId) return;

    showConfirmationDialog(
        'Tem certeza que deseja excluir esta coluna e todos os seus cartões?',
        (confirmationDialog) => {
            saveState(); // Salva o estado para o Desfazer
            const boardData = getBoard(currentBoard.id);
            boardData.columnIds = boardData.columnIds.filter(id => id !== columnId);
            saveBoard(boardData);
            deleteColumn(columnId); // Deleta a coluna e seus cartões
            currentBoard = getFullBoardData(currentBoard.id);
            renderCurrentBoard();
            document.getElementById('column-dialog').close(); // Close the original column dialog
            showDialogMessage(confirmationDialog, 'Coluna excluída com sucesso.', 'success');
            return true;
        },
        null,
        'Sim, Excluir',
        'Não'
    );
}

function handleDeleteCard(cardId) {
    showConfirmationDialog(
        'Tem certeza que deseja excluir este cartão?',
        (dialog) => {
            saveState(); // Salva o estado para o Desfazer
            const columnData = getColumn(currentBoard.columns.find(c => c.cardIds.includes(cardId)).id);
            columnData.cardIds = columnData.cardIds.filter(id => id !== cardId);
            saveColumn(columnData);
            deleteCard(cardId);
            currentBoard = getFullBoardData(currentBoard.id);
            renderCurrentBoard();
            showDialogMessage(dialog, 'Cartão excluído.', 'success');
            return true;
        },
        null,
        'Sim, Excluir',
        'Não'
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
        showFloatingMessage('Nada para desfazer.', 'info');
        return;
    }
    const lastState = undoStack.pop();
    redoStack.push(lastState);
    
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
        showFloatingMessage('Nada para refazer.', 'info');
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

// Adicione esta função se ela não existir, ou substitua a antiga
async function saveBoardAsTemplate() {
    if (!currentBoard) {
        showFloatingMessage('Nenhum quadro selecionado para salvar como template.', 'warning');
        return;
    }

    // Usa um diálogo customizado em vez do prompt nativo
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Salvar Quadro como Template</h3>
        <div class="form-group">
            <label for="template-name-input">Nome do Template:</label>
            <input type="text" id="template-name-input" value="${currentBoard.title} (Template)">
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
            showDialogMessage(dialog, 'O nome do template é obrigatório.', 'error');
            return;
        }

        const existingTemplates = getUserBoardTemplates(currentUser.id);
        if (existingTemplates.some(t => t.name.toLowerCase() === templateName.toLowerCase())) {
            showDialogMessage(dialog, 'Já existe um template com este nome.', 'error');
            return;
        }

        const newTemplate = {
            id: 'user-board-' + Date.now(),
            name: templateName,
            icon: currentBoard.icon || '📋',
            description: `Template criado a partir do quadro '${currentBoard.title}'.`,
            columns: currentBoard.columns.map(col => ({ name: col.title, color: col.color }))
        };

        existingTemplates.push(newTemplate);
        saveUserBoardTemplates(currentUser.id, existingTemplates);

        showDialogMessage(dialog, `Template '${newTemplate.name}' salvo com sucesso!`, 'success');
        setTimeout(() => dialog.close(), 1500);
    });
}

//Preferências

function showPreferencesDialog() {
    const dialog = document.getElementById('preferences-dialog');
    const user = getCurrentUser();
    // O cloneNode é uma forma de garantir que os listeners antigos sejam removidos.
    // É uma abordagem válida, embora a remoção manual de listeners seja mais "limpa".
    const newDialog = dialog.cloneNode(true);
    dialog.parentNode.replaceChild(newDialog, dialog);

    // Salvar os valores originais para a função "Cancelar"
    originalKanbanTheme = user.theme || 'auto';
    originalKanbanFont = user.preferences?.fontFamily || 'Segoe UI';
    originalKanbanFontSize = user.preferences?.fontSize || 'medium';
    originalShowTitle = user.preferences?.showBoardTitle !== false;
    originalShowIcon = user.preferences?.showBoardIcon !== false;
    originalShowTags = user.preferences?.showTags !== false;
    originalShowDate = user.preferences?.showDate !== false;
    originalShowStatus = user.preferences?.showStatus !== false;
    originalShowCardDetails = user.preferences?.showCardDetails !== false;
    originalShowAssignment = user.preferences?.showAssignment !== false;

    // Preencher o diálogo com os valores atuais do usuário
    newDialog.querySelector('#pref-theme').value = originalKanbanTheme;
    newDialog.querySelector('#pref-language').value = user.language || 'pt-BR';
    newDialog.querySelector('#pref-font-family').value = originalKanbanFont;
    newDialog.querySelector('#pref-font-size').value = originalKanbanFontSize;
    newDialog.querySelector('#pref-show-tags').checked = user.preferences?.showTags !== false;
    newDialog.querySelector('#pref-show-date').checked = user.preferences?.showDate !== false;
    newDialog.querySelector('#pref-show-status').checked = user.preferences?.showStatus !== false;
    newDialog.querySelector('#pref-show-assignment').checked = user.preferences?.showAssignment !== false;
    newDialog.querySelector('#pref-show-assignment').checked = user.preferences?.showAssignment !== false;
    newDialog.querySelector('#pref-show-card-details').checked = user.preferences?.showCardDetails !== false;
    newDialog.querySelector('#pref-show-icon').checked = user.preferences?.showBoardIcon !== false;
    newDialog.querySelector('#pref-show-title').checked = user.preferences?.showBoardTitle !== false;
    populateTagTemplatesSelect(user.preferences?.defaultTagTemplateId);

    kanbanIsSaved = true; // Reseta o estado de salvamento ao abrir

    // --- Lógica de Cancelamento Centralizada ---
    const handleCancel = () => {
        if (!kanbanIsSaved) {
            showConfirmationDialog(
                'Descartar alterações não salvas?',
                (confirmDialog) => { // onConfirm (Descartar)
                    restoreKanbanOriginalSettings();
                    showDialogMessage(confirmDialog, 'Alterações descartadas.', 'info');
                    newDialog.close();
                    return true; // Fecha o diálogo de confirmação
                },
                (confirmDialog) => { // onCancel (Continuar editando)
                    showDialogMessage(confirmDialog, 'Continue editando...', 'info');
                    return true; // Fecha apenas a confirmação
                },
                'Sim, Descartar',
                'Não'
            );
        } else {
            newDialog.close(); // Fecha sem perguntar se nada mudou
        }
    };

    // --- Anexar Eventos ---

    // Botão Salvar
    newDialog.querySelector('#pref-save-btn').addEventListener('click', () => {
        showConfirmationDialog(
            'Deseja salvar as alterações feitas nas preferências?',
            (confirmDialog) => { // onConfirm (Salvar)
                if (savePreferences()) {
                    showDialogMessage(confirmDialog, 'Preferências salvas com sucesso!', 'success');
                    newDialog.close();
                    return true;
                } else {
                    showDialogMessage(confirmDialog, 'Erro ao salvar as preferências.', 'error');
                    return false; // Mantém o diálogo de confirmação aberto
                }
            },
            (confirmDialog) => { // onCancel (Não salvar ainda)
                showDialogMessage(confirmDialog, 'Continue editando...', 'info');
                return true; // Fecha apenas a confirmação
            },
            'Sim, Salvar',
            'Não'
        );
    });

    // Botão Cancelar
    newDialog.querySelector('#pref-cancel-btn').addEventListener('click', handleCancel);

    // Evento 'cancel' (disparado pela tecla ESC)
    newDialog.addEventListener('cancel', (e) => {
        e.preventDefault(); // Impede o fechamento automático do diálogo
        handleCancel();     // Executa nossa lógica de confirmação
    });

    // Evento de clique no backdrop (fundo)
    newDialog.addEventListener('click', (e) => {
        if (e.target === newDialog) {
            handleCancel();
        }
    });

    // Listeners que marcam o estado como "não salvo" e aplicam preview
    const fieldsToTrack = [
        { id: 'pref-theme', action: (e) => applyThemeFromSelect(e.target.value) },
        { id: 'pref-font-family', action: (e) => applyFontFamily(e.target.value) },
        { id: 'pref-font-size', action: (e) => applyFontSize(e.target.value, true) },
        { id: 'pref-language', action: null },
        { id: 'pref-default-tag-template', action: null },
        { id: 'pref-show-tags', action: () => applyCardPreview() },
        { id: 'pref-show-date', action: () => applyCardPreview() },
        { id: 'pref-show-status', action: () => applyCardPreview() },
        { id: 'pref-show-card-details', action: () => applyCardPreview() },
        { id: 'pref-show-card-details', action: () => applyCardPreview() },
        { id: 'pref-show-assignment', action: () => applyCardPreview() },
        { id: 'pref-show-title', action: () => applyTitlePreview() },
        { id: 'pref-show-icon', action: () => applyTitlePreview() }
    ];

    fieldsToTrack.forEach(field => {
        const element = newDialog.querySelector(`#${field.id}`);
        if (element) {
            element.addEventListener('change', (e) => {
                kanbanIsSaved = false;
                if (field.action) {
                    field.action(e);
                }
            });
        }
    });

    newDialog.showModal();
}

function restoreKanbanOriginalSettings() {
    applyThemeFromSelect(originalKanbanTheme);
    applyFontFamily(originalKanbanFont);
    applyFontSize(originalKanbanFontSize, true);

    // Restaura as preferências de visualização dos cartões
    currentUser.preferences.showTags = originalShowTags;
    currentUser.preferences.showDate = originalShowDate;
    currentUser.preferences.showStatus = originalShowStatus;
    currentUser.preferences.showCardDetails = originalShowCardDetails;
    currentUser.preferences.showAssignment = originalShowAssignment;
    renderCurrentBoard(); // Redesenha para aplicar

    // Restaura a visibilidade original do título e do ícone
    const titleElement = document.getElementById('kanban-title');
    if (!titleElement || !currentBoard) return;

    const iconHtml = originalShowIcon ? `<span class="board-icon">${currentBoard.icon || '📋'}</span>` : '';
    const titleHtml = originalShowTitle ? `<span class="board-title-text">${currentBoard.title}</span>` : '';

    titleElement.innerHTML = `${iconHtml}${titleHtml}`.trim();
    titleElement.style.display = (originalShowTitle || originalShowIcon) ? 'block' : 'none';
}

function savePreferences() {
    const dialog = document.getElementById('preferences-dialog');
    const user = getCurrentUser();
    
    const updatedUser = {
        ...user,
        theme: document.getElementById('pref-theme').value,
        language: document.getElementById('pref-language').value,
        preferences: {
            ...user.preferences,
            fontFamily: document.getElementById('pref-font-family').value,
            fontSize: document.getElementById('pref-font-size').value,
            showTags: document.getElementById('pref-show-tags').checked,
            showDate: document.getElementById('pref-show-date').checked,
            showStatus: document.getElementById('pref-show-status').checked,
            showAssignment: document.getElementById('pref-show-assignment').checked,
            showAssignment: document.getElementById('pref-show-assignment').checked,
            defaultTagTemplateId: document.getElementById('pref-default-tag-template').value,
            showBoardIcon: document.getElementById('pref-show-icon').checked,
            showBoardTitle: document.getElementById('pref-show-title').checked,
            showCardDetails: document.getElementById('pref-show-card-details').checked
        }
    };

    if (updateUser(user.id, updatedUser)) {
        // Atualizar os valores originais
        originalKanbanTheme = updatedUser.theme;
        originalKanbanFont = updatedUser.preferences.fontFamily;
        originalKanbanFontSize = updatedUser.preferences.fontSize;
        
        kanbanIsSaved = true;
        applyUserPreferences();
        return true;
    } else {
        return false;
    }
}

function populateTagTemplatesSelect(selectedId = null) {
    const select = document.getElementById('pref-default-tag-template');
    if (!select) return;
    
    select.innerHTML = '<option value="">Nenhum (usar padrão do sistema)</option>';
    
    const userTagTemplates = getUserTagTemplates(currentUser.id);
    const systemTagTemplates = getSystemTagTemplates();
    
    // Adicionar templates do usuário
    if (userTagTemplates.length > 0) {
        const optgroupUser = document.createElement('optgroup');
        optgroupUser.label = 'Meus Conjuntos';
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
        optgroupSystem.label = 'Sistema';
        systemTagTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            if (template.id === selectedId) option.selected = true;
            optgroupSystem.appendChild(option);
        });
        select.appendChild(optgroupSystem);
    }
}

function applyUserPreferences() {
    const user = getCurrentUser();
    if (!user) return;

    // Aplicar tema
    applyUserTheme();

    // Aplicar fonte
    applyFontFamily(user.preferences?.fontFamily || 'Segoe UI');
    
    // Aplicar tamanho da fonte
    applyFontSize(user.preferences?.fontSize || 'medium');

    // Aplicar opções de exibição (podem ser usadas ao renderizar os cartões)
    // Nota: A renderização dos cartões pode precisar ser atualizada
    renderCurrentBoard();

    // Aplica a preferência de esconder o título
    const titleElement = document.getElementById('kanban-title');
    const iconSpan = titleElement.querySelector('.board-icon');
    const titleSpan = titleElement.querySelector('.board-title-text');
    if (iconSpan) iconSpan.style.display = user.preferences?.showBoardIcon === false ? 'none' : 'inline';
    if (titleSpan) titleSpan.style.display = user.preferences?.showBoardTitle === false ? 'none' : 'inline';
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

function applyFontSize(size, isPreview = false) { // Parâmetro isPreview adicionado
    let fontSize;
    switch (size) {
        case 'small': fontSize = '11px'; break;
        case 'large': fontSize = '19px'; break;
        case 'x-large': fontSize = '23px'; break;
        default: fontSize = '15px';
    }
    // Aplica ao documento inteiro
    document.documentElement.style.fontSize = fontSize;
    
    // Salva a preferência apenas se não for uma pré-visualização
    if (!isPreview) {
        const currentUser = getCurrentUser();
        if (currentUser) {
            updateUser(currentUser.id, { 
                preferences: {
                    ...(currentUser.preferences || {}),
                    fontSize: size
                }
            });
        }
    }
}

function handleCutColumn(columnId) {
    const column = findColumn(columnId);
    if (column) {
        saveState(); // Salva o estado antes de recortar
        clipboard = {
            type: 'cut_column',
            data: JSON.parse(JSON.stringify(column)) // Guarda uma cópia dos dados
        };

        // Remove a coluna do quadro atual
        currentBoard.columns = currentBoard.columns.filter(c => c.id !== columnId);
        currentBoard.columnIds = currentBoard.columnIds.filter(id => id !== columnId);
        saveBoard(currentBoard);
        renderCurrentBoard();
        showFloatingMessage('Coluna recortada!', 'info');
    }
}

function handleCutCard(cardId) {
    const { card, column } = findCardAndColumn(cardId);
    if (card && column) {
        saveState(); // Salva o estado antes de recortar
        clipboard = {
            type: 'cut_card',
            data: JSON.parse(JSON.stringify(card)), // Guarda uma cópia dos dados
            sourceColumnId: column.id
        };

        // Remove o cartão da coluna de origem
        const cardIndex = column.cardIds.indexOf(cardId);
        if (cardIndex > -1) {
            column.cardIds.splice(cardIndex, 1);
            column.cards.splice(cardIndex, 1);
        }
        
        saveColumn(column);
        renderCurrentBoard();
        showFloatingMessage('Cartão recortado!', 'info');
        updatePasteCardButtons(true);
    }
}

// ===== LÓGICA DE COPIAR E COLAR =====

function handleCopyCard(cardId) {
    const { card, column } = findCardAndColumn(cardId);
    if (card && column) {
        clipboard = {
            type: 'card',
            data: JSON.parse(JSON.stringify(card)), // Deep copy
            sourceColumnId: column.id
        };
        showFloatingMessage('Cartão copiado!', 'info');
        updatePasteCardButtons(true);
    }
}

function handleCopyColumn(columnId) {
    const column = findColumn(columnId);
    if (column) {
        clipboard = {
            type: 'column',
            data: JSON.parse(JSON.stringify(column)) // Deep copy
        };
        showFloatingMessage('Coluna copiada!', 'info');
        updatePasteCardButtons(false); // Esconde botões de colar cartão
    }
}

function handlePaste() {
    if (!clipboard) return;

    if (clipboard.type === 'card' || clipboard.type === 'cut_card') {
        // Cola o cartão na mesma coluna de onde foi copiado
        handlePasteCard(clipboard.sourceColumnId);
    } else if (clipboard.type === 'column' || clipboard.type === 'cut_column') {
        handlePasteColumn();
    }
}

function handlePasteCard(targetColumnId) {
    if (!clipboard || (clipboard.type !== 'card' && clipboard.type !== 'cut_card')) return;

    saveState();
    const targetColumn = currentBoard.columns.find(c => c.id === targetColumnId);
    if (!targetColumn) return;

    let newCardData;
    let message;

    if (clipboard.type === 'card') {
        newCardData = { ...clipboard.data, id: `card-${Date.now()}` };
        newCardData.title = `${newCardData.title} (Cópia)`;
        message = 'Cartão colado!';
    } else { // 'cut_card'
        newCardData = { ...clipboard.data }; // Usa os dados originais
        message = 'Cartão movido!';
    }
    
    const savedCard = saveCard(newCardData);
    targetColumn.cards.push(savedCard);
    targetColumn.cardIds.push(savedCard.id);
    saveColumn(targetColumn);

    clipboard = null; // Limpa a área de transferência
    updatePasteCardButtons(false); // Esconde os botões de colar

    renderCurrentBoard();
    showFloatingMessage(message, 'success');
}

function handlePasteColumn() {
    if (!clipboard || (clipboard.type !== 'column' && clipboard.type !== 'cut_column')) return;

    saveState();
    const newColumnData = JSON.parse(JSON.stringify(clipboard.data)); // Deep copy
    let message;

    // Copia os cartões, criando novos IDs para cada um
    if (clipboard.type === 'column') {
        newColumnData.id = `column-${Date.now()}`;
        newColumnData.title = `${newColumnData.title} (Cópia)`;
        message = 'Coluna copiada!';

        const newCards = newColumnData.cards.map(card => {
            const newCard = { ...card, id: `card-${Date.now()}-${Math.random()}` };
            saveCard(newCard);
            return newCard;
        });
        newColumnData.cards = newCards;
        newColumnData.cardIds = newCards.map(c => c.id);
    } else { // 'cut_column'
        // Não precisa mudar ID nem título. Os cartões já existem.
        message = 'Coluna movida!';
    }

    clipboard = null; // Limpa a área de transferência
    updatePasteCardButtons(false);

    const savedColumn = saveColumn(newColumnData);
    currentBoard.columns.push(savedColumn);
    currentBoard.columnIds.push(savedColumn.id);
    saveBoard(currentBoard);

    renderCurrentBoard();
    showFloatingMessage(message, 'success');
}

function updatePasteCardButtons(show) {
    document.querySelectorAll('.paste-card-btn').forEach(btn => {
        btn.style.display = show ? 'inline-block' : 'none';
    });
}

// ===== LÓGICA DE EXPORTAÇÃO E IMPRESSÃO =====

function handleExportImage() {
    showFloatingMessage('Preparando imagem para exportação...', 'info');
    const boardArea = document.getElementById('main-area');
    
    // Para esta função funcionar, a biblioteca html2canvas precisa ser importada no seu HTML:
    // <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    if (typeof html2canvas === 'undefined') {
        showFloatingMessage('Erro: Biblioteca html2canvas não encontrada.', 'error');
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
        showFloatingMessage('Falha ao exportar imagem.', 'error');
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
                <title>Imprimir Quadro - ${boardTitle}</title>
                <style>
                    body { 
                        font-family: Segoe UI, sans-serif; 
                        background-color: white !important; /* Força fundo branco */
                        color: black; 
                        -webkit-print-color-adjust: exact; /* Força impressão de cores de fundo */
                        color-adjust: exact; /* Padrão */
                    }
                    #main-area { padding: 20px; }
                    #kanban-title { text-align: center; font-size: 24px; margin-bottom: 20px; color: black; }
                    #columns-container { display: flex; gap: 15px; overflow-x: auto; }
                    .column { 
                        border: 1px solid #ccc; 
                        border-radius: 8px; 
                        width: 300px; 
                        background-color: #f0f0f0; /* Fundo base da coluna, caso a cor não seja aplicada */
                        page-break-inside: avoid; 
                        vertical-align: top;
                        display: inline-block;
                    }
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
                <div class="print-footer">Impresso por: ${userName} em ${printDate}</div>
            </body>
        </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500); // Delay para garantir que o conteúdo seja renderizado
}

// Modifique a função applyUserTheme para aplicar o tema imediatamente
function applyUserTheme() {
    const user = getCurrentUser();
    if (!user) return;

    const theme = user.theme || 'auto';
    const systemTheme = localStorage.getItem('appTheme') || 'dark';
    
    document.body.classList.remove('light-mode', 'dark-mode');

    if (theme === 'light') {
        document.body.classList.add('light-mode');
    } else if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        // Modo automático
        if (systemTheme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.add('dark-mode');
        }
    }
}

function applyTitlePreview() {
    const titleElement = document.getElementById('kanban-title');
    if (!titleElement || !currentBoard) return;

    // O diálogo é clonado, então precisamos pegar o que está atualmente no DOM.
    const dialog = document.querySelector('#preferences-dialog');
    
    const showTitle = dialog.querySelector('#pref-show-title').checked;
    const showIcon = dialog.querySelector('#pref-show-icon').checked;

    const iconHtml = showIcon ? `<span class="board-icon">${currentBoard.icon || '📋'}</span>` : '';
    const titleHtml = showTitle ? `<span class="board-title-text">${currentBoard.title}</span>` : '';

    titleElement.innerHTML = `${iconHtml}${titleHtml}`.trim();
    titleElement.style.display = (showTitle || showIcon) ? 'block' : 'none';
}

function applyCardPreview() {
    const dialog = document.querySelector('#preferences-dialog');
    if (!dialog) return;

    // Atualiza o objeto de preferências do usuário em memória (temporariamente)
    // para que a função renderCurrentBoard use os valores de preview.
    currentUser.preferences.showTags = dialog.querySelector('#pref-show-tags').checked;
    currentUser.preferences.showDate = dialog.querySelector('#pref-show-date').checked;
    currentUser.preferences.showStatus = dialog.querySelector('#pref-show-status').checked;
    currentUser.preferences.showAssignment = dialog.querySelector('#pref-show-assignment').checked;
    currentUser.preferences.showAssignment = dialog.querySelector('#pref-show-assignment').checked;
    currentUser.preferences.showCardDetails = dialog.querySelector('#pref-show-card-details').checked;
    currentUser.preferences.showAssignment = dialog.querySelector('#pref-show-assignment').checked;

    // Simplesmente redesenha o quadro. A função createCardElement já
    // contém a lógica para mostrar/esconder os elementos com base nessas preferências.
    renderCurrentBoard();
}

function showIconPickerDialog(callback) {
    const dialog = document.getElementById('icon-picker-dialog');
    if (!dialog) return;

    // Garante que o diálogo está limpo de listeners antigos
    const newDialog = dialog.cloneNode(true);
    dialog.parentNode.replaceChild(newDialog, dialog);

    const iconGrid = newDialog.querySelector('#icon-grid');
    iconGrid.innerHTML = '';

    ICON_LIBRARY.forEach(icon => {
        const iconBtn = document.createElement('button');
        iconBtn.className = 'icon-picker-btn';
        iconBtn.textContent = icon;
        iconBtn.onclick = () => {
            callback(icon);
            newDialog.close();
        };
        iconGrid.appendChild(iconBtn);
    });

    newDialog.showModal();
    newDialog.querySelector('#close-icon-picker-btn').onclick = () => newDialog.close();
}

function confirmExit() {
    // Usa a sua função showConfirmationDialog que já funciona
    showConfirmationDialog(
        'Tem certeza que deseja fechar o aplicativo?',
        (dialog) => { // onConfirm
            showDialogMessage(dialog, 'Fechando...', 'info');
            setTimeout(() => window.close(), 1000);
            return true;
        },
        (dialog) => { // onCancel
            showDialogMessage(dialog, 'Operação cancelada.', 'info');
            return true; // Retorna true para fechar o diálogo de confirmação
        },
        'Sim, Sair',
        'Não'
    );
}
function applyThemeFromSelect(themeValue) {
    document.body.classList.remove('light-mode', 'dark-mode');
    
    if (themeValue === 'light') {
        document.body.classList.add('light-mode');
    } else if (themeValue === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        const systemTheme = localStorage.getItem('appTheme') || 'dark';
        if (systemTheme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.add('dark-mode');
        }
    }
}
