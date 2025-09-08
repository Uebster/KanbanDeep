// js/groups.js - PART 1/4 - REFACTORED VERSION
import { 
  getCurrentUser, 
  getAllUsers,
  validateMasterPassword 
} from './auth.js';
import { 
  getGroup, 
  saveGroup, 
  getAllGroups,
  deleteGroup as deleteGroupStorage,
  universalSave, 
  universalLoad,
  getUserProfile,      // <-- ADICIONE ESTA
  saveUserProfile,     // <-- ADICIONE ESTA
  getSystemBoardTemplates,
  getSystemTagTemplates
} from './storage.js';
import { 
  showFloatingMessage, 
  initDraggableElements,
  updateUserAvatar
} from './ui-controls.js';
import { 
    addGroupInvitationNotification,
    addGroupRemovalNotification 
} from './notifications.js';

let currentUser;
let allUsers = [];
let groups = [];
let servers = [];
let currentGroup = null;
const ICON_LIBRARY = [
  '📋', '🏷️', '💼', '📚', '🛒', '🎮', '🔥', '📊', '🚀', '🎯', '💡', '🎉', '🏆', '⚙️', '🔧', '🏠', '❤️', '⭐', '📌', '📎', '📁', '📅', '⏰', '✅', '❌', '❓', '❗', '💰', '👥', '🧠'
];


// Funções para gerenciar templates de grupo
export function getGroupBoardTemplates(userId) {
  const key = `user_${userId}_group_board_templates`;
  return universalLoad(key) || [];
}

export function saveGroupBoardTemplates(userId, templates) {
  const key = `user_${userId}_group_board_templates`;
  return universalSave(key, templates);
}

export function getGroupTagTemplates(userId) {
  const key = `user_${userId}_group_tag_templates`;
  return universalLoad(key) || [];
}

export function saveGroupTagTemplates(userId, templates) {
  const key = `user_${userId}_group_tag_templates`;
  return universalSave(key, templates);
}

// groups.js - Adicione este código na função initGroupsPage(), após a verificação de estatísticas
export function initGroupsPage() {
    applyUserTheme();
    
    currentUser = getCurrentUser();
    if (!currentUser) {
        showFloatingMessage('Usuário não logado. Redirecionando...', 'error');
        setTimeout(() => { window.location.href = 'list-users.html'; }, 2000);
        return;
    }
    
    // Carrega os grupos ANTES de qualquer outra lógica para que a variável 'groups' esteja disponível.
    loadGroups();

    // Verificar se há um grupo selecionado para mostrar estatísticas
    const selectedGroupId = localStorage.getItem('selectedGroupId');
    const openStatistics = localStorage.getItem('openStatistics');
    
    if (selectedGroupId && openStatistics === 'true') {
        // Limpar os valores do localStorage
        localStorage.removeItem('selectedGroupId');
        localStorage.removeItem('openStatistics');
        
        // Encontrar o grupo e mostrar estatísticas
        currentGroup = groups.find(g => g.id === selectedGroupId);
        if (currentGroup) {
            // Mudar para a aba de estatísticas
            switchTab('statistics');
            
            // Carregar as estatísticas do grupo
            loadGroupStatistics(currentGroup.id);
            
            // Atualizar o nome do grupo nas estatísticas
            document.getElementById('statistics-group-name').textContent = currentGroup.name;
        }
    }
    
    // VERIFICAÇÃO PARA ABRIR A ABA DE CRIAÇÃO DE GRUPO
    const openCreateGroup = localStorage.getItem('openCreateGroup');
    if (openCreateGroup === 'true') {
        // Limpar o valor do localStorage
        localStorage.removeItem('openCreateGroup');
        
        // Mudar para a aba de criação de grupo
        switchTab('create-group');
    }
    
    // Resto da inicialização...
    if (currentUser) {
        updateUserAvatar(currentUser);
    }

    setupEventListeners();
    setupTabs();
    loadServers();
    initDraggableElements();
}

function setupEditGroupDialog() {
    const editDialog = document.getElementById('edit-group-dialog');
    const form = document.getElementById('edit-group-form');
    const cancelBtn = document.getElementById('cancel-edit-group');
    const addParticipantBtn = document.getElementById('btn-add-participant');
    
    if (!editDialog || !form || !cancelBtn || !addParticipantBtn) return;
    
    // Remover event listeners existentes para evitar duplicação
    form.removeEventListener('submit', saveGroupChanges);
    cancelBtn.removeEventListener('click', handleCancelEdit);
    addParticipantBtn.removeEventListener('click', handleAddParticipant);
    
    // Adicionar novos event listeners
    form.addEventListener('submit', saveGroupChanges);
    cancelBtn.addEventListener('click', handleCancelEdit);
    addParticipantBtn.addEventListener('click', handleAddParticipant);
    
    function handleCancelEdit() {
        showConfirmationDialog(
            'Tem certeza que deseja cancelar as alterações?',
            (confirmationDialog) => {
                showDialogMessage(confirmationDialog.querySelector('.feedback'), 'Alterações canceladas.', 'info');
                
                setTimeout(() => {
                    confirmationDialog.close();
                    editDialog.close();
                }, 1500);
                
                return true;
            }
        );
    }
    
function handleAddParticipant() {
        showAddParticipantDialog();
    }
}

function loadGroups() {
    const allGroupsData = getAllGroups();
    
    // Filtra apenas os grupos dos quais o usuário atual é membro
    groups = allGroupsData.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    
    // Chama a renderização com os dados reais
    renderGroups();
}

function setupEventListeners() {
    document.getElementById('kanban-btn')?.addEventListener('click', () => window.location.href = 'kanban.html');
    // --- ABAS PRINCIPAIS ---
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    document.getElementById('btn-create-group')?.addEventListener('click', () => switchTab('create-group'));

    
    // --- ABA "CRIAR GRUPO" ---
    document.getElementById('create-group-form')?.addEventListener('submit', createGroup);
    document.getElementById('btn-add-board')?.addEventListener('click', showAddBoardDialog);
    document.getElementById('btn-cancel-group')?.addEventListener('click', cancelGroupCreation);

    
    // --- ABA "MEUS GRUPOS" (USANDO DELEGAÇÃO DE EVENTOS) ---
document.getElementById('my-groups')?.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const groupCard = button.closest('.group-card');
    if (!groupCard) return;
    
    const groupId = groupCard.dataset.groupId;
    
    currentGroup = groups.find(g => g.id === groupId);
    if (!currentGroup) {
        showFloatingMessage('Grupo não encontrado.', 'error');
        return;
    }

    switch (action) {
        case 'view':
            viewGroup(currentGroup);
            break;
        case 'edit':
            editGroup(currentGroup);
            break;
        case 'delete':
            deleteGroup();
            break;
        case 'leave':
            leaveGroup();
            break;
    }
});
    // --- ABA "GERENCIAR GRUPO" ---
// Adicionar este código ao setupEventListeners
document.querySelectorAll('.group-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remover classe active de todas as abas e conteúdos
        document.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.group-content').forEach(c => c.classList.remove('active'));
        
        // Adicionar classe active à aba clicada
        tab.classList.add('active');
        
        // Mostrar o conteúdo correspondente
        const target = tab.dataset.target;
        document.getElementById(target).classList.add('active');
    });
});
    document.getElementById('edit-group-form')?.addEventListener('submit', saveGroupChanges);
document.getElementById('cancel-edit-group')?.addEventListener('click', () => {
    showConfirmationDialog(
        'Tem certeza que deseja cancelar as alterações? Todas as mudanças não salvas serão perdidas.',
        (dialog) => {
            showDialogMessage(dialog.querySelector('.feedback'), 'Alterações canceladas.', 'info');
            
            setTimeout(() => {
                dialog.close(); // Fecha apenas o diálogo de confirmação
                document.getElementById('edit-group-dialog').close(); // Fecha o diálogo de edição
            }, 1500);
            
            return true;
        }
    );
});

document.getElementById('btn-add-participant')?.addEventListener('click', () => {
    // Verifique se currentGroup está definido
    if (!currentGroup) {
        showFloatingMessage('Nenhum grupo selecionado.', 'error');
        return;
    }
    
    showAddParticipantDialog();
});

document.getElementById('confirm-add-participant')?.addEventListener('click', () => {
    const select = document.getElementById('participant-select');
    const memberId = select.value;
    const feedbackEl = document.querySelector('#add-participant-dialog .feedback');
    
    if (!memberId || select.disabled) {
        showDialogMessage(feedbackEl, 'Selecione um usuário válido para adicionar.', 'error');
        return;
    }
    
    // Enviar solicitação via notificação
    sendGroupInvitation(currentGroup.id, memberId, currentUser);
    
    showDialogMessage(feedbackEl, 'A solicitação será enviada ao salvar as alterações.', 'success');
    
    // Fechar diálogo após breve delay
    setTimeout(() => {
        document.getElementById('add-participant-dialog').close();
    }, 1500);
});

        // Botão para adicionar participante

    document.getElementById('cancel-add-participant')?.addEventListener('click', () => {
    const feedbackEl = document.querySelector('#add-participant-dialog .feedback');
    showDialogMessage(feedbackEl, 'Operação cancelada.', 'info');
    
    setTimeout(() => {
        document.getElementById('add-participant-dialog').close();
    }, 1500);
});
    
    // --- TEMPLATES DE GRUPO ---
    document.getElementById('btn-new-board-template')?.addEventListener('click', () => showGroupBoardTemplateDialog());
    document.getElementById('btn-new-tag-template')?.addEventListener('click', () => showGroupTagTemplateDialog());

    
    // --- ABA "ADMINISTRAR SERVIDORES" ---
    document.getElementById('btn-create-server')?.addEventListener('click', showCreateServerDialog);
    document.getElementById('btn-add-server')?.addEventListener('click', showAddServerDialog);
    document.getElementById('confirm-server-btn')?.addEventListener('click', createServer);
    document.getElementById('cancel-server-btn')?.addEventListener('click', () => {
        document.getElementById('server-dialog').close();
    });
    document.getElementById('confirm-add-server-btn')?.addEventListener('click', addServer);
    document.getElementById('cancel-add-server-btn')?.addEventListener('click', () => {
        showDialogMessage(document.querySelector('#add-server-dialog .feedback'), 'Operação cancelada.', 'info');
        setTimeout(() => {
            document.getElementById('add-server-dialog').close();
        }, 1500);
    });
    document.getElementById('paste-server-btn')?.addEventListener('click', pasteServerUrl);
    document.getElementById('copy-server-url-btn')?.addEventListener('click', copyServerUrl);
    document.getElementById('close-share-dialog-btn')?.addEventListener('click', () => {
        showDialogMessage(document.querySelector('#share-server-dialog .feedback'), 'Operação cancelada.', 'info');
        setTimeout(() => {
            document.getElementById('share-server-dialog').close();
        }, 1500);
    });

    // --- DELEGAÇÃO DE EVENTOS PARA DIÁLOGOS DE TEMPLATE ---
    // Usar delegação de eventos para evitar duplicação
    document.body.addEventListener('click', (e) => {
        // Para o diálogo de template de quadro
        if (e.target.matches('#add-group-board-column-btn')) {
            addColumnToGroupEditor();
        }
        if (e.target.matches('#save-group-board-template-btn')) {
            saveGroupBoardTemplate();
        }
        
        // Para o diálogo de template de etiqueta
        if (e.target.matches('#add-group-tag-btn')) {
            addTagToGroupEditor();
        }
        if (e.target.matches('#save-group-tag-template-btn')) {
            saveGroupTagTemplate();
        }
    });
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    
    // Carregar dados específicos da aba
    if (tabId === 'create-group') {
        loadUsersForSelection();
        loadTagTemplatesForGroup();
        loadBoardTemplatesForGroup();
    } else if (tabId === 'group-templates') {
        loadGroupTemplates();
    } else if (tabId === 'statistics') {
        loadStatistics();
    }
}

function switchGroupTab(targetId) {
    // Remover classe active de todas as abas e conteúdos
    document.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.group-content').forEach(c => c.classList.remove('active'));
    
    // Adicionar classe active à aba clicada
    document.querySelector(`.group-tab[data-target="${targetId}"]`).classList.add('active');
    
    // Mostrar o conteúdo correspondente
    document.getElementById(targetId).classList.add('active');
}

function showAddBoardDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Adicionar Quadro ao Grupo</h3>
        <div class="form-group">
            <label for="board-name">Nome do Quadro:</label>
            <input type="text" id="board-name" placeholder="Nome do quadro" required>
        </div>
        <div class="form-group">
            <label for="board-template">Usar Template (Opcional):</label>
            <select id="board-template">
                <option value="">Começar com um quadro vazio</option>
                <!-- Templates de quadro do sistema e do grupo serão preenchidos aqui -->
            </select>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="cancel-board-btn">Cancelar</button>
            <button class="btn btn-primary" id="save-board-btn">Salvar Quadro</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Carregar templates de quadro
    loadBoardTemplatesForDialog(dialog);
    
    dialog.showModal();
    
    const cancelBtn = dialog.querySelector('#cancel-board-btn');
    const saveBtn = dialog.querySelector('#save-board-btn');
    const feedbackEl = dialog.querySelector('.feedback');
    
    cancelBtn.addEventListener('click', () => {
        dialog.close();
        dialog.remove();
    });
    
    saveBtn.addEventListener('click', () => {
        const boardName = document.getElementById('board-name').value.trim();
        const template = document.getElementById('board-template').value;
        
        if (!boardName) {
            showDialogMessage(feedbackEl, 'O nome do quadro é obrigatório.', 'error');
            return;
        }
        
        addBoardToGroup(boardName, template);
        showDialogMessage(feedbackEl, 'Quadro adicionado com sucesso!', 'success');
        
        setTimeout(() => {
            dialog.close();
            dialog.remove();
        }, 1500);
    });
}

function loadBoardTemplatesForDialog(dialog) {
    const templateSelect = dialog.querySelector('#board-template');
    if (!templateSelect) return;
    
    // Limpar opções existentes, mantendo apenas a opção vazia
    templateSelect.innerHTML = '<option value="">Começar com um quadro vazio</option>';
    
    // Carregar templates do grupo primeiro
    const groupTemplates = getGroupBoardTemplates(currentUser.id);
    if (groupTemplates.length > 0) {
        const optgroupGroup = document.createElement('optgroup');
        optgroupGroup.label = 'Templates do Grupo';
        groupTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupGroup.appendChild(option);
        });
        templateSelect.appendChild(optgroupGroup);
    }
    
    // Carregar templates do sistema
    const systemTemplates = getSystemBoardTemplates();
    if (systemTemplates.length > 0) {
        const optgroupSystem = document.createElement('optgroup');
        optgroupSystem.label = 'Templates do Sistema';
        systemTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupSystem.appendChild(option);
        });
        templateSelect.appendChild(optgroupSystem);
    }
}

function addBoardToGroup(name, templateId) {
    const container = document.getElementById('group-boards-container');
    const boardId = 'board-' + Date.now();
    
    // Encontrar o template selecionado
    let templateName = "";
    if (templateId) {
        const systemTemplate = getSystemBoardTemplates().find(t => t.id === templateId);
        if (systemTemplate) {
            templateName = systemTemplate.name;
        } else {
            const groupTemplate = getGroupBoardTemplates(currentUser.id).find(t => t.id === templateId);
            if (groupTemplate) {
                templateName = groupTemplate.name;
            }
        }
    }
    
    const boardElement = document.createElement('div');
    boardElement.className = 'group-board-item';
    boardElement.dataset.id = boardId;
    boardElement.innerHTML = `
        <div class="board-info">
            <strong>${name}</strong>
            ${templateName ? `<span class="template-badge">Template: ${templateName}</span>` : ''}
        </div>
        <button class="btn btn-sm btn-danger remove-board-btn">Remover</button>
    `;
    
    boardElement.querySelector('.remove-board-btn').addEventListener('click', () => {
        boardElement.remove();
    });
    
    container.appendChild(boardElement);
}

function loadTagTemplatesForGroup() {
    const templateSelect = document.getElementById('group-tag-template');
    if (!templateSelect) return;
    
    // Limpar opções existentes
    templateSelect.innerHTML = '';
    
    // Carregar templates do grupo primeiro
    const groupTemplates = getGroupTagTemplates(currentUser.id);
    if (groupTemplates.length > 0) {
        const optgroupGroup = document.createElement('optgroup');
        optgroupGroup.label = 'Conjuntos do Grupo';
        groupTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupGroup.appendChild(option);
        });
        templateSelect.appendChild(optgroupGroup);
    }
    
    // Carregar templates do sistema
    const systemTemplates = getSystemTagTemplates();
    if (systemTemplates.length > 0) {
        const optgroupSystem = document.createElement('optgroup');
        optgroupSystem.label = 'Sistema';
        systemTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupSystem.appendChild(option);
        });
        templateSelect.appendChild(optgroupSystem);
    }
    
    // Adicionar opção padrão (nenhum) no topo
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Nenhum (usar padrão do sistema)';
    templateSelect.insertBefore(defaultOption, templateSelect.firstChild);
}

function loadBoardTemplatesForGroup() {
    // Esta função pode ser usada para carregar templates de quadro em outros contextos
    // Por enquanto, apenas a função loadBoardTemplatesForDialog é usada
}

// js/groups.js - PART 2/4 - REFACTORED VERSION

// ===== FUNÇÕES DE TEMPLATES DE GRUPO =====

// js/groups.js - PARTE ADICIONAL - Funções para templates de grupo

// Funções auxiliares para verificar unicidade de nomes
function isGroupBoardTemplateNameUnique(name, editingId = null) {
    const groupTemplates = getGroupBoardTemplates(currentUser.id);
    return !groupTemplates.some(template => 
        template.name.toLowerCase() === name.toLowerCase() && 
        template.id !== editingId
    );
}

function isGroupTagTemplateNameUnique(name, editingId = null) {
    const groupTemplates = getGroupTagTemplates(currentUser.id);
    return !groupTemplates.some(template => 
        template.name.toLowerCase() === name.toLowerCase() && 
        template.id !== editingId
    );
}

// Contadores para nomes não titulados
let untitledColumnCounter = 1;
let untitledTagCounter = 1;

// Funções para templates de quadro do grupo
function showGroupBoardTemplateDialog(templateId = null) {
    const dialog = document.getElementById('group-board-template-dialog');
    const groupTemplates = getGroupBoardTemplates(currentUser.id);
    const template = templateId ? groupTemplates.find(t => t.id === templateId) : null;
    
    dialog.dataset.editingId = templateId;
    dialog.querySelector('#group-board-template-dialog-title').textContent = template ? 'Editar Template de Quadro' : 'Criar Novo Template de Quadro';
    document.getElementById('group-board-template-name').value = template ? template.name : '';
    document.getElementById('group-board-template-desc').value = template ? template.description : '';

    // Lógica do Ícone
    const iconInput = document.getElementById('group-board-template-icon');
    if (iconInput) {
        iconInput.value = template ? template.icon || '📋' : '📋';
    }
    const chooseIconButton = document.getElementById('btn-choose-group-board-icon');
    if (chooseIconButton) {
        chooseIconButton.onclick = () => {
            showIconPickerDialog((selectedIcon) => iconInput.value = selectedIcon);
        };
    }
    
    const editor = document.getElementById('group-board-columns-editor');
    editor.innerHTML = '';
    const initialColumns = template ? template.columns : [{ name: 'Nova Coluna', color: '#e74c3c' }];
    initialColumns.forEach(col => addColumnToGroupEditor(col.name, col.color));

    // Limpar mensagens de erro
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'error', 'success');

    updateGroupColumnCount(editor); 
    
    // Adicionar event listeners aos botões
    
    dialog.showModal();
}

function addColumnToGroupEditor(name = '', color = '#333333') {
    const editor = document.getElementById('group-board-columns-editor');
    editor.classList.remove('hidden');

    if (editor.children.length >= 8) {
        showDialogMessage(editor.closest('dialog').querySelector('.feedback'), 'Limite de 8 colunas por quadro atingido.', 'warning');
        return;
    }
    
    const item = document.createElement('div');
    item.className = 'editor-item';
    item.innerHTML = `
        <input type="text" value="${name}" placeholder="Nova Coluna" class="form-control" name="column_name">
        <input type="color" value="${color}" name="column_color">
        <button class="remove-btn">-</button>
    `;
    
    item.querySelector('.remove-btn').onclick = () => {
        item.remove();
        updateGroupColumnCount(editor);
    };
    
    editor.appendChild(item);
    updateGroupColumnCount(editor);
}

function updateGroupColumnCount(editor) {
    if (!editor) return;
    
    const count = editor.children.length;
    const dialog = editor.closest('dialog');
    if (!dialog) return;

    dialog.querySelector('#group-board-column-count').textContent = count;
    dialog.querySelector('#add-group-board-column-btn').disabled = count >= 8;
    editor.classList.toggle('hidden', count === 0);
}

function saveGroupBoardTemplate() {
    const dialog = document.getElementById('group-board-template-dialog');
    const templateId = dialog.dataset.editingId;
    const icon = document.getElementById('group-board-template-icon')?.value || '📋';
    const name = document.getElementById('group-board-template-name').value.trim();
    const feedbackEl = dialog.querySelector('.feedback');

    if (!name) {
        showDialogMessage(feedbackEl, 'O nome do template é obrigatório.', 'error');
        return;
    }

    if (!isGroupBoardTemplateNameUnique(name, templateId)) {
        showDialogMessage(feedbackEl, 'Já existe um template com este nome no grupo. Por favor, escolha outro nome.', 'error');
        return;
    }

    const columns = [];
    document.querySelectorAll('#group-board-columns-editor .editor-item').forEach(item => {
        let colName = item.querySelector('input[type="text"]').value.trim();
        const colColor = item.querySelector('input[type="color"]').value;
        
        if (!colName) {
            colName = `Nova Coluna ${untitledColumnCounter}`;
            untitledColumnCounter++;
        }
        
        columns.push({ name: colName, color: colColor });
    });

    if (columns.length === 0) {
        showDialogMessage(feedbackEl, 'Adicione pelo menos uma coluna ao template.', 'error');
        return;
    }
    
    showConfirmationDialog(
        'Deseja salvar este template?',
        async (confirmationDialog) => {
            try {
                let groupTemplates = getGroupBoardTemplates(currentUser.id);
                
                if (templateId) {
                    const index = groupTemplates.findIndex(t => t.id === templateId);
                    if (index !== -1) {
                        groupTemplates[index] = { 
                            ...groupTemplates[index], 
                            icon,
                            name, 
                            description: document.getElementById('group-board-template-desc').value, 
                            columns 
                        };
                    }
                } else {
                    const newTemplate = {
                        id: 'group-board-' + Date.now(),
                        name,
                        icon,
                        description: document.getElementById('group-board-template-desc').value,
                        columns
                    };
                    groupTemplates.push(newTemplate);
                }

                const success = saveGroupBoardTemplates(currentUser.id, groupTemplates);
                
                if (success) {
                    showDialogMessage(confirmationDialog.querySelector('.feedback'), 'Template salvo com sucesso!', 'success');
                    setTimeout(() => {
                        confirmationDialog.close();
                        dialog.close();
                        loadGroupTemplates();
                    }, 1500);
                } else {
                    throw new Error('Falha ao salvar template no grupo');
                }
                
                return true;
            } catch (error) {
                console.error('Erro ao salvar template:', error);
                showDialogMessage(confirmationDialog.querySelector('.feedback'), 'Não foi possível salvar o template.', 'error');
                return false;
            }
        }
    );
}

function deleteGroupBoardTemplate(templateId) {
    showConfirmationDialog(
        'Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.',
        async (dialog) => {
            let groupTemplates = getGroupBoardTemplates(currentUser.id);
            groupTemplates = groupTemplates.filter(t => t.id !== templateId);
            saveGroupBoardTemplates(currentUser.id, groupTemplates);
            loadGroupTemplates();
            showDialogMessage(dialog.querySelector('.feedback'), 'Template excluído.', 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

// Funções para templates de etiqueta do grupo
function showGroupTagTemplateDialog(templateId = null) {
    const dialog = document.getElementById('group-tag-template-dialog');
    const groupTemplates = getGroupTagTemplates(currentUser.id);
    const template = templateId ? groupTemplates.find(t => t.id === templateId) : null;
    
    dialog.dataset.editingId = templateId;
    dialog.querySelector('#group-tag-template-dialog-title').textContent = template ? 'Editar Conjunto de Etiquetas' : 'Criar Novo Conjunto de Etiquetas';
    document.getElementById('group-tag-template-name').value = template ? template.name : '';
    document.getElementById('group-tag-template-desc').value = template ? template.description : '';

    // Lógica do Ícone
    const iconInput = document.getElementById('group-tag-template-icon');
    if (iconInput) {
        iconInput.value = template ? template.icon || '🏷️' : '🏷️';
    }
    const chooseIconButton = document.getElementById('btn-choose-group-tag-icon');
    if (chooseIconButton) {
        chooseIconButton.onclick = () => {
            showIconPickerDialog((selectedIcon) => iconInput.value = selectedIcon);
        };
    }

    const editor = document.getElementById('group-tags-editor');
    editor.innerHTML = '';
    const initialTags = template ? template.tags : [{ name: 'Nova Etiqueta', color: '#3498db' }];
    initialTags.forEach(tag => addTagToGroupEditor(tag.name, tag.color));

    // Limpar mensagens de erro
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'error', 'success');

    updateGroupTagCount(editor);
    
    dialog.showModal();
}

function addTagToGroupEditor(name = '', color = '#3498db') {
    const editor = document.getElementById('group-tags-editor');
    editor.classList.remove('hidden');

    if (editor.children.length >= 8) {
        showDialogMessage(editor.closest('dialog').querySelector('.feedback'), 'Limite de 8 etiquetas por conjunto atingido.', 'warning');
        return;
    }
    
    const item = document.createElement('div');
    item.className = 'editor-item';
    item.innerHTML = `
        <input type="text" value="${name}" placeholder="Nova Etiqueta" class="form-control" name="tag_name">
        <input type="color" value="${color}" name="tag_color">
        <button class="remove-btn">-</button>
    `;
    
    item.querySelector('.remove-btn').onclick = () => {
        item.remove();
        updateGroupTagCount(editor);
    };
    
    editor.appendChild(item);
    updateGroupTagCount(editor);
}

function updateGroupTagCount(editor) {
    if (!editor) return;

    const count = editor.children.length;
    const dialog = editor.closest('dialog');
    if (!dialog) return;
    
    dialog.querySelector('#group-tag-count').textContent = count;
    dialog.querySelector('#add-group-tag-btn').disabled = count >= 8;
    editor.classList.toggle('hidden', count === 0);
}

function saveGroupTagTemplate() {
    const dialog = document.getElementById('group-tag-template-dialog');
    const templateId = dialog.dataset.editingId;
    const icon = document.getElementById('group-tag-template-icon')?.value || '🏷️';
    const name = document.getElementById('group-tag-template-name').value.trim();
    const feedbackEl = dialog.querySelector('.feedback');
    
    if (!name) {
        showDialogMessage(feedbackEl, 'O nome do conjunto é obrigatório.', 'error');
        return;
    }

    if (!isGroupTagTemplateNameUnique(name, templateId)) {
        showDialogMessage(feedbackEl, 'Já existe um conjunto com este nome no grupo. Por favor, escolha outro nome.', 'error');
        return;
    }

    const tags = [];
    document.querySelectorAll('#group-tags-editor .editor-item').forEach(item => {
        let tagName = item.querySelector('input[type="text"]').value.trim();
        const tagColor = item.querySelector('input[type="color"]').value;
        
        if (!tagName) {
            tagName = `Nova Etiqueta ${untitledTagCounter}`;
            untitledTagCounter++;
        }
        
        tags.push({ name: tagName, color: tagColor });
    });

    if (tags.length === 0) {
        showDialogMessage(feedbackEl, 'Adicione pelo menos uma etiqueta ao conjunto.', 'error');
        return;
    }

    showConfirmationDialog(
        'Deseja salvar este conjunto de etiquetas?',
        async (confirmationDialog) => {
            try {
                let groupTemplates = getGroupTagTemplates(currentUser.id);
                
                if (templateId) {
                    const index = groupTemplates.findIndex(t => t.id === templateId);
                    if (index !== -1) {
                        groupTemplates[index] = { 
                            ...groupTemplates[index], 
                            icon,
                            name, 
                            description: document.getElementById('group-tag-template-desc').value, 
                            tags 
                        };
                    }
                } else {
                    const newTemplate = {
                        id: 'group-tag-' + Date.now(),
                        name,
                        icon,
                        description: document.getElementById('group-tag-template-desc').value,
                        tags
                    };
                    groupTemplates.push(newTemplate);
                }

                const success = saveGroupTagTemplates(currentUser.id, groupTemplates);
                
                if (success) {
                    showDialogMessage(confirmationDialog.querySelector('.feedback'), 'Conjunto salvo com sucesso!', 'success');
                    setTimeout(() => {
                        confirmationDialog.close();
                        dialog.close();
                        loadGroupTemplates();
                    }, 1500);
                } else {
                    throw new Error('Falha ao salvar conjunto no grupo');
                }
                
                return true;
            } catch (error) {
                console.error('Erro ao salvar conjunto:', error);
                showDialogMessage(confirmationDialog.querySelector('.feedback'), 'Não foi possível salvar o conjunto.', 'error');
                return false;
            }
        }
    );
}

function deleteGroupTagTemplate(templateId) {
    showConfirmationDialog(
        'Tem certeza que deseja excluir este conjunto de etiquetas? Esta ação não pode ser desfeita.',
        async (dialog) => {
            let groupTemplates = getGroupTagTemplates(currentUser.id);
            groupTemplates = groupTemplates.filter(t => t.id !== templateId);
            saveGroupTagTemplates(currentUser.id, groupTemplates);
            loadGroupTemplates();
            showDialogMessage(dialog.querySelector('.feedback'), 'Conjunto de etiquetas excluído.', 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function loadGroupTemplates() {
    // Carregar templates de quadro de grupo
    const boardTemplates = getGroupBoardTemplates(currentUser.id);
    renderGroupBoardTemplates(boardTemplates);
    
    // Carregar templates de etiqueta de grupo
    const tagTemplates = getGroupTagTemplates(currentUser.id);
    renderGroupTagTemplates(tagTemplates);
}

function renderGroupBoardTemplates(templates) {
    const container = document.getElementById('group-board-templates-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (templates.length === 0) {
        container.innerHTML = '<p class="no-templates">Nenhum template de quadro criado para este grupo.</p>';
        return;
    }
    
    templates.forEach(template => {
        const templateCard = document.createElement('div');
        templateCard.className = 'template-card';
        templateCard.innerHTML = `
            <div class="template-icon">${template.icon || '📋'}</div>
            <h4>${template.name}</h4>
            <p>${template.description || 'Sem descrição'}</p>
            <div class="template-colors">
                ${template.columns.slice(0, 4).map(col => 
                    `<div class="color-box" style="background-color: ${col.color};"></div>`
                ).join('')}
                ${template.columns.length > 4 ? '<span>...</span>' : ''}
            </div>
            <div class="template-actions">
                <button class="btn btn-sm btn-primary use-template-btn" data-template-id="${template.id}">Usar</button>
                <button class="btn btn-sm btn-secondary edit-template-btn" data-template-id="${template.id}">Editar</button>
                <button class="btn btn-sm btn-danger delete-template-btn" data-template-id="${template.id}">Excluir</button>
            </div>
        `;
        
        container.appendChild(templateCard);
    });
    
    // Adicionar event listeners
    container.querySelectorAll('.use-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.dataset.templateId;
            useBoardTemplate(templateId);
        });
    });
    
    container.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.dataset.templateId;
            showGroupBoardTemplateDialog(templateId);
        });
    });
    
    container.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.dataset.templateId;
            deleteGroupBoardTemplate(templateId);
        });
    });
}

function renderGroupTagTemplates(templates) {
    const container = document.getElementById('group-tag-templates-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (templates.length === 0) {
        container.innerHTML = '<p class="no-templates">Nenhum conjunto de etiquetas criado para este grupo.</p>';
        return;
    }
    
    templates.forEach(template => {
        const templateCard = document.createElement('div');
        templateCard.className = 'template-card';
        templateCard.innerHTML = `
            <div class="template-icon">${template.icon || '🏷️'}</div>
            <h4>${template.name}</h4>
            <p>${template.description || 'Sem descrição'}</p>
            <div class="tag-list">
                ${template.tags.slice(0, 3).map(tag => 
                    `<span class="tag-pill" style="background-color: ${tag.color}">${tag.name}</span>`
                ).join('')}
                ${template.tags.length > 3 ? '<span>...</span>' : ''}
            </div>
            <div class="template-actions">
                <button class="btn btn-sm btn-primary use-template-btn" data-template-id="${template.id}">Usar</button>
                <button class="btn btn-sm btn-secondary edit-template-btn" data-template-id="${template.id}">Editar</button>
                <button class="btn btn-sm btn-danger delete-template-btn" data-template-id="${template.id}">Excluir</button>
            </div>
        `;
        
        container.appendChild(templateCard);
    });
    
    // Adicionar event listeners
    container.querySelectorAll('.use-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.dataset.templateId;
            useTagTemplate(templateId);
        });
    });
    
    container.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.dataset.templateId;
            showGroupTagTemplateDialog(templateId);
        });
    });
    
    container.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.dataset.templateId;
            deleteGroupTagTemplate(templateId);
        });
    });
}

function showIconPickerDialog(callback) {
    const dialog = document.getElementById('icon-picker-dialog');
    if (!dialog) {
        console.error('Diálogo do seletor de ícones não encontrado no HTML.');
        return;
    }
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

// js/groups.js - PART 3/4 - REFACTORED VERSION

// ===== FUNÇÕES DE SERVIDORES =====

function loadServers() {
    servers = universalLoad('servers') || [];
    renderServers();
}

function saveServers() {
    universalSave('servers', servers);
}

function renderServers() {
    const serversList = document.querySelector('.servers-list');
    if (!serversList) return;
    
    serversList.innerHTML = '';
    
    if (servers.length === 0) {
        serversList.innerHTML = '<p class="no-servers">Nenhum servidor encontrado.</p>';
        return;
    }
    
    servers.forEach(server => {
        const serverItem = document.createElement('div');
        serverItem.className = 'server-item';
        serverItem.innerHTML = `
            <div class="server-info">
                <div class="server-icon">🌐</div>
                <div class="server-details">
                    <h3>${server.name}</h3>
                    <p>${server.url || 'Servidor local'}</p>
                </div>
            </div>
            <div class="server-actions">
                <button class="btn btn-sm btn-primary share-server-btn" data-server-id="${server.id}">Compartilhar</button>
                <button class="btn btn-sm btn-danger delete-server-btn" data-server-id="${server.id}">Excluir</button>
            </div>
        `;
        
        serversList.appendChild(serverItem);
    });
    
    // Adicionar event listeners aos botões
    document.querySelectorAll('.share-server-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const serverId = e.target.dataset.serverId;
            shareServer(serverId);
        });
    });
    
    document.querySelectorAll('.delete-server-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const serverId = e.target.dataset.serverId;
            confirmDeleteServer(serverId);
        });
    });
}

function showCreateServerDialog() {
    const dialog = document.getElementById('server-dialog');
    dialog.querySelector('#server-dialog-title').textContent = 'Criar Novo Servidor';
    dialog.querySelector('#server-name').value = '';
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'success', 'error');
    dialog.showModal();
}

function createServer() {
    const dialog = document.getElementById('server-dialog');
    const serverName = document.getElementById('server-name').value.trim();
    const feedbackEl = dialog.querySelector('.feedback');
    
    if (!serverName) {
        showDialogMessage(feedbackEl, 'O nome do servidor é obrigatório.', 'error');
        return;
    }
    
    const newServer = {
        id: 'server-' + Date.now(),
        name: serverName,
        url: window.location.origin,
        createdAt: new Date().toISOString()
    };
    
    servers.push(newServer);
    saveServers();
    renderServers();
    
    showDialogMessage(feedbackEl, 'Servidor criado com sucesso!', 'success');
    
    setTimeout(() => {
        dialog.close();
    }, 1500);
}

function showAddServerDialog() {
    const dialog = document.getElementById('add-server-dialog');
    document.getElementById('server-url').value = '';
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'success', 'error');
    dialog.showModal();
}

function pasteServerUrl() {
    navigator.clipboard.readText()
        .then(text => {
            if (!text) {
                const feedbackEl = document.querySelector('#add-server-dialog .feedback');
                showDialogMessage(feedbackEl, 'A área de transferência está vazia.', 'error');
                return;
            }
            
            // Validar se o texto é uma URL
            try {
                new URL(text);
                document.getElementById('server-url').value = text;
                const feedbackEl = document.querySelector('#add-server-dialog .feedback');
                showDialogMessage(feedbackEl, 'URL colada com sucesso!', 'success');
            } catch (e) {
                const feedbackEl = document.querySelector('#add-server-dialog .feedback');
                showDialogMessage(feedbackEl, 'O conteúdo da área de transferência não é uma URL válida.', 'error');
            }
        })
        .catch(err => {
            const feedbackEl = document.querySelector('#add-server-dialog .feedback');
            showDialogMessage(feedbackEl, 'Não foi possível acessar a área de transferência.', 'error');
        });
}

function copyServerUrl() {
    const urlInput = document.getElementById('server-share-url');
    urlInput.select();
    
    try {
        navigator.clipboard.writeText(urlInput.value);
        const feedbackEl = document.querySelector('#share-server-dialog .feedback');
        showDialogMessage(feedbackEl, 'URL copiada com sucesso!', 'success');
        
        // Fechar o diálogo após 1.5 segundos
        setTimeout(() => {
            document.getElementById('share-server-dialog').close();
        }, 1500);
    } catch (err) {
        const feedbackEl = document.querySelector('#share-server-dialog .feedback');
        showDialogMessage(feedbackEl, 'Falha ao copiar a URL.', 'error');
    }
}

function confirmDeleteServer(serverId) {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    showConfirmationDialog(
        `Tem certeza que deseja excluir o servidor "${server.name}"? Esta ação não pode ser desfeita.`,
        (dialog) => {
            servers = servers.filter(s => s.id !== serverId);
            saveServers();
            renderServers();
            
            // Mostra a mensagem de sucesso
            showDialogMessage(dialog.querySelector('.feedback'), 'Servidor excluído com sucesso.', 'success');
            
            // Fecha o diálogo automaticamente após 1.5 segundos
            setTimeout(() => {
                dialog.close();
                dialog.remove();
            }, 1500);
            
            // Retorna false para evitar fechamento automático pelo showConfirmationDialog
            return false;
        }
    );
}

function shareServer(serverId) {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    const dialog = document.getElementById('share-server-dialog');
    const shareUrl = server.url || `${window.location.origin}?server=${server.id}`;
    
    document.getElementById('server-share-url').value = shareUrl;
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'success', 'error');
    dialog.showModal();
}

// Adicionar verificação de conexão ao adicionar servidor
async function addServer() {
    const dialog = document.getElementById('add-server-dialog');
    const serverUrl = document.getElementById('server-url').value.trim();
    const feedbackEl = dialog.querySelector('.feedback');
    
    if (!serverUrl) {
        showDialogMessage(feedbackEl, 'A URL do servidor é obrigatória.', 'error');
        return;
    }
    
    // Validar URL
    try {
        new URL(serverUrl);
    } catch (e) {
        showDialogMessage(feedbackEl, 'URL inválida. Por favor, insira uma URL válida.', 'error');
        return;
    }
    
    // Verificar se já existe um servidor com esta URL
    const existingServer = servers.find(s => s.url === serverUrl);
    if (existingServer) {
        showDialogMessage(feedbackEl, 'Este servidor já foi adicionado.', 'error');
        return;
    }
    
    // Verificar conexão com o servidor
    showDialogMessage(feedbackEl, 'Testando conexão com o servidor...', 'info');
    
    const connectionTest = await testServerConnection(serverUrl);
    
    if (!connectionTest.success) {
        showDialogMessage(feedbackEl, `Falha na conexão: ${connectionTest.message}`, 'error');
        return;
    }
    
    // Mostrar confirmação final
    showConfirmationDialog(
        `Confirma a adição do servidor "${new URL(serverUrl).hostname}"?`,
        (confirmDialog) => {
            const newServer = {
                id: 'server-' + Date.now(),
                url: serverUrl,
                name: `Servidor Externo - ${new URL(serverUrl).hostname}`,
                createdAt: new Date().toISOString(),
                isExternal: true,
                status: 'connected'
            };
            
            servers.push(newServer);
            saveServers();
            renderServers();
            
            showDialogMessage(confirmDialog.querySelector('.feedback'), 'Servidor adicionado com sucesso!', 'success');
            
            setTimeout(() => {
                confirmDialog.close();
                dialog.close();
            }, 1500);
            
            return true;
        }
    );
}

// ===== FUNÇÕES DE GRUPOS (ATUALIZADAS) =====

function renderGroups() {
    const adminGroupsContainer = document.querySelector('#admin-groups .groups-grid');
    const memberGroupsContainer = document.querySelector('#member-groups .groups-grid');
    
    if (!adminGroupsContainer || !memberGroupsContainer) return;
    
    // Limpar os containers
    adminGroupsContainer.innerHTML = '';
    memberGroupsContainer.innerHTML = '';
    
    // Separar grupos por tipo (admin vs membro)
    const adminGroups = groups.filter(group => group.adminId === currentUser.id);
    const memberGroups = groups.filter(group => group.adminId !== currentUser.id);
    
    // Renderizar grupos de administrador
    if (adminGroups.length === 0) {
        adminGroupsContainer.innerHTML = '<p class="no-groups-message">Você não administra nenhum grupo.</p>';
    } else {
        adminGroups.forEach(group => {
            const groupCard = createGroupCard(group);
            adminGroupsContainer.appendChild(groupCard);
        });
    }
    
    // Renderizar grupos em que é membro
    if (memberGroups.length === 0) {
        memberGroupsContainer.innerHTML = '<p class="no-groups-message">Você não participa de nenhum grupo como membro.</p>';
    } else {
        memberGroups.forEach(group => {
            const groupCard = createGroupCard(group);
            memberGroupsContainer.appendChild(groupCard);
        });
    }
    
    // Ativar a primeira aba por padrão se houver conteúdo
    const activeTab = document.querySelector('.group-tab.active');
    if (!activeTab) {
        document.querySelector('.group-tab').classList.add('active');
        document.querySelector('.group-content').classList.add('active');
    }
}

// Ela contém o HTML do seu card, mas corrigido para a nova estrutura de dados.
function createGroupCard(group) {
    const groupCard = document.createElement('div');
    groupCard.className = 'group-card';
    groupCard.dataset.groupId = group.id;

    const isAdmin = group.adminId === currentUser.id;
    
    const statusHtml = isAdmin
        ? '<span class="group-status status-admin">Admin</span>'
        : '<span class="group-status status-member">Membro</span>';

    const actionsHtml = isAdmin
        ? `<button class="btn btn-sm btn-secondary" data-action="edit">Editar</button>
           <button class="btn btn-sm btn-danger" data-action="delete">Excluir</button>`
        : `<button class="btn btn-sm btn-danger" data-action="leave">Sair</button>`;

    groupCard.innerHTML = `
        ${statusHtml}
        <div class="group-header">
            <span class="group-icon">👥</span>
            <div class="group-info">
                <h3 class="group-name">${group.name}</h3>
                <p class="group-members">${group.memberIds ? group.memberIds.length : 0} membros</p>
            </div>
        </div>
        <p class="group-description">${group.description || 'Sem descrição.'}</p>
        <div class="group-stats">
            <div class="group-stat">
                <div class="stat-number">${getGroupTaskCount(group.id)}</div>
                <div class="stat-label">Tarefas</div>
            </div>
            <div class="group-stat">
                <div class="stat-number">${getCompletedTaskCount(group.id)}</div>
                <div class="stat-label">Concluídas</div>
            </div>
            <div class="group-stat">
                <div class="stat-number">${getOverdueTaskCount(group.id)}</div>
                <div class="stat-label">Atrasadas</div>
            </div>
        </div>
        <div class="group-actions">
            <button class="btn btn-sm btn-primary" data-action="view">Visualizar</button>
            ${actionsHtml}
        </div>
    `;
    return groupCard;
}

function loadUsersForSelection() {
    const membersSelect = document.getElementById('group-members');
    if (!membersSelect) return;
    
    membersSelect.innerHTML = '';
    const users = getAllUsers();
    const currentUser = getCurrentUser();
    
    users.forEach(user => {
        if (user.id !== currentUser.id) {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            membersSelect.appendChild(option);
        }
    });
}

function createGroup(e) {
    e.preventDefault();
    const form = e.target;
    const feedbackEl = form.querySelector('.feedback');
    
    // Coleta de dados do formulário
    const groupName = document.getElementById('group-name').value.trim();
    const groupDescription = document.getElementById('group-description').value;
    const groupAccess = document.getElementById('group-access').value;
    const groupTagTemplate = document.getElementById('group-tag-template').value;
    const permissions = {
        createBoards: document.getElementById('perm-create-boards').checked,
        editBoards: document.getElementById('perm-edit-boards').checked,
        createColumns: document.getElementById('perm-create-columns').checked,
        editColumns: document.getElementById('perm-edit-columns').checked,
        createTags: document.getElementById('perm-create-tags').checked,
        editTags: document.getElementById('perm-edit-tags').checked,
        createCards: document.getElementById('perm-create-cards').checked
    };
    const boards = [];
    document.querySelectorAll('#group-boards-container .group-board-item').forEach(item => {
        const boardName = item.querySelector('.board-info strong').textContent;
        const templateElement = item.querySelector('.template-badge');
        const template = templateElement ? templateElement.textContent.replace('Template: ', '') : '';
        boards.push({ name: boardName, template: template });
    });
    const membersSelect = document.getElementById('group-members');
    const selectedMembers = Array.from(membersSelect.selectedOptions).map(option => option.value);

    if (!groupName) {
        showDialogMessage(feedbackEl, 'O nome do grupo é obrigatório.', 'error');
        return;
    }
    
    showConfirmationDialog(
        `Confirma a criação do grupo "${groupName}"?`,
        (dialog) => {
            const existingGroup = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
            if (existingGroup) {
                showDialogMessage(dialog.querySelector('.feedback'), 'Já existe um grupo com este nome.', 'error');
                
                setTimeout(() => {
                    dialog.close();
                    switchTab('create-group');
                }, 1500);
                
                return false;
            }
            
            const currentUser = getCurrentUser();
            if (!currentUser) {
                showDialogMessage(dialog.querySelector('.feedback'), 'Erro: usuário não autenticado.', 'error');
                return false;
            }
            
            const newGroup = {
                name: groupName,
                description: groupDescription,
                access: groupAccess,
                tagTemplate: groupTagTemplate,
                permissions: permissions,
                boards: boards,
                memberIds: [currentUser.id], // Apenas o criador é adicionado inicialmente
                adminId: currentUser.id,
                createdAt: new Date().toISOString(),
                statistics: {
                    totalCards: 0,
                    completedCards: 0,
                    activeCards: 0
                }
            };
            
            const savedGroup = saveGroup(newGroup);

            if (savedGroup) {
                // Enviar notificações para os membros selecionados
                selectedMembers.forEach(memberId => {
                    sendGroupInvitation(savedGroup.id, memberId, currentUser);
                });

                showDialogMessage(dialog.querySelector('.feedback'), 'Grupo criado com sucesso! Convites enviados.', 'success');
                
                // Atualizar a lista de grupos
                loadGroups();
                
                setTimeout(() => {
                    dialog.close();
                    form.reset();
                    document.getElementById('group-boards-container').innerHTML = '';
                    switchTab('my-groups');
                }, 1500);
                
                return true;
            } else {
                showDialogMessage(dialog.querySelector('.feedback'), 'Erro ao criar o grupo.', 'error');
                return false;
            }
        }
    );
}

function cancelGroupCreation() {
    showConfirmationDialog(
        'Tem certeza que deseja cancelar a criação do grupo? Todas as informações serão perdidas.',
        (dialog) => {
            const feedbackEl = dialog.querySelector('.feedback');
            showDialogMessage(feedbackEl, 'Alterações descartadas.', 'info');
            
            setTimeout(() => {
                dialog.close();
                document.getElementById('create-group-form').reset();
                document.getElementById('group-boards-container').innerHTML = '';
                switchTab('my-groups');
            }, 1500);
            
            return true;
        }
    );
}

function handleGroupAction(e) {
    const action = e.target.dataset.action;
    const groupId = e.target.dataset.groupId;
    
    // Define o grupo atual para outras funções usarem
    currentGroup = groups.find(group => group.id === groupId);
    if (!currentGroup) {
        showFloatingMessage('Grupo não encontrado.', 'error');
        return;
    }
    
    switch (action) {
        case 'view':
            viewGroup(currentGroup);
            break;
        case 'edit':
            editGroup(currentGroup);
            break;
        case 'delete':
            deleteGroup(); // <-- REMOVIDO o parâmetro 'group'
            break;
        case 'leave':
            leaveGroup(currentGroup);
            break;
        default:
            showFloatingMessage('Ação inválida.', 'error');
    }
}

function viewGroup(group) {
    // Preencher nome do grupo nas estatísticas
    document.getElementById('statistics-group-name').textContent = group.name;
    
    // Alternar para a aba de estatísticas
    switchTab('statistics');
    
    // Carregar estatísticas do grupo
    loadGroupStatistics(group.id);
}

function editGroup(group) {
    const dialog = document.getElementById('edit-group-dialog');
    const form = document.getElementById('edit-group-form');
    
    // Preencher formulário com dados atuais
    document.getElementById('edit-group-name').value = group.name;
    document.getElementById('edit-group-description').value = group.description || '';
    document.getElementById('edit-group-access').value = group.access || 'public';
    
    // Carregar lista de membros (mas a interface mostrará "participantes")
    loadGroupMembers(group);
    
    // Limpar feedback anterior
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    
    // Mostrar diálogo
    dialog.showModal();
}

function saveGroupChanges(e) {
    e.preventDefault();
    
    const dialog = document.getElementById('edit-group-dialog');
    const feedbackEl = dialog.querySelector('.feedback');
    
    const name = document.getElementById('edit-group-name').value.trim();
    if (!name) {
        showDialogMessage(feedbackEl, 'O nome do grupo é obrigatório.', 'error');
        return;
    }
    
    // Verificar se outro grupo já tem este nome (excluindo o grupo atual)
    const existingGroup = groups.find(g => 
        g.name.toLowerCase() === name.toLowerCase() && 
        g.id !== currentGroup.id
    );
    
    if (existingGroup) {
        showDialogMessage(feedbackEl, 'Já existe um grupo com este nome.', 'error');
        return;
    }
    
    // Mostrar confirmação antes de salvar
    showConfirmationDialog(
        'Deseja salvar todas as alterações no grupo?',
        (confirmationDialog) => {
            // Atualizar grupo
            currentGroup.name = name;
            currentGroup.description = document.getElementById('edit-group-description').value;
            currentGroup.access = document.getElementById('edit-group-access').value;
            
            // Enviar notificações para participantes pendentes
            if (window.pendingParticipants && window.pendingParticipants.length > 0) {
                window.pendingParticipants.forEach(memberId => {
                    sendGroupInvitation(currentGroup.id, memberId, currentUser);
                });
                // Limpar lista de participantes pendentes
                window.pendingParticipants = [];
            }
            
            // Salvar alterações
            if (saveGroup(currentGroup)) {
                showDialogMessage(confirmationDialog.querySelector('.feedback'), 'Grupo atualizado com sucesso! Notificações enviadas.', 'success');
                
                // Atualizar exibição
                renderGroups();
                
                // Fechar diálogos após breve delay
                setTimeout(() => {
                    confirmationDialog.close();
                    dialog.close();
                }, 1500);
                
                return true;
            } else {
                showDialogMessage(confirmationDialog.querySelector('.feedback'), 'Erro ao salvar alterações.', 'error');
                return false;
            }
        }
    );
}

function deleteGroup() {
    if (!currentGroup || currentGroup.adminId !== currentUser.id) {
        showFloatingMessage('Apenas o administrador pode excluir o grupo.', 'error');
        return;
    }
    
    showConfirmationDialog(
        `Tem certeza que deseja excluir permanentemente o grupo "${currentGroup.name}"?`,
        async (confirmationDialog) => {
            // Fechar o diálogo de confirmação inicial
            confirmationDialog.close();
            
            // Abrir diálogo de senha personalizado para esta operação
            const passwordDialog = document.createElement('dialog');
            passwordDialog.className = 'draggable';
            passwordDialog.innerHTML = `
                <h3 class="drag-handle">Confirmação de Segurança</h3>
                <div class="form-group">
                    <label for="confirm-password-input">Digite sua senha ou a senha mestra para excluir o grupo "${currentGroup.name}":</label>
                    <input type="password" id="confirm-password-input" autocomplete="current-password" required>
                </div>
                <div class="feedback"></div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="cancel-password-btn">Cancelar</button>
                    <button class="btn btn-primary" id="confirm-password-btn">Excluir Grupo</button>
                </div>
            `;
            
            document.body.appendChild(passwordDialog);
            passwordDialog.showModal();
            
            const confirmBtn = passwordDialog.querySelector('#confirm-password-btn');
            const cancelBtn = passwordDialog.querySelector('#cancel-password-btn');
            const passwordInput = passwordDialog.querySelector('#confirm-password-input');
            const feedbackEl = passwordDialog.querySelector('.feedback');

            const closePasswordDialog = () => {
                passwordDialog.close();
                setTimeout(() => passwordDialog.remove(), 300);
            };

            const handleConfirm = async () => {
                const password = passwordInput.value;
                if (!password) {
                    showDialogMessage(feedbackEl, 'A senha é obrigatória.', 'error');
                    return;
                }
                
                if (password === currentUser.password || validateMasterPassword(password)) {
                    // Desabilitar botões durante a operação
                    confirmBtn.disabled = true;
                    cancelBtn.disabled = true;
                    
                    // Processar a exclusão do grupo
                    if (deleteGroupStorage(currentGroup.id)) {
                        // Lógica de limpeza de referências
                        const groupMemberIds = currentGroup.memberIds || [];
                        groupMemberIds.forEach(memberId => {
                            const userProfile = getUserProfile(memberId);
                            if (userProfile && userProfile.groupIds) {
                                userProfile.groupIds = userProfile.groupIds.filter(id => id !== currentGroup.id);
                                saveUserProfile(userProfile);
                            }
                        });
                        
                        // Mostrar mensagem de sucesso DENTRO do diálogo de senha
                        showDialogMessage(feedbackEl, 'Grupo excluído com sucesso!', 'success');
                        loadGroups();
                        
                        // Fechar o diálogo e mudar de aba após 1.5 segundos
                        setTimeout(() => {
                            closePasswordDialog();
                            switchTab('my-groups');
                        }, 1500);
                    } else {
                        showDialogMessage(feedbackEl, 'Erro ao excluir o grupo.', 'error');
                        confirmBtn.disabled = false;
                        cancelBtn.disabled = false;
                    }
                } else {
                    showDialogMessage(feedbackEl, 'Senha incorreta. Tente novamente.', 'error');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            };

            cancelBtn.addEventListener('click', () => {
                showDialogMessage(feedbackEl, 'Exclusão cancelada.', 'info');
                confirmBtn.disabled = true;
                cancelBtn.disabled = true;
                setTimeout(closePasswordDialog, 1500);
            });

            confirmBtn.addEventListener('click', handleConfirm);
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleConfirm();
            });
        }
    );
}

// js/groups.js - PART 4/4 - REFACTORED VERSION

// Função promptForPassword atualizada com feedback no diálogo
function promptForPassword() {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'draggable';
        dialog.innerHTML = `
            <h3 class="drag-handle">Confirmação de Segurança</h3>
            <div class="form-group">
                <label for="confirm-password-input">Digite sua senha ou a senha mestra:</label>
                <input type="password" id="confirm-password-input" autocomplete="current-password" required>
            </div>
            <div class="feedback"></div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancel-password-btn">Cancelar</button>
                <button class="btn btn-primary" id="confirm-password-btn">Confirmar</button>
            </div>
        `;
        
        document.body.appendChild(dialog);
        dialog.showModal();
        
        const confirmBtn = dialog.querySelector('#confirm-password-btn');
        const cancelBtn = dialog.querySelector('#cancel-password-btn');
        const passwordInput = dialog.querySelector('#confirm-password-input');
        const feedbackEl = dialog.querySelector('.feedback');

        const closeAndResolve = (value) => {
            dialog.close();
            setTimeout(() => {
                dialog.remove();
                resolve(value);
            }, 300);
        };

        const handleConfirm = () => {
            const password = passwordInput.value;
            if (!password) {
                showDialogMessage(feedbackEl, 'A senha é obrigatória.', 'error');
                return;
            }
            if (password === currentUser.password || validateMasterPassword(password)) {
                closeAndResolve(password);
            } else {
                showDialogMessage(feedbackEl, 'Senha incorreta. Tente novamente.', 'error');
                passwordInput.value = '';
                passwordInput.focus();
            }
        };

        cancelBtn.addEventListener('click', () => {
            showDialogMessage(feedbackEl, 'Operação cancelada.', 'info');
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            setTimeout(() => closeAndResolve(null), 1500);
        });

        confirmBtn.addEventListener('click', handleConfirm);
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleConfirm();
        });
    });
}

function leaveGroup() {
    if (!currentGroup) {
        showFloatingMessage('Nenhum grupo selecionado.', 'error');
        return;
    }
    if (currentGroup.adminId === currentUser.id) {
        showFloatingMessage('Você não pode sair de um grupo que administra. Transfira a administração primeiro.', 'error');
        return;
    }

    showConfirmationDialog(
        `Tem certeza que deseja sair do grupo "${currentGroup.name}"?`,
        (dialog) => {
            // Fechar o diálogo de confirmação
            dialog.close();
            
            // Mostrar diálogo de senha personalizado
            const passwordDialog = document.createElement('dialog');
            passwordDialog.className = 'draggable';
            passwordDialog.innerHTML = `
                <h3 class="drag-handle">Confirmação de Segurança</h3>
                <div class="form-group">
                    <label for="confirm-password-input">Digite sua senha para sair do grupo "${currentGroup.name}":</label>
                    <input type="password" id="confirm-password-input" autocomplete="current-password" required>
                </div>
                <div class="feedback"></div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="cancel-password-btn">Cancelar</button>
                    <button class="btn btn-primary" id="confirm-password-btn">Confirmar</button>
                </div>
            `;
            
            document.body.appendChild(passwordDialog);
            passwordDialog.showModal();
            
            const confirmBtn = passwordDialog.querySelector('#confirm-password-btn');
            const cancelBtn = passwordDialog.querySelector('#cancel-password-btn');
            const passwordInput = passwordDialog.querySelector('#confirm-password-input');
            const feedbackEl = passwordDialog.querySelector('.feedback');

            const handleConfirm = async () => {
                const password = passwordInput.value;
                if (!password) {
                    showDialogMessage(feedbackEl, 'A senha é obrigatória.', 'error');
                    return;
                }
                
                if (password === currentUser.password || validateMasterPassword(password)) {
                    // Processar a saída do grupo
                    const groupData = getGroup(currentGroup.id);
                    const userProfile = getUserProfile(currentUser.id);

                    if (groupData && groupData.memberIds) {
                        groupData.memberIds = groupData.memberIds.filter(id => id !== currentUser.id);
                        saveGroup(groupData);
                    }

                    if (userProfile && userProfile.groupIds) {
                        userProfile.groupIds = userProfile.groupIds.filter(id => id !== currentGroup.id);
                        saveUserProfile(userProfile);
                    }

                    showDialogMessage(feedbackEl, `Você saiu do grupo "${currentGroup.name}".`, 'success');
                    
                    setTimeout(() => {
                        passwordDialog.close();
                        passwordDialog.remove();
                        loadGroups();
                        switchTab('my-groups');
                    }, 1500);
                } else {
                    showDialogMessage(feedbackEl, 'Senha incorreta. Tente novamente.', 'error');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            };

            cancelBtn.addEventListener('click', () => {
                passwordDialog.close();
                passwordDialog.remove();
            });

            confirmBtn.addEventListener('click', handleConfirm);
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleConfirm();
            });
        }
    );
}

// ===== FUNÇÕES DE ESTATÍSTICAS E RELATÓRIOS =====

function loadStatistics() {
    if (!currentGroup) {
        // Mostrar mensagem de placeholder se nenhum grupo estiver selecionado
        document.querySelector('#statistics .placeholder-message').style.display = 'block';
        document.querySelector('#statistics .stats-sections').style.display = 'none';
        return;
    }
    
    // Esconder mensagem de placeholder e mostrar estatísticas
    document.querySelector('#statistics .placeholder-message').style.display = 'none';
    document.querySelector('#statistics .stats-sections').style.display = 'block';
    
    // Carregar estatísticas do grupo atual
    loadGroupStatistics(currentGroup.id);
}

function loadGroupStatistics(groupId) {
    // Simular dados de estatísticas
    const statistics = {
        daily: generateDailyStats(),
        weekly: generateWeeklyStats(),
        monthly: generateMonthlyStats()
    };
    
    renderStatistics(statistics);
}

function generateDailyStats() {
    return {
        date: new Date().toLocaleDateString('pt-BR'),
        completedCards: Math.floor(Math.random() * 20) + 5,
        createdCards: Math.floor(Math.random() * 25) + 10,
        meetings: Math.floor(Math.random() * 3) + 1,
        participants: generateParticipantStats(5)
    };
}

function generateWeeklyStats() {
    return {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'),
        endDate: new Date().toLocaleDateString('pt-BR'),
        completedCards: Math.floor(Math.random() * 100) + 50,
        createdCards: Math.floor(Math.random() * 120) + 60,
        meetings: Math.floor(Math.random() * 10) + 5,
        participants: generateParticipantStats(8)
    };
}

function generateMonthlyStats() {
    return {
        month: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        completedCards: Math.floor(Math.random() * 400) + 200,
        createdCards: Math.floor(Math.random() * 500) + 250,
        meetings: Math.floor(Math.random() * 20) + 10,
        participants: generateParticipantStats(12),
        progress: generateProgressData()
    };
}

function generateParticipantStats(count) {
    const participants = [];
    const users = getAllUsers();
    
    for (let i = 0; i < count && i < users.length; i++) {
        participants.push({
            id: users[i].id,
            name: users[i].name,
            completed: Math.floor(Math.random() * 20) + 5,
            productivity: Math.floor(Math.random() * 100) + 1,
            role: i === 0 ? 'Administrador' : 'Membro',
            avatar: users[i].avatar || `https://ui-avatars.com/api/?name=${users[i].name}&background=random&size=32`
        });
    }
    
    return participants;
}

function generateProgressData() {
    return {
        todo: Math.floor(Math.random() * 30) + 10,
        inProgress: Math.floor(Math.random() * 20) + 5,
        inReview: Math.floor(Math.random() * 15) + 5,
        completed: Math.floor(Math.random() * 50) + 20
    };
}

function renderStatistics(statistics) {
    // Atualizar estatísticas resumidas
    document.getElementById('total-cards').textContent = 
        statistics.daily.createdCards + statistics.weekly.createdCards + statistics.monthly.createdCards;
    document.getElementById('completed-cards').textContent = 
        statistics.daily.completedCards + statistics.weekly.completedCards + statistics.monthly.completedCards;
    document.getElementById('active-cards').textContent = 
        (statistics.daily.createdCards + statistics.weekly.createdCards + statistics.monthly.createdCards) - 
        (statistics.daily.completedCards + statistics.weekly.completedCards + statistics.monthly.completedCards);
    
    // Renderizar tabela de participantes
    renderParticipantsTable(statistics.monthly.participants);
    
    // Renderizar gráfico de status (placeholder)
    renderStatusChart(statistics.monthly.progress);
}

function renderParticipantsTable(participants) {
    const tableBody = document.getElementById('participants-table-body');
    tableBody.innerHTML = '';
    
    participants.forEach(participant => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${participant.name}</td>
            <td>${participant.role}</td>
            <td>${participant.completed}</td>
            <td>${participant.productivity}%</td>
        `;
        tableBody.appendChild(row);
    });
}

function renderStatusChart(progressData) {
    // Placeholder para gráfico - em uma implementação real, usaria Chart.js ou similar
    const chartContainer = document.getElementById('status-chart');
    const legendContainer = document.getElementById('status-legend');
    
    chartContainer.innerHTML = '<p>Gráfico de status dos cartões será exibido aqui.</p>';
    
    legendContainer.innerHTML = `
        <div class="legend-item">
            <div class="legend-color" style="background-color: #e74c3c;"></div>
            <div class="legend-label">A Fazer: ${progressData.todo}%</div>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: #f39c12;"></div>
            <div class="legend-label">Em Progresso: ${progressData.inProgress}%</div>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: #3498db;"></div>
            <div class="legend-label">Em Revisão: ${progressData.inReview}%</div>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: #2ecc71;"></div>
            <div class="legend-label">Concluído: ${progressData.completed}%</div>
        </div>
    `;
}

// ===== FUNÇÕES DE UTILIDADE =====

function applyUserTheme() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const userTheme = currentUser.theme || 'auto';
    const systemTheme = localStorage.getItem('appTheme') || 'dark';
    
    document.body.classList.remove('light-mode', 'dark-mode');

    if (userTheme === 'light') {
        document.body.classList.add('light-mode');
    } else if (userTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        if (systemTheme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.add('dark-mode');
        }
    }
}

function handleConfirmation() {
    const dialog = document.getElementById('confirmation-dialog');
    const feedbackEl = dialog.querySelector('.feedback');
    
    if (dialog._confirmCallback) {
        const result = dialog._confirmCallback(dialog);
        if (result === true) {
            dialog.close();
        } else if (result === false) {
            // Ação falhou, manter diálogo aberto
            showDialogMessage(feedbackEl, 'Não foi possível completar a ação.', 'error');
        }
    } else {
        dialog.close();
    }
}

// Funções auxiliares (mantidas do original)
function getGroupTaskCount(groupId) {
    return Math.floor(Math.random() * 50);
}

function getCompletedTaskCount(groupId) {
    return Math.floor(Math.random() * 50);
}

function getOverdueTaskCount(groupId) {
    return Math.floor(Math.random() * 10);
}

async function testServerConnection(serverUrl) {
    try {
        const response = await fetch(`${serverUrl}/api/status`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return { success: true, message: 'Conexão bem-sucedida', data: data };
        } else {
            return { success: false, message: 'Servidor respondeu com erro' };
        }
    } catch (error) {
        return { success: false, message: 'Não foi possível conectar ao servidor' };
    }
}

function saveNotification(notification) {
    // Obter notificações existentes
    let notifications = universalLoad('notifications') || [];
    
    // Adicionar nova notificação
    notifications.push(notification);
    
    // Salvar notificações
    universalSave('notifications', notifications);
    
    return true;
}
function showConfirmationDialog(message, onConfirm) {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Confirmação</h3>
        <p>${message}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button id="confirm-cancel-btn" class="btn btn-secondary">Não</button>
            <button id="confirm-ok-btn" class="btn btn-primary">Sim</button>
        </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();

    const confirmBtn = dialog.querySelector('#confirm-ok-btn');
    const cancelBtn = dialog.querySelector('#confirm-cancel-btn');
    const feedbackEl = dialog.querySelector('.feedback');

    // Função para fechar e remover o diálogo de forma segura
    const closeDialog = () => {
        dialog.close();
        setTimeout(() => dialog.remove(), 300);
    };

    // Botão "Não" / Cancelar - mostra mensagem e depois fecha
    cancelBtn.addEventListener('click', () => {
        showDialogMessage(feedbackEl, 'Operação cancelada.', 'info');
        
        // Desabilita os botões após clicar em "Não"
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        
        // Fecha o diálogo após 1.5 segundos
        setTimeout(() => {
            closeDialog();
        }, 1500);
    });

    // Botão "Sim" / Confirmar
    confirmBtn.addEventListener('click', () => {
        // Desabilita os botões para prevenir múltiplos cliques
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        
        // Executa a ação de confirmação
        const result = onConfirm(dialog);
        
        // Se a ação retornar false, reabilita os botões
        if (result === false) {
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
        }
        // Se retornar true, o diálogo será fechado pela função onConfirm
    });
}

function showDialogMessage(element, message, type = 'info') {
    if (!element) return;
    
    element.textContent = message;
    element.className = `feedback ${type} show`;
    
    if (type !== 'error') {
        setTimeout(() => {
            element.classList.remove('show');
        }, 3000);
    }
}

// Adicionar event listeners para as abas de grupo
document.querySelectorAll('.group-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remover classe active de todas as abas e conteúdos
        document.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.group-content').forEach(c => c.classList.remove('active'));
        
        // Adicionar classe active à aba clicada
        tab.classList.add('active');
        
        // Mostrar o conteúdo correspondente
        const target = tab.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
    });
});

function removeMemberFromGroup(group, memberId) {
    const users = getAllUsers();
    const member = users.find(u => u.id === memberId);
    if (!member) return;
    
    showConfirmationDialog(
        `Tem certeza que deseja remover ${member.name} do grupo?`,
        (dialog) => {
            // Remover o membro do grupo (em memória)
            group.memberIds = group.memberIds.filter(id => id !== memberId);
            
            // Atualizar a lista de membros
            loadGroupMembers(group);

            // Enviar notificação de remoção
            notifyGroupRemoval(group.name, memberId);
            
            // Mostrar feedback de sucesso
            showDialogMessage(dialog.querySelector('.feedback'), `${member.name} será removido do grupo quando você salvar as alterações.`, 'success');
            
            // Fechar apenas o diálogo de confirmação, não o de edição
            setTimeout(() => {
                dialog.close();
            }, 1500);
            
            return true;
        }
    );
}

// Função para mostrar diálogo de adicionar participante
function showAddParticipantDialog() {
    const dialog = document.getElementById('add-participant-dialog');
    if (!dialog) {
        console.error('Diálogo de adicionar participante não encontrado');
        return;
    }
    
    const select = document.getElementById('participant-select');
    if (!select) {
        console.error('Elemento participant-select não encontrado');
        return;
    }
    
    // Limpar seleção anterior
    select.innerHTML = '';
    
    // Obter todos os usuários
    const users = getAllUsers();
    const currentUser = getCurrentUser();
    
    // Filtrar usuários que ainda não estão no grupo
    const availableUsers = users.filter(user => 
        user.id !== currentUser.id && 
        !currentGroup.memberIds.includes(user.id)
    );
    
    if (availableUsers.length === 0) {
        select.innerHTML = '<option value="">Nenhum usuário disponível</option>';
        select.disabled = true;
    } else {
        select.disabled = false;
        availableUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            select.appendChild(option);
        });
    }
    
    // Limpar feedback
    const feedbackEl = dialog.querySelector('.feedback');
    if (feedbackEl) {
        feedbackEl.textContent = '';
        feedbackEl.className = 'feedback';
    }
    
    dialog.showModal();
}

// Adicione esta função para enviar convites:
function sendGroupInvitation(groupId, userId, inviter) {
    const group = getGroup(groupId);
    if (!group) return;
    
    // Usar a nova função de notificação
    addGroupInvitationNotification(
        group.name, 
        groupId, 
        inviter.name, 
        inviter.id, 
        userId
    );
}

function notifyGroupRemoval(groupName, userId) {
    const currentUser = getCurrentUser();
    addGroupRemovalNotification(groupName, currentUser.name, userId);
}

function loadGroupMembers(group) {
    const membersList = document.getElementById('group-members-list');
    membersList.innerHTML = '';
    
    // Obter todos os usuários
    const users = getAllUsers();
    
    group.memberIds.forEach(memberId => {
        const user = users.find(u => u.id === memberId);
        if (!user) return;
        
        const isAdmin = group.adminId === memberId;
        
        const memberItem = document.createElement('div');
        memberItem.className = 'group-member-item';
        memberItem.innerHTML = `
            <div class="group-member-info">
                <div class="member-avatar">
                    ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div>${user.name}</div>
                    <div class="member-email">${user.email || ''}</div>
                </div>
            </div>
            <div>
                ${isAdmin ? 
                    '<span class="admin-badge">Administrador</span>' : 
                    `<button class="btn btn-sm btn-danger remove-member-btn" data-member-id="${memberId}">Remover</button>`
                }
            </div>
        `;
        
        membersList.appendChild(memberItem);
    });
    
    // Adicionar event listeners para os botões de remover
    membersList.querySelectorAll('.remove-member-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const memberId = e.target.dataset.memberId;
            removeMemberFromGroup(group, memberId);
        });
    });
}