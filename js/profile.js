// js/profile.js - VERSÃO FINAL CORRIGIDA

import { getCurrentUser, updateUser, logout, validateMasterPassword } from './auth.js';
import { getUserProfile, deleteUserProfile, getUserTagTemplates, getSystemTagTemplates, getAllGroups, getGroup,
      getNotifications,   // <-- Adicione esta
  saveNotifications, saveUserProfile
} from './storage.js';
import { showFloatingMessage, initDraggableElements, updateUserAvatar, showConfirmationDialog, showDialogMessage, debounce, initCustomSelects, applyUserTheme } from './ui-controls.js';
import { applyTranslations, t, initTranslations, loadLanguage } from './translations.js';
import { addGroupRequestNotification } from './notifications.js';

// Variável para armazenar dados originais do usuário
let originalUserData = null;
let originalTheme = null;
let originalFont = null;
let originalFontSize = null;
let isSaved = true;

// Função de inicialização exportada
export async function initProfilePage() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showFloatingMessage(t('ui.userNotLoggedIn'), 'error');
        setTimeout(() => { window.location.href = 'list-users.html'; }, 2000);
        return;
    }

    if (currentUser) {
        updateUserAvatar(currentUser);
    }

    await initTranslations();
    document.getElementById('page-title').textContent = t('profile.pageTitle');

    loadUserData(t); // 1. Carrega os dados, passando a função de tradução.
    setupEventListeners();
    setupColorPicker();
    setupPrivacyOptions();
    initDraggableElements();
    // initCustomSelects() foi movido para o final de loadUserData() para garantir que os selects estejam prontos.
}

function translateProfilePage() {
    // Helper para definir o texto de um elemento de forma segura
    const safeSetText = (selector, textKey) => {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = t(textKey);
        }
    };

    // Traduz labels estáticos que não são cobertos pelo data-i18n
    safeSetText('label[for="name"]', 'createUser.label.fullName');
    safeSetText('label[for="username"]', 'createUser.label.username');
    safeSetText('label[for="bio"]', 'createUser.label.bio');
    safeSetText('label[for="birthdate"]', 'createUser.label.birthdate');
    safeSetText('label[for="gender"]', 'createUser.label.gender');
    safeSetText('label[for="location"]', 'createUser.label.location');
    safeSetText('label[for="email"]', 'createUser.label.email');
    safeSetText('label[for="whatsapp"]', 'createUser.label.whatsapp');
    safeSetText('label[for="linkedin"]', 'createUser.label.linkedin');
    safeSetText('label[for="language"]', 'preferences.language');
    safeSetText('label[for="theme"]', 'preferences.theme');
    safeSetText('label[for="font-family"]', 'preferences.font');
    safeSetText('label[for="font-size"]', 'preferences.fontSize');
    safeSetText('label[for="default-tag-template"]', 'preferences.defaultTagSet');
    safeSetText('label[for="color-palette-container"]', 'preferences.primaryColor');
    safeSetText('legend[data-i18n="preferences.displayOnBoard"]', 'preferences.displayOnBoard');
    safeSetText('legend[data-i18n="preferences.displayOnCard"]', 'preferences.displayOnCard');
    // O seletor '#privacy-settings-label' não existe em profile.html, então foi removido para evitar o erro.
}
function loadUserData(t) { // Recebe a função de tradução como argumento
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    try {
        const userData = getUserProfile(currentUser.id);
        if (!userData) {
            showFloatingMessage(t('profile.error.loading'), 'error');
            return;
        }

        // Traduz os labels da página
        translateProfilePage();

        // Carrega os grupos do usuário APÓS a tradução inicial estar pronta
        loadUserGroups(t); // Passa a função 't' para a função que carrega os grupos
        
        // Salvar os dados originais para restauração
        originalUserData = {...userData};
        originalTheme = userData.theme || 'auto';
        originalFontSize = userData.preferences?.fontSize || 'medium';
        originalFont = userData.preferences?.fontFamily || 'Segoe UI, Inter, sans-serif';
            
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
defaultOption.textContent = t('preferences.tagTemplate.none');
tagTemplateSelect.appendChild(defaultOption);

// Adiciona os templates do usuário primeiro, se existirem
if (userTagTemplates.length > 0) {
    const optgroupUser = document.createElement('optgroup');
    optgroupUser.label = t('preferences.tagTemplate.mySets');
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
    optgroupSystem.label = t('preferences.tagTemplate.systemSets');
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
// 2. Se não houver, seleciona o "Padrão 1" do sistema.
tagTemplateSelect.value = prefs.defaultTagTemplateId || 'system-tags-prio';
        
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
            document.getElementById('font-family').value = userData.preferences.fontFamily || 'Segoe UI, Inter, sans-serif';
            document.getElementById('font-size').value = userData.preferences.fontSize || 'medium'; // <-- CORREÇÃO: fontSizeValue -> fontSize
            document.getElementById('pref-card-show-tags').checked = userData.preferences.showTags !== false;
            document.getElementById('pref-card-show-date').checked = userData.preferences.showDate !== false;
            document.getElementById('pref-card-show-status').checked = userData.preferences.showStatus !== false;
            document.getElementById('pref-card-show-assignment').checked = userData.preferences.showAssignment !== false;
            document.getElementById('pref-board-show-icon').checked = userData.preferences.showBoardIcon !== false;
            document.getElementById('pref-board-show-title').checked = userData.preferences.showBoardTitle !== false;
            document.getElementById('pref-card-show-details').checked = userData.preferences.showCardDetails !== false;
            document.getElementById('pref-smart-header').checked = userData.preferences.smartHeader === true;
        }
        
        // --- LÓGICA DE COR PRIMÁRIA ---
        const primaryColor = userData.preferences?.primaryColor;
        const paletteContainer = document.getElementById('color-palette-container');
        paletteContainer.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));

        if (primaryColor === 'none') {
            paletteContainer.querySelector('[data-action="remove-primary"]')?.classList.add('active');
        } else if (primaryColor && primaryColor.hex) {
            const activeSwatch = paletteContainer.querySelector(`[data-hex="${primaryColor.hex}"]`);
            if (activeSwatch) {
                activeSwatch.classList.add('active');
            }
        } else {
            // Se não houver cor salva, marca a padrão do sistema
            paletteContainer.querySelector('[data-hex="#4cd4e6"]')?.classList.add('active');
        }

        // Avatar
        updateAvatarPreview(userData);
        
        
    } catch (error) {
        console.error('Erro ao carregar dados do usuário:', error);
        showFloatingMessage(t('profile.error.loading'), 'error');
    }
    initCustomSelects(); // Chamado aqui, no final, para garantir que todos os selects estão populados
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
    
    document.querySelector('#profile-form .actions #btn-save')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleSaveClick();
    });

    document.getElementById('btn-cancel')?.addEventListener('click', handleCancelClick);
    document.getElementById('change-password-account')?.addEventListener('click', changePassword);
    document.getElementById('btn-delete-account')?.addEventListener('click', confirmDeleteAccount);
    document.getElementById('manage-groups-btn')?.addEventListener('click', () => handleNavigation('groups.html'));
    document.getElementById('manage-templates-btn')?.addEventListener('click', () => handleNavigation('templates.html'));
    document.getElementById('btn-join-group')?.addEventListener('click', showGroupSearchDialog);
    
    // Opções de privacidade
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.privacy-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

        // Listener específico para o idioma, para aplicar a tradução em tempo real
    const languageSelect = document.getElementById('language');
    if (languageSelect) {
        languageSelect.addEventListener('change', async (e) => {
            isSaved = false;
            await loadLanguage(e.target.value); // Carrega o novo dicionário
            applyTranslations(); // Traduz elementos com data-i18n
            
            // Re-renderiza as partes dinâmicas da página que precisam de tradução
            translateProfilePage(); // Traduz labels estáticos
            loadUserGroups(t);      // Re-renderiza os cards de grupo com a nova tradução
            initCustomSelects();    // Atualiza o texto dos selects customizados
        });
    }

    // Listeners que marcam o estado como "não salvo"
    const formFields = [
        'name', 'username', 'bio', 'birthdate', 'gender', 
        'location', 'email', 'whatsapp', 'linkedin', 'language',
        'default-tag-template'
    ];
    formFields.forEach(field => {
        const element = document.getElementById(field);
        if (element) {
            element.addEventListener('input', () => { isSaved = false; });
            element.addEventListener('change', () => { isSaved = false; });
        }
    });

    // Listeners com pré-visualização
    const previewFields = [
        { id: 'theme', action: (e) => applyThemeFromSelect(e.target.value) },
        { id: 'font-size', action: (e) => applyFontSize(e.target.value, true) }
    ];
    previewFields.forEach(field => {
        const element = document.getElementById(field.id);
        if (element) {
            element.addEventListener('change', (e) => {
                if (field.action) field.action(e);
                isSaved = false;
            });
        }
    });

    // Para checkboxes
    [
        'pref-card-show-tags', 'pref-card-show-date', 'pref-card-show-status', 'pref-card-show-assignment', 'pref-board-show-title', 'pref-board-show-icon', 'pref-card-show-details', 'pref-smart-header'
    ].forEach(id => document.getElementById(id)?.addEventListener('change', () => { isSaved = false; }));
    
    // Para opções de privacidade
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.addEventListener('click', () => { isSaved = false; });
    });

    // --- INTERCEPTADOR DE NAVEGAÇÃO ---
    // Adiciona listeners aos botões de navegação para usar a função de verificação.
    // O 'true' no final faz com que este listener capture o evento ANTES dos listeners do main.js,
    // permitindo que a navegação seja cancelada se necessário.
    const navActions = {
        'kanban-btn': { url: 'kanban.html' },
        'my-groups-btn': { url: 'groups.html' },
        'templates-btn': { url: 'templates.html' },
        'friends-btn': { url: 'friends.html' },
        'notifications-btn': { url: 'notifications.html' },
        'switch-user-btn': { url: 'list-users.html' }
    };

    Object.keys(navActions).forEach(id => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', (e) => {
                // CORREÇÃO: Sempre previne a ação padrão e chama o handleNavigation.
                // A função handleNavigation decidirá se navega ou mostra o diálogo.
                e.preventDefault();
                e.stopImmediatePropagation(); // Impede que outros listeners (do main.js) sejam executados.
                handleNavigation(navActions[id].url, navActions[id].state || {});
            }, true); // Captura o evento na fase de "capturing".
        }
    });

    // Listener para os botões de estatísticas dos grupos (usando delegação)
    document.getElementById('groups-container')?.addEventListener('click', (e) => {
        const statsButton = e.target.closest('.view-group-stats');
        if (statsButton) {
            const groupId = statsButton.dataset.groupId;
            if (groupId) {
                handleNavigation('groups.html', { openTab: 'statistics', groupId });
            }
        }
    });
}

function setupColorPicker() {
    const paletteContainer = document.getElementById('color-palette-container');
    if (!paletteContainer) return;

    paletteContainer.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;

        isSaved = false; // Marca como não salvo

        paletteContainer.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));
        swatch.classList.add('active');

        const action = swatch.dataset.action;
        
        if (action === 'remove-primary') {
            document.body.classList.add('no-primary-effects');
        } else {
            const hex = swatch.dataset.hex;
            const rgb = swatch.dataset.rgb;
            if (hex && rgb) {
                document.body.classList.remove('no-primary-effects');
                document.documentElement.style.setProperty('--primary', hex);
                document.documentElement.style.setProperty('--primary-rgb', rgb);
            }
        }
    });
}

/**
 * Lida com a navegação para outras páginas, verificando se há alterações não salvas.
 * @param {string} destination - A URL de destino (ex: 'templates.html').
 * @param {Object} [state] - Um objeto com chaves e valores para salvar no localStorage antes de navegar.
 */
function handleNavigation(destination, state = {}) {
    // Limpa o estado de navegação anterior se não houver um novo.
    if (Object.keys(state).length === 0) {
        localStorage.removeItem('openTab');
        localStorage.removeItem('groupId');
    }

    if (isSaved) {
        Object.keys(state).forEach(key => localStorage.setItem(key, state[key]));
        window.location.href = destination;
    } else {
        // Mostra o diálogo de confirmação
        showConfirmationDialog(t('profile.nav.confirmLeave'),
            (dialog) => { // onConfirm (Sim, sair) - CORRIGIDO
                Object.keys(state).forEach(key => localStorage.setItem(key, state[key]));
                showDialogMessage(dialog, t('profile.nav.redirecting'), 'info');
                setTimeout(() => {
                    isSaved = true; // Libera a trava antes de sair da página
                    window.location.href = destination;
                }, 1500);
                return false; // Mantém o diálogo aberto enquanto redireciona
            },
            null, // onCancel usa o padrão
            t('profile.nav.yesLeave'), t('profile.nav.no')
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

function applyFontSize(size, isPreview = false) {
    // Usa os mesmos valores em 'rem' do ui-controls.js para consistência.
    const sizeMap = { small: '0.75rem', medium: '1rem', large: '1.3rem', 'x-large': '1.6rem' };
    const fontSizeValue = sizeMap[size] || '1rem'; // Padrão para 'medium'

    document.documentElement.style.fontSize = fontSizeValue;
    
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
function handleSaveClick() {
    showConfirmationDialog(t('profile.confirm.save'), // A chave já está aqui
        // onConfirm
        async (dialog) => {
            const result = await processProfileUpdate();
            
            if (result.success) {
                isSaved = true;
                showDialogMessage(dialog, t('profile.feedback.profileSaved'), 'success'); // A chave já está aqui
                // Atualiza os dados originais para refletir o que foi salvo
                originalUserData = {...result.userData};
                originalTheme = result.userData.theme || 'auto';
                applyUserTheme(); // <-- CHAMA A FUNÇÃO GLOBAL PARA APLICAR TUDO
                applyTranslations();
                return true;
            } else {
                showDialogMessage(dialog, t(result.message), 'error'); // Usa a chave de tradução
                return false;
            }
        }
    );
}

function handleCancelClick() {
    showConfirmationDialog(t('profile.confirm.discard'), // A chave já está aqui
        // onConfirm (Sim, descartar)
        (dialog) => {
            // Restaura os dados do formulário e aplica o tema/fonte originais
            restoreOriginalData();
            
            isSaved = true;
            showDialogMessage(dialog, t('profile.feedback.discarded'), 'info'); // A chave já está aqui
            return true;
        },
        // onCancel (Não, continuar editando)
        (dialog) => {
            showDialogMessage(dialog, t('profile.feedback.continueEditing'), 'info');
            return true;
        }
    );
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
        return { success: false, message: 'profile.error.loading' };
    }
    
    // Validar campos obrigatórios
    const name = document.getElementById('name').value.trim();
    if (!name) {
        return { success: false, message: 'profile.error.nameRequired' };
    }
    
    const username = document.getElementById('username').value.trim();
    if (!username) {
        return { success: false, message: 'profile.error.usernameRequired' };
    }

    const privacyOption = document.querySelector('.privacy-option.selected');
    const privacy = privacyOption ? privacyOption.dataset.value : 'private';
    
    // Coletar cor primária
    const activeSwatch = document.querySelector('#color-palette-container .color-swatch.active');
    let primaryColor = null;
    if (activeSwatch) {
        if (activeSwatch.dataset.action === 'remove-primary') {
            primaryColor = 'none';
        } else {
            primaryColor = {
                hex: activeSwatch.dataset.hex,
                rgb: activeSwatch.dataset.rgb
            };
        }
    }

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
            showTags: document.getElementById('pref-card-show-tags').checked,
            showDate: document.getElementById('pref-card-show-date').checked,
            showStatus: document.getElementById('pref-card-show-status').checked,
            showAssignment: document.getElementById('pref-card-show-assignment').checked,
            showBoardIcon: document.getElementById('pref-board-show-icon').checked,
            showBoardTitle: document.getElementById('pref-board-show-title').checked,
            showCardDetails: document.getElementById('pref-card-show-details').checked,
            smartHeader: document.getElementById('pref-smart-header').checked,
            defaultTagTemplateId: document.getElementById('default-tag-template').value,
            primaryColor: primaryColor // Salva a nova preferência de cor
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
            return { success: false, message: 'profile.error.imageProcessing' };
        }
    }
    
    return completeProfileUpdate(updatedUser);
}

/**
 * Atualiza o medidor de força da senha na interface.
 * @param {string} password - A senha que está sendo digitada.
 * @param {HTMLElement} strengthMeter - O elemento que exibe a força.
 */
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

function completeProfileUpdate(updatedUser) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        return { success: false, message: 'profile.error.sessionNotFound' };
    }
    
    // Combina os dados atualizados com os dados existentes
    const fullUserData = {
        ...getUserProfile(currentUser.id), // Pega a versão mais recente do storage
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
            message: 'profile.feedback.profileSaved',
            userData: fullUserData
        };
    } else {
        return { success: false, message: t('profile.feedback.errorSaving') };
    }
}

// Diálogo de alterar senha (mantido do create-user)
function changePassword() {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('profile.changePassword.title')}</h3>
        <div class="form-group">
            <label for="current-password-input">${t('profile.changePassword.currentPassword')}</label>
            <input type="password" id="current-password-input" placeholder="${t('profile.changePassword.currentPasswordPlaceholder')}">
        </div>
        <div class="form-group">
            <label for="new-password-input">${t('profile.changePassword.newPassword')}</label>
            <input type="password" id="new-password-input" placeholder="${t('profile.changePassword.newPasswordPlaceholder')}">
            <div class="password-strength">
                <div class="password-strength-meter" id="new-password-strength-meter"></div>
            </div>
        </div>
        <div class="form-group">
            <label for="confirm-new-password-input">${t('profile.changePassword.confirmNewPassword')}</label>
            <input type="password" id="confirm-new-password-input" placeholder="${t('profile.changePassword.confirmNewPasswordPlaceholder')}">
        </div>
        
        <div class="feedback"></div>

        <div class="modal-actions">
            <button id="cancel-change-password" class="btn btn-neon cancel">${t('ui.cancel')}</button>
            <button id="confirm-change-password" class="btn btn-neon confirm">${t('profile.changePassword.title')}</button>
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
            showDialogMessage(dialog, t('createUser.error.allFieldsRequired'), 'error');
            return;
        }
        
        // Validação do comprimento mínimo da senha
        if (newPassword.length < 4) {
            showDialogMessage(dialog, t('createUser.error.passwordLength'), 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showDialogMessage(dialog, t('createUser.error.passwordMismatch'), 'error');
            return;
        }
        
        if (currentPassword !== userData.password && !validateMasterPassword(currentPassword)) {
            showDialogMessage(dialog, t('ui.incorrectPassword'), 'error');
            return;
        }
        
        if (updateUser(userData.id, { password: newPassword })) {
            showDialogMessage(dialog, t('profile.changePassword.success'), 'success');
            setTimeout(() => dialog.close(), 1500);
        } else {
            showDialogMessage(dialog, t('profile.changePassword.error'), 'error');
        }
    });
}

// Diálogo de excluir conta (mantido do create-user)
function confirmDeleteAccount() {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('profile.deleteAccount.title')}</h3>
        <p>${t('profile.deleteAccount.confirm')}</p>
        
        <div class="form-group">
            <label for="delete-confirm-password">${t('profile.deleteAccount.passwordLabel')}</label>
            <input type="password" id="delete-confirm-password" autocomplete="current-password">
        </div>
        
        <div class="feedback"></div>

        <div class="modal-actions">
            <button id="cancel-delete-btn" class="btn btn-neon cancel">${t('ui.cancel')}</button>
            <button id="confirm-delete-btn" class="btn btn-neon danger">${t('ui.deletePermanently')}</button>
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
            showDialogMessage(dialog, t('ui.passwordRequired'), 'error');
            return;
        }

        if (password === userData.password || validateMasterPassword(password)) {
            if (deleteUserProfile(userData.id)) {
                showDialogMessage(dialog, t('profile.deleteAccount.success'), 'success');
                dialog.querySelectorAll('button').forEach(btn => btn.disabled = true);
                
                setTimeout(() => {
                    logout();
                    window.location.href = 'list-users.html';
                }, 2000);
            } else {
                showDialogMessage(dialog, t('profile.deleteAccount.error'), 'error');
            }
        } else {
            showDialogMessage(dialog, t('ui.incorrectPassword'), 'error');
            dialog.querySelector('#delete-confirm-password').value = '';
            dialog.querySelector('#delete-confirm-password').focus();
        }
    });
}

// profile.js - Adicione estas funções

// Função para carregar e exibir os grupos do usuário
function loadUserGroups(t) { // Recebe a função de tradução como argumento
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
        
        // Determina o texto do papel ANTES de criar o HTML.
        // Isso garante que a função t() seja chamada no contexto correto e facilita a depuração.
        const roleText = isAdmin ? t('profile.groups.roleAdmin') : t('profile.groups.roleMember');
        const statsButtonText = t('profile.groups.buttonStats');

        const groupCard = document.createElement('div');
        groupCard.className = 'group-card';
        groupCard.innerHTML = `
            <div class="group-icon">${group.icon || '👥'}</div>
            <div class="group-info">
                <div class="group-name">${group.name}</div>
                <div class="group-role">${roleText}</div>
            </div>
            <div class="group-actions">
                <button type="button" class="btn btn-sm view-group-stats" data-group-id="${group.id}">
                    ${statsButtonText}
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
        <h3 class="drag-handle">${t('profile.groups.searchDialogTitle')}</h3>
        <div class="form-group">
            <input type="text" id="group-search-input" placeholder="${t('profile.groups.searchPlaceholder')}" 
                   style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border);">
        </div>
        <div id="group-search-results" style="max-height: 300px; overflow-y: auto; margin: 15px 0; border: 1px solid var(--border); border-radius: 6px; padding: 10px;"></div>
        
        <div class="feedback" id="group-search-feedback"></div>
        
        <div class="modal-actions">
            <button id="group-search-cancel" class="btn cancel">${t('ui.cancel')}</button>
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
        searchAndDisplayGroups(query);
    }, 300));
    
    // Função para buscar grupos
    /**
     * Busca todos os grupos públicos disponíveis, filtra-os com base na consulta
     * e chama a função para renderizar os resultados.
     * @param {string} [query=''] - O termo de busca para filtrar os grupos.
     */
    function searchAndDisplayGroups(query = '') {
        const allGroups = getAllGroups() || [];
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
            resultsContainer.innerHTML = `<p style="text-align: center; padding: 20px; color: var(--text-muted);">${t('profile.groups.searchPrompt')}</p>`;
            return;
        }
        if (groups.length === 0 && query) {
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 15px;">🔍</div>
                    <p style="font-style: italic; margin: 0;">${t('profile.groups.searchNotFound')}</p>
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
                    <div style="font-size: 0.9rem; color: var(--text-muted);">${t('profile.groups.memberCount', { count: group.memberIds ? group.memberIds.length : 0 })}</div>
                </div>
                <button class="btn btn-sm join-group-btn" data-group-id="${group.id}" data-group-name="${group.name}">
                    ${t('profile.groups.buttonJoin')}
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
        joinButton.textContent = t('profile.groups.sendingRequest');
        
        const currentUser = getCurrentUser();
        const group = getGroup(groupId);
        
        if (!group) {
            showFeedback(dialog.querySelector('#group-search-feedback'), t('profile.groups.groupNotFound'), 'error');
            joinButton.disabled = false;
            joinButton.textContent = t('profile.groups.buttonJoin');
            return;
        }
        
        // Enviar notificação para o administrador do grupo
        addGroupRequestNotification(
            groupName,
            groupId,
            currentUser.name,
            currentUser.id,
            group.adminId
        );
        
        showFeedback(dialog.querySelector('#group-search-feedback'), t('profile.groups.requestSent', { groupName: groupName }), 'success');
        joinButton.textContent = t('profile.groups.requested');
        
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

/**
 * Restaura todos os dados do formulário e o estado visual da página para os valores originais.
 */
function restoreOriginalData() {
    if (!originalUserData) return;

    /**
     * Helper para atualizar o valor de um select e sua exibição customizada.
     * @param {string} id - O ID do elemento select.
     * @param {string} value - O valor a ser definido.
     */
    const updateSelectDisplay = (id, value) => {
        const selectEl = document.getElementById(id);
        if (!selectEl) return;
        selectEl.value = value;
        const displayEl = selectEl.closest('.custom-select')?.querySelector('.select-selected');
        if (displayEl && selectEl.selectedIndex > -1) displayEl.innerHTML = selectEl.options[selectEl.selectedIndex].innerHTML;
    };

    // --- 1. RESTAURA OS VALORES DOS CAMPOS DO FORMULÁRIO ---
    const prefs = originalUserData.preferences || {};
    
    // Campos de texto e data
    document.getElementById('name').value = originalUserData.name || '';
    document.getElementById('username').value = originalUserData.username || '';
    document.getElementById('bio').value = originalUserData.bio || '';
    document.getElementById('birthdate').value = originalUserData.birthdate || '';
    document.getElementById('location').value = originalUserData.location || '';
    document.getElementById('email').value = originalUserData.email || '';
    document.getElementById('whatsapp').value = originalUserData.whatsapp || '';
    document.getElementById('linkedin').value = originalUserData.linkedin || '';

    // Selects
    updateSelectDisplay('gender', originalUserData.gender || '');
    updateSelectDisplay('language', originalUserData.language || 'pt-BR');
    updateSelectDisplay('theme', originalUserData.theme || 'auto');
    updateSelectDisplay('font-family', prefs.fontFamily || 'Segoe UI, Inter, sans-serif');
    updateSelectDisplay('font-size', prefs.fontSize || 'medium');
    updateSelectDisplay('default-tag-template', prefs.defaultTagTemplateId || '');

    // Checkboxes
    document.getElementById('pref-card-show-tags').checked = prefs.showTags !== false;
    document.getElementById('pref-card-show-date').checked = prefs.showDate !== false;
    document.getElementById('pref-card-show-status').checked = prefs.showStatus !== false;
    document.getElementById('pref-card-show-assignment').checked = prefs.showAssignment !== false;
    document.getElementById('pref-board-show-icon').checked = prefs.showBoardIcon !== false;
    document.getElementById('pref-board-show-title').checked = prefs.showBoardTitle !== false;
    document.getElementById('pref-card-show-details').checked = prefs.showCardDetails !== false;
    document.getElementById('pref-smart-header').checked = prefs.smartHeader === true;

    // Opção de privacidade
    const privacyValue = originalUserData.privacy || 'private';
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.value === privacyValue);
    });

    // --- 2. RESTAURA O ESTADO VISUAL DA PÁGINA ---

    // Restaura o tema
    applyThemeFromSelect(originalUserData.theme || 'auto');

    // Restaura a fonte
    applyFontFamily(prefs.fontFamily || 'Segoe UI, Inter, sans-serif');
    applyFontSize(prefs.fontSize || 'medium', true);

    // Restaura a cor primária
    const primaryColor = prefs.primaryColor;
    const paletteContainer = document.getElementById('color-palette-container');
    paletteContainer.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));

    if (primaryColor === 'none') {
        paletteContainer.querySelector('[data-action="remove-primary"]')?.classList.add('active');
        document.body.classList.add('no-primary-effects');
    } else if (primaryColor && primaryColor.hex) {
        const activeSwatch = paletteContainer.querySelector(`[data-hex="${primaryColor.hex}"]`);
        if (activeSwatch) activeSwatch.classList.add('active');
        document.body.classList.remove('no-primary-effects');
        document.documentElement.style.setProperty('--primary', primaryColor.hex);
        document.documentElement.style.setProperty('--primary-rgb', primaryColor.rgb);
    } else {
        // Se não houver cor salva, restaura a padrão do sistema
        paletteContainer.querySelector('[data-hex="#4cd4e6"]')?.classList.add('active');
        document.body.classList.remove('no-primary-effects');
        document.documentElement.style.setProperty('--primary', '#4cd4e6');
        document.documentElement.style.setProperty('--primary-rgb', '76, 212, 230');
    }

    // Restaura o avatar
    updateAvatarPreview(originalUserData);
}

/**
 * Aplica um tema visualmente para pré-visualização.
 * @param {string} themeValue - O valor do tema ('light', 'dark', etc.).
 */
function applyThemeFromSelect(themeValue) {
    // Limpa apenas as classes de tema para evitar conflitos
    document.body.classList.remove('light-mode', 'dark-mode', 'light-gray-mode');

    // Aplica a classe correta com base no tema final
    // 'auto' e 'dark-gray' resultam no tema padrão (:root), então não precisam de classe.
    switch (themeValue) {
        case 'light': document.body.classList.add('light-mode'); break;
        case 'dark': document.body.classList.add('dark-mode'); break;
        case 'light-gray': document.body.classList.add('light-gray-mode'); break;
        case 'dark-gray':
        case 'auto':
        default:
            // Não faz nada, permitindo que o tema padrão (:root) seja aplicado.
            break;
    }
}

/**
 * Aplica uma família de fontes visualmente para pré-visualização.
 * @param {string} fontFamily - A string da família de fontes.
 */
function applyFontFamily(fontFamily, isPreview = false) {
    document.documentElement.style.setProperty('--app-font-family', fontFamily);
}
