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
  getSystemTagTemplates,
  saveBoard,
  saveColumn,
  getFullBoardData
} from './storage.js';
import { 
  showFloatingMessage, 
  initDraggableElements,
  updateUserAvatar,
  showConfirmationDialog,
  showDialogMessage,
  showIconPickerDialog
} from './ui-controls.js';
import { 
    addGroupInvitationNotification,
    addGroupRemovalNotification,
    addMeetingNotification,
    addMessageNotification,
    addReportNotification
} from './notifications.js';

let currentUser;
let allUsers = [];
let groups = [];
let servers = [];
let currentGroup = null;
let isGroupSaved = true; // Flag para rastrear alterações no diálogo de edição

// groups.js - Adicione este código na função initGroupsPage(), após a verificação de estatísticas
export function initGroupsPage() {
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

    // Lógica movida para o final para garantir que os grupos já foram carregados
    if (selectedGroupId && openStatistics === 'true') {
        localStorage.removeItem('selectedGroupId');
        localStorage.removeItem('openStatistics');
        const groupSelect = document.getElementById('stats-group-select');
        if(groupSelect) groupSelect.value = selectedGroupId;
        switchTab('statistics');
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

    
    // --- ABA "REUNIÕES" ---
    document.getElementById('btn-schedule-meeting')?.addEventListener('click', showMeetingDialog);

    // --- ABA "CRIAR GRUPO" ---
    document.getElementById('btn-add-board')?.addEventListener('click', showAddBoardToGroupDialog);
    document.getElementById('group-report-frequency')?.addEventListener('change', handleReportFrequencyChange);
    document.getElementById('edit-group-report-frequency')?.addEventListener('change', handleReportFrequencyChange);
    document.getElementById('btn-message-all')?.addEventListener('click', sendMessageToAllMembers);
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
// Lógica de troca de abas internas (Grupos que Criei / Grupos que Participo)
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
    }); // Esta lógica substitui a função switchGroupTab
});
    document.getElementById('edit-group-form')?.addEventListener('submit', saveGroupChanges);
document.getElementById('cancel-edit-group')?.addEventListener('click', () => {
    const editDialog = document.getElementById('edit-group-dialog');
    if (isGroupSaved) {
        editDialog.close();
        return;
    }

    showConfirmationDialog(
        'Você tem alterações não salvas. Deseja descartá-las?',
        (confirmationDialog) => {
            showDialogMessage(confirmationDialog, 'Alterações descartadas.', 'info');
            setTimeout(() => {
                editDialog.close();
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
    const dialog = document.getElementById('add-participant-dialog');
    const memberId = select.value;
    
    if (!memberId || select.disabled) {
        showDialogMessage(dialog, 'Selecione um usuário válido para adicionar.', 'error');
        return;
    }
    
    // Enviar solicitação via notificação
    sendGroupInvitation(currentGroup.id, memberId, currentUser);
    
    showDialogMessage(dialog, 'Convite enviado com sucesso!', 'success');
    
    // Marcar como não salvo para que o admin salve o grupo
    isGroupSaved = false;
    
    // Fechar diálogo após breve delay
    setTimeout(() => {
        document.getElementById('add-participant-dialog').close();
    }, 1500);
});

        // Botão para adicionar participante

    document.getElementById('cancel-add-participant')?.addEventListener('click', () => {
    const dialog = document.getElementById('add-participant-dialog');
    showDialogMessage(dialog, 'Operação cancelada.', 'info');
    
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
        const dialog = document.getElementById('server-dialog');
        showDialogMessage(dialog, 'Operação cancelada.', 'info');
        setTimeout(() => dialog.close(), 1500);
    });
    document.getElementById('confirm-add-server-btn')?.addEventListener('click', addServer);
    document.getElementById('cancel-add-server-btn')?.addEventListener('click', () => {
        const dialog = document.getElementById('add-server-dialog');
        showDialogMessage(dialog, 'Operação cancelada.', 'info');
        setTimeout(() => dialog.close(), 1500);
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
    } else if (tabId === 'group-templates') {
        loadGroupTemplates();
    } else if (tabId === 'statistics') {
        const groupSelect = document.getElementById('stats-group-select');
        populateGroupSelectorForStats(groupSelect);
        const selectedGroupId = groupSelect.value;
        if (selectedGroupId) loadAndRenderStatistics(selectedGroupId);
    } else if (tabId === 'meetings') {
        loadAndRenderMeetings();
    }
}

function handleReportFrequencyChange(e) {
    const frequency = e.target.value;
    // Encontra o container pai (seja o formulário de criação ou o diálogo de edição)
    const parentContainer = e.target.closest('form, dialog');
    if (!parentContainer) return;

    const weekContainer = parentContainer.querySelector('[id*="-report-day-of-week-container"]');
    const monthContainer = parentContainer.querySelector('[id*="-report-day-of-month-container"]');

    if (weekContainer) weekContainer.classList.toggle('hidden', frequency !== 'weekly');
    if (monthContainer) monthContainer.classList.toggle('hidden', frequency !== 'monthly');
}

function loadAndRenderMeetings() {
    const meetingsListContainer = document.getElementById('meetings-list');
    const scheduleBtn = document.getElementById('btn-schedule-meeting');
    if (!meetingsListContainer || !scheduleBtn) return;

    const userGroups = getAllGroups().filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    const isAdminOfAnyGroup = userGroups.some(g => g.adminId === currentUser.id);

    // Mostra o botão de agendar apenas para administradores
    scheduleBtn.style.display = isAdminOfAnyGroup ? 'block' : 'none';

    const allMeetings = userGroups.flatMap(group => 
        (group.meetings || []).map(meeting => ({ ...meeting, groupName: group.name }))
    );

    // Ordena as reuniões pela data, das mais próximas para as mais distantes
    allMeetings.sort((a, b) => new Date(a.date) - new Date(b.date));

    meetingsListContainer.innerHTML = '';

    if (allMeetings.length === 0) {
        meetingsListContainer.innerHTML = '<p class="no-templates">Nenhuma reunião agendada para os seus grupos.</p>';
        return;
    }

    allMeetings.forEach(meeting => {
        const meetingCard = document.createElement('div');
        meetingCard.className = 'meeting-card';

        const date = new Date(meeting.date);
        const day = date.getDate();
        const month = date.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');

        meetingCard.innerHTML = `
            <div class="meeting-date-box">
                <span class="meeting-day">${day}</span>
                <span class="meeting-month">${month}</span>
            </div>
            <div class="meeting-details">
                <h4 class="meeting-title">${meeting.title}</h4>
                <div class="meeting-meta">
                    <span><strong>Grupo:</strong> ${meeting.groupName}</span>
                    <span><strong>Horário:</strong> ${meeting.time}</span>
                    ${meeting.location ? `<span><strong>Local:</strong> ${meeting.location}</span>` : ''}
                </div>
            </div>
        `;
        meetingsListContainer.appendChild(meetingCard);
    });
}

function showMeetingDialog() {
    const dialog = document.getElementById('meeting-dialog');
    const groupSelect = document.getElementById('meeting-group-select');

    // Popula o select com os grupos que o usuário administra
    groupSelect.innerHTML = '';
    const adminGroups = getAllGroups().filter(g => g.adminId === currentUser.id);
    adminGroups.forEach(group => {
        groupSelect.innerHTML += `<option value="${group.id}">${group.name}</option>`;
    });

    // Limpa campos
    document.getElementById('meeting-title').value = '';
    document.getElementById('meeting-date').value = '';
    document.getElementById('meeting-time').value = '';
    document.getElementById('meeting-location').value = '';
    document.getElementById('meeting-description').value = '';

    // Adiciona o listener de salvamento
    const saveBtn = document.getElementById('save-meeting-btn');
    // Clona para remover listeners antigos e evitar duplicação
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', saveMeeting);

    dialog.showModal();
}

function saveMeeting() {
    const dialog = document.getElementById('meeting-dialog');
    const groupId = document.getElementById('meeting-group-select').value;
    const title = document.getElementById('meeting-title').value.trim();
    const date = document.getElementById('meeting-date').value;
    const time = document.getElementById('meeting-time').value;

    if (!groupId || !title || !date || !time) {
        showDialogMessage(dialog, 'Grupo, título, data e horário são obrigatórios.', 'error');
        return;
    }

    const group = getGroup(groupId);
    if (!group) return;

    if (!group.meetings) group.meetings = [];

    const newMeeting = {
        id: 'meeting-' + Date.now(),
        title, date, time,
        location: document.getElementById('meeting-location').value.trim(),
        description: document.getElementById('meeting-description').value.trim()
    };

    group.meetings.push(newMeeting);
    saveGroup(group);

    // Envia notificação para todos os membros
    group.memberIds.forEach(memberId => {
        // Não envia para si mesmo
        if (memberId !== currentUser.id) {
            addMeetingNotification(title, group.name, `${date}T${time}`);
        }
    });

    showDialogMessage(dialog, 'Reunião agendada e membros notificados!', 'success');
    setTimeout(() => {
        dialog.close();
        loadAndRenderMeetings(); // Atualiza a lista
    }, 1500);
}

function addBoardToGroup(name, templateId, description) {
    const container = document.getElementById('group-boards-container');
    const boardId = 'board-' + Date.now();
    
    // Encontrar o template selecionado
    let templateName = "";
    if (templateId) {
        const allTemplates = getSystemBoardTemplates();
        const foundTemplate = allTemplates.find(t => t.id === templateId);
        if (foundTemplate) templateName = foundTemplate.name;
    }
    
    const boardElement = document.createElement('div');
    boardElement.className = 'group-board-item';
    boardElement.dataset.id = boardId;
    boardElement.dataset.templateId = templateId || '';
    boardElement.dataset.description = description || '';
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

function showAddBoardToGroupDialog() {
    const dialog = document.getElementById('add-board-to-group-dialog');
    const templateSelect = dialog.querySelector('#add-board-template-select');
    const titleInput = dialog.querySelector('#add-board-title-input');
    const descriptionInput = dialog.querySelector('#add-board-description-input');
    const iconInput = dialog.querySelector('#add-board-icon-input');

    // Limpa e popula o select de templates do sistema
    templateSelect.innerHTML = '<option value="">Começar com um quadro vazio</option>';
    const systemTemplates = getSystemBoardTemplates();
    systemTemplates.forEach(t => {
        templateSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });

    // Reseta os campos
    titleInput.value = '';
    descriptionInput.value = '';
    iconInput.value = '📋';

    // Listener para o seletor de ícone
    dialog.querySelector('#btn-choose-add-board-icon').onclick = () => {
        showIconPickerDialog(icon => iconInput.value = icon);
    };

    // Listener para o botão de cancelar
    dialog.querySelector('#cancel-add-board-to-group-btn').onclick = () => dialog.close();

    // Listener para o botão de confirmar
    const confirmBtn = dialog.querySelector('#confirm-add-board-to-group-btn');
    // Remove listener antigo para evitar duplicação
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
        const boardName = titleInput.value.trim();
        const selectedTemplateId = templateSelect.value;
        const description = descriptionInput.value.trim();
        const selectedTemplate = systemTemplates.find(t => t.id === selectedTemplateId);

        // Se um template foi selecionado e o nome está vazio, usa o nome do template
        const finalBoardName = boardName || (selectedTemplate ? selectedTemplate.name : '');

        if (!finalBoardName) {
            showDialogMessage(dialog, 'O nome do quadro é obrigatório.', 'error');
            return;
        }

        // Adiciona o quadro à lista na interface
        addBoardToGroup(finalBoardName, selectedTemplateId, description);

        showDialogMessage(dialog, 'Quadro adicionado à lista de criação!', 'success');
        setTimeout(() => {
            dialog.close();
        }, 1500);
    });

    dialog.showModal();
}

function loadTagTemplatesForGroup() {
    const templateSelect = document.getElementById('group-tag-template');
    if (!templateSelect) return;

    // Limpar opções existentes
    templateSelect.innerHTML = '';

    // Adicionar opção padrão (nenhum) no topo
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Nenhum (começar do zero)';
    templateSelect.appendChild(defaultOption);

    // Carregar templates do sistema
    const systemTemplates = getSystemTagTemplates();
    if (systemTemplates.length > 0) {
        const optgroupSystem = document.createElement('optgroup');
        optgroupSystem.label = 'Usar um Template do Sistema';
        systemTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupSystem.appendChild(option);
        });
        templateSelect.appendChild(optgroupSystem);
    }
}

// js/groups.js - PART 2/4 - REFACTORED VERSION

// ===== FUNÇÕES DE TEMPLATES DE GRUPO =====

// js/groups.js - PARTE ADICIONAL - Funções para templates de grupo

// Contadores para nomes não titulados
let untitledColumnCounter = 1;
let untitledTagCounter = 1;

// Funções para templates de quadro do grupo
function showGroupBoardTemplateDialog(templateId = null) {
    const dialog = document.getElementById('group-board-template-dialog');
    const adminGroups = getAllGroups().filter(g => g.adminId === currentUser.id);

    if (adminGroups.length === 0) {
        showFloatingMessage("Você não administra nenhum grupo para criar templates.", 'warning');
        return;
    }

    // Injeta o seletor de grupo no diálogo
    const nameField = dialog.querySelector('#group-board-template-name').parentElement;
    let selectorGroup = dialog.querySelector('#group-selector-container');
    if (!selectorGroup) {
        selectorGroup = document.createElement('div');
        selectorGroup.className = 'form-group';
        selectorGroup.id = 'group-selector-container';
        nameField.insertAdjacentElement('beforebegin', selectorGroup);
    }
    selectorGroup.innerHTML = `
        <label for="group-template-target-group">Salvar no Grupo:</label>
        <select id="group-template-target-group">
            <option value="">-- Selecione um grupo --</option>
            ${adminGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
        </select>
    `;
    const groupSelector = dialog.querySelector('#group-template-target-group');

    let template = null;
    if (templateId) {
        for (const group of adminGroups) {
            const foundTemplate = (group.boardTemplates || []).find(t => t.id === templateId);
            if (foundTemplate) {
                template = foundTemplate;
                groupSelector.value = group.id;
                groupSelector.disabled = true; // Não permite mover template entre grupos na edição
                break;
            }
        }
    } else {
        groupSelector.disabled = false;
    }
    
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
    const groupId = dialog.querySelector('#group-template-target-group').value;
    const description = document.getElementById('group-board-template-desc').value;

    if (!groupId) {
        showDialogMessage(dialog, 'É necessário selecionar um grupo.', 'error');
        return;
    }

    const targetGroup = getGroup(groupId);
    if (!targetGroup) {
        showDialogMessage(dialog, 'Grupo selecionado não encontrado.', 'error');
        return;
    }

    if (!name) {
        showDialogMessage(dialog, 'O nome do template é obrigatório.', 'error');
        return;
    }

    const boardTemplates = targetGroup.boardTemplates || [];
    const isNameUnique = !boardTemplates.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== templateId);

    if (!isNameUnique) {
        showDialogMessage(dialog, 'Já existe um template com este nome no grupo. Por favor, escolha outro nome.', 'error');
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
        showDialogMessage(dialog, 'Adicione pelo menos uma coluna ao template.', 'error');
        return;
    }
    
    showConfirmationDialog(
        'Deseja salvar este template?',
        async (confirmationDialog) => {
            if (!targetGroup.boardTemplates) targetGroup.boardTemplates = [];

            if (templateId && templateId !== 'null') {
                const index = targetGroup.boardTemplates.findIndex(t => t.id === templateId);
                if (index !== -1) {
                    targetGroup.boardTemplates[index] = { ...targetGroup.boardTemplates[index], icon, name, description, columns };
                }
            } else {
                const newTemplate = { id: 'group-board-' + Date.now(), name, icon, description, columns };
                targetGroup.boardTemplates.push(newTemplate);
            }

            if (saveGroup(targetGroup)) {
                showDialogMessage(confirmationDialog, 'Template salvo com sucesso!', 'success');
                loadGroupTemplates();
                setTimeout(() => dialog.close(), 1500);
                return true;
            } else {
                showDialogMessage(confirmationDialog, 'Erro ao salvar o template.', 'error');
                return false;
            }
        }
    );
}

// Funções para templates de etiqueta do grupo
function showGroupTagTemplateDialog(templateId = null) {
    const dialog = document.getElementById('group-tag-template-dialog');
    const adminGroups = getAllGroups().filter(g => g.adminId === currentUser.id);

    if (adminGroups.length === 0) {
        // A mensagem já é mostrada pela função de quadro, não precisa repetir.
        return;
    }

    // Injeta o seletor de grupo no diálogo
    const nameField = dialog.querySelector('#group-tag-template-name').parentElement;
    let selectorGroup = dialog.querySelector('#group-selector-container');
    if (!selectorGroup) {
        selectorGroup = document.createElement('div');
        selectorGroup.className = 'form-group';
        selectorGroup.id = 'group-selector-container';
        nameField.insertAdjacentElement('beforebegin', selectorGroup);
    }
    selectorGroup.innerHTML = `
        <label for="group-template-target-group-tag">Salvar no Grupo:</label>
        <select id="group-template-target-group-tag">
            <option value="">-- Selecione um grupo --</option>
            ${adminGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
        </select>
    `;
    const groupSelector = dialog.querySelector('#group-template-target-group-tag');

    let template = null;
    if (templateId) {
        for (const group of adminGroups) {
            const foundTemplate = (group.tagTemplates || []).find(t => t.id === templateId);
            if (foundTemplate) {
                template = foundTemplate;
                groupSelector.value = group.id;
                groupSelector.disabled = true;
                break;
            }
        }
    } else {
        groupSelector.disabled = false;
    }
    
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

function addTagToGroupEditor(name = '', color = '#4cd4e6') {
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
    const groupId = dialog.querySelector('#group-template-target-group-tag').value;
    const description = document.getElementById('group-tag-template-desc').value;
    
    if (!groupId) {
        showDialogMessage(dialog, 'É necessário selecionar um grupo.', 'error');
        return;
    }

    const targetGroup = getGroup(groupId);
    if (!targetGroup) {
        showDialogMessage(dialog, 'Grupo selecionado não encontrado.', 'error');
        return;
    }

    if (!name) {
        showDialogMessage(dialog, 'O nome do conjunto é obrigatório.', 'error');
        return;
    }

    const tagTemplates = targetGroup.tagTemplates || [];
    const isNameUnique = !tagTemplates.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== templateId);

    if (!isNameUnique) {
        showDialogMessage(dialog, 'Já existe um conjunto com este nome no grupo. Por favor, escolha outro nome.', 'error');
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
        showDialogMessage(dialog, 'Adicione pelo menos uma etiqueta ao conjunto.', 'error');
        return;
    }

    showConfirmationDialog(
        'Deseja salvar este conjunto de etiquetas?',
        async (confirmationDialog) => {
            if (!targetGroup.tagTemplates) targetGroup.tagTemplates = [];

            if (templateId && templateId !== 'null') {
                const index = targetGroup.tagTemplates.findIndex(t => t.id === templateId);
                if (index !== -1) {
                    targetGroup.tagTemplates[index] = { ...targetGroup.tagTemplates[index], icon, name, description, tags };
                }
            } else {
                const newTemplate = { id: 'group-tag-' + Date.now(), name, icon, description, tags };
                targetGroup.tagTemplates.push(newTemplate);
                // Se o grupo não tinha um template padrão, o novo se torna o padrão.
                if (!targetGroup.tagTemplate || targetGroup.tagTemplate === '') {
                    targetGroup.tagTemplate = newTemplate.id;
                }
            }

            if (saveGroup(targetGroup)) {
                showDialogMessage(confirmationDialog, 'Conjunto salvo com sucesso!', 'success');
                loadGroups(); // Atualiza a lista de grupos para refletir a mudança no alerta
                loadGroupTemplates();
                setTimeout(() => dialog.close(), 1500);
                return true;
            } else {
                showDialogMessage(confirmationDialog, 'Erro ao salvar o conjunto.', 'error');
                return false;
            }
        }
    );
}

function loadGroupTemplates() {
    const boardContainer = document.getElementById('group-board-templates-grid');
    const tagContainer = document.getElementById('group-tag-templates-grid');
    const adminGroups = getAllGroups().filter(g => g.adminId === currentUser.id);

    if (adminGroups.length === 0) {
        boardContainer.innerHTML = '<p class="no-templates">Você não administra nenhum grupo para ter templates.</p>';
        tagContainer.innerHTML = '<p class="no-templates">Você não administra nenhum grupo para ter conjuntos de etiquetas.</p>';
        return;
    }

    const boardTemplates = adminGroups.flatMap(g => 
        (g.boardTemplates || []).map(t => ({ ...t, groupId: g.id, groupName: g.name }))
    );
    renderGroupBoardTemplates(boardTemplates);
    
    const tagTemplates = adminGroups.flatMap(g => 
        (g.tagTemplates || []).map(t => ({ ...t, groupId: g.id, groupName: g.name }))
    );
    renderGroupTagTemplates(tagTemplates);
}

function renderGroupBoardTemplates(templates) {
    const container = document.getElementById('group-board-templates-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (templates.length === 0) {
        container.innerHTML = '<p class="no-templates">Nenhum template de quadro criado para os grupos que você administra.</p>';
        return;
    }
    
    templates.forEach(template => {
        const templateCard = document.createElement('div');
        templateCard.className = 'template-card';
        templateCard.dataset.templateId = template.id;
        templateCard.dataset.groupId = template.groupId;
        templateCard.innerHTML = `
            <div class="template-icon">${template.icon || '📋'}</div>
            <h4>${template.name}</h4>
            <p class="template-group-info">Grupo: ${template.groupName}</p>
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
            const card = e.target.closest('.template-card');
            useBoardTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
    
    container.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.closest('.template-card').dataset.templateId;
            showGroupBoardTemplateDialog(templateId);
        });
    });
    
    container.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            deleteGroupBoardTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
}

function renderGroupTagTemplates(templates) {
    const container = document.getElementById('group-tag-templates-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (templates.length === 0) {
        container.innerHTML = '<p class="no-templates">Nenhum conjunto de etiquetas criado para os grupos que você administra.</p>';
        return;
    }
    
    templates.forEach(template => {
        const templateCard = document.createElement('div');
        templateCard.className = 'template-card';
        templateCard.dataset.templateId = template.id;
        templateCard.dataset.groupId = template.groupId;
        templateCard.innerHTML = `
            <div class="template-icon">${template.icon || '🏷️'}</div>
            <h4>${template.name}</h4>
            <p class="template-group-info">Grupo: ${template.groupName}</p>
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
            const card = e.target.closest('.template-card');
            useTagTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
    
    container.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const templateId = e.target.closest('.template-card').dataset.templateId;
            showGroupTagTemplateDialog(templateId);
        });
    });
    
    container.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            deleteGroupTagTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
}

function useBoardTemplate(templateId, groupId) {
    const group = getGroup(groupId);
    if (!group) return;

    const template = (group.boardTemplates || []).find(t => t.id === templateId);
    if (!template) {
        showFloatingMessage('Template não encontrado no grupo.', 'error');
        return;
    }

    const newColumns = template.columns.map(colTemplate => {
        return saveColumn({ title: colTemplate.name, color: colTemplate.color, cardIds: [] });
    });

    const newBoardData = {
        title: `${template.name} (Cópia do Grupo)`,
        icon: template.icon || '📋',
        ownerId: currentUser.id,
        visibility: 'group', // O quadro criado a partir de um template de grupo, é de grupo
        groupId: group.id,
        columnIds: newColumns.map(col => col.id)
    };

    const savedBoard = saveBoard(newBoardData);

    localStorage.setItem(`currentBoardId_${currentUser.id}`, savedBoard.id);
    showFloatingMessage(`Quadro '${savedBoard.title}' criado com sucesso! Redirecionando...`, 'success');
    setTimeout(() => { window.location.href = `kanban.html`; }, 1500);
}

function useTagTemplate(templateId, groupId) {
    showFloatingMessage('Funcionalidade "Usar Conjunto de Etiquetas" ainda não implementada.', 'info');
    // Futuramente, isso poderia aplicar o conjunto de etiquetas a um quadro selecionado.
}

function deleteGroupBoardTemplate(templateId, groupId) {
    showConfirmationDialog('Tem certeza que deseja excluir este template?', (dialog) => {
        const group = getGroup(groupId);
        if (!group || !group.boardTemplates) return false;
        group.boardTemplates = group.boardTemplates.filter(t => t.id !== templateId);
        if (saveGroup(group)) {
            showDialogMessage(dialog, 'Template excluído.', 'success');
            loadGroupTemplates();
            return true;
        }
        return false;
    });
}

function deleteGroupTagTemplate(templateId, groupId) {
    showConfirmationDialog('Tem certeza que deseja excluir este conjunto?', (dialog) => {
        const group = getGroup(groupId);
        if (!group || !group.tagTemplates) return false;

        const wasDefault = group.tagTemplate === templateId;
        
        // Filtra para remover o template
        group.tagTemplates = group.tagTemplates.filter(t => t.id !== templateId);

        // Se o template excluído era o padrão, define um novo padrão.
        if (wasDefault) {
            if (group.tagTemplates.length > 0) {
                // O novo padrão é o primeiro da lista de templates customizados.
                group.tagTemplate = group.tagTemplates[0].id;
            } else {
                // Se não houver mais templates customizados, volta para "Nenhum".
                group.tagTemplate = '';
            }
        }

        if (saveGroup(group)) {
            showDialogMessage(dialog, 'Conjunto excluído.', 'success');
            loadGroupTemplates();
            loadGroups(); // Recarrega os grupos para atualizar o alerta
            return true;
        }
        return false;
    });
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
    
    if (!serverName) {
        showDialogMessage(dialog, 'O nome do servidor é obrigatório.', 'error');
        return;
    }

    showConfirmationDialog(
        `Confirma a criação do servidor "${serverName}"?`,
        (confirmDialog) => {
            const newServer = {
                id: 'server-' + Date.now(),
                name: serverName,
                url: window.location.origin,
                createdAt: new Date().toISOString()
            };
            
            servers.push(newServer);
            saveServers();
            renderServers();
            
            showDialogMessage(confirmDialog, 'Servidor criado com sucesso!', 'success');
            setTimeout(() => dialog.close(), 1500); // Fecha o diálogo original
            return true; // Fecha o diálogo de confirmação
        }
        // onCancel usará o comportamento padrão de ui-controls.js
    );
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
            const dialog = document.getElementById('add-server-dialog');
            if (!text) {
                showDialogMessage(dialog, 'A área de transferência está vazia.', 'error');
                return;
            }
            
            // Validar se o texto é uma URL
            try {
                new URL(text);
                document.getElementById('server-url').value = text;
                showDialogMessage(dialog, 'URL colada com sucesso!', 'success');
            } catch (e) {
                showDialogMessage(dialog, 'O conteúdo da área de transferência não é uma URL válida.', 'error');
            }
        })
        .catch(err => {
            showDialogMessage(document.getElementById('add-server-dialog'), 'Não foi possível acessar a área de transferência.', 'error');
        });
}

function copyServerUrl() {
    const urlInput = document.getElementById('server-share-url');
    urlInput.select();
    
    const dialog = document.getElementById('share-server-dialog');
    try {
        navigator.clipboard.writeText(urlInput.value);
        showDialogMessage(dialog, 'URL copiada com sucesso!', 'success');
        
        // Fechar o diálogo após 1.5 segundos
        setTimeout(() => {
            dialog.close();
        }, 1500);
    } catch (err) {
        showDialogMessage(dialog, 'Falha ao copiar a URL.', 'error');
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
            showDialogMessage(dialog, 'Servidor excluído com sucesso.', 'success');
            
            // Fecha o diálogo automaticamente após 1.5 segundos
            setTimeout(() => {
                dialog.close();
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
    
    if (!serverUrl) {
        showDialogMessage(dialog, 'A URL do servidor é obrigatória.', 'error');
        return;
    }
    
    // Validar URL
    try {
        new URL(serverUrl);
    } catch (e) {
        showDialogMessage(dialog, 'URL inválida. Por favor, insira uma URL válida.', 'error');
        return;
    }
    
    // Verificar se já existe um servidor com esta URL
    const existingServer = servers.find(s => s.url === serverUrl);
    if (existingServer) {
        showDialogMessage(dialog, 'Este servidor já foi adicionado.', 'error');
        return;
    }
    
    // Verificar conexão com o servidor
    showDialogMessage(dialog, 'Testando conexão com o servidor...', 'info');
    
    const connectionTest = await testServerConnection(serverUrl);
    
    if (!connectionTest.success) {
        showDialogMessage(dialog, `Falha na conexão: ${connectionTest.message}`, 'error');
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
            
            showDialogMessage(confirmDialog, 'Servidor adicionado com sucesso!', 'success');
            
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

    const noTagTemplateWarning = !group.tagTemplate
        ? `<div class="group-warning"><span>⚠️</span> Sem conjunto de etiquetas padrão!</div>`
        : '';

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
        ${noTagTemplateWarning}
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

function cancelGroupCreation() {
    showConfirmationDialog(
        'Tem certeza que deseja cancelar a criação do grupo? Todas as informações serão perdidas.',
        (dialog) => {
            showDialogMessage(dialog, 'Alterações descartadas.', 'info');
            
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

function viewGroup(group) {
    // Alternar para a aba de estatísticas
    switchTab('statistics');
    
    // Agora que a aba está ativa, os elementos existem.
    const statsGroupNameEl = document.getElementById('statistics-group-name');
    if (statsGroupNameEl) {
        statsGroupNameEl.textContent = group.name;
    }

    // Carrega as estatísticas para o grupo específico que foi clicado.
    loadAndRenderStatistics(group.id);
}

function editGroup(group) {
    const dialog = document.getElementById('edit-group-dialog');
    const form = document.getElementById('edit-group-form');
    
    // Preencher formulário com dados atuais
    document.getElementById('edit-group-name').value = group.name;
    document.getElementById('edit-group-description').value = group.description || '';
    document.getElementById('edit-group-access').value = group.access || 'public';

    // --- LÓGICA PARA O SELECT DE TAG TEMPLATE ---
    const tagTemplateSelect = document.getElementById('edit-group-tag-template');
    tagTemplateSelect.innerHTML = ''; // Limpa

    const groupTemplates = group.tagTemplates || [];

    // Só mostra "Nenhum" se não houver templates customizados para o grupo.
    if (groupTemplates.length === 0) {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Nenhum (usar padrão do grupo)';
        tagTemplateSelect.appendChild(defaultOption);
    }

    // Carrega os templates do próprio grupo
    if (groupTemplates.length > 0) {
        const optgroupGroup = document.createElement('optgroup');
        optgroupGroup.label = 'Templates deste Grupo';
        groupTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupGroup.appendChild(option);
        });
        tagTemplateSelect.appendChild(optgroupGroup);
    }

    // Templates do Sistema
    const systemTemplates = getSystemTagTemplates();
    if (systemTemplates.length > 0) {
        const optgroupSystem = document.createElement('optgroup');
        optgroupSystem.label = 'Usar um Template do Sistema';
        systemTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupSystem.appendChild(option);
        });
        tagTemplateSelect.appendChild(optgroupSystem);
    }

    // Seleciona o valor atual do grupo
    tagTemplateSelect.value = group.tagTemplate || '';
    
    // --- LÓGICA PARA PREENCHER OS CAMPOS DE RELATÓRIO ---
    const reportSettings = group.reportSettings || { frequency: 'none' };
    const freqSelect = document.getElementById('edit-group-report-frequency');
    const weekSelect = document.getElementById('edit-group-report-day-of-week');
    const monthInput = document.getElementById('edit-group-report-day-of-month');
    const weekContainer = document.getElementById('edit-group-report-day-of-week-container');
    const monthContainer = document.getElementById('edit-group-report-day-of-month-container');

    freqSelect.value = reportSettings.frequency;
    // Mostra/esconde os campos condicionais
    weekContainer.classList.toggle('hidden', reportSettings.frequency !== 'weekly');
    monthContainer.classList.toggle('hidden', reportSettings.frequency !== 'monthly');

    // Define os valores dos campos condicionais se aplicável
    if (reportSettings.frequency === 'weekly') {
        weekSelect.value = reportSettings.dayOfWeek || '1';
    }
    if (reportSettings.frequency === 'monthly') {
        monthInput.value = reportSettings.dayOfMonth || '1';
    }

    // Resetar o estado de "salvo" e adicionar listeners para rastrear alterações
    isGroupSaved = true;
    const formElements = dialog.querySelectorAll('input, textarea, select');
    
    const markAsUnsaved = () => isGroupSaved = false;

    formElements.forEach(el => {
        el.removeEventListener('change', markAsUnsaved); // Evita duplicatas
        el.addEventListener('change', markAsUnsaved);
    });

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
            currentGroup.name = name;
            currentGroup.description = document.getElementById('edit-group-description').value;
            currentGroup.access = document.getElementById('edit-group-access').value;
            currentGroup.tagTemplate = document.getElementById('edit-group-tag-template').value;
            
            const reportFrequency = document.getElementById('edit-group-report-frequency').value;
            currentGroup.reportSettings = {
                frequency: reportFrequency,
                dayOfWeek: reportFrequency === 'weekly' ? document.getElementById('edit-group-report-day-of-week').value : null,
                dayOfMonth: reportFrequency === 'monthly' ? document.getElementById('edit-group-report-day-of-month').value : null,
            };
            
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
                showDialogMessage(confirmationDialog, 'Grupo atualizado com sucesso! Notificações enviadas.', 'success');
                
                // Atualizar exibição
                renderGroups();
                isGroupSaved = true; // Reseta o estado após salvar
                
                // Fechar diálogos após breve delay
                setTimeout(() => {
                    confirmationDialog.close();
                    dialog.close();
                }, 1500);
                
                return true;
            } else {
                showDialogMessage(confirmationDialog, 'Erro ao salvar alterações.', 'error');
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
                        showDialogMessage(passwordDialog, 'Grupo excluído com sucesso!', 'success');
                            loadGroups();
                        
                        // Fechar o diálogo e mudar de aba após 1.5 segundos
                        setTimeout(() => {
                            closePasswordDialog();
                            switchTab('my-groups');
                        }, 1500);
                    } else {
                        showDialogMessage(passwordDialog, 'Erro ao excluir o grupo.', 'error');
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
                showDialogMessage(passwordDialog, 'Exclusão cancelada.', 'info');
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

                    showDialogMessage(passwordDialog, `Você saiu do grupo "${currentGroup.name}".`, 'success');
                    
                    setTimeout(() => {
                        passwordDialog.close();
                        passwordDialog.remove();
                        loadGroups();
                        switchTab('my-groups');
                    }, 1500);
                } else {
                    showDialogMessage(passwordDialog, 'Senha incorreta. Tente novamente.', 'error');
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

let statusChartInstance = null; // Variável global para a instância do gráfico

function populateGroupSelectorForStats(selectElement) {
    if (!selectElement) return;
    selectElement.innerHTML = '';

    const adminGroups = getAllGroups().filter(g => g.adminId === currentUser.id);
    if (adminGroups.length === 0) {
        selectElement.innerHTML = '<option value="">Você não administra grupos</option>';
        selectElement.disabled = true;
        return;
    }

    selectElement.disabled = false;
    adminGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        selectElement.appendChild(option);
    });

    // Adiciona listeners para os filtros
    selectElement.onchange = () => loadAndRenderStatistics(selectElement.value);
    document.getElementById('time-filter').onchange = () => loadAndRenderStatistics(selectElement.value);
    document.getElementById('chart-type').onchange = () => loadAndRenderStatistics(selectElement.value);
}

function loadAndRenderStatistics(groupId) {
    const group = getGroup(groupId);
    if (!group) {
        document.querySelector('.stats-sections').innerHTML = '<p class="no-templates">Grupo não encontrado.</p>';
        return;
    }

    const timeFilter = document.getElementById('time-filter').value;
    const allCards = [];

    (group.boardIds || []).forEach(boardId => {
        const board = getFullBoardData(boardId);
        if (board) {
            board.columns.forEach(column => {
                allCards.push(...column.cards);
            });
        }
    });

    // Filtrar cartões por data
    const now = new Date();
    const filteredCards = allCards.filter(card => {
        if (timeFilter === 'all') return true;
        if (!card.createdAt) return false; // Ignora cartões sem data de criação

        const cardDate = new Date(card.createdAt);
        const diffDays = (now - cardDate) / (1000 * 60 * 60 * 24);

        if (timeFilter === 'today') return diffDays <= 1;
        if (timeFilter === 'last7') return diffDays <= 7;
        if (timeFilter === 'last30') return diffDays <= 30;
        return false;
    });

    // Calcular estatísticas
    const totalCards = filteredCards.length;
    const completedCards = filteredCards.filter(c => c.isComplete).length;
    const activeCards = totalCards - completedCards;

    const tasksByMember = {};
    group.memberIds.forEach(id => {
        tasksByMember[id] = { completed: 0, total: 0 };
    });

    filteredCards.forEach(card => {
        if (card.assignedTo && tasksByMember[card.assignedTo]) {
            tasksByMember[card.assignedTo].total++;
            if (card.isComplete) {
                tasksByMember[card.assignedTo].completed++;
            }
        }
    });

    // Renderizar tudo
    renderSummary(totalCards, completedCards, activeCards);
    renderParticipantsTable(tasksByMember, group.memberIds);
    renderStatusChart({ active: activeCards, completed: completedCards });
}

function renderSummary(total, completed, active) {
    // Atualizar estatísticas resumidas
    document.getElementById('total-cards').textContent = total;
    document.getElementById('completed-cards').textContent = completed;
    document.getElementById('active-cards').textContent = active;
}

function renderParticipantsTable(tasksByMember, memberIds) {
    const tableBody = document.getElementById('participants-table-body');
    tableBody.innerHTML = '';
    
    memberIds.forEach(memberId => {
        const user = allUsers.find(u => u.id === memberId);
        if (!user) return;

        const stats = tasksByMember[memberId];
        const productivity = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.name}</td>
            <td>Membro</td>
            <td>${stats.completed}</td>
            <td>${productivity}%</td>
        `;
        tableBody.appendChild(row);
    });
}

function renderStatusChart(data) {
    const ctx = document.getElementById('status-chart').getContext('2d');
    const chartType = document.getElementById('chart-type').value;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    // Garante que o gráfico seja exibido mesmo se os dados estiverem zerados
    const hasData = data.active > 0 || data.completed > 0;
    const chartData = hasData ? [data.active, data.completed] : [1, 1]; // Usa dados placeholder se zerado
    const chartColors = hasData 
        ? ['rgba(243, 156, 18, 0.7)', 'rgba(46, 204, 113, 0.7)']
        : ['rgba(128, 128, 128, 0.2)', 'rgba(128, 128, 128, 0.2)']; // Cinza se zerado

    statusChartInstance = new Chart(ctx, {
        type: chartType, // pie ou bar
        data: {
            labels: ['Ativos', 'Concluídos'],
            datasets: [{
                label: 'Status dos Cartões',
                data: chartData,
                backgroundColor: chartColors,
                borderColor: [
                    'rgba(243, 156, 18, 1)',
                    'rgba(46, 204, 113, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: hasData ? 'Distribuição de Cartões por Status' : 'Nenhum cartão no período selecionado'
                },
                tooltip: {
                    callbacks: {
                        label: hasData ? undefined : () => '' // Esconde tooltips se não houver dados
                    }
                }
            }
        }
    });
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

/**
 * Verifica todos os grupos e envia relatórios automáticos se necessário.
 * Esta função é exportada para ser chamada pelo main.js na inicialização.
 */
export function checkAndSendReports() {
    const allGroups = getAllGroups();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normaliza para o início do dia

    allGroups.forEach(group => {
        const settings = group.reportSettings;
        if (!settings || settings.frequency === 'none') {
            return; // Pula se não houver relatórios configurados
        }

        const lastSent = group.lastReportSent ? new Date(group.lastReportSent) : null;

        let shouldSend = false;

        if (!lastSent) { // Se nunca foi enviado, envia o primeiro
            shouldSend = true;
        } else {
            lastSent.setHours(0, 0, 0, 0);
            const diffDays = (today - lastSent) / (1000 * 60 * 60 * 24);

            if (settings.frequency === 'daily' && diffDays >= 1) {
                shouldSend = true;
            } else if (settings.frequency === 'weekly' && today.getDay() == settings.dayOfWeek && diffDays >= 7) {
                shouldSend = true;
            } else if (settings.frequency === 'monthly' && today.getDate() == settings.dayOfMonth && diffDays >= 28) {
                shouldSend = true;
            }
        }

        if (shouldSend) {
            // Envia notificação para cada membro
            group.memberIds.forEach(memberId => {
                addReportNotification(memberId, settings.frequency, group.name);
            });
            // Atualiza a data do último envio e salva o grupo
            group.lastReportSent = new Date().toISOString();
            saveGroup(group);
        }
    });
}

function sendMessageToAllMembers() {
    // Esta função é chamada pelo botão no diálogo de edição de grupo.
    if (!currentGroup) {
        showFloatingMessage('Nenhum grupo selecionado para enviar mensagem.', 'error');
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Mensagem para o Grupo: ${currentGroup.name}</h3>
        <div class="form-group">
            <label for="group-broadcast-message-textarea">Mensagem:</label>
            <textarea id="group-broadcast-message-textarea" placeholder="Escreva sua mensagem para todos os membros..." rows="5" style="width: 100%;"></textarea>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">Cancelar</button>
            <button class="btn btn-primary">Enviar para Todos</button>
        </div>
    `;

    document.body.appendChild(dialog);
    initDraggableElements();
    dialog.showModal();

    const textarea = dialog.querySelector('#group-broadcast-message-textarea');
    const sendBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');

    const closeDialog = () => { dialog.close(); dialog.remove(); };
    cancelBtn.addEventListener('click', closeDialog);

    sendBtn.addEventListener('click', () => {
        const message = textarea.value.trim();
        if (!message) { showDialogMessage(dialog, 'A mensagem não pode estar vazia.', 'error'); return; }
        const membersToNotify = currentGroup.memberIds.filter(id => id !== currentUser.id);
        membersToNotify.forEach(memberId => addMessageNotification(`${currentUser.name} (Grupo: ${currentGroup.name})`, currentUser.id, memberId, message.length > 50 ? message.substring(0, 50) + '...' : message));
        showDialogMessage(dialog, `Mensagem enviada para ${membersToNotify.length} membro(s).`, 'success');
        sendBtn.disabled = true; cancelBtn.disabled = true;
        setTimeout(closeDialog, 1500);
    });
}

function sendMessageToMember(memberId) {
    const member = allUsers.find(u => u.id === memberId);
    if (!member) {
        showFloatingMessage('Membro não encontrado.', 'error');
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Enviar Mensagem para ${member.name}</h3>
        <div class="form-group">
            <textarea id="group-private-message-textarea" placeholder="Escreva sua mensagem..." rows="5"></textarea>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">Cancelar</button>
            <button class="btn btn-primary">Enviar</button>
        </div>
    `;

    document.body.appendChild(dialog);
    initDraggableElements(); // Torna o diálogo arrastável
    dialog.showModal();

    const textarea = dialog.querySelector('#group-private-message-textarea');
    const sendBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');

    const closeDialog = () => { dialog.close(); dialog.remove(); };
    cancelBtn.addEventListener('click', closeDialog);

    sendBtn.addEventListener('click', () => {
        const message = textarea.value.trim();
        if (!message) { showDialogMessage(dialog, 'A mensagem não pode estar vazia.', 'error'); return; }
        addMessageNotification(currentUser.name, currentUser.id, member.id, message.length > 50 ? message.substring(0, 50) + '...' : message);
        showDialogMessage(dialog, 'Mensagem enviada com sucesso!', 'success');
        sendBtn.disabled = true; cancelBtn.disabled = true;
        setTimeout(closeDialog, 1500);
    });
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
        const hue = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
        const avatarBgColor = `hsl(${hue}, 65%, 65%)`;
        
        const memberItem = document.createElement('div');
        memberItem.className = 'group-member-item';
        memberItem.innerHTML = `
            <div class="group-member-info">
                <div class="member-avatar" style="${user.avatar ? '' : `background-color: ${avatarBgColor};`}">
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
                    `<button class="btn btn-sm btn-secondary message-member-btn" data-member-id="${memberId}" title="Enviar Mensagem">✉️</button>
                     <button class="btn btn-sm btn-danger remove-member-btn" data-member-id="${memberId}">Remover</button>`
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

    // Adicionar event listeners para os botões de mensagem
    membersList.querySelectorAll('.message-member-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const memberId = e.target.closest('button').dataset.memberId;
            sendMessageToMember(memberId);
        });
    });
}

/**
 * Calcula o número total de tarefas (cartões) em todos os quadros de um grupo.
 * @param {string} groupId - O ID do grupo.
 * @returns {number} O número total de tarefas.
 */
function getGroupTaskCount(groupId) {
    const group = getGroup(groupId);
    if (!group || !group.boardIds) return 0;

    return group.boardIds.reduce((total, boardId) => {
        const board = getFullBoardData(boardId);
        if (!board) return total;
        return total + board.columns.reduce((boardTotal, column) => boardTotal + column.cards.length, 0);
    }, 0);
}

/**
 * Calcula o número de tarefas concluídas em todos os quadros de um grupo.
 * @param {string} groupId - O ID do grupo.
 * @returns {number} O número de tarefas concluídas.
 */
function getCompletedTaskCount(groupId) {
    const group = getGroup(groupId);
    if (!group || !group.boardIds) return 0;

    return group.boardIds.reduce((total, boardId) => {
        const board = getFullBoardData(boardId);
        if (!board) return total;
        return total + board.columns.reduce((boardTotal, column) => 
            boardTotal + column.cards.filter(card => card.isComplete).length, 0);
    }, 0);
}

/**
 * Calcula o número de tarefas atrasadas em todos os quadros de um grupo.
 * @param {string} groupId - O ID do grupo.
 * @returns {number} O número de tarefas atrasadas.
 */
function getOverdueTaskCount(groupId) {
    const group = getGroup(groupId);
    if (!group || !group.boardIds) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normaliza para o início do dia

    return group.boardIds.reduce((total, boardId) => {
        const board = getFullBoardData(boardId);
        if (!board) return total;
        return total + board.columns.reduce((boardTotal, column) => 
            boardTotal + column.cards.filter(card => !card.isComplete && card.dueDate && new Date(card.dueDate) < today).length, 0);
    }, 0);
}