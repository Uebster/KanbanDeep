// js/profile.js - VERSÃO FINAL CORRIGIDA

import { getCurrentUser, updateUser, logout, validateMasterPassword } from './auth.js';
import { getUserProfile, deleteUserProfile, getUserTagTemplates, getSystemTagTemplates, getAllGroups, getGroup,
      getNotifications,   // <-- Adicione esta
  saveNotifications   // <-- Adicione esta
 } from './storage.js';
import { showFloatingMessage, initDraggableElements, updateUserAvatar, showConfirmationDialog, showDialogMessage } from './ui-controls.js';

// Variável para armazenar dados originais do usuário
let originalUserData = null;
let originalTheme = null;
let originalFont = null;
let originalFontSize = null;
let isSaved = true;

// Função de inicialização exportada
export function initProfilePage() {
    applyUserTheme();
    
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showFloatingMessage('Usuário não logado. Redirecionando...', 'error');
        setTimeout(() => { window.location.href = 'list-users.html'; }, 2000);
        return;
    }
   
        if (currentUser) {
        updateUserAvatar(currentUser);
    }

    setupEventListeners();
    loadUserData();
    setupPrivacyOptions();
    initDraggableElements();
}

// Aplica o tema do usuário
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

// Carrega dados do usuário para preenchimento automático
function loadUserData() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    try {
        const userData = getUserProfile(currentUser.id);
        if (!userData) {
            showFloatingMessage('Dados do usuário não encontrados', 'error');
            return;
        }
        
        // Salvar os dados originais para restauração
        originalUserData = {...userData};
        originalTheme = userData.theme || 'auto';
        originalFont = userData.preferences?.fontFamily || 'Segoe UI';
        originalFontSize = userData.preferences?.fontSize || 'medium';
            
        // Preencher dados na interface
        document.getElementById('name').value = userData.name || '';
        document.getElementById('username').value = userData.username || '';
        document.getElementById('bio').value = userData.bio || '';
        document.getElementById('birthdate').value = userData.birthdate || '';
        document.getElementById('gender').value = userData.gender || '';
        document.getElementById('location').value = userData.location || '';
        document.getElementById('email').value = userData.email || '';
        document.getElementById('whatsapp').value = userData.whatsapp || '';
        document.getElementById('linkedin').value = userData.linkedin || '';
        document.getElementById('language').value = userData.language || 'pt-BR';
        document.getElementById('theme').value = userData.theme || 'auto';

// --- Preenchimento do Select de Etiquetas (COM A NOVA LÓGICA) ---
const tagTemplateSelect = document.getElementById('default-tag-template');
const userTagTemplates = getUserTagTemplates(currentUser.id);
const systemTagTemplates = getSystemTagTemplates();

// Limpa as opções existentes
tagTemplateSelect.innerHTML = '';

// Adiciona a opção padrão (nenhum) no topo
const defaultOption = document.createElement('option');
defaultOption.value = '';
defaultOption.textContent = 'Nenhum (usar padrão do sistema)';
tagTemplateSelect.appendChild(defaultOption);

// Adiciona os templates do usuário primeiro, se existirem
if (userTagTemplates.length > 0) {
    const optgroupUser = document.createElement('optgroup');
    optgroupUser.label = 'Meus Conjuntos';
    userTagTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        optgroupUser.appendChild(option);
    });
    tagTemplateSelect.appendChild(optgroupUser);
}

// Adiciona os templates do sistema
if (systemTagTemplates.length > 0) {
    const optgroupSystem = document.createElement('optgroup');
    optgroupSystem.label = 'Sistema';
    systemTagTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        optgroupSystem.appendChild(option);
    });
    tagTemplateSelect.appendChild(optgroupSystem);
}

// --- LÓGICA DE SELEÇÃO PADRÃO ---
const prefs = userData.preferences || {};
// 1. Tenta usar a preferência salva do usuário.
// 2. Se não houver, seleciona a opção padrão (nenhum)
tagTemplateSelect.value = prefs.defaultTagTemplateId || '';
        
        // Configuração de privacidade
        const privacyValue = userData.privacy || 'private';
        document.querySelectorAll('.privacy-option').forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.value === privacyValue) {
                option.classList.add('selected');
            }
        });
        
        // Preferências de visualização
        if (userData.preferences) {
            document.getElementById('font-family').value = userData.preferences.fontFamily || 'Segoe UI';
            document.getElementById('font-size').value = userData.preferences.fontSize || 'medium'; // <-- CORREÇÃO: fontSizeValue -> fontSize
            document.getElementById('pref-show-tags').checked = userData.preferences.showTags !== false;
            document.getElementById('pref-show-date').checked = userData.preferences.showDate !== false;
            document.getElementById('pref-show-status').checked = userData.preferences.showStatus !== false;
            document.getElementById('pref-show-assignment').checked = userData.preferences.showAssignment !== false;
            document.getElementById('pref-show-icon').checked = userData.preferences.showBoardIcon !== false;
            document.getElementById('pref-show-title').checked = userData.preferences.showBoardTitle !== false;
            document.getElementById('pref-show-card-details').checked = userData.preferences.showCardDetails !== false;
        }
        
        // Avatar
        updateAvatarPreview(userData);
        
        
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        showFloatingMessage('Erro ao carregar dados do usuário', 'error');
    }
    loadUserGroups();
}


function updateAvatarPreview(userData) {
    const avatarImage = document.getElementById('avatar-image');
    const avatarText = document.getElementById('avatar-text');
    
    if (userData.avatar) {
        avatarImage.src = userData.avatar;
        avatarImage.style.display = 'block';
        avatarText.style.display = 'none';
    } else {
        avatarText.textContent = userData.name ? userData.name.charAt(0).toUpperCase() : '?';
        avatarImage.style.display = 'none';
        avatarText.style.display = 'flex';
    }
}

function setupEventListeners() {
    // Upload de avatar
    document.getElementById('btn-upload-avatar')?.addEventListener('click', () => {
        document.getElementById('avatar-upload')?.click();
    });
    document.getElementById('avatar-upload')?.addEventListener('change', handleAvatarUpload);
    
    document.getElementById('btn-save')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleSaveClick();
    });

    document.getElementById('btn-cancel')?.addEventListener('click', handleCancelClick);
    document.getElementById('change-password-account')?.addEventListener('click', changePassword);
    document.getElementById('btn-delete-account')?.addEventListener('click', confirmDeleteAccount);
    document.getElementById('btn-join-group')?.addEventListener('click', showGroupSearchDialog);
    
    // Opções de privacidade
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.privacy-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

    // --- INTERCEPTADOR DE NAVEGAÇÃO GLOBAL (PARA ESTA PÁGINA) ---
    // Este listener intercepta cliques em botões de navegação ANTES que outros scripts (como main.js) possam agir.
    document.body.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        // Mapeia os IDs dos botões de navegação para suas ações.
        const navActions = {
            'kanban-btn': { dest: 'kanban.html' },
            'my-groups-btn': { dest: 'groups.html' },
            'templates-btn': { dest: 'templates.html' },
            'manage-board-templates-btn': { dest: 'templates.html' },
            'notifications-btn': { dest: 'notifications.html' },
            'switch-user-btn': { dest: 'list-users.html' },
            'btn-create-group': { dest: 'groups.html', state: { openCreateGroup: 'true' } }
        };

        const action = navActions[button.id];
        const isStatsButton = button.classList.contains('view-group-stats');

        // Se o botão clicado não for um dos botões de navegação mapeados, nem o de estatísticas, não faz nada.
        if (!action && !isStatsButton) return;

        // Impede a execução de outros listeners (como os do main.js) e a navegação padrão.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // Essencial para parar os listeners do main.js

        if (isStatsButton) {
            handleNavigation('groups.html', {
                selectedGroupId: button.dataset.groupId,
                openStatistics: 'true'
            });
        } else if (action) {
            // Chama a nossa função de navegação segura.
            handleNavigation(action.dest, action.state);
        }
    }, true); // O 'true' no final ativa a fase de captura, que é crucial.
    
// Aplicação instantânea para pré-visualização
    document.getElementById('theme')?.addEventListener('change', (e) => { // <-- BUG CORRIGIDO AQUI
        applyThemeFromSelect(e.target.value);
        isSaved = false;
    });
    
    document.getElementById('font-family')?.addEventListener('change', (e) => {
        applyFontFamily(e.target.value, true);
        isSaved = false;
    });

    document.getElementById('font-size')?.addEventListener('change', (e) => {
        applyFontSize(e.target.value, true); // O 'true' indica que é uma pré-visualização
        isSaved = false;
    });

    // Marca o estado como "não salvo" quando qualquer campo do formulário muda
    const formFields = [
        'name', 'username', 'bio', 'birthdate', 'gender', 
        'location', 'email', 'whatsapp', 'linkedin', 'language',
        'theme', 'font-family', 'font-size',
        'pref-show-date', 'pref-show-status', 'default-tag-template'
    ];
    
    formFields.forEach(field => {
        const element = document.getElementById(field);
        if (element) {
            element.addEventListener('change', () => {
                isSaved = false;
            });
        }
    });

    // Para checkboxes
    const checkboxes = [
        'pref-show-tags', 'pref-show-date', 'pref-show-status', 'pref-show-assignment', 'pref-show-title', 'pref-show-icon', 'pref-show-card-details'
    ];
    
    checkboxes.forEach(checkbox => {
        const element = document.getElementById(checkbox);
        if (element) {
            element.addEventListener('change', () => {
                isSaved = false;
            });
        }
    });
    
    // Para opções de privacidade
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.addEventListener('click', () => {
            isSaved = false;
        });
    });
}

/**
 * Lida com a navegação para outras páginas, verificando se há alterações não salvas.
 * @param {string} destination - A URL de destino (ex: 'templates.html').
 * @param {Object} [state] - Um objeto com chaves e valores para salvar no localStorage antes de navegar.
 */
function handleNavigation(destination, state = {}) {
    if (isSaved) {
        // Salva o estado e navega diretamente
        Object.keys(state).forEach(key => localStorage.setItem(key, state[key]));
        window.location.href = destination;
    } else {
        // Mostra o diálogo de confirmação
        showConfirmationDialog(
            'Você tem alterações não salvas. Deseja sair mesmo assim?',
            () => { // onConfirm (Sim, sair)
                isSaved = true; // Libera a trava
                Object.keys(state).forEach(key => localStorage.setItem(key, state[key]));
                showFloatingMessage('Redirecionando...', 'info');
                window.location.href = destination;
            },
            (dialog) => { showDialogMessage(dialog, 'Continue editando.', 'info'); return true; }, // onCancel
            'Sim, Sair', 'Não'
        );
    }
}

function handleAvatarUpload(e) {
    if (this.files && this.files[0]) {
        isSaved = false; // <-- CORREÇÃO: Marca a página como não salva
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const avatarImage = document.getElementById('avatar-image');
            const avatarText = document.getElementById('avatar-text');
            
            avatarImage.src = e.target.result;
            avatarImage.style.display = 'block';
            avatarText.style.display = 'none';
        }
        
        reader.readAsDataURL(this.files[0]);
    }
}

function restoreOriginalSettings() {
    applyThemeFromSelect(originalTheme, true);
    applyFontFamily(originalFont, true);
    applyFontSize(originalFontSize, true); // <-- CORREÇÃO: Adicionado o 'true' para preview
}

function applyFontSize(size, isPreview = false) {
    let fontSizeValue;
    switch (size) {
        case 'small': fontSizeValue = '12px'; break;
        case 'medium': fontSizeValue = '14px'; break;
        case 'large': fontSizeValue = '16px'; break;
        case 'x-large': fontSizeValue = '18px'; break;
        default: fontSizeValue = '14px';
    }

    document.documentElement.style.fontSize = fontSizeValue; // <-- CORREÇÃO: Aplicar diretamente ao font-size
    
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
// Adicione esta função para aplicar as configurações de fonte do usuário
function applyUserFontAndSize() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.preferences) return;
    
    applyFontFamily(currentUser.preferences.fontFamily || 'Segoe UI');
    applyFontSize(currentUser.preferences.fontSize || 'medium');
}

function handleSaveClick() {
    
    showConfirmationDialog(
        'Deseja salvar as alterações feitas no seu perfil?',
        // onConfirm
        async (dialog) => {
            const result = await processProfileUpdate();
            
            if (result.success) {
                isSaved = true;
                showDialogMessage(dialog, 'Perfil salvo com sucesso!', 'success');
                // Atualiza os dados originais para refletir o que foi salvo
                originalUserData = {...result.userData};
                originalTheme = result.userData.theme || 'auto';
                originalFont = result.userData.preferences?.fontFamily || 'Segoe UI';
                originalFontSize = result.userData.preferences?.fontSize || 'medium';
                return true;
            } else {
                showDialogMessage(dialog, result.message, 'error');
                return false;
            }
        }
    );
}

function handleCancelClick() {
    showConfirmationDialog(
        'Tem certeza que deseja descartar todas as alterações?',
        // onConfirm (Sim, descartar)
        (dialog) => {
            // Restaurar os valores originais
            restoreOriginalSettings();
            restoreOriginalData();
            
            isSaved = true;
            showDialogMessage(dialog, 'Alterações descartadas.', 'info');
            return true;
        },
        // onCancel (Não, continuar editando)
        (dialog) => {
            showDialogMessage(dialog, 'Continue editando...', 'info');
            return true;
        }
    );
}

function restoreOriginalData() {
    if (!originalUserData) return;
    
    document.getElementById('name').value = originalUserData.name || '';
    document.getElementById('username').value = originalUserData.username || '';
    document.getElementById('bio').value = originalUserData.bio || '';
    document.getElementById('birthdate').value = originalUserData.birthdate || '';
    document.getElementById('gender').value = originalUserData.gender || '';
    document.getElementById('location').value = originalUserData.location || '';
    document.getElementById('email').value = originalUserData.email || '';
    document.getElementById('whatsapp').value = originalUserData.whatsapp || '';
    document.getElementById('linkedin').value = originalUserData.linkedin || '';
    document.getElementById('language').value = originalUserData.language || 'pt-BR';
    document.getElementById('theme').value = originalUserData.theme || 'auto';
    
    // Configuração de privacidade
    const privacyValue = originalUserData.privacy || 'private';
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.value === privacyValue) {
            option.classList.add('selected');
        }
    });
    
    // Preferências de visualização
    if (originalUserData.preferences) {
        document.getElementById('font-family').value = originalUserData.preferences.fontFamily || 'Segoe UI';
        document.getElementById('font-size').value = originalUserData.preferences.fontSize || 'medium';
        document.getElementById('pref-show-tags').checked = originalUserData.preferences.showTags !== false;
        document.getElementById('pref-show-date').checked = originalUserData.preferences.showDate !== false;
        document.getElementById('pref-show-status').checked = originalUserData.preferences.showStatus !== false;
        document.getElementById('pref-show-assignment').checked = originalUserData.preferences.showAssignment !== false;
        document.getElementById('pref-show-icon').checked = originalUserData.preferences.showBoardIcon !== false;
        document.getElementById('pref-show-title').checked = originalUserData.preferences.showBoardTitle !== false;
        document.getElementById('pref-show-card-details').checked = originalUserData.preferences.showCardDetails !== false;
        document.getElementById('default-tag-template').value = originalUserData.preferences.defaultTagTemplateId || '';
    }
    
    // Avatar
    updateAvatarPreview(originalUserData);
    
    // Restaura tema e fonte
    applyThemeFromSelect(originalUserData.theme || 'auto');
    applyFontFamily(originalUserData.preferences?.fontFamily || 'Segoe UI');
    applyFontSize(originalUserData.preferences.fontSize || 'medium'); // <-- CORREÇÃO: Usar dados originais
}

function setupPrivacyOptions() {
    const privacyOptions = document.querySelectorAll('.privacy-option');
    
    privacyOptions.forEach(option => {
        option.addEventListener('click', () => {
            privacyOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
    });
}

// Processa a atualização do perfil
async function processProfileUpdate() {
    const userData = getCurrentUser();
    if (!userData) {
        return { success: false, message: 'Erro ao carregar dados do usuário.' };
    }
    
    // Validar campos obrigatórios
    const name = document.getElementById('name').value.trim();
    if (!name) {
        return { success: false, message: 'O nome completo é obrigatório.' };
    }
    
    const username = document.getElementById('username').value.trim();
    if (!username) {
        return { success: false, message: 'O nome de usuário é obrigatório.' };
    }

    const privacyOption = document.querySelector('.privacy-option.selected');
    const privacy = privacyOption ? privacyOption.dataset.value : 'private';
    
    // Coletar todos os dados do formulário
    const updatedUser = {
        name: name,
        username: username,
        bio: document.getElementById('bio').value.trim(),
        birthdate: document.getElementById('birthdate').value,
        gender: document.getElementById('gender').value,
        location: document.getElementById('location').value.trim(),
        email: document.getElementById('email').value.trim(),
        whatsapp: document.getElementById('whatsapp').value.trim(),
        linkedin: document.getElementById('linkedin').value.trim(),
        privacy: privacy,
        language: document.getElementById('language').value,
        theme: document.getElementById('theme').value,
        preferences: {
            fontFamily: document.getElementById('font-family').value,
            fontSize: document.getElementById('font-size').value,
            showTags: document.getElementById('pref-show-tags').checked,
            showDate: document.getElementById('pref-show-date').checked,
            showStatus: document.getElementById('pref-show-status').checked,
            showAssignment: document.getElementById('pref-show-assignment').checked,
            showBoardIcon: document.getElementById('pref-show-icon').checked,
            showBoardTitle: document.getElementById('pref-show-title').checked,
            showCardDetails: document.getElementById('pref-show-card-details').checked,
            defaultTagTemplateId: document.getElementById('default-tag-template').value
        }
    };
    
    // Processar avatar se houver upload
    const avatarFile = document.getElementById('avatar-upload').files[0];
    if (avatarFile) {
        try {
            const toBase64 = file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });
            
            updatedUser.avatar = await toBase64(avatarFile);
        } catch (error) {
            return { success: false, message: 'Erro ao processar imagem.' };
        }
    }
    
    return completeProfileUpdate(updatedUser);
}

function completeProfileUpdate(updatedUser) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        return { success: false, message: 'Erro: Sessão do usuário não encontrada.' };
    }
    
    // Combina os dados atualizados com os dados existentes
    const fullUserData = {
        ...currentUser,
        ...updatedUser,
        // Mantém campos que não são editáveis no formulário
        id: currentUser.id,
        createdAt: currentUser.createdAt,
        lastLogin: currentUser.lastLogin,
        boards: currentUser.boards || [],
        groups: currentUser.groups || []
    };
    
    if (updateUser(currentUser.id, fullUserData)) {
        // Atualiza os dados originais para o próximo cancelamento
        originalUserData = {...fullUserData};
        return { 
            success: true, 
            message: 'Perfil salvo com sucesso!',
            userData: fullUserData
        };
    } else {
        return { success: false, message: 'Erro ao salvar o perfil.' };
    }
}

// Diálogo de alterar senha (mantido do create-user)
function changePassword() {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Alterar Senha</h3>
        <div class="form-group">
            <label for="current-password-input">Senha Atual:</label>
            <input type="password" id="current-password-input" placeholder="Digite sua senha atual">
        </div>
        <div class="form-group">
            <label for="new-password-input">Nova Senha (mínimo 4 caracteres):</label>
            <input type="password" id="new-password-input" placeholder="Digite a nova senha (mín. 4 caracteres)">
            <div class="password-strength">
                <div class="password-strength-meter" id="new-password-strength-meter"></div>
            </div>
        </div>
        <div class="form-group">
            <label for="confirm-new-password-input">Confirmar Nova Senha:</label>
            <input type="password" id="confirm-new-password-input" placeholder="Repita a nova senha">
        </div>
        
        <div class="feedback"></div>

        <div class="modal-actions">
            <button id="cancel-change-password" class="btn btn-secondary">Cancelar</button>
            <button id="confirm-change-password" class="btn btn-primary">Alterar Senha</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    dialog.showModal();

    // Adicionar validação de força da senha em tempo real
    const newPasswordInput = dialog.querySelector('#new-password-input');
    const strengthMeter = dialog.querySelector('#new-password-strength-meter');
    
    newPasswordInput.addEventListener('input', function() {
        updatePasswordStrength(this.value, strengthMeter);
    });

    const cancelButton = dialog.querySelector('#cancel-change-password');
    cancelButton.addEventListener('click', () => dialog.close());
    
    dialog.addEventListener('close', () => dialog.remove());

    const confirmButton = dialog.querySelector('#confirm-change-password');
    confirmButton.addEventListener('click', () => {
        const currentPassword = dialog.querySelector('#current-password-input').value;
        const newPassword = dialog.querySelector('#new-password-input').value;
        const confirmPassword = dialog.querySelector('#confirm-new-password-input').value;
        const userData = getCurrentUser();

        if (!currentPassword || !newPassword || !confirmPassword) {
            showDialogMessage(dialog, 'Todos os campos são obrigatórios.', 'error');
            return;
        }
        
        // Validação do comprimento mínimo da senha
        if (newPassword.length < 4) {
            showDialogMessage(dialog, 'A nova senha deve ter pelo menos 4 caracteres.', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showDialogMessage(dialog, 'As novas senhas não coincidem.', 'error');
            return;
        }
        
        if (currentPassword !== userData.password && !validateMasterPassword(currentPassword)) {
            showDialogMessage(dialog, 'Senha atual incorreta.', 'error');
            return;
        }
        
        if (updateUser(userData.id, { password: newPassword })) {
            showDialogMessage(dialog, 'Senha alterada com sucesso!', 'success');
            setTimeout(() => dialog.close(), 1500);
        } else {
            showDialogMessage(dialog, 'Erro ao alterar a senha.', 'error');
        }
    });
}

// Função para atualizar o medidor de força da senha (similar à do create-user.js)
function updatePasswordStrength(password, strengthMeter) {
    if (!strengthMeter) return;

    let strength = 0;
    if (password.length >= 4) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    strength = Math.min(strength, 4); 

    strengthMeter.className = 'password-strength-meter';
    strengthMeter.classList.add(`strength-${strength}`);
}

// Diálogo de excluir conta (mantido do create-user)
function confirmDeleteAccount() {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Excluir Perfil</h3>
        <p>Esta ação é irreversível. Para confirmar, por favor, digite sua senha atual ou a senha mestra.</p>
        
        <div class="form-group">
            <label for="delete-confirm-password">Senha de Confirmação:</label>
            <input type="password" id="delete-confirm-password" autocomplete="current-password">
        </div>
        
        <div class="feedback"></div>

        <div class="modal-actions">
            <button id="cancel-delete-btn" class="btn btn-secondary">Cancelar</button>
            <button id="confirm-delete-btn" class="btn btn-primary">Excluir Permanentemente</button>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();

    const cancelButton = dialog.querySelector('#cancel-delete-btn');
    cancelButton.addEventListener('click', () => dialog.close());
    
    dialog.addEventListener('close', () => dialog.remove());

    const confirmButton = dialog.querySelector('#confirm-delete-btn');
    confirmButton.addEventListener('click', () => {
        const password = dialog.querySelector('#delete-confirm-password').value;
        const userData = getCurrentUser();

        if (!password) {
            showDialogMessage(dialog, 'A senha é obrigatória para confirmar.', 'error');
            return;
        }

        if (password === userData.password || validateMasterPassword(password)) {
            if (deleteUserProfile(userData.id)) {
                showDialogMessage(dialog, 'Perfil excluído com sucesso. Redirecionando...', 'success');
                dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);
                
                setTimeout(() => {
                    logout();
                    window.location.href = 'list-users.html';
                }, 2000);
            } else {
                showDialogMessage(dialog, 'Ocorreu um erro ao excluir o perfil.', 'error');
            }
        } else {
            showDialogMessage(dialog, 'Senha incorreta.', 'error');
            dialog.querySelector('#delete-confirm-password').value = '';
            dialog.querySelector('#delete-confirm-password').focus();
        }
    });
}

// Funções de tema e fonte
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

// Aplica a família de fontes universalmente
function applyFontFamily(fontFamily, isPreview = false) {
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

    // Salva a preferência no perfil do usuário se NÃO for uma pré-visualização
    if (!isPreview) {
        const currentUser = getCurrentUser();
        if (currentUser) {
            updateUser(currentUser.id, {
                preferences: {
                    ...(currentUser.preferences || {}),
                    fontFamily: fontFamily
                }
            });
        }
    }
}

// Adicione esta função para aplicar as configurações de fonte do usuário
function applyUserFont() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.preferences) return;
    
    applyFontFamily(currentUser.preferences.fontFamily || 'Segoe UI');
    applyFontSize(currentUser.preferences.fontSize || 'medium');
}

// Exportar função para ser usada em outras páginas
export function getAppliedFontFamily() {
    const currentUser = getCurrentUser();
    return currentUser?.preferences?.fontFamily || 'Segoe UI, sans-serif';
}

// profile.js - Adicione estas funções

// Função para carregar e exibir os grupos do usuário
function loadUserGroups() {
    const groupsContainer = document.getElementById('groups-container');
    if (!groupsContainer) return;
    
    const noGroupsMessage = groupsContainer.querySelector('.no-groups-message');
    if (!noGroupsMessage) return;
    
    // Obter grupos do usuário
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const allGroups = getAllGroups();
    const userGroups = allGroups.filter(group => 
        group.memberIds && group.memberIds.includes(currentUser.id)
    );
    
    // Limpar container
    groupsContainer.querySelectorAll('.group-card').forEach(card => card.remove());
    
    if (!userGroups || userGroups.length === 0) {
        noGroupsMessage.style.display = 'block';
        return;
    }
    
    noGroupsMessage.style.display = 'none';
    
    // Adicionar cada grupo ao container
    userGroups.forEach(group => {
        const isAdmin = group.adminId === currentUser.id;
        
        const groupCard = document.createElement('div');
        groupCard.className = 'group-card';
        groupCard.innerHTML = `
            <div class="group-icon">👥</div>
            <div class="group-info">
                <div class="group-name">${group.name}</div>
                <div class="group-role">${isAdmin ? 'Administrador' : 'Membro'}</div>
            </div>
            <div class="group-actions">
                <button class="btn btn-sm view-group-stats" data-group-id="${group.id}">
                    📊 Estatísticas
                </button>
            </div>
        `;
        
        groupsContainer.appendChild(groupCard);
    });
}

// Função para mostrar diálogo de busca de grupos
function showGroupSearchDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">🔍 Procurar Grupos</h3>
        <div class="form-group">
            <input type="text" id="group-search-input" placeholder="Digite o nome do grupo..." 
                   style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border);">
        </div>
        <div id="group-search-results" style="max-height: 300px; overflow-y: auto; margin: 15px 0; border: 1px solid var(--border); border-radius: 6px; padding: 10px;"></div>
        
        <div class="feedback" id="group-search-feedback"></div>
        
        <div class="modal-actions">
            <button id="group-search-cancel" class="btn btn-secondary">Cancelar</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    dialog.showModal();
    
    const searchInput = dialog.querySelector('#group-search-input');
    const resultsContainer = dialog.querySelector('#group-search-results');
    
    // Função para mostrar feedback
    function showFeedback(feedbackEl, message, type = 'info') {
        feedbackEl.textContent = message;
        feedbackEl.className = `feedback ${type} show`;
        
        if (type !== 'error') {
            setTimeout(() => {
                feedbackEl.classList.remove('show');
            }, 3000);
        }
    }
    
    // Fechar diálogo
    dialog.querySelector('#group-search-cancel').addEventListener('click', () => {
        dialog.close();
        dialog.remove();
    });
    
    // Implementar busca de grupos
    searchInput.addEventListener('input', debounce(function() {
        const query = this.value.trim();
        searchGroups(query);
    }, 300));
    
    // Função para buscar grupos
    /**
     * Busca todos os grupos públicos disponíveis, filtra-os com base na consulta
     * e chama a função para renderizar os resultados.
     * @param {string} [query=''] - O termo de busca para filtrar os grupos.
     */
    function searchAndDisplayGroups(query = '') {
        const allGroups = getAllGroups();
        const currentUser = getCurrentUser();

        // Filtrar grupos públicos que o usuário não é membro
        const availableGroups = allGroups.filter(group => 
            group.access === 'public' && 
            (!group.memberIds || !group.memberIds.includes(currentUser.id))
        );

        const filteredGroups = query
            ? availableGroups.filter(group => group.name.toLowerCase().includes(query))
            : availableGroups;

        displayGroupSearchResults(filteredGroups, availableGroups.length === 0, query);
    }
    
    // Função para exibir resultados da busca
    /**
     * Renderiza os resultados da busca de grupos no diálogo.
     * @param {Array} groups - A lista de grupos a ser exibida.
     * @param {boolean} noPublicGroupsExist - True se não houver nenhum grupo público no sistema.
     * @param {string} query - O termo de busca atual.
     */
    function displayGroupSearchResults(groups, noPublicGroupsExist, query) {
        resultsContainer.innerHTML = ''; // Limpa sempre

        if (noPublicGroupsExist) {
            resultsContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--text-muted);">Digite para buscar grupos públicos.</p>`;
            return;
        }
        if (groups.length === 0 && query) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 15px;">🔍</div>
                    <p style="font-style: italic; margin: 0;">Nenhum grupo encontrado com este nome.</p>
                </div>
            `;
            return;
        }
        
        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'group-result-item';
            groupEl.style.padding = '10px';
            groupEl.style.borderBottom = '1px solid var(--border)';
            groupEl.style.display = 'flex';
            groupEl.style.justifyContent = 'space-between';
            groupEl.style.alignItems = 'center';
            
            groupEl.innerHTML = `
                <div>
                    <div style="font-weight: bold;">${group.name}</div>
                    <div style="font-size: 0.9rem; color: var(--text-muted);">${group.memberIds ? group.memberIds.length : 0} membros</div>
                </div>
                <button class="btn btn-sm join-group-btn" data-group-id="${group.id}" data-group-name="${group.name}">
                    Entrar
                </button>
            `;
            
            resultsContainer.appendChild(groupEl);
        });
        
        // Adicionar event listeners aos botões de entrar
        dialog.querySelectorAll('.join-group-btn').forEach(button => {
            button.addEventListener('click', function() {
                const groupId = this.getAttribute('data-group-id');
                const groupName = this.getAttribute('data-group-name');
                requestToJoinGroup(groupId, groupName);
            });
        });
    }
    
    // Função para solicitar entrada em um grupo
    function requestToJoinGroup(groupId, groupName) {
        const joinButton = dialog.querySelector(`.join-group-btn[data-group-id="${groupId}"]`);
        
        if (!joinButton) return;
        
        // Desabilitar o botão para evitar múltiplos cliques
        joinButton.disabled = true;
        joinButton.textContent = 'Enviando...';
        
        const currentUser = getCurrentUser();
        const group = getGroup(groupId);
        
        if (!group) {
            showFeedback(dialog.querySelector('#group-search-feedback'), 'Grupo não encontrado.', 'error');
            joinButton.disabled = false;
            joinButton.textContent = 'Entrar';
            return;
        }
        
        // Enviar notificação para o administrador do grupo
        addGroupJoinRequestNotification(
            groupName,
            groupId,
            currentUser.name,
            currentUser.id,
            group.adminId
        );
        
        showFeedback(dialog.querySelector('#group-search-feedback'), `Solicitação para entrar no grupo "${groupName}" enviada!`, 'success');
        joinButton.textContent = 'Solicitado';
        
        // Fechar o diálogo após um tempo
        setTimeout(() => {
            dialog.close();
            dialog.remove();
        }, 2000);
    }
    
    // Chamar a busca inicial ao abrir o diálogo
    searchAndDisplayGroups();

    // Focar no input ao abrir o diálogo
    setTimeout(() => {
        dialog.querySelector('#group-search-input').focus();
    }, 100);
}

// Adicione esta função de utilitário para debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            clearTimeout(timeout);
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Adicione esta função ao notifications.js ou aqui se não estiver disponível
function addGroupJoinRequestNotification(groupName, groupId, userName, userId, adminId) {
    const notifications = getNotifications(adminId) || [];
    
    const newNotification = {
        id: 'notification-' + Date.now(),
        type: 'group_join_request',
        title: 'Solicitação de Participação',
        message: `${userName} solicitou participar do grupo "${groupName}"`,
        timestamp: new Date().toISOString(),
        read: false,
        data: {
            groupId: groupId,
            userId: userId,
            groupName: groupName
        }
    };
    
    notifications.unshift(newNotification);
    saveNotifications(adminId, notifications);
}