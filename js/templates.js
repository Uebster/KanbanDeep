// js/template.js (VERSÃO COMPLETA COM CORREÇÕES)
import { 
    getSystemBoardTemplates, 
    getUserBoardTemplates,
    saveUserBoardTemplates,
    getSystemTagTemplates,
    getUserTagTemplates,
    saveUserTagTemplates,
    saveBoard,
    saveColumn
} from './storage.js';
import { getCurrentUser, updateUser } from './auth.js';
import { showFloatingMessage, updateUserAvatar, showConfirmationDialog, showDialogMessage, showContextMenu, showTemplateEditorDialog } from './ui-controls.js';
import { t, initTranslations } from './translations.js';

let currentUser;
let untitledColumnCounter = 1;
let untitledTagCounter = 1;

export async function initTemplatesPage() {
    console.log("Iniciando página de templates...");
    currentUser = getCurrentUser();
    
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }

    await initTranslations();
    
    setupPage();
    setupTabs();
    setupActionButtons();
    loadAndRenderAllTemplates();

    // Listener para recarregar templates quando forem salvos pelo editor universal
    window.addEventListener('templatesUpdated', loadAndRenderAllTemplates);
}

function setupPage() {
    document.getElementById('page-title').textContent = t('templates.pageTitle');
    if (currentUser) {
        updateUserAvatar(currentUser);
    }
    document.getElementById('kanban-btn')?.addEventListener('click', () => window.location.href = 'kanban.html');
}

function renderBoardTemplates(templates, gridElement, isEditable) {
    if (!gridElement) return;
    gridElement.innerHTML = '';
    
    if (templates.length === 0 && isEditable) {
        gridElement.innerHTML = `<p class="loading-text">${t('templates.feedback.noUserBoard')}</p>`;
        return;
    }
    
    templates.forEach(template => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.dataset.id = template.id;
        
        const columns = template.columns || [];
        const colorsHtml = columns.map(col => 
            `<div class="color-box" style="background-color: ${col.color};"></div>`
        ).join('');

        const actionsHtml = isEditable ? `
            <button class="btn btn-sm btn-primary btn-use-template">${t('templates.button.use')}</button>
            <button class="btn btn-sm edit btn-edit-board">${t('templates.button.edit')}</button>
            <button class="btn btn-sm danger btn-delete-board">${t('templates.button.delete')}</button>
        ` : `<button class="btn btn-sm btn-primary btn-use-template">${t('templates.button.use')}</button>`;

        card.innerHTML = `
            <h4>${template.icon || '📋'} ${t(template.name)}</h4>
            <p>${t(template.description) || t('templates.feedback.noDescription')}</p>
            <div class="template-colors">${colorsHtml}</div>
            <div class="template-actions">${actionsHtml}</div>`;
        gridElement.appendChild(card);
        
        if (isEditable) {
            card.addEventListener('contextmenu', (e) => {
                showTemplateContextMenu(e, template, 'board');
            });
        }
    });
    
    gridElement.querySelectorAll('.btn-use-template').forEach(btn => btn.onclick = (e) => useBoardTemplate(e.target.closest('.template-card').dataset.id));
    if (isEditable) {
        gridElement.querySelectorAll('.btn-edit-board').forEach(btn => btn.onclick = (e) => {
            showTemplateEditorDialog('board', { ownerType: 'user' }, e.target.closest('.template-card').dataset.id);
        });
        gridElement.querySelectorAll('.btn-delete-board').forEach(btn => btn.onclick = (e) => deleteBoardTemplate(e.target.closest('.template-card').dataset.id));
    }
}

function useBoardTemplate(templateId) {
    const userTemplates = getUserBoardTemplates(currentUser.id);
    const allTemplates = [...getSystemBoardTemplates(), ...userTemplates];
    const template = allTemplates.find(t => t.id === templateId);

    if (!template) {
        showFloatingMessage(t('templates.feedback.templateNotFound'), 'error');
        return;
    }
    
    const newColumns = template.columns.map(colTemplate => {
        const newColumnData = {
            title: colTemplate.name,
            color: colTemplate.color,
            cardIds: []
        };
        return saveColumn(newColumnData);
    });

    const newBoardData = {
        title: `${template.name} ${t('kanban.board.copySuffix')}`,
        icon: template.icon || '📋',
        ownerId: currentUser.id,
        visibility: 'private',
        columnIds: newColumns.map(col => col.id)
    };

    const savedBoard = saveBoard(newBoardData);

    localStorage.setItem(`currentBoardId_${currentUser.id}`, savedBoard.id);
    showFloatingMessage(t('templates.feedback.boardUsed', { boardTitle: savedBoard.title }), 'success');
    setTimeout(() => {
        window.location.href = `kanban.html`;
    }, 1500);
}

function renderTagTemplates(templates, gridElement, isEditable) {
    if (!gridElement) return;
    gridElement.innerHTML = '';
    
    if (templates.length === 0 && isEditable) {
        gridElement.innerHTML = `<p class="loading-text">${t('templates.feedback.noUserTag')}</p>`;
        return;
    }

    templates.forEach(template => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.dataset.id = template.id;
        const tags = template.tags || [];
        const tagsHtml = tags.map(tag => 
            `<span class="tag-pill" style="background-color: ${tag.color};">${tag.name}</span>`
        ).join('');
        
        const actionsHtml = isEditable ? `
            <button class="btn btn-sm confirm btn-use-tag">${t('templates.button.use')}</button>
            <button class="btn btn-sm edit btn-edit-tag">${t('templates.button.edit')}</button>
            <button class="btn btn-sm danger btn-delete-tag">${t('templates.button.delete')}</button>
        ` : `<button class="btn btn-sm btn-primary btn-use-tag">${t('templates.button.use')}</button>`;

        card.innerHTML = `
            <h4>${template.icon || '🏷️'} ${t(template.name)}</h4>
            <p>${t(template.description) || t('templates.feedback.noDescription')}</p>
            <div class="tag-list">${tagsHtml}</div>
            <div class="template-actions">${actionsHtml}</div>`;
        gridElement.appendChild(card);
        
        if (isEditable) {
            card.addEventListener('contextmenu', (e) => {
                showTemplateContextMenu(e, template, 'tag');
            });
        }
    });

    gridElement.querySelectorAll('.btn-use-tag').forEach(btn => btn.onclick = (e) => useTagTemplate(e.target.closest('.template-card').dataset.id));
    if (isEditable) {
        gridElement.querySelectorAll('.btn-edit-tag').forEach(btn => btn.onclick = (e) => {
            showTemplateEditorDialog('tag', { ownerType: 'user' }, e.target.closest('.template-card').dataset.id);
        });
        gridElement.querySelectorAll('.btn-delete-tag').forEach(btn => btn.onclick = (e) => deleteTagTemplate(e.target.closest('.template-card').dataset.id));
    }
}

function useTagTemplate(templateId) {
    showConfirmationDialog(
        t('templates.confirm.setAsDefault'),
        (dialog) => {
            const userTemplates = getUserTagTemplates(currentUser.id);
            const allTemplates = [...getSystemTagTemplates(), ...userTemplates];
            const template = allTemplates.find(t => t.id === templateId);

            if (!template) {
                showDialogMessage(dialog, t('templates.feedback.tagNotFound'), 'error');
                return false;
            }

            // Atualiza a preferência do usuário
            const userData = getCurrentUser();
            if (userData) {
                userData.preferences.defaultTagTemplateId = templateId;
                if (updateUser(userData.id, userData)) {
                    showDialogMessage(dialog, t('templates.feedback.tagUsed', { templateName: template.name }), 'success');
                    return true;
                }
            }
            showDialogMessage(dialog, t('templates.feedback.tagUseError'), 'error');
            return false;
        }
    );
}

function deleteBoardTemplate(templateId) {
    showConfirmationDialog(
        t('templates.confirm.deleteBoard'),
        async (dialog) => {
            let templates = getUserBoardTemplates(currentUser.id);
            templates = templates.filter(t => t.id !== templateId);
            saveUserBoardTemplates(currentUser.id, templates);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, t('templates.feedback.boardDeleted'), 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function deleteTagTemplate(templateId) {
    showConfirmationDialog(
        t('templates.confirm.deleteTag'),
        async (dialog) => {
            let templates = getUserTagTemplates(currentUser.id);
            templates = templates.filter(t => t.id !== templateId);
            saveUserTagTemplates(currentUser.id, templates);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, t('templates.feedback.tagDeleted'), 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function setupTabs() {
    const tabs = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const actionsMenu = document.getElementById('actions-dropdown');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'board-templates') {
                actionsMenu.innerHTML = `<button id="delete-all-board-templates" data-i18n="templates.button.deleteAllBoard"></button>`;
                document.getElementById('delete-all-board-templates').onclick = deleteAllBoardTemplates;
            } else {
                actionsMenu.innerHTML = `<button id="delete-all-tag-templates" data-i18n="templates.button.deleteAllTag"></button>`;
                document.getElementById('delete-all-tag-templates').onclick = deleteAllTagTemplates;
            }
        });
    });
    document.querySelector('.tab')?.click();
}

function setupActionButtons() {
    document.getElementById('create-user-board-template').onclick = () => {
        showTemplateEditorDialog('board', { ownerType: 'user' });
    };
    document.getElementById('create-user-tag-template').onclick = () => {
        showTemplateEditorDialog('tag', { ownerType: 'user' });
    };
}

function deleteAllBoardTemplates() {
    const userTemplates = getUserBoardTemplates(currentUser.id);
    if (userTemplates.length === 0) {
        showFloatingMessage(t('templates.feedback.noBoardToDelete'), 'warning');
        return;
    }

    showConfirmationDialog(
        t('templates.confirm.deleteAllBoard'),
        async (dialog) => {
            saveUserBoardTemplates(currentUser.id, []);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, t('templates.feedback.allBoardDeleted'), 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function deleteAllTagTemplates() {
    const userTemplates = getUserTagTemplates(currentUser.id);
    if (userTemplates.length === 0) {
        showFloatingMessage(t('templates.feedback.noTagToDelete'), 'warning');
        return;
    }

    showConfirmationDialog(
        t('templates.confirm.deleteAllTag'),
        async (dialog) => {
            saveUserTagTemplates(currentUser.id, []);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, t('templates.feedback.allTagDeleted'), 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function showAlertDialog(message) {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Aviso</h3>
        <p>${message}</p>
        <div class="modal-actions">
            <button class="btn btn-primary" id="alert-ok-btn">OK</button>
        </div>
    `;
    document.body.appendChild(dialog);
    
    setTimeout(() => {
        dialog.showModal();
        
        const okBtn = dialog.getElementById('alert-ok-btn');
        okBtn.addEventListener('click', () => {
            dialog.close();
            setTimeout(() => dialog.remove(), 300);
        });
    }, 10);
}

function showTemplateContextMenu(event, template, type) {    
    const menuItems = [
        { 
            label: t('ui.edit'), 
            icon: '✏️', 
            action: () => showTemplateEditorDialog(type, { ownerType: 'user' }, template.id) 
        },
        { 
            label: t('ui.delete'), 
            icon: '🗑️', 
            action: () => type === 'board' ? deleteBoardTemplate(template.id) : deleteTagTemplate(template.id),
            isDestructive: true
        },
        { isSeparator: true },
        { label: t('kanban.contextMenu.card.details'), icon: 'ℹ️', action: () => showTemplateDetails(template, type) }
    ];

    showContextMenu(event, menuItems);
}

function showTemplateDetails(template, type) {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${type === 'board' ? t('templates.details.titleBoard') : t('templates.details.titleTag')}</h3>
        <div class="form-group">
            <label>${t('templates.details.name')}</label>
            <p>${template.name}</p>
        </div>
        <div class="form-group">
            <label>${t('templates.details.description')}</label>
            <p>${template.description || t('templates.feedback.noDescription')}</p>
        </div>
        <div class="form-group">
            <label>${type === 'board' ? t('templates.details.columns') : t('templates.details.tags')}:</label>
            <ul>
                    ${type === 'board'
                        ? template.columns.map(col => `<li style="color: ${col.color}">${t(col.name)} (${col.color})</li>`).join('')
                        : template.tags.map(tag => `<li style="color: ${tag.color}">${t(tag.name)} (${tag.color})</li>`).join('')
                    }
            </ul>
        </div>
        <div class="modal-actions">
            <button class="btn btn-primary" id="close-details-btn" data-i18n="ui.close"></button>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.querySelector('#close-details-btn').onclick = () => {
        dialog.close();
        setTimeout(() => dialog.remove(), 300);
    };
}

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
    applyUserFont();
}

function applyUserFont() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.preferences) return;
    
    applyFontFamily(currentUser.preferences.fontFamily || 'Segoe UI');
    const sizeMap = { small: '12px', medium: '14px', large: '16px', 'x-large': '18px' };
    document.documentElement.style.fontSize = sizeMap[currentUser.preferences.fontSize] || '14px';
}

function applyFontFamily(fontFamily) {
    const allElements = document.querySelectorAll('*');
    for (let i = 0; i < allElements.length; i++) {
        allElements[i].style.fontFamily = fontFamily;
    }
    const existingStyle = document.getElementById('universal-font-style');
    if (existingStyle) existingStyle.remove();
    const style = document.createElement('style');
    style.id = 'universal-font-style';
    style.textContent = `
        ::placeholder { font-family: ${fontFamily} !important; }
        :-ms-input-placeholder { font-family: ${fontFamily} !important; }
        ::-ms-input-placeholder { font-family: ${fontFamily} !important; }
        input, textarea, select, button { font-family: ${fontFamily} !important; }
    `;
    document.head.appendChild(style);
}

function loadAndRenderAllTemplates() {
    const boardTemplates = getUserBoardTemplates(currentUser.id);
    const tagTemplates = getUserTagTemplates(currentUser.id);
    // Renderiza os templates do usuário
    renderBoardTemplates(boardTemplates, document.getElementById('user-board-templates-grid'), true);
    renderTagTemplates(tagTemplates, document.getElementById('user-tag-templates-grid'), true);
    // Renderiza os templates do sistema
    renderBoardTemplates(getSystemBoardTemplates(), document.getElementById('system-board-templates-grid'), false);
    renderTagTemplates(getSystemTagTemplates(), document.getElementById('system-tag-templates-grid'), false);
}