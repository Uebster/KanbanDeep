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
import { showFloatingMessage, updateUserAvatar, showConfirmationDialog, showDialogMessage, showIconPickerDialog, ICON_LIBRARY } from './ui-controls.js';

let currentUser;
let untitledColumnCounter = 1;
let untitledTagCounter = 1;

export function initTemplatesPage() {
    console.log("Iniciando página de templates...");
    currentUser = getCurrentUser();
    
    if (!currentUser) {
        window.location.href = 'list-users.html';
        return;
    }
    
    setupPage();
    setupTabs();
    setupActionButtons();
    loadAndRenderAllTemplates();
}

function setupPage() {
    document.getElementById('page-title').textContent = "Gerenciar Templates";
    if (currentUser) {
        updateUserAvatar(currentUser);
    }
    document.getElementById('kanban-btn')?.addEventListener('click', () => window.location.href = 'kanban.html');
}

function renderBoardTemplates(templates, gridElement, isEditable) {
    if (!gridElement) return;
    gridElement.innerHTML = '';
    
    if (templates.length === 0 && isEditable) {
        gridElement.innerHTML = '<p class="loading-text">Você ainda não criou nenhum template de quadro.</p>';
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
            <button class="btn btn-sm btn-primary btn-use-template">Usar</button>
            <button class="btn btn-sm btn-edit-board">Editar</button>
            <button class="btn btn-sm btn-danger btn-delete-board">Excluir</button>
        ` : `<button class="btn btn-sm btn-primary btn-use-template">Usar</button>`;

        card.innerHTML = `
            <h4>${template.icon || '📋'} ${template.name}</h4>
            <p>${template.description || 'Sem descrição.'}</p>
            <div class="template-colors">${colorsHtml}</div>
            <div class="template-actions">${actionsHtml}</div>`;
        gridElement.appendChild(card);
        
        if (isEditable) {
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showTemplateContextMenu(e, template, 'board');
            });
        }
    });
    
    gridElement.querySelectorAll('.btn-use-template').forEach(btn => btn.onclick = (e) => useBoardTemplate(e.target.closest('.template-card').dataset.id));
    if (isEditable) {
        gridElement.querySelectorAll('.btn-edit-board').forEach(btn => btn.onclick = (e) => showBoardTemplateDialog(e.target.closest('.template-card').dataset.id));
        gridElement.querySelectorAll('.btn-delete-board').forEach(btn => btn.onclick = (e) => deleteBoardTemplate(e.target.closest('.template-card').dataset.id));
    }
}

function useBoardTemplate(templateId) {
    const userTemplates = getUserBoardTemplates(currentUser.id);
    const allTemplates = [...getSystemBoardTemplates(), ...userTemplates];
    const template = allTemplates.find(t => t.id === templateId);

    if (!template) {
        showFloatingMessage('Template não encontrado.', 'error');
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
        title: `${template.name} (Cópia)`,
        icon: template.icon || '📋',
        ownerId: currentUser.id,
        visibility: 'private',
        columnIds: newColumns.map(col => col.id)
    };

    const savedBoard = saveBoard(newBoardData);

    localStorage.setItem(`currentBoardId_${currentUser.id}`, savedBoard.id);
    showFloatingMessage(`Quadro '${savedBoard.title}' criado com sucesso!`, 'success');
    setTimeout(() => {
        window.location.href = `kanban.html`;
    }, 1500);
}

function renderTagTemplates(templates, gridElement, isEditable) {
    if (!gridElement) return;
    gridElement.innerHTML = '';
    
    if (templates.length === 0 && isEditable) {
        gridElement.innerHTML = '<p class="loading-text">Você ainda não criou nenhum conjunto de etiquetas.</p>';
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
            <button class="btn btn-sm btn-primary btn-use-tag">Usar</button>
            <button class="btn btn-sm btn-edit-tag">Editar</button>
            <button class="btn btn-sm btn-danger btn-delete-tag">Excluir</button>
        ` : `<button class="btn btn-sm btn-primary btn-use-tag">Usar</button>`;

        card.innerHTML = `
            <h4>${template.icon || '🏷️'} ${template.name}</h4>
            <p>${template.description || 'Sem descrição.'}</p>
            <div class="tag-list">${tagsHtml}</div>
            <div class="template-actions">${actionsHtml}</div>`;
        gridElement.appendChild(card);
        
        if (isEditable) {
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showTemplateContextMenu(e, template, 'tag');
            });
        }
    });

    gridElement.querySelectorAll('.btn-use-tag').forEach(btn => btn.onclick = (e) => useTagTemplate(e.target.closest('.template-card').dataset.id));
    if (isEditable) {
        gridElement.querySelectorAll('.btn-edit-tag').forEach(btn => btn.onclick = (e) => showTagTemplateDialog(e.target.closest('.template-card').dataset.id));
        gridElement.querySelectorAll('.btn-delete-tag').forEach(btn => btn.onclick = (e) => deleteTagTemplate(e.target.closest('.template-card').dataset.id));
    }
}

function useTagTemplate(templateId) {
    showConfirmationDialog(
        'Deseja definir este conjunto como o seu padrão para novos cartões?',
        (dialog) => {
            const userTemplates = getUserTagTemplates(currentUser.id);
            const allTemplates = [...getSystemTagTemplates(), ...userTemplates];
            const template = allTemplates.find(t => t.id === templateId);

            if (!template) {
                showDialogMessage(dialog, 'Conjunto não encontrado.', 'error');
                return false;
            }

            // Atualiza a preferência do usuário
            const userData = getCurrentUser();
            if (userData) {
                userData.preferences.defaultTagTemplateId = templateId;
                if (updateUser(userData.id, userData)) {
                    showDialogMessage(dialog, `Conjunto '${template.name}' definido como padrão!`, 'success');
                    return true;
                }
            }
            showDialogMessage(dialog, 'Erro ao definir conjunto padrão.', 'error');
            return false;
        }
    );
}

function showBoardTemplateDialog(templateId = null) {
    const dialog = document.getElementById('board-template-dialog');
    const userTemplates = getUserBoardTemplates(currentUser.id);
    const template = templateId ? userTemplates.find(t => t.id === templateId) : null;
    
    dialog.dataset.editingId = templateId;
    document.getElementById('board-template-dialog-title').textContent = template ? 'Editar Template de Quadro' : 'Criar Novo Template de Quadro';
    
    // Lógica do Ícone
    const iconInput = document.getElementById('board-template-icon');
    iconInput.value = template ? template.icon || '📋' : '📋';
    document.getElementById('btn-choose-board-icon').onclick = () => {
        showIconPickerDialog((selectedIcon) => {
            iconInput.value = selectedIcon;
        });
    };

    document.getElementById('board-template-name').value = template ? template.name : '';
    document.getElementById('board-template-desc').value = template ? template.description : '';
    
    const editor = document.getElementById('board-columns-editor');
    editor.innerHTML = '';
    const initialColumns = template ? template.columns : [{ name: 'Coluna 1', color: '#e74c3c' }];
    initialColumns.forEach(col => addColumnToEditor(col.name, col.color));

    // Limpar mensagens de erro
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'error', 'success');

    updateColumnCount(editor); 
    dialog.showModal();
}

function addColumnToEditor(name = '', color = '#333333') {
    const editor = document.getElementById('board-columns-editor');
    editor.classList.remove('hidden'); // Mostra o editor ao adicionar o primeiro item

    if (editor.children.length >= 8) {
        showFloatingMessage('Limite de 8 colunas por quadro atingido.', 'warning');
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
        // Passa a referência do editor para a função de contagem
        updateColumnCount(editor); 
    };
    editor.appendChild(item);
    // Passa a referência do editor para a função de contagem
    updateColumnCount(editor); 
}

function updateColumnCount(editor) { // <-- Agora recebe 'editor' como parâmetro
    if (!editor) return; // Segurança
    
    const count = editor.children.length;
    // Precisamos encontrar os elementos de contagem a partir do diálogo pai
    const dialog = editor.closest('dialog');
    if (!dialog) return;

    dialog.querySelector('#board-column-count').textContent = count;
    dialog.querySelector('#add-board-column-btn').disabled = count >= 8;

    // A lógica principal: esconde ou mostra o editor
    editor.classList.toggle('hidden', count === 0);
}

function saveBoardTemplate() {
    const dialog = document.getElementById('board-template-dialog');
    const templateId = dialog.dataset.editingId;
    const icon = document.getElementById('board-template-icon').value;
    const name = document.getElementById('board-template-name').value.trim();
    const description = document.getElementById('board-template-desc').value;
    
    if (!name) {
        showDialogMessage(dialog, 'O nome do template é obrigatório.', 'error');
        return;
    }

    // Pega uma cópia nova dos templates para a validação
    const currentTemplates = getUserBoardTemplates(currentUser.id);
    const isNameUnique = !currentTemplates.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== templateId);

    if (!isNameUnique) {
        showDialogMessage(dialog, 'Já existe um template com este nome. Por favor, escolha outro nome.', 'error');
        return;
    }

    const columns = [];
    document.querySelectorAll('#board-columns-editor .editor-item').forEach(item => {
        let colName = item.querySelector('input[type="text"]').value.trim();
        const colColor = item.querySelector('input[type="color"]').value;
        
        if (!colName) {
            colName = `Nova Coluna (${untitledColumnCounter})`;
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
        (confirmationDialog) => {
            let templatesToSave = getUserBoardTemplates(currentUser.id);
            if (templateId && templateId !== 'null') {
                const index = templatesToSave.findIndex(t => t.id === templateId);
                if (index !== -1) {
                    templatesToSave[index] = { 
                        ...templatesToSave[index], 
                        icon, name, 
                        description: description, 
                        columns 
                    };
                }
            } else {
                const newTemplate = {
                    id: 'user-board-' + Date.now(),
                    name, icon,
                    description: description,
                    columns
                };
                templatesToSave.push(newTemplate);
            }

            const success = saveUserBoardTemplates(currentUser.id, templatesToSave);

            if (success) {
                loadAndRenderAllTemplates();
                showDialogMessage(confirmationDialog, 'Template salvo com sucesso!', 'success');
                setTimeout(() => {
                    dialog.close(); // Fecha o diálogo principal de edição
                }, 1500);
                return true; // Sinaliza para fechar o diálogo de confirmação
            } else {
                showDialogMessage(confirmationDialog, 'Erro ao salvar o template.', 'error');
                return false;
            }
        }
    );
}

function deleteBoardTemplate(templateId) {
    showConfirmationDialog(
        'Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.',
        async (dialog) => {
            let templates = getUserBoardTemplates(currentUser.id);
            templates = templates.filter(t => t.id !== templateId);
            saveUserBoardTemplates(currentUser.id, templates);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, 'Template excluído.', 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function showTagTemplateDialog(templateId = null) {
    const dialog = document.getElementById('tag-template-dialog');
    const userTemplates = getUserTagTemplates(currentUser.id);
    const template = templateId ? userTemplates.find(t => t.id === templateId) : null;

    dialog.dataset.editingId = templateId;
    document.getElementById('tag-template-dialog-title').textContent = template ? 'Editar Conjunto de Etiquetas' : 'Criar Novo Conjunto de Etiquetas';
    document.getElementById('tag-template-name').value = template ? template.name : '';
    document.getElementById('tag-template-desc').value = template ? template.description : '';

    // Lógica do Ícone
    const iconInput = document.getElementById('tag-template-icon');
    iconInput.value = template ? template.icon || '🏷️' : '🏷️';
    document.getElementById('btn-choose-tag-icon').onclick = () => {
        showIconPickerDialog((selectedIcon) => {
            iconInput.value = selectedIcon;
        });
    };

    const editor = document.getElementById('tags-editor');
    editor.innerHTML = '';
    const initialTags = template ? template.tags : [{ name: 'Nova Etiqueta', color: '#3498db' }];
    initialTags.forEach(tag => addTagToEditor(tag.name, tag.color));

    // Limpar mensagens de erro
    const feedbackEl = dialog.querySelector('.feedback');
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('show', 'error', 'success');

    updateTagCount(editor);
    dialog.showModal();
}

function addTagToEditor(name = '', color = '#3498db') {
    const editor = document.getElementById('tags-editor');
    editor.classList.remove('hidden');

    if (editor.children.length >= 8) {
        showFloatingMessage('Limite de 8 etiquetas por conjunto atingido.', 'warning');
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
        updateTagCount(editor); // Passa a referência
    };
    editor.appendChild(item);
    updateTagCount(editor); // Passa a referência
}

function updateTagCount(editor) { // <-- Agora recebe 'editor' como parâmetro
    if (!editor) return;

    const count = editor.children.length;
    const dialog = editor.closest('dialog');
    if (!dialog) return;
    
    dialog.querySelector('#tag-count').textContent = count;
    dialog.querySelector('#add-tag-btn').disabled = count >= 8;
    
    editor.classList.toggle('hidden', count === 0);
}

function saveTagTemplate() {
    const dialog = document.getElementById('tag-template-dialog');
    const templateId = dialog.dataset.editingId;
    const icon = document.getElementById('tag-template-icon').value;
    const name = document.getElementById('tag-template-name').value.trim();

    if (!name) {
        showDialogMessage(dialog, 'O nome do conjunto é obrigatório.', 'error');
        return;
    }

    const currentTemplates = getUserTagTemplates(currentUser.id);
    const isNameUnique = !currentTemplates.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== templateId);

    if (!isNameUnique) {
        showDialogMessage(dialog, 'Já existe um conjunto com este nome. Por favor, escolha outro nome.', 'error');
        return;
    }

    const tags = [];
    document.querySelectorAll('#tags-editor .editor-item').forEach(item => {
        let tagName = item.querySelector('input[type="text"]').value.trim();
        const tagColor = item.querySelector('input[type="color"]').value;
        
        if (!tagName) {
            tagName = `Nova Etiqueta (${untitledTagCounter})`;
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
        (confirmationDialog) => {
            let templatesToSave = getUserTagTemplates(currentUser.id);
            if (templateId && templateId !== 'null') {
                const index = templatesToSave.findIndex(t => t.id === templateId);
                if (index !== -1) {
                    templatesToSave[index] = { 
                        ...templatesToSave[index], 
                        icon, name, 
                        description: document.getElementById('tag-template-desc').value, 
                        tags 
                    };
                }
            } else {
                const newTemplate = {
                    id: 'user-tag-' + Date.now(),
                    name, icon,
                    description: document.getElementById('tag-template-desc').value,
                    tags
                };
                templatesToSave.push(newTemplate);
            }

            const success = saveUserTagTemplates(currentUser.id, templatesToSave);

            if (success) {
                loadAndRenderAllTemplates();
                showDialogMessage(confirmationDialog, 'Conjunto salvo com sucesso!', 'success');
                setTimeout(() => {
                    dialog.close(); // Fecha o diálogo principal de edição
                }, 1500);
                return true; // Sinaliza para fechar o diálogo de confirmação
            } else {
                showDialogMessage(confirmationDialog, 'Erro ao salvar o conjunto.', 'error');
                return false;
            }
        }
    );
}


function deleteTagTemplate(templateId) {
    showConfirmationDialog(
        'Tem certeza que deseja excluir este conjunto de etiquetas? Esta ação não pode ser desfeita.',
        async (dialog) => {
            let templates = getUserTagTemplates(currentUser.id);
            templates = templates.filter(t => t.id !== templateId);
            saveUserTagTemplates(currentUser.id, templates);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, 'Conjunto de etiquetas excluído.', 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
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
                actionsMenu.innerHTML = `<button id="delete-all-board-templates">Apagar Todos os Templates</button>`;
                document.getElementById('delete-all-board-templates').onclick = deleteAllBoardTemplates;
            } else {
                actionsMenu.innerHTML = `<button id="delete-all-tag-templates">Apagar Todos os Conjuntos</button>`;
                document.getElementById('delete-all-tag-templates').onclick = deleteAllTagTemplates;
            }
        });
    });
    document.querySelector('.tab')?.click();
}

function setupActionButtons() {
    document.getElementById('create-user-board-template').onclick = () => showBoardTemplateDialog();
    document.getElementById('create-user-tag-template').onclick = () => showTagTemplateDialog();
    
    document.getElementById('add-board-column-btn').onclick = () => addColumnToEditor();
    document.getElementById('save-board-template-btn').onclick = saveBoardTemplate;
    document.getElementById('add-tag-btn').onclick = () => addTagToEditor();
    document.getElementById('save-tag-template-btn').onclick = saveTagTemplate;
}

function deleteAllBoardTemplates() {
    const userTemplates = getUserBoardTemplates(currentUser.id);
    if (userTemplates.length === 0) {
        showAlertDialog('Não há templates de quadro para apagar.');
        return;
    }

    showConfirmationDialog(
        'Tem certeza que deseja apagar TODOS os seus templates de quadro? Esta ação não pode ser desfeita.',
        async (dialog) => {
            saveUserBoardTemplates(currentUser.id, []);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, 'Todos os templates de quadro foram apagados.', 'info');
            setTimeout(() => dialog.close(), 1500);
            return true;
        }
    );
}

function deleteAllTagTemplates() {
    const userTemplates = getUserTagTemplates(currentUser.id);
    if (userTemplates.length === 0) {
        showAlertDialog('Não há conjuntos de etiquetas para apagar.');
        return;
    }

    showConfirmationDialog(
        'Tem certeza que deseja apagar TODOS os seus conjuntos de etiquetas? Esta ação não pode ser desfeita.',
        async (dialog) => {
            saveUserTagTemplates(currentUser.id, []);
            loadAndRenderAllTemplates();
            showDialogMessage(dialog, 'Todos os conjuntos de etiquetas foram apagados.', 'info');
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
    const existingMenu = document.getElementById('template-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.id = 'template-context-menu';
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;

    menu.innerHTML = `
        <button data-action="edit">Editar</button>
        <button data-action="delete">Excluir</button>
        <hr>
        <button data-action="details">Detalhes</button>
    `;

    document.body.appendChild(menu);

    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
    };

    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 100);

    menu.querySelector('[data-action="edit"]').onclick = () => {
        closeMenu();
        if (type === 'board') {
            showBoardTemplateDialog(template.id);
        } else {
            showTagTemplateDialog(template.id);
        }
    };

    menu.querySelector('[data-action="delete"]').onclick = () => {
        closeMenu();
        if (type === 'board') {
            deleteBoardTemplate(template.id);
        } else {
            deleteTagTemplate(template.id);
        }
    };

    menu.querySelector('[data-action="details"]').onclick = () => {
        closeMenu();
        showTemplateDetails(template, type);
    };
}

function showTemplateDetails(template, type) {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Detalhes do ${type === 'board' ? 'Template' : 'Conjunto'}</h3>
        <div class="form-group">
            <label>Nome:</label>
            <p>${template.name}</p>
        </div>
        <div class="form-group">
            <label>Descrição:</label>
            <p>${template.description || 'Sem descrição'}</p>
        </div>
        <div class="form-group">
            <label>${type === 'board' ? 'Colunas' : 'Etiquetas'}:</label>
            <ul>
                ${type === 'board' 
                    ? template.columns.map(col => `<li style="color: ${col.color}">${col.name} (${col.color})</li>`).join('')
                    : template.tags.map(tag => `<li style="color: ${tag.color}">${tag.name} (${tag.color})</li>`).join('')
                }
            </ul>
        </div>
        <div class="modal-actions">
            <button class="btn btn-primary" id="close-details-btn">Fechar</button>
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