// js/kanban.js - VERSÃO REFATORADA E FINAL

import { getCurrentUser, updateUser } from './auth.js';
import { 
    getUserProfile, getFullBoardData, getBoard, saveBoard, deleteBoard, 
    getColumn, saveColumn, getCard, saveCard, deleteCard,
    getAllUsers, getAllGroups, getSystemBoardTemplates, getUserBoardTemplates, 
    getSystemTagTemplates, getUserTagTemplates, saveUserBoardTemplates
} from './storage.js';
import { showFloatingMessage, initDraggableElements, updateUserAvatar, initUIControls } from './ui-controls.js';

// ===== ESTADO GLOBAL DO MÓDULO =====
let currentUser = null;
let allUsers = [];
let boards = [];
let currentBoard = null;
let draggedElement = null;
let undoStack = [];
let redoStack = [];
let tagColorMap = new Map();
let originalKanbanTheme = null;
let originalKanbanFont = null;
let originalKanbanFontSize = null;
let originalShowTitle = null;
let originalShowIcon = null;
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
    document.getElementById('column-delete-btn')?.addEventListener('click', handleDeleteColumn);
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

// ===== LÓGICA DE PREFERÊNCIAS - CÓDIGO CORRIGIDO =====

document.getElementById('preferences-btn')?.addEventListener('click', showPreferencesDialog);

// ===== LÓGICA DE RENDERIZAÇÃO =====

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

    currentBoard.columns.forEach(column => {
        const columnEl = createColumnElement(column);
        columnsContainer.appendChild(columnEl);
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
        </div>
        <div class="cards-container" data-column-id="${column.id}">
            ${column.cards.map(card => createCardElement(card).outerHTML).join('')}
        </div>
        <button class="add-card-btn">+ Adicionar Cartão</button>
    `;

    columnEl.querySelector('.add-card-btn').addEventListener('click', () => {
        showCardDialog(null, column.id);
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

    // Constrói o HTML do hover-info
    const creator = allUsers.find(u => u.id === card.creatorId);
    const assignee = allUsers.find(u => u.id === card.assignedTo);
    const hoverInfoHtml = `
        <div class="card-hover-info">
            <p><strong>Descrição:</strong> ${card.description || 'Nenhuma'}</p>
            ${creator ? `<p><strong>Criador:</strong> ${creator.name}</p>` : ''}
            ${assignee ? `<p><strong>Atribuído a:</strong> ${assignee.name}</p>` : ''}
        </div>
    `;

    cardEl.innerHTML = `
        <div class="card-content">
            <div class="card-top-details">
                ${dueDateHtml}
                ${statusBoxHtml}
            </div>
            <p class="card-title">${card.title}</p>
            ${tagLineHtml}
        </div>
        ${hoverInfoHtml}
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
        <div class="drag-handle" style="cursor: move; padding: 10px; color: white;">
            <h3 style="margin: 0;">🔍 Buscar Usuários</h3>
        </div>
        <div style="padding: 20px;">
            <input type="text" id="user-search-input" placeholder="Digite o nome do usuário..." 
                          border-radius: 6px; background-color: var(--bg-page); color: var(--text);">
            <div id="user-search-results" style="max-height: 300px; overflow-y: auto;"></div>
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
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) closeUserSearchDialog();
    });
    const handleEscPress = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closeUserSearchDialog();
        }
    };
    dialog.addEventListener('keydown', handleEscPress);
    dialog.addEventListener('close', () => dialog.removeEventListener('keydown', handleEscPress));

    const searchInput = document.getElementById('user-search-input');
    searchInput.focus();

    // Buscar usuários localmente, excluindo o usuário atual
    const localUsers = getAllUsers().filter(user => user.id !== currentUser.id);
    displayUserResults(localUsers);

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredUsers = localUsers.filter(user => 
            user.name.toLowerCase().includes(searchTerm) ||
            user.username.toLowerCase().includes(searchTerm)
        );
        displayUserResults(filteredUsers);
    });

    // Corrigir o event listener do botão fechar
    document.getElementById('user-search-close').addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que o evento feche o dropdown
        dialog.close();
        dialog.remove();
    });

    // Fechar ao clicar fora do diálogo
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            dialog.close();
            dialog.remove();
        }
    });
}

// Função para exibir resultados de usuários
function displayUserResults(users) {
    const resultsContainer = document.getElementById('user-search-results');
    resultsContainer.innerHTML = '';

    if (users.length === 0) {
        resultsContainer.innerHTML = '<p style="text-align: center; padding: 20px;">Nenhum usuário encontrado</p>';
        return;
    }

    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'user-result-item';
        userEl.style.padding = '10px';
        userEl.style.borderBottom = '1px solid #eee';
        userEl.style.cursor = 'pointer';
        userEl.style.display = 'flex';
        userEl.style.alignItems = 'center';
        userEl.style.gap = '10px';

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

        if (user.avatar) {
            avatarEl.innerHTML = `<img src="${user.avatar}" alt="${user.name}" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            avatarEl.textContent = user.name.charAt(0).toUpperCase();
        }

        // Informações do usuário
        const infoEl = document.createElement('div');
        infoEl.innerHTML = `
            <div style="font-weight: bold;">${user.name}</div>
            <div style="font-size: 0.9em; color: #666;">@${user.username}</div>
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

function getAllUniqueTags() {
    const tagSet = new Set();
    boards.forEach(board => {
        board.columns.forEach(column => {
            column.cards.forEach(card => {
                card.tags?.forEach(tag => tagSet.add(tag));
            });
        });
    });
    return [...tagSet];
}

function showSearchDialog() {
    const dialog = document.getElementById('search-dialog');
    
    // Coletar todos os cartões acessíveis pelo usuário
    const allAccessibleCards = getAllAccessibleCards();
    
    if (allAccessibleCards.length === 0) {
        showFloatingMessage('Não existe cartões para este usuário', 'info');
        return;
    }
    const creatorSelect = document.getElementById('search-creator');
    const assigneeSelect = document.getElementById('search-assignee'); // <-- Pega a referência do novo select
    const tagSelect = document.getElementById('search-tags');

    // --- Pega a lista de todos os usuários relevantes (você + membros de grupos) ---
    const allGroups = getAllGroups();
    const userGroups = allGroups.filter(g => g.members.includes(currentUser.id));
    const memberIds = new Set([currentUser.id]); // Começa com o próprio usuário
    userGroups.forEach(g => g.members.forEach(id => memberIds.add(id)));
    
    // --- Popula o select "Por Criador" ---
    creatorSelect.innerHTML = '<option value="">Qualquer um</option>';
    memberIds.forEach(id => {
        const user = allUsers.find(u => u.id === id);
        if (user) {
            creatorSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
        }
    });

    // --- Popula o select "Atribuído a" (LÓGICA ADICIONADA) ---
    assigneeSelect.innerHTML = '<option value="">Qualquer um</option>';
    memberIds.forEach(id => {
        const user = allUsers.find(u => u.id === id);
        if (user) {
            assigneeSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
        }
    });

    // --- Popula o select "Etiqueta" (lógica mantida) ---
    const userTagTemplates = getUserTagTemplates(currentUser.id);
    const systemTagTemplates = getSystemTagTemplates();
    const userTags = new Set();
    userTagTemplates.forEach(t => t.tags.forEach(tag => userTags.add(tag.name)));
    const systemTags = new Set();
    systemTagTemplates.forEach(t => t.tags.forEach(tag => systemTags.add(tag.name)));
    tagSelect.innerHTML = '<option value="">Todas</option>';
    [...userTags].sort().forEach(tag => {
        tagSelect.innerHTML += `<option value="${tag}">${tag}</option>`;
    });
    [...systemTags].sort().forEach(tag => {
        if (!userTags.has(tag)) {
            tagSelect.innerHTML += `<option value="${tag}">${tag}</option>`;
        }
    });

    // Anexa os listeners dos botões
    document.getElementById('search-apply-btn').onclick = applySearchFilters;
    document.getElementById('search-reset-btn').onclick = resetSearchFilters;
    document.getElementById('search-cancel-btn').onclick = () => dialog.close();

        const closeSearchDialog = () => {
        newDialog.close();
    };

    // Botão Cancelar/Fechar
    newDialog.querySelector('#search-cancel-btn').addEventListener('click', closeSearchDialog);
    // Outros botões que fecham
    newDialog.querySelector('#search-apply-btn').addEventListener('click', () => { applySearchFilters(); closeSearchDialog(); });
    newDialog.querySelector('#search-reset-btn').addEventListener('click', () => { resetSearchFilters(); closeSearchDialog(); });

    // Clicar Fora (no backdrop)
    newDialog.addEventListener('click', (e) => {
        if (e.target === newDialog) closeSearchDialog();
    });
    
    // Pressionar ESC
    const handleEscPress = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closeSearchDialog();
        }
    };
    newDialog.addEventListener('keydown', handleEscPress);
    newDialog.addEventListener('close', () => newDialog.removeEventListener('keydown', handleEscPress));
    
    dialog.showModal();
}

function getAllAccessibleCards() {
    const allCards = [];
    
    // 1. Cartões dos boards do usuário
    boards.forEach(board => {
        board.columns.forEach(column => {
            column.cards.forEach(card => {
                allCards.push({
                    ...card,
                    boardId: board.id,
                    boardTitle: board.title,
                    columnId: column.id,
                    columnTitle: column.title
                });
            });
        });
    });
    
    // 2. Cartões dos boards de grupos que o usu participa
    const userGroups = getAllGroups().filter(group => 
        group.memberIds && group.memberIds.includes(currentUser.id)
    );
    
    userGroups.forEach(group => {
        if (group.boardIds) {
            group.boardIds.forEach(boardId => {
                const board = getFullBoardData(boardId);
                if (board) {
                    board.columns.forEach(column => {
                        column.cards.forEach(card => {
                            allCards.push({
                                ...card,
                                boardId: board.id,
                                boardTitle: board.title,
                                columnId: column.id,
                                columnTitle: column.title,
                                groupId: group.id,
                                groupName: group.name
                            });
                        });
                    });
                }
            });
        }
    });
    
    return allCards;
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
    
    const allAccessibleCards = getAllAccessibleCards();
    const filteredCards = allAccessibleCards.filter(card => {
        let isMatch = true;

        // Filtro por Texto
        if (filters.text && !(card.title.toLowerCase().includes(filters.text) || card.description?.toLowerCase().includes(filters.text))) {
            isVisible = false;
        }
        // Filtro por Criador
        if (filters.creator && card.creatorId !== filters.creator) {
            isVisible = false;
        }
        // Filtro por Status
        if (filters.status === 'active' && card.isComplete) {
            isVisible = false;
        }
        if (filters.status === 'completed' && !card.isComplete) {
            isVisible = false;
        }
        // Filtro por Atribuído
        if (filters.assignee === 'me' && card.assignedTo !== currentUser.id) {
            isVisible = false;
        }
        // Filtro por Etiqueta
        if (filters.tag && !card.tags?.includes(filters.tag)) {
            isVisible = false;
        }
        // Filtro por Data de Vencimento
        if (filters.dueDate && card.dueDate) {
            const dueDate = new Date(card.dueDate);
            dueDate.setHours(0,0,0,0);
            if (filters.dueDate === 'overdue' && dueDate >= today) {
                isVisible = false;
            }
            if (filters.dueDate === 'today' && dueDate.getTime() !== today.getTime()) {
                isVisible = false;
            }
        } else if (filters.dueDate) { // Esconde cartões sem data se um filtro de data estiver ativo
             isVisible = false;
        }

        cardEl.style.display = isVisible ? 'block' : 'none';
        return isMatch;
    });

    if (filteredCards.length === 0) {
        showFloatingMessage('Nenhum cartão encontrado com estes critérios', 'info');
        document.getElementById('search-dialog').close();
        return;
    }

    // Exibir resultados (podemos implementar uma visualização de resultados)
    displaySearchResults(filteredCards);
    document.getElementById('search-dialog').close();
}

// Nova função para exibir resultados da busca
function displaySearchResults(cards) {
    // Implementar uma interface para mostrar os resultados
    const resultsDialog = document.createElement('dialog');
    resultsDialog.innerHTML = `
        <h3>Resultados da Busca (${cards.length} cartões encontrados)</h3>
        <div class="search-results" style="max-height: 400px; overflow-y: auto;">
            ${cards.map(card => `
                <div class="search-result-item" style="padding: 10px; border-bottom: 1px solid #eee;">
                    <h4>${card.title}</h4>
                    <p>${card.description || 'Sem descrição'}</p>
                    <div style="font-size: 0.9em; color: #666;">
                        Board: ${card.boardTitle} | 
                        Coluna: ${card.columnTitle}
                        ${card.groupName ? ` | Grupo: ${card.groupName}` : ''}
                    </div>
                    <button class="btn btn-sm btn-primary" 
                            onclick="navigateToCard('${card.boardId}', '${card.columnId}', '${card.id}')">
                        Ir para o Cartão
                    </button>
                </div>
            `).join('')}
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="this.closest('dialog').close()">Fechar</button>
        </div>
    `;
    
    document.body.appendChild(resultsDialog);
    resultsDialog.showModal();
}

// Função para navegar até um cartão específico
function navigateToCard(boardId, columnId, cardId) {
    // Fechar diálogo de resultados
    document.querySelector('dialog[open]').close();
    
    // Trocar para o board correto
    const boardSelect = document.getElementById('board-select');
    boardSelect.value = boardId;
    switchBoard({target: boardSelect});
    
    // Rolagem e destaque para o cartão (após um pequeno delay para renderização)
    setTimeout(() => {
        const cardElement = document.querySelector(`.card[data-card-id="${cardId}"]`);
        if (cardElement) {
            cardElement.scrollIntoView({behavior: 'smooth', block: 'center'});
            cardElement.style.boxShadow = '0 0 0 3px var(--primary)';
            setTimeout(() => {
                cardElement.style.boxShadow = '';
            }, 3000);
        }
    }, 500);
}

function resetSearchFilters() {
    // Limpa os campos do formulário
    document.getElementById('search-text').value = '';
    document.getElementById('search-creator').selectedIndex = 0;
    document.getElementById('search-status').selectedIndex = 0;
    document.getElementById('search-assignee').selectedIndex = 0;
    document.getElementById('search-due-date').selectedIndex = 0;
    document.getElementById('search-tags').selectedIndex = 0;

    // Mostra todos os cartões novamente
    document.querySelectorAll('.card').forEach(cardEl => {
        cardEl.style.display = 'block';
    });
    
    showFloatingMessage('Filtros removidos.', 'info');
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

    // Esconde/mostra o seletor de ícone baseado na seleção de template
    const templateSelect = document.getElementById('board-template-select');
    templateSelect.onchange = () => {
        const iconGroup = document.getElementById('board-icon-input').closest('.form-group');
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
    console.log('Salvando quadro...');
    const dialog = document.getElementById('board-dialog');
    const boardId = dialog.dataset.editingId;
    let title = document.getElementById('board-title-input').value.trim();
    const icon = document.getElementById('board-icon-input').value;
    const templateId = document.getElementById('board-template-select').value;
    if (!title && !templateId) { showDialogMessage(dialog, 'O título é obrigatório.', 'error'); return; }

    let savedBoard;
    if (boardId) {
        const boardData = getBoard(boardId);
        if (!boardData) return;
        boardData.title = title;
        boardData.icon = icon;
        boardData.visibility = document.getElementById('board-visibility').value;
        savedBoard = saveBoard(boardData);
    } else {
        const allTemplates = [...getUserBoardTemplates(currentUser.id), ...getSystemBoardTemplates()];
        const selectedTemplate = allTemplates.find(t => t.id === templateId);
        if (selectedTemplate && !title) title = `${selectedTemplate.name} (Cópia)`;
        const newColumns = selectedTemplate ? selectedTemplate.columns.map(colTmpl => saveColumn({ title: colTmpl.name, color: colTmpl.color, cardIds: [] })) : [];
        const newBoardData = { title, icon: selectedTemplate ? selectedTemplate.icon : icon, ownerId: currentUser.id, visibility: document.getElementById('board-visibility').value, columnIds: newColumns.map(c => c.id) };
        savedBoard = saveBoard(newBoardData);
    }
    
    showSuccessAndRefresh(dialog, savedBoard.id);
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
    console.log('Salvando coluna...');
    const dialog = document.getElementById('column-dialog');
    const columnId = dialog.dataset.editingId;
    const title = document.getElementById('column-title-input').value.trim();
    if (!title) { showDialogMessage(dialog, 'O nome da coluna é obrigatório.', 'error'); return; }
    
    const columnData = { title, description: document.getElementById('column-description').value, color: document.getElementById('column-color-input').value };

    if (columnId) {
        const existingColumn = getColumn(columnId);
        if (existingColumn) {
            Object.assign(existingColumn, columnData);
            saveColumn(existingColumn);
        }
    } else {
        const newColumn = saveColumn({ ...columnData, cardIds: [] });
        const boardData = getBoard(currentBoard.id);
        boardData.columnIds.push(newColumn.id);
        saveBoard(boardData);
    }
    showSuccessAndRefresh(dialog, currentBoard.id);
}

/**
 * Mostra uma mensagem de sucesso, espera, fecha o diálogo e atualiza a UI.
 * É a função padrão para finalizar operações de salvamento bem-sucedidas.
 * @param {HTMLElement} dialog O diálogo a ser manipulado.
 * @param {string} boardToFocusId O ID do quadro que deve estar em foco após a atualização.
 */
function showSuccessAndRefresh(dialog, boardToFocusId) {
    showDialogMessage(dialog, 'Salvo com sucesso! Atualizando...', 'success');
    dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);

    setTimeout(() => {
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

// 1. ADICIONE ESTA NOVA FUNÇÃO AUXILIAR
/**
 * Exibe uma mensagem dentro de um diálogo específico.
 * @param {HTMLElement} dialog O elemento do diálogo.
 * @param {string} message A mensagem a ser exibida.
 * @param {string} type 'error' ou 'success'.
 */
function showDialogMessage(dialog, message, type) {
    const feedbackEl = dialog.querySelector('.feedback');
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback ${type} show`;
    setTimeout(() => {
        feedbackEl.classList.remove('show');
    }, 4000);
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
    assigneeSelect.innerHTML = '<option value="">Ninguém</option>';
    const allGroups = getAllGroups();
    const userGroups = allGroups.filter(g => g.members.includes(currentUser.id));
    const memberIds = new Set([currentUser.id]);
    userGroups.forEach(g => g.members.forEach(id => memberIds.add(id)));

    memberIds.forEach(id => {
        const user = allUsers.find(u => u.id === id);
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
    document.getElementById('card-title-input').value = card ? card.title : '';

    dialog.showModal();
}

// Em kanban.js

function handleSaveCard() {
    console.log('Salvando cartão...');
    const dialog = document.getElementById('card-dialog');
    const cardId = dialog.dataset.editingId;
    const newColumnId = document.getElementById('card-column-select').value;
    const title = document.getElementById('card-title-input').value.trim();
    if (!title) { showDialogMessage(dialog, 'O título é obrigatório.', 'error'); return; }

    const dateValue = document.getElementById('card-due-date').value;
    const timeValue = document.getElementById('card-due-time').value;
    let combinedDateTime = dateValue ? (timeValue ? `${dateValue}T${timeValue}:00` : `${dateValue}T00:00:00`) : null;
    const cardData = { title, description: document.getElementById('card-description').value.trim(), dueDate: combinedDateTime, tags: Array.from(document.getElementById('card-tags').selectedOptions).map(opt => opt.value), assignedTo: document.getElementById('card-assigned-to').value };

    if (cardId && cardId !== 'null') {
        const originalCard = getCard(cardId);
        const sourceColumnData = getColumn(currentBoard.columns.find(c => c.cardIds.includes(cardId)).id);
        Object.assign(originalCard, cardData);
        saveCard(originalCard);
        if (sourceColumnData && sourceColumnData.id !== newColumnId) {
            sourceColumnData.cardIds = sourceColumnData.cardIds.filter(id => id !== cardId);
            saveColumn(sourceColumnData);
            const targetColumnData = getColumn(newColumnId);
            targetColumnData.cardIds.push(cardId);
            saveColumn(targetColumnData);
        }
    } else {
        // --- LÓGICA DE CRIAÇÃO DE CARTÃO CORRIGIDA ---
        cardData.creatorId = currentUser.id;
        cardData.isComplete = false;
        const newCard = saveCard(cardData);

        // Em vez de buscar a coluna no storage, a encontramos no objeto 'currentBoard' em memória,
        // que é mais seguro e evita problemas de sincronização.
        const targetColumn = currentBoard.columns.find(c => c.id === newColumnId);
        if (targetColumn) {
            targetColumn.cardIds.push(newCard.id);
            saveColumn(targetColumn); // Salva a coluna atualizada no storage.
        }
    }
    showSuccessAndRefresh(dialog, currentBoard.id);
}

// ===== LÓGICA DE DRAG-AND-DROP =====

function setupDragAndDrop() {
    const cards = document.querySelectorAll('.card');
    const columns = document.querySelectorAll('.column');

    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });

    columns.forEach(column => {
        column.addEventListener('dragstart', handleDragStart);
        column.addEventListener('dragend', handleDragEnd);
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedElement = e.target;
    setTimeout(() => e.target.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedElement = null;
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

        const sourceColumn = getColumn(sourceColumnId);
        const targetColumn = getColumn(targetColumnId);
        
        sourceColumn.cardIds = sourceColumn.cardIds.filter(id => id !== cardId);
        const afterElement = getDragAfterElement(targetColumnEl.querySelector('.cards-container'), e.clientY, false);
        const newIndex = afterElement ? targetColumn.cardIds.indexOf(afterElement.dataset.cardId) : targetColumn.cardIds.length;
        targetColumn.cardIds.splice(newIndex, 0, cardId);

        saveColumn(sourceColumn);
        if (sourceColumnId !== targetColumnId) saveColumn(targetColumn);
    } else {
        const columnId = draggedElement.dataset.columnId;
        const boardData = getBoard(currentBoard.id);
        const afterElement = getDragAfterElement(document.getElementById('columns-container'), e.clientX, true);
        
        boardData.columnIds = boardData.columnIds.filter(id => id !== columnId);
        const newIndex = afterElement ? boardData.columnIds.indexOf(afterElement.dataset.columnId) : boardData.columnIds.length;
        boardData.columnIds.splice(newIndex, 0, columnId);
        saveBoard(boardData);
    }
    
    currentBoard = getFullBoardData(currentBoard.id);
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
        <button data-action="copy">📋 Copiar</button>
        <button data-action="cut">✂️ Recortar</button>
        <hr>
        <button data-action="delete" class="destructive">🗑️ Excluir</button>
    `;
    
    document.body.appendChild(menu);
    positionMenu(menu, x, y);

    // Adiciona listeners para as ações
    menu.querySelector('[data-action="delete"]').onclick = () => handleDeleteCard(cardId); // <<< ATUALIZADO AQUI
    menu.querySelector('[data-action="edit"]').onclick = () => showCardDialog(cardId);
    menu.querySelector('[data-action="details"]').onclick = () => showDetailsDialog(cardId);
    menu.querySelector('[data-action="complete"]').onclick = () => toggleCardComplete(cardId);
    menu.querySelector('[data-action="delete"]').onclick = () => deleteCard(cardId);
    // As ações de copiar/recortar podem ser implementadas no futuro
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
        <hr>
        <button data-action="delete" class="destructive">🗑️ Excluir</button>
    `;
    
    document.body.appendChild(menu);
    positionMenu(menu, x, y);

    // Adiciona listeners para as ações
    menu.querySelector('[data-action="edit"]').onclick = () => showColumnDialog(columnId);
    menu.querySelector('[data-action="details"]').onclick = () => showDetailsDialog(null, columnId);
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
    if (confirm('Tem certeza que deseja excluir esta coluna e todos os seus cartões?')) {
        currentBoard.columns = currentBoard.columns.filter(c => c.id !== columnId);
        persistChanges();
        renderCurrentBoard();
    }
}

function toggleCardComplete(cardId) {
    const { card } = findCardAndColumn(cardId);
    card.isComplete = !card.isComplete;
    persistChanges();
    renderCurrentBoard();
}

function handleDeleteBoard() {
    if (!currentBoard) return;
    if (confirm(`Tem certeza de que deseja excluir o quadro "${currentBoard.title}"?`)) {
        deleteBoard(currentBoard.id);
        const userProfile = getUserProfile(currentUser.id);
        boards = (userProfile.boardIds || []).map(id => getFullBoardData(id)).filter(Boolean);
        currentBoard = boards[0] || null;
        localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard ? currentBoard.id : null);
        renderBoardSelector();
        renderCurrentBoard();
        showFloatingMessage('Quadro excluído com sucesso.', 'success');
    }
}

function handleDeleteColumn() {
    const dialog = document.getElementById('column-dialog');
    const columnId = dialog.dataset.editingId;
    if (!columnId) return;
    if (confirm('Tem certeza que deseja excluir esta coluna e todos os seus cartões?')) {
        const boardData = getBoard(currentBoard.id);
        boardData.columnIds = boardData.columnIds.filter(id => id !== columnId);
        saveBoard(boardData);
        deleteColumn(columnId); // Deleta a coluna e seus cartões
        currentBoard = getFullBoardData(currentBoard.id);
        renderCurrentBoard();
        dialog.close();
    }
}

function handleDeleteCard(cardId) {
    if (confirm('Tem certeza que deseja excluir este cartão?')) {
        const columnData = getColumn(currentBoard.columns.find(c => c.cardIds.includes(cardId)).id);
        columnData.cardIds = columnData.cardIds.filter(id => id !== cardId);
        saveColumn(columnData);
        deleteCard(cardId);
        currentBoard = getFullBoardData(currentBoard.id);
        renderCurrentBoard();
        showFloatingMessage('Cartão excluído.', 'info');
    }
}


function persistChanges(addToHistory = true) {
    console.log('Persistindo mudanças...', currentBoard);
    if (!currentBoard) return;

    if (addToHistory) {
        saveState(); // Salva o estado atual para o Desfazer
    }
    
    // CORREÇÃO: Salva o quadro atual individualmente usando a função correta
    saveBoard(currentBoard);
    
    // Atualiza a lista local de quadros (se já existir, substitui; se não, adiciona)
    const index = boards.findIndex(b => b.id === currentBoard.id);
    if (index !== -1) {
        boards[index] = currentBoard;
    } else {
        boards.push(currentBoard);
    }
    
    // Salva o ID do quadro atual para ser reaberto na próxima vez
    localStorage.setItem(`currentBoardId_${currentUser.id}`, currentBoard.id);
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
    currentBoard = JSON.parse(undoStack[undoStack.length - 1]);
    renderCurrentBoard();
    saveBoard(currentBoard);
}

function redoAction() {
    if (redoStack.length === 0) {
        showFloatingMessage('Nada para refazer.', 'info');
        return;
    }
    const nextState = redoStack.pop();
    undoStack.push(nextState);
    currentBoard = JSON.parse(nextState);
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
function saveBoardAsTemplate() {
    if (!currentBoard) {
        showFloatingMessage('Nenhum quadro selecionado para salvar como template.', 'warning');
        return;
    }

    const templateName = prompt("Digite um nome para o novo template:", currentBoard.title);
    if (!templateName || templateName.trim() === '') {
        showFloatingMessage('A criação do template foi cancelada.', 'info');
        return;
    }

    // Cria o objeto do novo template
    const newTemplate = {
        id: 'user-board-' + Date.now(),
        name: templateName.trim(),
        icon: '📋',
        description: `Template criado a partir do quadro '${currentBoard.title}'`,
        columns: currentBoard.columns.map(col => ({ 
            name: col.title, 
            color: col.color 
        }))
    };

    // LÓGICA DE SALVAMENTO CORRETA:
    // 1. Carrega os templates de usuário já existentes.
    const userTemplates = getUserBoardTemplates(currentUser.id);
    // 2. Adiciona o novo template à lista.
    userTemplates.push(newTemplate);
    // 3. Salva a lista completa e atualizada.
    saveUserBoardTemplates(currentUser.id, userTemplates);

    showFloatingMessage(`Template '${newTemplate.name}' salvo com sucesso!`, 'success');
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

    // Preencher o diálogo com os valores atuais do usuário
    newDialog.querySelector('#pref-theme').value = originalKanbanTheme;
    newDialog.querySelector('#pref-language').value = user.language || 'pt-BR';
    newDialog.querySelector('#pref-font-family').value = originalKanbanFont;
    newDialog.querySelector('#pref-font-size').value = originalKanbanFontSize;
    newDialog.querySelector('#pref-show-tags').checked = user.preferences?.showTags !== false;
    newDialog.querySelector('#pref-show-date').checked = user.preferences?.showDate !== false;
    newDialog.querySelector('#pref-show-status').checked = user.preferences?.showStatus !== false;
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
        { id: 'pref-font-size', action: (e) => applyFontSize(e.target.value, true) }, // Adicionado isPreview = true
        { id: 'pref-language', action: null },
        { id: 'pref-default-tag-template', action: null },
        { id: 'pref-show-tags', action: null },
        { id: 'pref-show-date', action: null },
        { id: 'pref-show-status', action: null },
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
            defaultTagTemplateId: document.getElementById('pref-default-tag-template').value,
            showBoardIcon: document.getElementById('pref-show-icon').checked,
            showBoardTitle: document.getElementById('pref-show-title').checked
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

function showIconPickerDialog(callback) {
    const dialog = document.getElementById('icon-picker-dialog');
    if (!dialog) return;

    const iconGrid = dialog.querySelector('#icon-grid');
    iconGrid.innerHTML = ''; // Limpa ícones anteriores

    ICON_LIBRARY.forEach(icon => {
        const iconBtn = document.createElement('button');
        iconBtn.className = 'icon-picker-btn';
        iconBtn.textContent = icon;
        iconBtn.onclick = () => {
            callback(icon);
            dialog.close();
        };
        iconGrid.appendChild(iconBtn);
    });

    dialog.showModal();
    dialog.querySelector('#close-icon-picker-btn').onclick = () => dialog.close();
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

function showConfirmationDialog(message, onConfirm, onCancel = null, confirmText = 'Sim', cancelText = 'Não') {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Confirmação</h3>
        <p>${message}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">${cancelText}</button>
            <button class="btn btn-primary">${confirmText}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();

    const confirmBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');

    const closeAndCleanup = () => {
        dialog.close();
        dialog.remove();
    };

    confirmBtn.addEventListener('click', () => {
        if (onConfirm(dialog)) { // A função onConfirm retorna true se for para fechar
            setTimeout(closeAndCleanup, 1500);
        }
    });

    cancelBtn.addEventListener('click', () => {
        if (onCancel) {
            if (onCancel(dialog)) { // onCancel também pode controlar o fechamento
                setTimeout(closeAndCleanup, 1500);
            }
        } else {
            closeAndCleanup(); // Comportamento padrão é fechar
        }
    });
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
