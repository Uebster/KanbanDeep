// js/create-user.js

import { registerUser, getAllUsers } from './auth.js';
import { showFloatingMessage, initDraggableElements, initCustomSelects, showConfirmationDialog, showDialogMessage } from './ui-controls.js';
import { t, initTranslations, loadLanguage, applyTranslations } from './translations.js';

// Função de inicialização exportada para ser chamada pelo main.js
export async function initCreateUserPage() {
    // 1. Lê as preferências temporárias da tela de login ANTES de tudo.
    const tempLanguage = localStorage.getItem('appLanguage') || 'pt-BR';
    const tempTheme = localStorage.getItem('appTheme') || 'dark-gray';
    
    // 2. Carrega o idioma correto.
    await loadLanguage(tempLanguage);
    applyTranslations();

    // 3. Aplica o tema visualmente.
    applyTheme(tempTheme);

    // 4. Pré-seleciona os valores nos selects.
    document.getElementById('language').value = tempLanguage;
    document.getElementById('theme').value = tempTheme;

    // 5. Inicializa o restante da página.
    setupDateInput();
    initCustomSelects();
    setupEventListeners();
}


function setupDateInput() {
    const today = new Date();
    const maxDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
    const birthdateInput = document.getElementById('birthdate');
    if (birthdateInput) {
        birthdateInput.max = maxDate.toISOString().split("T")[0];
    }
}

function setupEventListeners() {
    // Botão de upload de avatar
    document.getElementById('btn-upload-avatar')?.addEventListener('click', () => {
        document.getElementById('avatar-upload')?.click();
    });
    document.getElementById('avatar-upload')?.addEventListener('change', previewAvatar);

    // Força da senha
    document.getElementById('password')?.addEventListener('input', updatePasswordStrength);

    // Seletor de cor primária
    setupColorPicker();
    
// Função de cancelamento corrigida
    // Adiciona listeners para pré-visualização de idioma e tema
    document.getElementById('language')?.addEventListener('change', async (e) => {
        await loadLanguage(e.target.value);
        applyTranslations();
        initCustomSelects(); // Atualiza o texto dos selects customizados
    });

    document.getElementById('theme')?.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });

    document.getElementById('btn-cancel')?.addEventListener('click', () => {
        showConfirmationDialog(t('createUser.confirm.cancel'), // "Tem certeza que deseja cancelar o cadastro? As informações inseridas serão perdidas."
            (dialog) => { // onConfirm
                showDialogMessage(dialog, t('createUser.feedback.cancelled'), 'info');
                setTimeout(() => window.location.href = 'list-users.html', 1500);
                return true; // Sinaliza para fechar o diálogo de confirmação
            }
        );
    });


    // Formulário de envio
    document.getElementById('create-user-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        showSaveConfirmationDialog();
    });

    // Opções de privacidade
    document.querySelectorAll('.privacy-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.privacy-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
    });
}

/**
 * Configura o listener para a paleta de cores primárias, permitindo a pré-visualização.
 */
function setupColorPicker() {
    const paletteContainer = document.getElementById('color-palette-container');
    if (!paletteContainer) return;

    paletteContainer.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;

        paletteContainer.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));
        swatch.classList.add('active');

        const action = swatch.dataset.action;
        
        if (action === 'remove-primary') {
            document.body.classList.add('no-primary-effects');
        } else {
            const hex = swatch.dataset.hex;
            const rgb = swatch.dataset.rgb;
            document.body.classList.remove('no-primary-effects');
            document.documentElement.style.setProperty('--primary', hex);
            document.documentElement.style.setProperty('--primary-rgb', rgb);

            // --- LÓGICA DE PRÉ-VISUALIZAÇÃO DA WINDOW-BAR ---
            const darkerColor = shadeColor(hex, -20); // Escurece a cor em 20%
            document.querySelector('.window-bar')?.style.setProperty('background-color', darkerColor);

        }
    });
}
async function processUserCreation() {
    const name = document.getElementById('name').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Validações
    if (!name || !username) {
        return { success: false, message: 'createUser.error.nameRequired' };
    }

    if (password.length < 4) {
        return { success: false, message: 'createUser.error.passwordLength' };
    }

    if (password !== confirmPassword) {
        return { success: false, message: 'createUser.error.passwordMismatch' };
     
    }

    const existingUsers = await getAllUsers();
    if (existingUsers.some(user => user.username === username)) {
        return { success: false, message: 'createUser.error.usernameExists' };
    }
    
    if (email && existingUsers.some(user => user.email === email)) {
        return { success: false, message: 'createUser.error.emailExists' };
    }

    // Coleta a cor primária selecionada
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

    // Cria o objeto de dados do formulário, SEM os campos de sistema
    const formData = {
        name,
        username,
        password,
        email,
        bio: document.getElementById('bio').value.trim(),
        birthdate: document.getElementById('birthdate').value,
        gender: document.getElementById('gender').value,
        location: document.getElementById('location').value.trim(),
        whatsapp: document.getElementById('whatsapp').value.trim(),
        linkedin: document.getElementById('linkedin').value.trim(),
        privacy: document.querySelector('.privacy-option.selected')?.dataset.value || 'private',
        language: document.getElementById('language').value,
        theme: document.getElementById('theme').value,
        avatar: document.getElementById('avatar-preview').querySelector('img')?.src || '',
        // Garante que as preferências de exibição sejam inicializadas
        preferences: {
            ...getInitialDisplayPreferences(),
            primaryColor: primaryColor
        }
    };

    if (await registerUser(formData)) { // Passa apenas os dados do formulário
        return { 
            success: true, 
            message: 'createUser.feedback.success',
            autoClose: true
        };
    } else {
        return { 
            success: false, 
            message: 'createUser.error.generic',
            autoClose: true
        };
    }
}

/**
 * Retorna um objeto com as preferências de exibição iniciais para um novo usuário.
 * @returns {object}
 */
function getInitialDisplayPreferences() {
    return {
        showTags: true,
        showDate: true,
        showStatus: true,
        showAssignment: true,
        showBoardIcon: true,
        showBoardTitle: true,
        showCardDetails: false,
        enableCardTooltip: true,
        smartHeader: false
    };
}
function previewAvatar() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const avatarPreview = document.getElementById('avatar-preview');
            avatarPreview.innerHTML = `<img src="${e.target.result}" alt="Preview do avatar">`;
        }
        reader.readAsDataURL(file);
    }
}

function updatePasswordStrength() {
    const password = document.getElementById('password').value;
    const strengthMeter = document.getElementById('password-strength-meter');
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

function applyTheme(theme) {
    document.body.classList.remove('light-mode', 'dark-mode', 'dark-gray-mode', 'light-gray-mode');

    switch (theme) {
        case 'light': document.body.classList.add('light-mode'); break;
        case 'dark': document.body.classList.add('dark-mode'); break;
        case 'light-gray': document.body.classList.add('light-gray-mode'); break;
    }
}

function showSaveConfirmationDialog() {
    showConfirmationDialog(t('createUser.confirm.register'), // "Confirmar cadastro do novo usuário?"
        async (dialog) => {
            const result = await processUserCreation();
            
            if (result.success) {
                showDialogMessage(dialog, t('createUser.feedback.success'), 'success');
                setTimeout(() => window.location.href = 'list-users.html', 1500);
                return true; // Sinaliza para fechar o diálogo
            } else {
                showDialogMessage(dialog, t(result.message), 'error');
                return false; // Mantém o diálogo aberto para correção
            }
        }
    );
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

    R = (R < 255) ? R : 255; G = (G < 255) ? G : 255; B = (B < 255) ? B : 255;

    return `#${(R.toString(16).padStart(2, '0'))}${(G.toString(16).padStart(2, '0'))}${(B.toString(16).padStart(2, '0'))}`;
}
