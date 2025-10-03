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
  showIconPickerDialog,
  showTemplateEditorDialog,
  initCustomSelects,
  showPrivateMessageDialog
} from './ui-controls.js';
import { 
    addGroupInvitationNotification,
    addGroupRemovalNotification,
    addMeetingNotification,
    addMessageNotification,
    addGroupLeaveNotification,
    addReportNotification,
    initNotificationsPage
} from './notifications.js';
import { t, initTranslations } from './translations.js';

let currentUser;
let allUsers = [];
let groups = [];
let servers = [];
let currentGroup = null;
let isGroupSaved = true; // Flag para rastrear alterações no diálogo de edição

// groups.js - Adicione este código na função initGroupsPage(), após a verificação de estatísticas
export async function initGroupsPage() {
    await initTranslations();

    currentUser = await getCurrentUser();
    if (!currentUser) {
        showFloatingMessage(t('ui.userNotLoggedIn'), 'error');
        setTimeout(() => { window.location.href = 'list-users.html'; }, 2000);
        return;
    }
    allUsers = await getAllUsers();
    
    // Carrega os grupos ANTES de qualquer outra lógica para que a variável 'groups' esteja disponível.
    loadGroups();

    // LER PARÂMETROS DA URL para abrir uma aba específica
    const openTab = localStorage.getItem('openTab');
    const groupId = localStorage.getItem('groupId');
    const reportPeriod = localStorage.getItem('reportPeriod');
    
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
    loadServers();
    initDraggableElements();

    // Lógica para abrir aba específica a partir da URL
    if (openTab) {
        localStorage.removeItem('openTab');
        localStorage.removeItem('groupId');
        switchTab(openTab, { groupId: groupId });
    } else if (openTab === 'reports' && groupId && reportPeriod) {
        localStorage.removeItem('openTab');
        localStorage.removeItem('groupId');
        localStorage.removeItem('reportPeriod');
        
        switchTab('reports');
        
        // Pré-seleciona os filtros e gera o relatório
        document.getElementById('report-group-select').value = groupId;
        document.getElementById('report-period-select').value = reportPeriod;
        initCustomSelects(); // Atualiza a UI dos selects
        generateAndRenderReport();
    }
}

async function loadGroups() {
    const allGroupsData = await getAllGroups();
    
    // Filtra apenas os grupos dos quais o usuário atual é membro
    groups = allGroupsData.filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
    
    // Chama a renderização com os dados reais
    renderGroups();
}

function setupEventListeners() {
    document.getElementById('kanban-btn')?.addEventListener('click', () => window.location.href = 'kanban.html');
    
    document.querySelectorAll('.showcase-navbar .nav-item').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    document.getElementById('btn-create-group')?.addEventListener('click', () => switchTab('create-group'));

    
    // --- ABA "ESTATÍSTICAS" ---
    document.getElementById('export-chart-btn')?.addEventListener('click', exportChartAsImage);

    // --- ABA "REUNIÕES" ---
    document.getElementById('btn-schedule-meeting')?.addEventListener('click', showMeetingDialog); // This button is already translated by data-i18n

    // --- ABA "CRIAR GRUPO" ---
    document.getElementById('btn-add-board')?.addEventListener('click', showAddBoardToGroupDialog); // This button is already translated by data-i18n
    document.getElementById('btn-choose-group-icon')?.addEventListener('click', () => {
        showIconPickerDialog(icon => document.getElementById('group-icon').value = icon);
    });
    document.getElementById('btn-save-group')?.addEventListener('click', handleSaveGroup); // This button is already translated by data-i18n
    document.getElementById('group-report-frequency')?.addEventListener('change', handleReportFrequencyChange);
    document.getElementById('edit-group-report-frequency')?.addEventListener('change', handleReportFrequencyChange);
    document.getElementById('btn-message-all')?.addEventListener('click', sendMessageToAllMembers);
    document.getElementById('btn-cancel-group')?.addEventListener('click', cancelGroupCreation); // This button is already translated by data-i18n

    
    // --- ABA "RELATÓRIOS" ---
    document.getElementById('generate-report-btn')?.addEventListener('click', generateAndRenderReport);
    document.getElementById('export-report-csv-btn')?.addEventListener('click', exportReportToCSV);

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
        showFloatingMessage(t('groups.feedback.groupNotFound'), 'error');
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

    // --- DIÁLOGO DE EDIÇÃO: LISTENERS CONFIGURADOS UMA ÚNICA VEZ ---
    const editDialog = document.getElementById('edit-group-dialog');
    if (editDialog) {
        // Botões de Salvar e Cancelar
        editDialog.querySelector('#save-edit-group-btn')?.addEventListener('click', saveGroupChanges);
        editDialog.querySelector('#cancel-edit-group')?.addEventListener('click', () => {
            if (isGroupSaved) {
                editDialog.close();
                return;
            }
            showConfirmationDialog(t('ui.unsavedChanges'), (confirmationDialog) => {
                showDialogMessage(confirmationDialog, t('kanban.feedback.changesDiscarded'), 'info');
                setTimeout(() => editDialog.close(), 1500);
                return true;
            });
        });

        // Lógica das Abas (CORRIGIDA)
        const dialogTabs = editDialog.querySelectorAll('.dialog-nav-item');
        const dialogPanes = editDialog.querySelectorAll('.tab-content'); // <-- CORREÇÃO: Usa a classe correta do seu HTML
        dialogTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                dialogTabs.forEach(t => t.classList.remove('active'));
                dialogPanes.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const targetPane = editDialog.querySelector(`#${tab.dataset.tab}`);
                if (targetPane) targetPane.classList.add('active');
            });
        });
    }

document.getElementById('btn-add-participant')?.addEventListener('click', () => {
    // Verifique se currentGroup está definido
    if (!currentGroup) {
        showFloatingMessage(t('groups.edit.noGroupSelected'), 'error');
        return;
    }
    
    showAddParticipantDialog();
});

document.getElementById('confirm-add-participant')?.addEventListener('click', () => {
    const select = document.getElementById('participant-select');
    const dialog = document.getElementById('add-participant-dialog');
    const memberId = select.value;
    
    if (!memberId || select.disabled) {
        showDialogMessage(dialog, t('groups.edit.selectUserToAdd'), 'error');
        return;
    }
    
    // Enviar solicitação via notificação
    sendGroupInvitation(currentGroup.id, memberId, currentUser);
    
    showDialogMessage(dialog, t('groups.edit.inviteSent'), 'success');
    
    // Marcar como não salvo para que o admin salve o grupo
    isGroupSaved = false;
    
    // Fechar diálogo após breve delay
    setTimeout(() => {
        document.getElementById('add-participant-dialog').close();
    }, 1500);
    });

    

    document.getElementById('cancel-add-participant')?.addEventListener('click', () => { // This button is already translated by data-i18n
    const dialog = document.getElementById('add-participant-dialog');
    showDialogMessage(dialog, t('ui.operationCancelled'), 'info');
    
    setTimeout(() => {
        document.getElementById('add-participant-dialog').close();
    }, 1500);
});
    
    // --- TEMPLATES DE GRUPO ---
    document.getElementById('btn-new-board-template')?.addEventListener('click', () => { // This button is already translated by data-i18n
        // Chama a função universal, passando o contexto 'group'
        showTemplateEditorDialog('board', { ownerType: 'group' });
    });
    document.getElementById('btn-new-tag-template')?.addEventListener('click', () => { // This button is already translated by data-i18n
        // Chama a função universal, passando o contexto 'group'
        showTemplateEditorDialog('tag', { ownerType: 'group' });
    });

    // Listener para atualizar a lista de templates de grupo quando um é salvo
    window.addEventListener('templatesUpdated', () => {
        // Verifica se a aba de templates de grupo está ativa para recarregar
        if (document.getElementById('group-templates')?.classList.contains('active')) {
            loadGroupTemplates();
        }
    });

    
    // --- ABA "ADMINISTRAR SERVIDORES" ---
    document.getElementById('btn-create-server')?.addEventListener('click', showCreateServerDialog); // This button is already translated by data-i18n
    document.getElementById('btn-add-server')?.addEventListener('click', showAddServerDialog); // This button is already translated by data-i18n
    document.getElementById('confirm-server-btn')?.addEventListener('click', createServer); // This button is already translated by data-i18n
    document.getElementById('cancel-server-btn')?.addEventListener('click', () => {
        const dialog = document.getElementById('server-dialog');
        showDialogMessage(dialog, t('ui.operationCancelled'), 'info');
        setTimeout(() => dialog.close(), 1500);
    });
    document.getElementById('confirm-add-server-btn')?.addEventListener('click', addServer); // This button is already translated by data-i18n
    document.getElementById('cancel-add-server-btn')?.addEventListener('click', () => {
        const dialog = document.getElementById('add-server-dialog');
        showDialogMessage(dialog, t('ui.operationCancelled'), 'info');
        setTimeout(() => dialog.close(), 1500);
    });
    document.getElementById('paste-server-btn')?.addEventListener('click', pasteServerUrl); // This button is already translated by data-i18n
    document.getElementById('copy-server-url-btn')?.addEventListener('click', copyServerUrl); // This button is already translated by data-i18n
    document.getElementById('close-share-dialog-btn')?.addEventListener('click', () => {
        showDialogMessage(document.querySelector('#share-server-dialog .feedback'), t('ui.operationCancelled'), 'info');
        setTimeout(() => {
            document.getElementById('share-server-dialog').close();
        }, 1500);
    });
}

async function switchTab(tabId, options = {}) {
    const tabs = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.nav-item[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    
    // Carregar dados específicos da aba
    if (tabId === 'create-group') {
        await loadUsersForSelection(); // This function populates a select, no hardcoded text.
        await loadTagTemplatesForGroup();
        initCustomSelects();
    } else if (tabId === 'group-templates') {
        await loadGroupTemplates();
        initCustomSelects();
    } else if (tabId === 'statistics') {
        const groupSelect = document.getElementById('stats-group-select');
        if (groupSelect) {
            populateGroupSelectorForStats(groupSelect);
            // Usa o ID das opções, ou o valor do select como fallback
            const groupIdToLoad = options.groupId || groupSelect.value;
            if (groupIdToLoad) {
                // Garante que o select mostre o grupo correto
                groupSelect.value = groupIdToLoad;
                await loadAndRenderStatistics(groupIdToLoad);
            }
            initCustomSelects();
        }
    } else if (tabId === 'meetings') {
        await loadAndRenderMeetings(); // This function populates a list, no hardcoded text.
    } else if (tabId === 'reports') {
        populateGroupSelectorForReports();
        initCustomSelects();
        document.getElementById('report-container').innerHTML = `<p class="no-templates">${t('groups.reports.selectGroup')}</p>`;
    }
}

async function handleSaveGroup() {
    const name = document.getElementById('group-name').value.trim();
    const permissions = {
        createBoards: document.getElementById('perm-create-boards').checked,
        editBoards: document.getElementById('perm-edit-boards').checked,
        createColumns: document.getElementById('perm-create-columns').checked,
        editColumns: document.getElementById('perm-edit-columns').checked,
        createCards: document.getElementById('perm-create-cards').checked
    };

    if (!name) {
        showFloatingMessage(t('groups.feedback.nameRequired'), 'error');
        return;
    }

    showConfirmationDialog(t('groups.confirm.create'), async (dialog) => {
        // Pega a lista de usuários a serem convidados
        const invitedUserIds = Array.from(document.getElementById('group-members').selectedOptions).map(opt => opt.value);

        // 1. Cria o objeto do grupo com APENAS o admin como membro inicial.
        const newGroupData = {
            name,
            icon: document.getElementById('group-icon').value || '👥',
            description: document.getElementById('group-description').value.trim(),
            access: document.getElementById('group-access').value,
            adminId: currentUser.id,
            memberIds: [currentUser.id], // CORREÇÃO: Apenas o admin é membro no início.
            boardIds: [],
            defaultPermissions: permissions, // <-- MUDANÇA: Agora são as permissões padrão
            memberPermissions: {}, // <-- NOVO: Estrutura para permissões individuais
            tagTemplate: document.getElementById('group-tag-template').value,
            createdAt: new Date().toISOString(), // Data de criação do grupo
            activityLog: [], // PASSO 1: Inicializa o log de atividades
            taskCount: 0, // FASE 2: Inicializa contador
            completedTaskCount: 0 // FASE 2: Inicializa contador
        };

        // 2. Salva o grupo para gerar seu ID.
        const savedGroup = await saveGroup(newGroupData);
        if (!savedGroup) {
            showDialogMessage(dialog, t('groups.edit.saveError'), 'error');
            return false;
        }

        // PASSO 2: Adiciona o log de criação
        addLogToGroup(savedGroup, {
            action: 'group_created',
            userId: currentUser.id,
            groupName: savedGroup.name
        });

        // NOVO: Envia as notificações de convite para os usuários selecionados.
        invitedUserIds.forEach(userId => {
            addGroupInvitationNotification(
                savedGroup.name,
                savedGroup.id,
                currentUser.name,
                currentUser.id,
                userId
            );
            // PASSO 2: Adiciona o log de convite
            addLogToGroup(savedGroup, {
                action: 'member_invited',
                userId: currentUser.id,
                memberName: allUsers.find(u => u.id === userId)?.name || 'Desconhecido'
            });
        });

        // 3. Agora, cria os quadros iniciais, associando-os ao ID do grupo recém-criado.
        const createdBoardIds = [];
        const boardItems = document.querySelectorAll('#group-boards-container .group-board-item');
        for (const item of boardItems) {
            const templateId = item.dataset.templateId;
            const allTemplates = await getSystemBoardTemplates();
            const selectedTemplate = allTemplates.find(t => t.id === templateId);

            // Cria as colunas se um template foi usado.
            const newColumns = selectedTemplate 
                ? await Promise.all(selectedTemplate.columns.map(colTmpl => saveColumn({ title: t(colTmpl.name), color: colTmpl.color, cardIds: [] }))) 
                : [];

            const boardData = {
                title: item.querySelector('strong').textContent,
                description: item.dataset.description,
                icon: '📋',
                ownerId: currentUser.id,
                visibility: 'group', // Quadros de grupo têm visibilidade de grupo por padrão.
                groupId: savedGroup.id, // <-- A CORREÇÃO PRINCIPAL ESTÁ AQUI
                columnIds: newColumns.map(c => c.id)
            };
            const savedBoard = await saveBoard(boardData);
            createdBoardIds.push(savedBoard.id);
        }

        // 4. Atualiza o grupo com os IDs dos quadros criados e salva novamente.
        savedGroup.boardIds = createdBoardIds;
        await saveGroup(savedGroup);

        showDialogMessage(dialog, t('groups.feedback.createSuccess'), 'success');
        setTimeout(() => { dialog.close(); loadGroups(); switchTab('my-groups'); }, 1500);
        return true;
    });
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

async function loadAndRenderMeetings() {
    const meetingsListContainer = document.getElementById('meetings-list');
    const scheduleBtn = document.getElementById('btn-schedule-meeting');
    if (!meetingsListContainer || !scheduleBtn) return;

    const userGroups = (await getAllGroups()).filter(g => g.memberIds && g.memberIds.includes(currentUser.id));
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
        meetingsListContainer.innerHTML = `<p class="no-templates">${t('groups.meetings.noneScheduled')}</p>`;
        return;
    }

    allMeetings.forEach(meeting => {
        const meetingCard = document.createElement('div');
        meetingCard.className = 'meeting-card';

        const date = new Date(meeting.date);
        const day = date.toLocaleDateString(undefined, { day: '2-digit' });
        const month = date.toLocaleDateString(undefined, { month: 'short' }).replace('.', '');

    meetingCard.innerHTML = `
            <div class="meeting-date-box">
                <span class="meeting-day">${day}</span>
                <span class="meeting-month">${month}</span>
            </div>
            <div class="meeting-details">
                <h4 class="meeting-title">${meeting.title}</h4>
                <div class="meeting-meta">
                    <span><strong>${t('groups.meetings.groupLabel')}</strong> ${meeting.groupName}</span>
                    <span><strong>${t('groups.meetings.timeLabel')}</strong> ${meeting.time}</span>
                    ${meeting.location ? `<span><strong>${t('groups.meetings.locationLabel')}</strong> ${meeting.location}</span>` : ''}
                </div>
            </div>
        `;
        meetingsListContainer.appendChild(meetingCard);
    });
}

async function showMeetingDialog() {
    const dialog = document.getElementById('meeting-dialog');
    const groupSelect = document.getElementById('meeting-group-select');

    
    groupSelect.innerHTML = '';
    const adminGroups = (await getAllGroups()).filter(g => g.adminId === currentUser.id);
    adminGroups.forEach(group => {
        groupSelect.innerHTML += `<option value="${group.id}">${group.name}</option>`;
    });

    
    document.getElementById('meeting-title').value = '';
    document.getElementById('meeting-date').value = '';
    document.getElementById('meeting-time').value = '';
    document.getElementById('meeting-location').value = '';
    document.getElementById('meeting-description').value = '';

    // Adiciona o listener de salvamento
    const saveBtn = document.getElementById('save-meeting-btn');
    
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', saveMeeting);

    
    const cancelBtn = document.getElementById('cancel-meeting-btn');
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    newCancelBtn.addEventListener('click', () => {
        showDialogMessage(dialog, t('groups.meetings.schedulingCancelled'), 'info');
        dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);
        setTimeout(() => dialog.close(), 1500);
    });

    initCustomSelects();
    dialog.showModal();
}

async function saveMeeting() {
    const dialog = document.getElementById('meeting-dialog');
    const groupId = document.getElementById('meeting-group-select').value;
    const title = document.getElementById('meeting-title').value.trim();
    const date = document.getElementById('meeting-date').value;
    const time = document.getElementById('meeting-time').value;

    if (!groupId || !title || !date || !time) {
        showDialogMessage(dialog, t('groups.meetings.fieldsRequired'), 'error');
        return;
    }

    const group = await getGroup(groupId);
    if (!group) return;

    if (!group.meetings) group.meetings = [];

    const newMeeting = {
        id: 'meeting-' + Date.now(),
        title, date, time,
        location: document.getElementById('meeting-location').value.trim(),
        description: document.getElementById('meeting-description').value.trim()
    };

    group.meetings.push(newMeeting);
    await saveGroup(group);

    
    group.memberIds.forEach(memberId => {
        // Não envia para si mesmo
        if (memberId !== currentUser.id) {
            addMeetingNotification(title, group.name, `${date}T${time}`);
        }
    });

    showDialogMessage(dialog, t('groups.meetings.scheduleSuccess'), 'success');
    setTimeout(() => {
        dialog.close();
        loadAndRenderMeetings(); // Atualiza a lista
    }, 1500);
}

async function addBoardToGroup(name, templateId, description) {
    const container = document.getElementById('group-boards-container');
    const boardId = 'board-' + Date.now();
    
    
    let templateName = "";
    if (templateId) {
        const allTemplates = await getSystemBoardTemplates();
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
            ${templateName ? `<span class="template-badge">${t('groups.boards.templateLabel', { templateName: templateName })}</span>` : ''}
        </div>
        <button class="btn btn-sm danger remove-board-btn">${t('ui.remove')}</button>
    `;
    
    boardElement.querySelector('.remove-board-btn').addEventListener('click', () => {
        boardElement.remove();
    });
    
    container.appendChild(boardElement);
}

async function showAddBoardToGroupDialog() {
    const dialog = document.getElementById('add-board-to-group-dialog');
    const templateSelect = dialog.querySelector('#add-board-template-select');
    const titleInput = dialog.querySelector('#add-board-title-input');
    const descriptionInput = dialog.querySelector('#add-board-description-input');
    const iconInput = dialog.querySelector('#add-board-icon-input');

    
    templateSelect.innerHTML = `<option value="">${t('kanban.dialog.board.templateEmpty')}</option>`;
    const systemTemplates = await getSystemBoardTemplates();
    if (systemTemplates.length > 0) {
        templateSelect.innerHTML += `<optgroup label="${t('kanban.dialog.board.systemTemplates')}">`;
        systemTemplates.forEach(template => templateSelect.innerHTML += `<option value="${template.id}">${t(template.name)}</option>`);
        templateSelect.innerHTML += `</optgroup>`;
    }

    
    titleInput.value = '';
    descriptionInput.value = '';
    iconInput.value = '📋';

    
    dialog.querySelector('#btn-choose-add-board-icon').onclick = () => {
        showIconPickerDialog(icon => iconInput.value = icon);
    };

    // Listener para o botão de cancelar
    dialog.querySelector('#cancel-add-board-to-group-btn').onclick = () => dialog.close();

    
    const confirmBtn = dialog.querySelector('#confirm-add-board-to-group-btn');
    
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
        const boardName = titleInput.value.trim();
        const selectedTemplateId = templateSelect.value;
        const description = descriptionInput.value.trim();
        const selectedTemplate = systemTemplates.find(t => t.id === selectedTemplateId);

        
        const finalBoardName = boardName || (selectedTemplate ? t(selectedTemplate.name) : '');

        if (!finalBoardName) {
            showDialogMessage(dialog, t('groups.boards.nameRequired'), 'error');
            return;
        }

        
        addBoardToGroup(finalBoardName, selectedTemplateId, description);

        showDialogMessage(dialog, t('groups.boards.addSuccess'), 'success');
        setTimeout(() => {
            dialog.close();
        }, 1500);
    });

    initCustomSelects();
    dialog.showModal();
}

async function loadTagTemplatesForGroup() {
    const templateSelect = document.getElementById('group-tag-template');
    if (!templateSelect) return;

    
    templateSelect.innerHTML = '';

    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = t('groups.tags.none');
    templateSelect.appendChild(defaultOption);

    
    const systemTemplates = await getSystemTagTemplates();
    if (systemTemplates.length > 0) {
        const optgroupSystem = document.createElement('optgroup');
        optgroupSystem.label = t('groups.tags.useSystemTemplate');
        systemTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = t(template.name);
            optgroupSystem.appendChild(option);
        });
        templateSelect.appendChild(optgroupSystem);
    }
}

// js/groups.js - PART 2/4 - REFACTORED VERSION

async function loadGroupTemplates() {
    const boardContainer = document.getElementById('group-board-templates-grid');
    const tagContainer = document.getElementById('group-tag-templates-grid');
    const adminGroups = (await getAllGroups()).filter(g => g.adminId === currentUser.id);

    if (adminGroups.length === 0) {
        boardContainer.innerHTML = `<p class="no-templates">${t('groups.templates.noAdminGroups')}</p>`;
        tagContainer.innerHTML = `<p class="no-templates">${t('groups.templates.noAdminGroups')}</p>`;
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

async function renderGroupBoardTemplates(templates) {
    const container = document.getElementById('group-board-templates-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (templates.length === 0) {
        container.innerHTML = `<p class="no-templates">${t('groups.templates.noBoardTemplates')}</p>`;
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
            <p class="template-group-info">${t('groups.templates.groupLabel', { groupName: template.groupName })}</p>
            <p>${template.description || t('templates.feedback.noDescription')}</p>
            <div class="template-colors">
                ${template.columns.slice(0, 4).map(col => 
                    `<div class="color-box" style="background-color: ${col.color};"></div>`
                ).join('')}
                ${template.columns.length > 4 ? '<span>...</span>' : ''}
            </div>
            <div class="template-actions">
                <button class="btn btn-sm confirm use-template-btn" data-template-id="${template.id}">${t('templates.button.use')}</button>
                <button class="btn btn-sm edit edit-template-btn" data-template-id="${template.id}">${t('templates.button.edit')}</button>
                <button class="btn btn-sm danger delete-template-btn" data-template-id="${template.id}">${t('templates.button.delete')}</button>
            </div>
        `;
        
        container.appendChild(templateCard);
    });
    
    
    container.querySelectorAll('.use-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            useBoardTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
    
    container.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            showTemplateEditorDialog('board', { ownerType: 'group', ownerId: card.dataset.groupId }, card.dataset.templateId);
        });
    });
    
    container.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            deleteGroupBoardTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
}

async function renderGroupTagTemplates(templates) {
    const container = document.getElementById('group-tag-templates-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (templates.length === 0) {
        container.innerHTML = `<p class="no-templates">${t('groups.templates.noTagTemplates')}</p>`;
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
            <p class="template-group-info">${t('groups.templates.groupLabel', { groupName: template.groupName })}</p>
            <p>${template.description || t('templates.feedback.noDescription')}</p>
            <div class="tag-list">
                ${template.tags.slice(0, 3).map(tag => 
                    `<span class="tag-pill" style="background-color: ${tag.color}">${tag.name}</span>`
                ).join('')}
                ${template.tags.length > 3 ? '<span>...</span>' : ''}
            </div>
            <div class="template-actions">
                <button class="btn btn-sm confirm use-template-btn" data-template-id="${template.id}">${t('templates.button.use')}</button>
                <button class="btn btn-sm edit edit-template-btn" data-template-id="${template.id}">${t('templates.button.edit')}</button>
                <button class="btn btn-sm danger delete-template-btn" data-template-id="${template.id}">${t('templates.button.delete')}</button>
            </div>
        `;
        
        container.appendChild(templateCard);
    });
    
    
    container.querySelectorAll('.use-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            useTagTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
    
    container.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            showTemplateEditorDialog('tag', { ownerType: 'group', ownerId: card.dataset.groupId }, card.dataset.templateId);
        });
    });
    
    container.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            deleteGroupTagTemplate(card.dataset.templateId, card.dataset.groupId);
        });
    });
}

async function useBoardTemplate(templateId, groupId) {
    const group = await getGroup(groupId);
    if (!group) return;

    const template = (group.boardTemplates || []).find(t => t.id === templateId);
    if (!template) {
        showFloatingMessage(t('groups.templates.templateNotFoundInGroup'), 'error');
        return;
    }

    const newColumns = await Promise.all(template.columns.map(async colTemplate => {
        return await saveColumn({ title: colTemplate.name, color: colTemplate.color, cardIds: [] });
    }));

    const newBoardData = {
        title: `${template.name} ${t('kanban.board.copySuffix')}`,
        icon: template.icon || '📋',
        ownerId: currentUser.id,
        visibility: 'group', // O quadro criado a partir de um template de grupo, é de grupo
        groupId: group.id,
        columnIds: newColumns.map(col => col.id)
    };

    const savedBoard = await saveBoard(newBoardData);

    localStorage.setItem(`currentBoardId_${currentUser.id}`, savedBoard.id);
    showFloatingMessage(t('templates.feedback.boardUsed', { boardTitle: savedBoard.title }), 'success');
    setTimeout(() => { window.location.href = `kanban.html`; }, 1500);
}

function useTagTemplate(templateId, groupId) {
    showFloatingMessage(t('groups.templates.tagUseNotImplemented'), 'info');
    
}

function deleteGroupBoardTemplate(templateId, groupId) {
    showConfirmationDialog(t('templates.confirm.deleteBoard'), (dialog) => {
        const group = getGroup(groupId);
        if (!group || !group.boardTemplates) return false;
        group.boardTemplates = group.boardTemplates.filter(t => t.id !== templateId);
        if (saveGroup(group)) {
            showDialogMessage(dialog, t('templates.feedback.boardDeleted'), 'success');
            loadGroupTemplates();
            return true;
        }
        return false;
    });
}

function deleteGroupTagTemplate(templateId, groupId) {
    showConfirmationDialog(t('templates.confirm.deleteTag'), async (dialog) => {
        const group = getGroup(groupId);
        if (!group || !group.tagTemplates) return false;

        const wasDefault = group.defaultTagTemplateId === templateId;
        
        // Filtra para remover o template
        group.tagTemplates = group.tagTemplates.filter(t => t.id !== templateId);

        
        if (wasDefault) {
            if (group.tagTemplates.length > 0) {
                // O novo padrão é o primeiro da lista de templates customizados.
                group.tagTemplate = group.tagTemplates[0].id;
            } else {
                // Se não houver mais templates customizados, volta para "Nenhum".
                group.tagTemplate = '';
            }
        }

        if (await saveGroup(group)) {
            showDialogMessage(dialog, t('templates.feedback.tagDeleted'), 'success');
            await loadGroupTemplates(); // Recarrega os templates da aba
            loadGroups(); // Recarrega os grupos para atualizar o alerta
            return true;
        }
        return false;
    });
}

// js/groups.js - PART 3/4 - REFACTORED VERSION

// ===== FUNÇÕES DE SERVIDORES =====

async function loadServers() {
    servers = await universalLoad('servers') || [];
    renderServers();
}

async function saveServers() {
    await universalSave('servers', servers);
}

function renderServers() {
    const serversList = document.querySelector('.servers-list');
    if (!serversList) return;
    
    serversList.innerHTML = '';
    
    if (servers.length === 0) {
        serversList.innerHTML = `<p class="no-servers">${t('groups.servers.noneFound')}</p>`;
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
                    <p>${server.url || t('groups.servers.localServer')}</p>
                </div>
            </div>
            <div class="server-actions">
                <button class="btn btn-sm share share-server-btn" data-server-id="${server.id}">${t('groups.servers.buttonShare')}</button>
                <button class="btn btn-sm danger delete-server-btn" data-server-id="${server.id}">${t('templates.button.delete')}</button>
            </div>
        `;
        
        serversList.appendChild(serverItem);
    });
    
    
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
    dialog.querySelector('#server-dialog-title').textContent = t('groups.servers.createDialogTitle');
    dialog.querySelector('#server-name').value = '';
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'success', 'error');
    dialog.showModal();
}

async function createServer() {
    const dialog = document.getElementById('server-dialog');
    const serverName = document.getElementById('server-name').value.trim();
    
    if (!serverName) {
        showDialogMessage(dialog, t('groups.servers.nameRequired'), 'error');
        return;
    }

    showConfirmationDialog(
        t('groups.servers.confirmCreate', { serverName: serverName }),
        async (confirmDialog) => {
            const newServer = {
                id: 'server-' + Date.now(),
                name: serverName,
                url: window.location.origin,
                createdAt: new Date().toISOString()
            };
            
            servers.push(newServer);
            await saveServers();
            renderServers();
            
            showDialogMessage(confirmDialog, t('groups.servers.createSuccess'), 'success');
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
                showDialogMessage(dialog, t('groups.servers.clipboardEmpty'), 'error');
                return;
            }
            
            
            try {
                new URL(text);
                document.getElementById('server-url').value = text;
                showDialogMessage(dialog, t('groups.servers.pasteSuccess'), 'success');
            } catch (e) {
                showDialogMessage(dialog, t('groups.servers.invalidUrl'), 'error');
            }
        })
        .catch(err => {
            showDialogMessage(document.getElementById('add-server-dialog'), t('groups.servers.clipboardError'), 'error');
        });
}

function copyServerUrl() {
    const urlInput = document.getElementById('server-share-url');
    urlInput.select();
    
    const dialog = document.getElementById('share-server-dialog');
    try {
        navigator.clipboard.writeText(urlInput.value);
        showDialogMessage(dialog, t('groups.servers.copySuccess'), 'success');
        
        
        setTimeout(() => {
            dialog.close();
        }, 1500);
    } catch (err) {
        showDialogMessage(dialog, t('groups.servers.copyError'), 'error');
    }
}

async function confirmDeleteServer(serverId) {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    showConfirmationDialog(
        t('groups.servers.confirmDelete', { serverName: server.name }),
        async (dialog) => {
            servers = servers.filter(s => s.id !== serverId);
            saveServers();
            renderServers();
            
            
            showDialogMessage(dialog, t('groups.servers.deleteSuccess'), 'success');
            
            
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
        showDialogMessage(dialog, t('groups.servers.urlRequired'), 'error');
        return;
    }
    
    
    try {
        new URL(serverUrl);
    } catch (e) {
        showDialogMessage(dialog, t('groups.servers.invalidUrl'), 'error');
        return;
    }
    
    
    const existingServer = servers.find(s => s.url === serverUrl);
    if (existingServer) {
        showDialogMessage(dialog, t('groups.servers.alreadyAdded'), 'error');
        return;
    }
    
    
    showDialogMessage(dialog, t('groups.servers.testingConnection'), 'info');
    
    const connectionTest = await testServerConnection(serverUrl);
    
    if (!connectionTest.success) {
        showDialogMessage(dialog, t('groups.servers.connectionFailed', { message: connectionTest.message }), 'error');
        return;
    }
    
    
    showConfirmationDialog(
        t('groups.servers.confirmAdd', { hostname: new URL(serverUrl).hostname }),
        async (confirmDialog) => {
            const newServer = {
                id: 'server-' + Date.now(),
                url: serverUrl,
                name: t('groups.servers.externalServerName', { hostname: new URL(serverUrl).hostname }),
                createdAt: new Date().toISOString(),
                isExternal: true,
                status: 'connected'
            };
            
            servers.push(newServer);
            await saveServers();
            renderServers();
            
            showDialogMessage(confirmDialog, t('groups.servers.addSuccess'), 'success');
            
            setTimeout(() => {
                confirmDialog.close();
                dialog.close();
            }, 1500);
            
            return true;
        }
    );
}

// ===== FUNÇÕES DE GRUPOS (ATUALIZADAS) =====
async function renderGroups() {
    const adminContainer = document.getElementById('admin-groups-grid');
    const memberContainer = document.getElementById('member-groups-grid');
    if (!adminContainer || !memberContainer) return;

    adminContainer.innerHTML = '';
    memberContainer.innerHTML = '';

    const adminGroups = groups.filter(g => g.adminId === currentUser.id);
    const memberGroups = groups.filter(g => g.adminId !== currentUser.id);
    
    if (adminGroups.length === 0) {
        adminContainer.innerHTML = `<p class="no-groups-message">${t('groups.myGroups.noAdminGroups')}</p>`;
    } else {
        for (const group of adminGroups) {
            const groupCard = await createGroupCard(group);
            adminContainer.appendChild(groupCard);
        }
    }
    
    if (memberGroups.length === 0) {
        memberContainer.innerHTML = `<p class="no-groups-message">${t('groups.myGroups.noMemberGroups')}</p>`;
    } else {
        for (const group of memberGroups) {
            const groupCard = await createGroupCard(group);
            memberContainer.appendChild(groupCard);
        }
    }
}

// Ela contém o HTML do seu card, mas corrigido para a nova estrutura de dados.
async function createGroupCard(group) {
    const groupCard = document.createElement('div');
    groupCard.className = 'group-card';
    groupCard.dataset.groupId = group.id;

    const isAdmin = group.adminId === currentUser.id;

    const actionsHtml = isAdmin
        ? `<button class="btn btn-sm edit" data-action="edit">${t('ui.edit')}</button>
           <button class="btn btn-sm danger" data-action="delete">${t('ui.delete')}</button>`
        : `<button class="btn btn-sm danger" data-action="leave">${t('groups.leave.title')}</button>`;

    groupCard.innerHTML = `
        <div class="group-icon">${group.icon || '👥'}</div>
        <h4 class="group-name">${group.name}</h4>
        <p class="group-description">${group.description || t('templates.feedback.noDescription')}</p>
        <div class="group-stats-grid">
            <div class="group-stat">
                <span class="stat-number">${group.memberIds ? group.memberIds.length : 0}</span>
                <span class="stat-label">${t('groups.myGroups.card.members')}</span>
            </div>
            <div class="group-stat">
                <span class="stat-number">${group.taskCount || 0}</span>
                <span class="stat-label">${t('groups.myGroups.card.tasks')}</span>
            </div>
            <div class="group-stat">
                <span class="stat-number">${group.completedTaskCount || 0}</span>
                <span class="stat-label">${t('groups.myGroups.card.completed')}</span>
            </div>
        </div>
        <div class="group-actions">
            <button class="btn btn-sm confirm" data-action="view">${t('profile.groups.buttonStats')}</button>
            ${actionsHtml}
        </div>
    `;
    return groupCard;
}

async function loadUsersForSelection() {
    const membersSelect = document.getElementById('group-members');
    if (!membersSelect) return;
    
    membersSelect.innerHTML = '';
    const users = await getAllUsers();
    const currentUser = await getCurrentUser();
    
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
        t('groups.create.confirmCancel'),
        (dialog) => {
            showDialogMessage(dialog, t('kanban.feedback.changesDiscarded'), 'info');
            
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

async function addLogToGroup(group, logData) {
    if (!group) return;

    const logEntry = {
        ...logData,
        timestamp: new Date().toISOString()
    };

    if (!group.activityLog) {
        group.activityLog = [];
    }
    group.activityLog.push(logEntry);
    await saveGroup(group); // Salva o grupo com o novo log
}

async function viewGroup(group) {
    // Alternar para a aba de estatísticas
    switchTab('statistics');
    
    // Agora que a aba está ativa, os elementos existem.
    const statsGroupNameEl = document.getElementById('statistics-group-name');
    if (statsGroupNameEl) {
        statsGroupNameEl.textContent = group.name;
    }

    // Carrega as estatísticas para o grupo específico que foi clicado.
    await loadAndRenderStatistics(group.id);
}

async function editGroup(group) {
    const dialog = document.getElementById('edit-group-dialog');
    document.getElementById('edit-group-name').value = group.name;
    const iconInput = document.getElementById('edit-group-icon');
    iconInput.value = group.icon || '👥';
    document.getElementById('btn-choose-edit-group-icon').onclick = () => {
        showIconPickerDialog(icon => iconInput.value = icon);
    };
    document.getElementById('edit-group-description').value = group.description || '';
    document.getElementById('edit-group-access').value = group.access || 'public';
    // Preenche as permissões
    const permissions = group.defaultPermissions || {}; // <-- MUDANÇA: Lê das permissões padrão
    document.getElementById('edit-perm-create-boards').checked = permissions.createBoards || false;
    document.getElementById('edit-perm-edit-boards').checked = permissions.editBoards || false;
    document.getElementById('edit-perm-create-columns').checked = permissions.createColumns || false;
    document.getElementById('edit-perm-edit-columns').checked = permissions.editColumns || false;
    document.getElementById('edit-perm-create-cards').checked = permissions.createCards || false;


    initCustomSelects();
    // --- LÓGICA PARA O SELECT DE TAG TEMPLATE ---
    const tagTemplateSelect = document.getElementById('edit-group-tag-template');
    tagTemplateSelect.innerHTML = ''; // Limpa

    const groupTemplates = group.tagTemplates || [];

    
    if (groupTemplates.length === 0) {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = t('groups.tags.none');
        tagTemplateSelect.appendChild(defaultOption);
    }

    
    if (groupTemplates.length > 0) {
        const optgroupGroup = document.createElement('optgroup');
        optgroupGroup.label = t('groups.templates.groupLabel', { groupName: group.name });
        groupTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupGroup.appendChild(option);
        });
        tagTemplateSelect.appendChild(optgroupGroup);
    }

    
    const systemTemplates = await getSystemTagTemplates();
    if (systemTemplates.length > 0) {
        const optgroupSystem = document.createElement('optgroup');
        optgroupSystem.label = t('groups.tags.useSystemTemplate');
        systemTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            optgroupSystem.appendChild(option);
        });
        tagTemplateSelect.appendChild(optgroupSystem);
    }

    
    tagTemplateSelect.value = group.defaultTagTemplateId || '';
    
    // --- LÓGICA PARA PREENCHER OS CAMPOS DE RELATÓRIO ---
    const reportSettings = group.reportSettings || { frequency: 'none' };
    const freqSelect = document.getElementById('edit-group-report-frequency');
    const weekSelect = document.getElementById('edit-group-report-day-of-week');
    const monthInput = document.getElementById('edit-group-report-day-of-month');
    const weekContainer = document.getElementById('edit-group-report-day-of-week-container');
    const monthContainer = document.getElementById('edit-group-report-day-of-month-container');

    freqSelect.value = reportSettings.frequency;
    
    weekContainer.classList.toggle('hidden', reportSettings.frequency !== 'weekly');
    monthContainer.classList.toggle('hidden', reportSettings.frequency !== 'monthly');

    
    if (reportSettings.frequency === 'weekly') {
        weekSelect.value = reportSettings.dayOfWeek || '1';
    }
    if (reportSettings.frequency === 'monthly') {
        monthInput.value = reportSettings.dayOfMonth || '1';
    }

    
    isGroupSaved = true;
    const formElements = dialog.querySelectorAll('input, textarea, select');
    
    const markAsUnsaved = () => isGroupSaved = false;

    formElements.forEach(el => {
        el.removeEventListener('change', markAsUnsaved); // Evita duplicatas
        el.addEventListener('change', markAsUnsaved);
    });

    
    loadGroupMembers(group);
    
    // PASSO 4: Renderiza o log de atividades
    renderGroupActivityLog(group, dialog.querySelector('#edit-group-activity-pane'));

    
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    
    // Garante que a primeira aba esteja ativa ao abrir, usando a nova classe
    const tabs = dialog.querySelectorAll('.dialog-nav-item');
    if (tabs.length > 0) {
        tabs[0].click();
    }

    initCustomSelects();
    
    dialog.showModal();
}

async function saveGroupChanges() {
    
    const dialog = document.getElementById('edit-group-dialog');
    const feedbackEl = dialog.querySelector('.feedback');
    
    const name = document.getElementById('edit-group-name').value.trim();
    if (!name) {
        showDialogMessage(feedbackEl, t('groups.feedback.nameRequired'), 'error');
        return;
    }
    
    
    const existingGroup = groups.find(g => 
        g.name.toLowerCase() === name.toLowerCase() && 
        g.id !== currentGroup.id
    );
    
    if (existingGroup) {
        showDialogMessage(feedbackEl, t('groups.edit.nameExists'), 'error');
        return;
    }
    
    
    showConfirmationDialog(
        t('groups.edit.confirmSave'),
        async (confirmationDialog) => {
            const oldGroup = { ...currentGroup }; // Clona o estado antigo para comparação

            currentGroup.name = name;
            currentGroup.description = document.getElementById('edit-group-description').value;
            currentGroup.icon = document.getElementById('edit-group-icon').value;
            currentGroup.access = document.getElementById('edit-group-access').value;
            currentGroup.defaultPermissions = { // <-- MUDANÇA: Salva como permissões padrão
                createBoards: document.getElementById('edit-perm-create-boards').checked,
                editBoards: document.getElementById('edit-perm-edit-boards').checked,
                createColumns: document.getElementById('edit-perm-create-columns').checked,
                editColumns: document.getElementById('edit-perm-edit-columns').checked,
                createCards: document.getElementById('edit-perm-create-cards').checked
            };

            currentGroup.defaultTagTemplateId = document.getElementById('edit-group-tag-template').value;
            
            const reportFrequency = document.getElementById('edit-group-report-frequency').value;
            currentGroup.reportSettings = {
                frequency: reportFrequency,
                dayOfWeek: reportFrequency === 'weekly' ? document.getElementById('edit-group-report-day-of-week').value : null,
                dayOfMonth: reportFrequency === 'monthly' ? document.getElementById('edit-group-report-day-of-month').value : null,
            };
            
            // PASSO 2: Loga as alterações
            logGroupChanges(oldGroup, currentGroup);

            
            if (window.pendingParticipants && window.pendingParticipants.length > 0) {
                window.pendingParticipants.forEach(memberId => {
                    sendGroupInvitation(currentGroup.id, memberId, currentUser);
                });
                
                window.pendingParticipants = [];
            }
            
            
            if (await saveGroup(currentGroup)) {
                showDialogMessage(confirmationDialog, t('groups.edit.saveSuccess'), 'success');
                
                
                renderGroups();
                isGroupSaved = true; // Reseta o estado após salvar
                
                
                setTimeout(() => {
                    confirmationDialog.close();
                    dialog.close();
                }, 1500);
                
                return true;
            } else {
                showDialogMessage(confirmationDialog, t('groups.edit.saveError'), 'error');
                return false;
            }
        }
    );
}

async function logGroupChanges(oldGroup, newGroup) {
    const changes = [];
    const fieldsToCompare = {
        name: 'Nome',
        description: 'Descrição',
        icon: 'Ícone',
        access: 'Acesso'
    };

    for (const field in fieldsToCompare) {
        if ((oldGroup[field] || '') !== (newGroup[field] || '')) {
            changes.push({
                action: 'group_edited',
                userId: currentUser.id,
                field: fieldsToCompare[field],
                from: oldGroup[field] || 'vazio',
                to: newGroup[field] || 'vazio'
            });
        }
    }

    const oldPerms = oldGroup.defaultPermissions || {};
    const newPerms = newGroup.defaultPermissions || {};
    for (const perm in newPerms) {
        if ((oldPerms[perm] || false) !== (newPerms[perm] || false)) {
            changes.push({
                action: 'permissions_changed',
                userId: currentUser.id,
                permission: t(`groups.permissions.${perm}`), // Traduz o nome da permissão
                value: newPerms[perm]
            });
        }
    }

    const oldReport = oldGroup.reportSettings || { frequency: 'none' };
    const newReport = newGroup.reportSettings || { frequency: 'none' };
    if (oldReport.frequency !== newReport.frequency) {
        changes.push({
            action: 'report_settings_changed',
            userId: currentUser.id,
            frequency: newReport.frequency
        });
    }

    changes.forEach(logData => addLogToGroup(newGroup, logData));
}

async function deleteGroup() {
    if (!currentGroup || currentGroup.adminId !== currentUser.id) {
        showFloatingMessage(t('groups.delete.adminOnly'), 'error');
        return;
    }
    
    showConfirmationDialog(
        t('groups.delete.confirm', { groupName: currentGroup.name }),
        (confirmationDialog) => {
            
            confirmationDialog.close();
            
            
            const passwordDialog = document.createElement('dialog');
            passwordDialog.className = 'draggable';
            passwordDialog.innerHTML = `
                <h3 class="drag-handle">${t('groups.delete.securityTitle')}</h3>
                <div class="form-group">
                    <label for="confirm-password-input">${t('groups.delete.passwordPrompt', { groupName: currentGroup.name })}</label>
                    <input type="password" id="confirm-password-input" autocomplete="current-password" required>
                </div>
                <div class="feedback"></div>
                <div class="modal-actions">
                    <button class="btn btn-neon cancel" id="cancel-password-btn">${t('ui.cancel')}</button>
                    <button class="btn btn-neon danger" id="confirm-password-btn">${t('groups.delete.buttonDelete')}</button>
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
                    showDialogMessage(feedbackEl, t('ui.passwordRequired'), 'error');
                    return;
                }
                
                if (password === currentUser.password || validateMasterPassword(password)) {
                    
                    confirmBtn.disabled = true;
                    cancelBtn.disabled = true;
                    
                    
                    if (await deleteGroupStorage(currentGroup.id)) {
                        
                        const groupMemberIds = currentGroup.memberIds || [];
                        groupMemberIds.forEach(async (memberId) => {
                            const userProfile = await getUserProfile(memberId);
                            if (userProfile && userProfile.groupIds) {
                                userProfile.groupIds = userProfile.groupIds.filter(id => id !== currentGroup.id);
                                saveUserProfile(userProfile);
                            }
                        });
                        
                        
                        showDialogMessage(passwordDialog, t('groups.delete.deleteSuccess'), 'success');
                            loadGroups();
                        
                        
                        setTimeout(() => {
                            closePasswordDialog();
                            switchTab('my-groups');
                        }, 1500);
                    } else {
                        showDialogMessage(passwordDialog, t('groups.edit.saveError'), 'error');
                        confirmBtn.disabled = false;
                        cancelBtn.disabled = false;
                    }
                } else {
                    showDialogMessage(feedbackEl, t('ui.incorrectPassword'), 'error');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            };

            cancelBtn.addEventListener('click', () => {
                showDialogMessage(passwordDialog, t('groups.delete.deleteCancelled'), 'info');
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

async function leaveGroup() {
    if (!currentGroup) {
        showFloatingMessage(t('groups.edit.noGroupSelected'), 'error');
        return;
    }
    if (currentGroup.adminId === currentUser.id) {
        showFloatingMessage(t('groups.leave.adminCannotLeave'), 'error');
        return;
    }

    showConfirmationDialog(
        t('groups.leave.confirm', { groupName: currentGroup.name }),
        async (dialog) => {
            
            dialog.close();
            
            
            const passwordDialog = document.createElement('dialog');
            passwordDialog.className = 'draggable';
            passwordDialog.innerHTML = `
                <h3 class="drag-handle">${t('groups.delete.securityTitle')}</h3>
                <div class="form-group">
                    <label for="confirm-password-input">${t('groups.leave.passwordPrompt', { groupName: currentGroup.name })}</label>
                    <input type="password" id="confirm-password-input" autocomplete="current-password" required>
                </div>
                <div class="feedback"></div>
                <div class="modal-actions">
                    <button class="btn btn-neon cancel" id="cancel-password-btn">${t('ui.cancel')}</button>
                    <button class="btn btn-neon confirm" id="confirm-password-btn">${t('ui.confirm')}</button>
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
                    showDialogMessage(feedbackEl, t('ui.passwordRequired'), 'error');
                    return;
                }
                
                if (password === currentUser.password || validateMasterPassword(password)) {
                    
                    const groupData = await getGroup(currentGroup.id);
                    const userProfile = await getUserProfile(currentUser.id);

                    if (groupData && groupData.memberIds) {
                        groupData.memberIds = groupData.memberIds.filter(id => id !== currentUser.id);
                        await saveGroup(groupData);
                        
                        
                        addGroupLeaveNotification(groupData.name, currentUser.name, groupData.adminId);
                    }

                    if (userProfile && userProfile.groupIds) {
                        userProfile.groupIds = userProfile.groupIds.filter(id => id !== currentGroup.id);
                        await saveUserProfile(userProfile);
                    }

                    showDialogMessage(passwordDialog, t('groups.leave.success', { groupName: currentGroup.name }), 'success');
                    
                    setTimeout(() => {
                        passwordDialog.close();
                        passwordDialog.remove();
                        loadGroups();
                        switchTab('my-groups');
                    }, 1500);
                } else {
                    showDialogMessage(passwordDialog, t('ui.incorrectPassword'), 'error');
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

async function populateGroupSelectorForStats(selectElement) {
    if (!selectElement) return;
    selectElement.innerHTML = '';

    
    const memberGroups = groups; 
    if (memberGroups.length === 0) {
        selectElement.innerHTML = `<option value="">${t('groups.reports.noGroups')}</option>`;
        selectElement.disabled = true;
        return;
    }

    selectElement.disabled = false;
    memberGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        selectElement.appendChild(option);
    });

    
    selectElement.onchange = () => loadAndRenderStatistics(selectElement.value);
    document.getElementById('time-filter').onchange = () => loadAndRenderStatistics(selectElement.value);
    document.getElementById('chart-type').onchange = () => loadAndRenderStatistics(selectElement.value);
}

async function loadAndRenderStatistics(groupId) {
    const group = await getGroup(groupId);
    if (!group) {
        document.querySelector('#statistics .stats-sections').innerHTML = `<p class="no-templates">${t('groups.stats.groupNotFound')}</p>`;
        return;
    }

    const timeFilter = document.getElementById('time-filter').value;
    const chartType = document.getElementById('chart-type').value;

    const allCardsInGroup = (await Promise.all((group.boardIds || []).map(async (boardId) => {
        const board = await getFullBoardData(boardId, true);
        if (!board) return [];

        // PRIVACY CHECK: Apenas quadros com visibilidade 'group' devem contar para as estatísticas do grupo.
        const isVisibleToGroup = board.visibility === 'group';
        if (isVisibleToGroup) {
            return board.columns.flatMap(col => col.cards);
        }
        return []; // Não inclui cartões de quadros privados de outros membros.
    }))).flat();

    const now = new Date();
    let startDate = new Date(0); // Início da época para 'all'
    if (timeFilter !== 'all') {
        startDate = new Date(); // now
        // CORREÇÃO: Garante que o 'today' comece hoje, e os outros contem os dias corretamente.
        switch (timeFilter) {
            case 'today':
                // startDate já é hoje, está correto.
                break;
            case 'last7': 
                startDate.setDate(startDate.getDate() - 6); 
                break;
            case 'last30': 
                startDate.setDate(startDate.getDate() - 29); 
                break;
        }
        startDate.setHours(0, 0, 0, 0);
    }

    const cardsCreatedInPeriod = allCardsInGroup.filter(card => 
        (card.activityLog || []).some(log => log.action === 'created' && (timeFilter === 'all' || new Date(log.timestamp) >= startDate))
    );

    // MÉTRICA DE CONCLUÍDOS: Apenas cartões com log 'completed' no período.
    const cardsCompletedInPeriod = allCardsInGroup.filter(card =>
        (card.activityLog || []).some(log => log.action === 'completed' && (timeFilter === 'all' || new Date(log.timestamp) >= startDate)));

    // MÉTRICA DE ARQUIVADOS: Apenas cartões com log 'archived' e que NÃO foram concluídos.
    const cardsArchivedAsOpenInPeriod = allCardsInGroup.filter(card => {
        const archiveLog = (card.activityLog || []).find(log => log.action === 'archived' && (timeFilter === 'all' || new Date(log.timestamp) >= startDate));
        if (!archiveLog) return false;
        // Verifica se não há um log 'completed' ANTES do log de arquivamento.
        const wasCompletedBeforeArchive = (card.activityLog || []).some(log => log.action === 'completed' && new Date(log.timestamp) < new Date(archiveLog.timestamp));
        return !wasCompletedBeforeArchive;
    });

    // CORREÇÃO: A lógica para determinar cartões ativos foi completamente reescrita para maior precisão.
    // Um cartão é considerado "ativo" se foi criado no período E seu estado atual não é 'concluído' nem 'arquivado/excluído'.
    const activeCardsList = cardsCreatedInPeriod.filter(card => 
        !card.isComplete && !card.isArchived
    );

    const totalCreated = cardsCreatedInPeriod.length;
    const totalCompleted = cardsCompletedInPeriod.length;
    const overdueCards = activeCardsList.filter(c => c.dueDate && new Date(c.dueDate) < now).length; // Atrasados são um subconjunto dos ativos.
    const onTimeCards = activeCardsList.length - overdueCards; // No prazo são os ativos que não estão atrasados.

    // O total de "ativos" para o resumo continua o mesmo.
    const totalActive = activeCardsList.length;

    const tasksByMember = {};
    group.memberIds.forEach(id => {
        tasksByMember[id] = { created: 0, assigned: 0, completed: 0 };
    });

    // Lógica de contagem de performance (agora idêntica à dos relatórios)
    allCardsInGroup.forEach(card => {
        (card.activityLog || []).forEach(log => {
            if (timeFilter === 'all' || new Date(log.timestamp) >= startDate) {
                if (['created', 'created_from_copy', 'created_from_column_copy'].includes(log.action) && tasksByMember[log.userId]) {
                    tasksByMember[log.userId].created++;
                }
            }
        });
        if (cardsCreatedInPeriod.some(c => c.id === card.id) && card.assignedTo && tasksByMember[card.assignedTo]) {
            tasksByMember[card.assignedTo].assigned++;
        }
        if (cardsCompletedInPeriod.some(c => c.id === card.id)) {
            const logEntry = (card.activityLog || []).find(log => log.action === 'completed' && (timeFilter === 'all' || new Date(log.timestamp) >= startDate));
            if (logEntry && logEntry.userId && tasksByMember[logEntry.userId]) {
                tasksByMember[logEntry.userId].completed++;
             }
        }
    });

    renderSummary(totalCreated, totalCompleted, totalActive, overdueCards);
    renderParticipantsTable(tasksByMember, group.memberIds);

    // ** DISPATCHER DE GRÁFICOS **
    if (chartType === 'pie' || chartType === 'bar') {
        const chartData = { onTime: onTimeCards, overdue: overdueCards, completed: totalCompleted };
        if (chartType === 'pie') renderPieChart(chartData);
        else if (chartType === 'bar') renderBarChart(chartData);    
    } else if (chartType === 'line') {
        renderLineChart(cardsCreatedInPeriod, timeFilter, startDate, group);
    } else if (chartType === 'burndown') {
        await renderBurndownChart(cardsCreatedInPeriod, timeFilter, startDate, group);
    }
}

async function renderSummary(total, completed, active, overdue) { // overdue is a new parameter
    // Atualizar estatísticas resumidas
    // CORREÇÃO: Verifica se os elementos existem antes de tentar atualizá-los.
    const totalEl = document.getElementById('total-cards');
    const completedEl = document.getElementById('completed-cards');
    const activeEl = document.getElementById('active-cards');
    const overdueEl = document.getElementById('overdue-cards');
    if (totalEl) totalEl.textContent = total;
    if (completedEl) completedEl.textContent = completed;
    if (activeEl) activeEl.textContent = active;
    if (overdueEl) overdueEl.textContent = overdue;
}

async function renderParticipantsTable(tasksByMember, memberIds) {
    const tableBody = document.getElementById('participants-table-body');
    tableBody.innerHTML = '';
    
    memberIds.forEach(memberId => {
        const user = allUsers.find(u => u.id === memberId);
        if (!user) return;

        const stats = tasksByMember[memberId];
        const totalCompleted = Object.values(tasksByMember).reduce((sum, s) => sum + s.completed, 0);
        const productivity = totalCompleted > 0 ? Math.round((stats.completed / totalCompleted) * 100) : 0;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.name}</td>
            <td>${stats.created}</td>
            <td>${stats.assigned}</td>
            <td>${stats.completed}</td>
            <td>${productivity}%</td>
        `;
        tableBody.appendChild(row);
    });
}

async function renderPieChart(data) {
    const ctx = document.getElementById('status-chart')?.getContext('2d');
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    const hasData = data.onTime > 0 || data.overdue > 0 || data.completed > 0;
    const labels = JSON.parse(t('groups.stats.chartLabels')); // ["Ativos (no prazo)", "Atrasados", "Concluídos"]
    const colors = {
        onTime: 'rgba(243, 156, 18, 0.7)', // Laranja
        overdue: 'rgba(231, 76, 60, 0.7)', // Vermelho
        completed: 'rgba(46, 204, 113, 0.7)' // Verde
    };
    const placeholderColor = 'rgba(128, 128, 128, 0.2)';

    statusChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: hasData ? [data.onTime, data.overdue, data.completed] : [1, 1, 1],
                backgroundColor: hasData ? [colors.onTime, colors.overdue, colors.completed] : [placeholderColor, placeholderColor, placeholderColor],
                borderWidth: 0 // Remove a borda branca
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { // CORREÇÃO: Garante que a legenda apareça em ambos os gráficos
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: hasData ? t('groups.stats.chartTitle') : t('groups.stats.chartNoData')
                },
                tooltip: {
                    callbacks: {
                        label: hasData ? undefined : () => '' 
                    }
                }
            }
        }
    });
}

async function renderBarChart(data) {
    const ctx = document.getElementById('status-chart')?.getContext('2d');
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    const hasData = data.onTime > 0 || data.overdue > 0 || data.completed > 0;
    const labels = JSON.parse(t('groups.stats.chartLabels')); // ["Ativos (no prazo)", "Atrasados", "Concluídos"]
    const colors = {
        onTime: 'rgba(243, 156, 18, 0.7)', // Laranja
        overdue: 'rgba(231, 76, 60, 0.7)', // Vermelho
        completed: 'rgba(46, 204, 113, 0.7)', // Verde
    };
    const placeholderColor = 'rgba(128, 128, 128, 0.2)';

    statusChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [t('groups.stats.chartTitle')], // Um único label para o eixo X.
            datasets: hasData ? [
                { label: labels[0], data: [data.onTime], backgroundColor: colors.onTime },
                { label: labels[1], data: [data.overdue], backgroundColor: colors.overdue },
                { label: labels[2], data: [data.completed], backgroundColor: colors.completed }
            ] : [
                { label: labels[0], data: [0], backgroundColor: placeholderColor },
                { label: labels[1], data: [0], backgroundColor: placeholderColor },
                { label: labels[2], data: [0], backgroundColor: placeholderColor }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                title: {
                    display: true,
                    text: hasData ? t('groups.stats.chartTitle') : t('groups.stats.chartNoData')
                },
                tooltip: {
                    enabled: hasData
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1 // Ensures y-axis shows whole numbers
                    }
                }
            }
        }
    });
}

async function renderLineChart(cardsCreatedInPeriod, timeFilter, startDate, group) {
    const ctx = document.getElementById('status-chart')?.getContext('2d');
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    const hasData = cardsCreatedInPeriod.length > 0;

    // CORREÇÃO: Permite que o gráfico de linha funcione para "Todo o Período"
    if (timeFilter === 'all') {
        if (group && group.createdAt) {
            startDate = new Date(group.createdAt);
            startDate.setHours(0, 0, 0, 0);
        }
    }

    const labels = [];
    const activeData = [];
    const completedData = [];
    const overdueData = [];
    const now = new Date();
    let periodInDays = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));

    if (periodInDays <= 1) {
        periodInDays = 2;
        startDate.setDate(startDate.getDate() - 1);
    }

    for (let i = 0; i < periodInDays; i++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);
        labels.push(day.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }));

        if (hasData) {
            const endOfDay = new Date(day);
            endOfDay.setHours(23, 59, 59, 999);

            const createdUpToDay = cardsCreatedInPeriod.filter(c =>
                (c.activityLog || []).some(log => 
                    ['created', 'created_from_copy', 'created_from_column_copy'].includes(log.action) &&
                    new Date(log.timestamp) <= endOfDay)
            );

            const burnedUpToDay = createdUpToDay.filter(c =>
                (c.activityLog || []).some(log => (log.action === 'completed' || log.action === 'archived' || log.action === 'trashed') && new Date(log.timestamp) <= endOfDay)
            );
            const activeOnDay = createdUpToDay.filter(c => !burnedUpToDay.some(b => b.id === c.id));
            const overdueOnDay = activeOnDay.filter(c => c.dueDate && new Date(c.dueDate) < endOfDay);

            activeData.push(activeOnDay.length);
            completedData.push(burnedUpToDay.length);
            overdueData.push(overdueOnDay.length);
        } else {
            activeData.push(0);
            completedData.push(0);
            overdueData.push(0);
        }
    }
    
    const placeholderColor = 'rgba(128, 128, 128, 0.2)';
    const placeholderBorderColor = 'rgba(128, 128, 128, 0.5)';

    statusChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: t('groups.reports.tasksCompleted'),
                    data: completedData,
                    borderColor: hasData ? 'rgba(46, 204, 113, 1)' : placeholderBorderColor,
                    backgroundColor: hasData ? 'rgba(46, 204, 113, 0.2)' : placeholderColor,
                    fill: hasData ? 'start' : true, // Garante o preenchimento no placeholder
                    tension: 0.2
                },
                {
                    label: t('kanban.dialog.details.statusActive'),
                    data: activeData,
                    borderColor: hasData ? 'rgba(243, 156, 18, 1)' : placeholderBorderColor,
                    backgroundColor: hasData ? 'rgba(243, 156, 18, 0.2)' : placeholderColor,
                    fill: hasData ? 'start' : true,
                    tension: 0.2
                },
                {
                    label: t('groups.reports.overdueTasks'),
                    data: overdueData,
                    borderColor: hasData ? 'rgba(231, 76, 60, 1)' : placeholderBorderColor,
                    backgroundColor: hasData ? 'rgba(231, 76, 60, 0.2)' : placeholderColor,
                    fill: hasData ? 'start' : true,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                title: { display: true, text: hasData ? t('groups.stats.chartTitle') : t('groups.stats.chartNoData') },
                tooltip: { enabled: hasData }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: t('groups.myGroups.card.tasks') } } }
        }
    });
}

async function renderBurndownChart(createdCards, timeFilter, startDate, group) {
    const ctx = document.getElementById('status-chart')?.getContext('2d');
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    const hasData = createdCards.length > 0;

    // CORREÇÃO: Ajusta a data de início para a criação do grupo se o período for "all"
    if (timeFilter === 'all') {
        if (group && group.createdAt) {
            startDate = new Date(group.createdAt);
            startDate.setHours(0, 0, 0, 0);
        }
    }

    let periodInDays = Math.max(1, Math.ceil((new Date() - startDate) / (1000 * 60 * 60 * 24)));
    if (periodInDays <= 1) {
        periodInDays = 2;
        startDate.setDate(startDate.getDate() - 1);
    }

    const totalTasks = createdCards.length;
    const labels = [];
    const idealData = [];
    const actualData = [];

    for (let i = 0; i < periodInDays; i++) {
        const day = new Date(startDate);
        day.setDate(startDate.getDate() + i);
        labels.push(day.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }));

        if (hasData) {
            const idealValue = totalTasks - (totalTasks / Math.max(1, periodInDays - 1)) * i;
            idealData.push(Math.max(0, idealValue.toFixed(2)));

            const endOfDay = new Date(day);
            endOfDay.setHours(23, 59, 59, 999);

            const burnedUpToDay = createdCards.filter(card => 
                (card.activityLog || []).some(log => 
                    (log.action === 'completed' || log.action === 'archived' || log.action === 'trashed') && 
                    new Date(log.timestamp) <= endOfDay
                )
            ).length;
            actualData.push(totalTasks - burnedUpToDay);
        } else {
            idealData.push(0);
            actualData.push(0);
        }
    }
    
    const placeholderColor = 'rgba(128, 128, 128, 0.2)';
    const placeholderBorderColor = 'rgba(128, 128, 128, 0.5)';

    statusChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: t('groups.stats.burndownIdeal'),
                data: idealData,
                borderColor: hasData ? 'rgba(255, 99, 132, 0.5)' : placeholderBorderColor,
                borderDash: [5, 5],
                fill: false,
                tension: 0.2
            }, {
                label: t('groups.stats.burndownActual'),
                data: actualData,
                borderColor: hasData ? 'rgba(54, 162, 235, 1)' : placeholderBorderColor,
                backgroundColor: hasData ? 'rgba(54, 162, 235, 0.2)' : placeholderColor,
                fill: 'start',
                tension: 0.2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                title: { display: true, text: hasData ? t('groups.stats.burndownTitle') : t('groups.stats.chartNoData') },
                tooltip: { enabled: hasData }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: t('groups.stats.remainingTasks') } } },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

async function populateGroupSelectorForReports() {
    const selectElement = document.getElementById('report-group-select');
    if (!selectElement) return;
    selectElement.innerHTML = '';

    const memberGroups = groups;
    if (memberGroups.length === 0) {
        selectElement.innerHTML = `<option value="">${t('groups.reports.noGroups')}</option>`;
        selectElement.disabled = true;
        return;
    }

    selectElement.disabled = false;
    memberGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        selectElement.appendChild(option);
    });
}

async function generateAndRenderReport() {
    const groupId = document.getElementById('report-group-select').value;
    const period = document.getElementById('report-period-select').value;
    const container = document.getElementById('report-container');
    const exportBtn = document.getElementById('export-report-csv-btn');

    if (!groupId) {
        container.innerHTML = `<p class="no-templates">${t('groups.reports.selectGroup')}</p>`;
        exportBtn.classList.add('hidden');
        return;
    }

    const group = await getGroup(groupId);
    if (!group) {
        container.innerHTML = `<p class="no-templates">${t('groups.feedback.groupNotFound')}</p>`;
        exportBtn.classList.add('hidden');
        return;
    }

    
    const now = new Date();
    let startDate = new Date();
    // CORREÇÃO: A data de início do período deve ser normalizada para o começo do dia (00:00:00)
    // para garantir que o filtro '>= startDate' funcione como esperado para "hoje", "últimos 7 dias", etc.
    switch (period) {
        case 'daily': 
            startDate.setHours(0, 0, 0, 0); // Início do dia de hoje
            break;
        case 'weekly': 
            startDate.setDate(now.getDate() - 6); // Inclui hoje + 6 dias anteriores
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'monthly': 
            startDate.setMonth(now.getMonth() - 1); // Mês anterior
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'all': 
            startDate = new Date(0); // Início da época Unix para pegar tudo
            break;
    }

    // A lógica de busca de cartões já inclui os arquivados (getFullBoardData(..., true))
    const allCardsInGroup = (await Promise.all((group.boardIds || []).map(async (boardId) => {
        const board = await getFullBoardData(boardId, true); // Inclui cartões arquivados para o relatório
        if (!board) return [];

        // PRIVACY CHECK: Apenas quadros com visibilidade 'group' devem contar para os relatórios do grupo.
        const isVisibleToGroup = board.visibility === 'group';
        if (isVisibleToGroup) {
            return board.columns.flatMap(col => col.cards);
        }
        return []; // Não inclui cartões de quadros privados de outros membros.
    }))).flat();

    // Se não houver nenhum cartão no grupo, exibe a mensagem e para.
    if (allCardsInGroup.length === 0) {
        container.innerHTML = `<div class="report-section"><p class="no-templates">${t('groups.reports.noActivity')}</p></div>`;
        exportBtn.classList.add('hidden');
        return;
    }

    // FASE 3: Lógica de relatório baseada no ActivityLog
    const cardsCreatedInPeriod = allCardsInGroup.filter(card => 
        (card.activityLog || []).some(log => ['created', 'created_from_copy', 'created_from_column_copy'].includes(log.action) && 
        (period === 'all' || new Date(log.timestamp) >= startDate))
    );
    // MÉTRICA DE CONCLUÍDOS: Apenas cartões com log 'completed' no período.
    const cardsCompletedInPeriod = allCardsInGroup.filter(card =>
        (card.activityLog || []).some(log => log.action === 'completed' && (period === 'all' || new Date(log.timestamp) >= startDate)));
    // NOVAS MÉTRICAS
    const cardsArchivedAsOpenInPeriod = allCardsInGroup.filter(card => {
        const archiveLog = (card.activityLog || []).find(log => log.action === 'archived' && (period === 'all' || new Date(log.timestamp) >= startDate));
        if (!archiveLog) return false;
        const wasCompletedBeforeArchive = (card.activityLog || []).some(log => log.action === 'completed' && new Date(log.timestamp) < new Date(archiveLog.timestamp));
        return !wasCompletedBeforeArchive;
    });
    const cardsTrashedInPeriod = allCardsInGroup.filter(card => 
        (card.activityLog || []).some(log => log.action === 'trashed' && (period === 'all' || new Date(log.timestamp) >= startDate))
    );

    const totalCreated = cardsCreatedInPeriod.length;
    const totalCompleted = cardsCompletedInPeriod.length;
    const completionRate = totalCreated > 0 ? ((totalCompleted / totalCreated) * 100).toFixed(1) : 0;

    const memberPerformance = group.memberIds.map(memberId => {
        const user = allUsers.find(u => u.id === memberId);
        if (!user) return null;
        
        // QUEM CRIOU: Conta os logs de criação feitos pelo usuário.
        const created = allCardsInGroup.filter(c => (c.activityLog || []).some(log => 
            ['created', 'created_from_copy', 'created_from_column_copy'].includes(log.action) && 
            log.userId === memberId && (period === 'all' || new Date(log.timestamp) >= startDate))).length;
        
        // QUEM COMPLETOU: Conta os logs de conclusão feitos pelo usuário.
        const completed = allCardsInGroup.filter(c => (c.activityLog || []).some(log =>
            log.action === 'completed' &&
            log.userId === memberId && (period === 'all' || new Date(log.timestamp) >= startDate))).length;

        // TAREFAS ATRIBUÍDAS (mantém a lógica original para essa métrica)
        const assigned = cardsCreatedInPeriod.filter(c => c.assignedTo === memberId).length;

        // CORREÇÃO: Produtividade como contribuição para o total concluído.
        const productivity = totalCompleted > 0 ? ((completed / totalCompleted) * 100).toFixed(1) : 0;
        return { name: user.name, created, assigned, completed, productivity };
    }).filter(Boolean);

    // CORREÇÃO: A métrica de cartões "Atrasados" deve respeitar o período do filtro.
    // A lógica anterior considerava todos os cartões do grupo, ignorando o filtro de data.
    const cardsBurnedInPeriod = allCardsInGroup.filter(card => 
        (card.activityLog || []).some(log => 
            (log.action === 'completed' || log.action === 'archived' || log.action === 'trashed') && 
            (period === 'all' || new Date(log.timestamp) >= startDate)
        )
    );
    const activeCardsInPeriod = cardsCreatedInPeriod.filter(c => !cardsBurnedInPeriod.some(burnedCard => burnedCard.id === c.id));
    const overdueCards = activeCardsInPeriod.filter(c => c.dueDate && new Date(c.dueDate) < now).length;

    
    container.innerHTML = `
        <div class="report-header">
            <h3>${t('groups.reports.title', { groupName: group.name })}</h3>
            <p><strong>${t('groups.reports.period')}</strong> ${period.charAt(0).toUpperCase() + period.slice(1)} | <strong>${t('groups.reports.generatedAt')}</strong> ${now.toLocaleString()}</p>
        </div>

        <div class="report-section">
            <h4>${t('groups.reports.summaryTitle')}</h4>
            <div class="stats-summary">
                <div class="stat-item">
                    <span class="stat-number">${totalCreated}</span>
                    <span class="stat-label">${t('groups.reports.tasksCreated')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${totalCompleted}</span>
                    <span class="stat-label">${t('groups.reports.tasksCompleted')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${completionRate}%</span>
                    <span class="stat-label">${t('groups.reports.completionRate')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${overdueCards}</span>
                    <span class="stat-label">${t('groups.reports.overdueTasks')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${cardsArchivedAsOpenInPeriod.length}</span>
                    <span class="stat-label">${t('archive.tabs.archived')}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${cardsTrashedInPeriod.length}</span>
                    <span class="stat-label">${t('archive.tabs.trash')}</span>
                </div>
            </div>
        </div>

        <div class="report-section">
            <h4>${t('groups.reports.memberPerformanceTitle')}</h4>
            <table class="participants-table">
                <thead>
                    <tr>
                        <th>${t('groups.reports.tableHeaderMember')}</th>
                        <th>${t('groups.reports.tasksCreated')}</th>
                        <th>${t('groups.reports.tableHeaderAssigned')}</th>
                        <th>${t('groups.reports.tableHeaderCompleted')}</th>
                        <th>${t('groups.reports.tableHeaderProductivity')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${memberPerformance.map(p => `
                        <tr>
                            <td>${p.name}</td>
                            <td>${p.created}</td>
                            <td>${p.assigned}</td>
                            <td>${p.completed}</td>
                            <td>${p.productivity}%</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Mostra o botão de exportar
    exportBtn.classList.remove('hidden');
}

async function exportReportToCSV() {
    const groupId = document.getElementById('report-group-select').value;
    const group = getGroup(groupId);
    if (!group) return;

    const table = document.querySelector('#report-container .participants-table');
    if (!table) return;

    let csvContent = "data:text/csv;charset=utf-8,";

    // Cabeçalho do CSV
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => `"${th.textContent}"`).join(',');
    csvContent += headers + '\r\n';

    // Linhas do CSV
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const rowData = Array.from(row.querySelectorAll('td')).map(td => {
            let data = td.textContent.replace(/"/g, '""'); // Escapa aspas duplas
            return `"${data}"`;
        }).join(',');
        csvContent += rowData + '\r\n';
    });

    // Cria e baixa o arquivo
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    
    const periodSelect = document.getElementById('report-period-select');
    const period = periodSelect.options[periodSelect.selectedIndex].text;
    const date = new Date().toISOString().split('T')[0];
    const filename = `relatorio_${group.name.replace(/ /g, '_')}_${period}_${date}.csv`;

    link.setAttribute("download", filename);
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);

    showFloatingMessage('Relatório exportado com sucesso!', 'success');
}

/**
 * Exporta o gráfico atualmente exibido na aba de estatísticas como uma imagem PNG.
 */
function exportChartAsImage() {
    if (!statusChartInstance) {
        showFloatingMessage(t('kanban.feedback.exportFail'), 'warning'); // Reutilizando chave, idealmente seria uma nova.
        return;
    }

    const canvas = document.getElementById('status-chart');
    if (!canvas) {
        showFloatingMessage(t('kanban.feedback.exportFail'), 'error');
        return;
    }

    showFloatingMessage(t('kanban.feedback.preparingExport'), 'info');

    // Timeout para garantir que animações do gráfico tenham terminado.
    setTimeout(() => {
        try {
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            
            const groupName = document.getElementById('stats-group-select').selectedOptions[0].text;
            const chartType = document.getElementById('chart-type').value;
            const date = new Date().toISOString().split('T')[0];

            link.download = `grafico_${groupName.replace(/ /g, '_')}_${chartType}_${date}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error("Erro ao exportar imagem do gráfico:", err);
            showFloatingMessage(t('kanban.feedback.exportFail'), 'error');
        }
    }, 500);
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

async function removeMemberFromGroup(group, memberId) {
    const users = await getAllUsers(); // A variável allUsers já está disponível globalmente
    const member = users.find(u => u.id === memberId);
    if (!member) return;
    
    showConfirmationDialog(
        t('groups.edit.confirmRemoveMember', { name: member.name }),
        async (dialog) => {
            // Remover o membro do grupo (em memória)
            currentGroup.memberIds = currentGroup.memberIds.filter(id => id !== memberId);
            
            // Atualizar a lista de membros
            loadGroupMembers(currentGroup);

            // Enviar notificação de remoção
            notifyGroupRemoval(currentGroup.name, memberId);
            
            // PASSO 2: Adiciona o log de remoção
            addLogToGroup(currentGroup, {
                action: 'member_removed',
                userId: currentUser.id,
                memberName: member.name
            });
            
            showDialogMessage(dialog, t('groups.edit.memberWillBeRemoved', { name: member.name }), 'info');
            
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
 * 
 */
export async function checkAndSendReports() {
    const allGroups = await getAllGroups();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normaliza para o início do dia

    allGroups.forEach(async group => {
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
            await saveGroup(group);
        }
    });
}

async function sendMessageToMember(memberId) {
    const member = allUsers.find(u => u.id === memberId);
    if (!member) {
        showFloatingMessage(t('groups.message.memberNotFound'), 'error');
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('groups.message.privateTitle', { name: member.name })}</h3>
        <div class="form-group">
            <textarea id="group-private-message-textarea" placeholder="${t('groups.message.privatePlaceholder')}" rows="5"></textarea>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn cancel" data-i18n="ui.cancel"></button>
            <button class="btn confirm" data-i18n="ui.send"></button>
        </div>
    `;

    document.body.appendChild(dialog);
    initDraggableElements(); // Torna o diálogo arrastável
    dialog.showModal();

    const textarea = dialog.querySelector('#group-private-message-textarea');
    const sendBtn = dialog.querySelector('.btn.confirm');
    const cancelBtn = dialog.querySelector('.btn.cancel');

    const closeDialog = () => { dialog.close(); dialog.remove(); };
    cancelBtn.addEventListener('click', closeDialog);

    sendBtn.addEventListener('click', () => {
        const message = textarea.value.trim();
        if (!message) { showDialogMessage(dialog, t('groups.message.emptyError'), 'error'); return; }
        addMessageNotification(currentUser.name, currentUser.id, member.id, message.length > 50 ? message.substring(0, 50) + '...' : message);
        showDialogMessage(dialog, t('groups.message.privateSuccess'), 'success');
        sendBtn.disabled = true; cancelBtn.disabled = true;
        setTimeout(closeDialog, 1500);
    });
}


async function sendGroupInvitation(groupId, userId, inviter) {
    const group = await getGroup(groupId);
    if (!group) return;
    
    
    addGroupInvitationNotification(
        group.name, 
        groupId, 
        inviter.name, 
        inviter.id, 
        userId
    );
}

async function notifyGroupRemoval(groupName, userId) {
    const currentUser = await getCurrentUser();
    addGroupRemovalNotification(groupName, currentUser.name, userId);
}

async function loadGroupMembers(group) {
    const membersList = document.getElementById('group-members-list');
    membersList.innerHTML = '';
    
    
    const users = await getAllUsers();
    
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
                    `<span class="admin-badge">${t('profile.groups.roleAdmin')}</span>` :
                    `<button type="button" class="btn btn-sm edit perms-member-btn" data-member-id="${memberId}" title="${t('groups.permissions.title')}">⚙️</button>
                     <button type="button" class="btn btn-sm alternative1 message-member-btn" data-member-id="${memberId}" title="${t('publicProfile.actions.message')}">✉️</button>
                     <button type="button" class="btn btn-sm danger remove-member-btn" data-member-id="${memberId}" title="${t('ui.remove')}">🗑️</button>`
                }
            </div>
        `;
        
        membersList.appendChild(memberItem);
    });
    
    
    membersList.querySelectorAll('.remove-member-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const memberId = e.target.dataset.memberId;
            isGroupSaved = false; // Marcar como não salvo ao remover um membro
            removeMemberFromGroup(group, memberId);
        });
    });

    
    membersList.querySelectorAll('.message-member-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const memberId = e.target.closest('button').dataset.memberId;
            showPrivateMessageDialog(memberId); // <-- USA A NOVA FUNÇÃO UNIVERSAL
        });
    });

    membersList.querySelectorAll('.perms-member-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const memberId = e.target.closest('button').dataset.memberId;
            showMemberPermissionsDialog(group, memberId);
        });
    });
}

/**
 * Exibe o diálogo para adicionar um novo participante ao grupo atual.
 * 
 */
async function showAddParticipantDialog() {
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
    
    select.innerHTML = ''; // Limpa seleção anterior
    
    const availableUsers = allUsers.filter(user => 
        user.id !== currentUser.id && 
        !currentGroup.memberIds.includes(user.id)
    );
    
    if (availableUsers.length === 0) {
        select.innerHTML = `<option value="">${t('groups.edit.noUsersAvailable')}</option>`;
        select.disabled = true;
    } else {
        select.disabled = false;
        select.innerHTML = `<option value="">${t('groups.edit.selectUser')}</option>`;
        availableUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            select.appendChild(option);
        });
    }
    
    initCustomSelects(); // Garante que o seletor seja estilizado
    dialog.showModal();
}

/**
 * Calcula o número de tarefas atrasadas em todos os quadros de um grupo.
 * 
 * @returns {number} O número de tarefas atrasadas.
 */
async function getOverdueTaskCount(groupId) {
    const group = await getGroup(groupId);
    if (!group || !group.boardIds) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normaliza para o início do dia

    return (await Promise.all(group.boardIds.map(async (boardId) => {
        const board = await getFullBoardData(boardId);
        if (!board) return total;
        return total + board.columns.reduce((boardTotal, column) => 
            boardTotal + column.cards.filter(card => !card.isComplete && card.dueDate && new Date(card.dueDate) < today).length, 0);
    }))).reduce((a, b) => a + b, 0);
}

/**
 * Abre o diálogo para configurar as permissões individuais de um membro.
 * @param {object} group - O objeto do grupo.
 * @param {string} memberId - O ID do membro.
 */
async function showMemberPermissionsDialog(group, memberId) {
    const member = allUsers.find(u => u.id === memberId);
    if (!member) return;

    const dialog = document.getElementById('member-permissions-dialog');
    dialog.querySelector('#member-permissions-title').textContent = `${t('groups.permissions.titleFor')} ${member.name}`;

    const useDefaultCheckbox = dialog.querySelector('#perm-use-default');
    const individualPermsContainer = dialog.querySelector('#individual-permissions-container');
    const individualCheckboxes = individualPermsContainer.querySelectorAll('input[type="checkbox"]');

    // Verifica se há permissões individuais para este membro
    const memberPerms = group.memberPermissions?.[memberId];
    const useDefault = !memberPerms;

    useDefaultCheckbox.checked = useDefault;
    individualPermsContainer.classList.toggle('hidden', useDefault);

    // Preenche as checkboxes individuais com base nas permissões salvas ou nas padrão do grupo
    const permsToDisplay = memberPerms || group.defaultPermissions || {};
    dialog.querySelector('#member-perm-create-boards').checked = permsToDisplay.createBoards || false;
    dialog.querySelector('#member-perm-edit-boards').checked = permsToDisplay.editBoards || false;
    dialog.querySelector('#member-perm-create-columns').checked = permsToDisplay.createColumns || false;
    dialog.querySelector('#member-perm-edit-columns').checked = permsToDisplay.editColumns || false;
    dialog.querySelector('#member-perm-create-cards').checked = permsToDisplay.createCards || false;

    // Lógica para habilitar/desabilitar as permissões individuais
    useDefaultCheckbox.onchange = () => {
        individualPermsContainer.classList.toggle('hidden', useDefaultCheckbox.checked);
    };

    // Botão de cancelar
    dialog.querySelector('.btn.cancel').onclick = () => dialog.close();

    // Botão de salvar
    dialog.querySelector('.btn.confirm').onclick = () => {
        if (useDefaultCheckbox.checked) {
            // Se "Usar padrão" está marcado, remove as permissões individuais deste membro
            if (currentGroup.memberPermissions && currentGroup.memberPermissions[memberId]) {
                delete currentGroup.memberPermissions[memberId];
                // PASSO 2: Adiciona log de alteração de permissão individual
                addLogToGroup(currentGroup, {
                    action: 'member_permissions_changed',
                    userId: currentUser.id,
                    memberName: member.name,
                    details: 'reverted_to_default'
                });
            }
        } else {
            // Se não, salva as permissões individuais
            if (!currentGroup.memberPermissions) {
                currentGroup.memberPermissions = {};
            }
            currentGroup.memberPermissions[memberId] = {
                createBoards: dialog.querySelector('#member-perm-create-boards').checked,
                editBoards: dialog.querySelector('#member-perm-edit-boards').checked,
                createColumns: dialog.querySelector('#member-perm-create-columns').checked,
                editColumns: dialog.querySelector('#member-perm-edit-columns').checked,
                createCards: dialog.querySelector('#member-perm-create-cards').checked,
            };
            // PASSO 2: Adiciona log de alteração de permissão individual
            addLogToGroup(currentGroup, {
                action: 'member_permissions_changed',
                userId: currentUser.id,
                memberName: member.name,
                details: 'customized'
            });
        }

        // Marca o diálogo principal de edição como "não salvo" para que o admin precise salvar o grupo
        isGroupSaved = false;

        showDialogMessage(dialog, t('groups.permissions.saveSuccess'), 'success');
        setTimeout(() => dialog.close(), 1500);
    };

    dialog.showModal();
}

/**
 * Renderiza o log de atividades de um grupo em um container.
 * @param {object} group - O objeto do grupo.
 * @param {HTMLElement} container - O elemento onde o log será renderizado.
 */
async function renderGroupActivityLog(group, container) {
    const log = group.activityLog || [];
    if (log.length === 0) {
        container.innerHTML = `<p class="activity-log-empty">${t('activityLog.empty')}</p>`;
        return;
    }

    const sortedLog = log.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let logHtml = '<ul class="activity-log-list">';
    sortedLog.forEach(entry => {
        const user = allUsers.find(u => u.id === entry.userId)?.name || 'Sistema';
        const date = new Date(entry.timestamp).toLocaleString();
        
        const replacements = {
            user: `<strong>${user}</strong>`,
            groupName: `<strong>${entry.groupName || group.name}</strong>`,
            field: `<strong>${entry.field}</strong>`,
            from: `<em>${entry.from}</em>`,
            to: `<em>${entry.to}</em>`,
            permission: `<strong>${entry.permission}</strong>`,
            value: `<strong>${entry.value ? 'ativada' : 'desativada'}</strong>`,
            memberName: `<strong>${entry.memberName}</strong>`,
            frequency: `<strong>${entry.frequency}</strong>`
        };
        
        const message = t(`activityLog.action.group.${entry.action}`, replacements)
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        logHtml += `<li class="activity-log-item"><div class="log-message">${message}</div><div class="log-date">${date}</div></li>`;
    });
    logHtml += '</ul>';
    container.innerHTML = logHtml;
}