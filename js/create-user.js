// js/create-user.js

import { registerUser, getAllUsers } from './auth.js';
import { showFloatingMessage, initDraggableElements, initCustomSelects, showConfirmationDialog, showDialogMessage } from './ui-controls.js';

// Função de inicialização exportada para ser chamada pelo main.js
export function initCreateUserPage() {
    initApp();
    initCustomSelects(); // Inicializa os selects customizados
    setupEventListeners();
    initDraggableElements();
}

// ===== FUNÇÕES DA PÁGINA =====

function initApp() {
    applyTheme(); // Aplica o tema ao carregar a página

    // Configurar data de nascimento máxima (usuários com pelo menos 13 anos)
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
    
// Função de cancelamento corrigida
    document.getElementById('btn-cancel')?.addEventListener('click', () => {
        showConfirmationDialog(
            'Tem certeza que deseja cancelar? Todas as alterações não salvas serão perdidas.',
            (dialog) => { // onConfirm
                showDialogMessage(dialog, 'Criação cancelada. Redirecionando...', 'info');
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

function processUserCreation() {
    const name = document.getElementById('name').value.trim();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Validações
    if (!name || !username) {
        return { success: false, message: 'Nome completo e nome de usuário são obrigatórios.' };
    }

    if (password.length < 4) {
        return { success: false, message: 'A senha deve ter pelo menos 4 caracteres.' };
    }

    if (password !== confirmPassword) {
        return { success: false, message: 'As senhas não coincidem.' };
     
    }

    const existingUsers = getAllUsers();
    if (existingUsers.some(user => user.username === username)) {
        return { success: false, message: 'Este nome de usuário já está em uso. Por favor, escolha outro.' };
    }
    
    if (email && existingUsers.some(user => user.email === email)) {
        return { success: false, message: 'Este e-mail já está em uso. Por favor, use outro.' };
    }

    // Cria o novo perfil do usuário
    const userProfile = {
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
        // Adiciona campos padrão para compatibilidade com o sistema
        id: 'user-' + Date.now(),
        createdAt: new Date().toISOString(),
        lastLogin: null,
        boards: [],
        groups: [],
        preferences: {}
    };

    if (registerUser(userProfile)) {
        return { 
            success: true, 
            message: 'Usuário criado com sucesso!',
            autoClose: true
        };
    } else {
        return { 
            success: false, 
            message: 'Ocorreu um erro ao criar o usuário. Verifique os dados e tente novamente.',
            autoClose: true
        };
    }
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

function applyTheme() {
    // Lê a preferência do sistema, definida na tela de login
    const systemTheme = localStorage.getItem('appTheme') || 'dark';
    
    document.body.classList.remove('light-mode', 'dark-mode');

    if (systemTheme === 'light') {
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.add('dark-mode');
    }
}

function showSaveConfirmationDialog() {
    showConfirmationDialog( // Agora usa a função global de ui-controls.js
        'Deseja registrar este usuário?',
        async (dialog) => {
            const result = processUserCreation();
            
            if (result.success) {
                showDialogMessage(dialog, 'Usuário registrado com sucesso! Redirecionando...', 'success');
                setTimeout(() => window.location.href = 'list-users.html', 1500);
                return true; // Sinaliza para fechar o diálogo
            } else {
                showDialogMessage(dialog, result.message, 'error');
                return false; // Mantém o diálogo aberto para correção
            }
        }
    );
}
