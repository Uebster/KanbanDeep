// js/create-user.js

import { registerUser, getAllUsers } from './auth.js';
import { showFloatingMessage, initDraggableElements } from './ui-controls.js';

// Função de inicialização exportada para ser chamada pelo main.js
export function initCreateUserPage() {
    initApp();
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
        (dialog) => { 
            const form = document.getElementById('create-user-form');
            if (form) {
                form.reset();
            }

            // Retorna um objeto com a mensagem de info
            return {
                success: true,
                message: 'Criação de usuário cancelada.',
                type: 'info'
            };
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

function showMessage(text, type = 'info') {
    const container = document.getElementById('message-container');
    if (!container) return;

    const message = document.createElement('div');
    message.className = `message ${type}`;

    let icon = 'ℹ️';
    if (type === 'error') icon = '❌';
    if (type === 'success') icon = '✅';

    message.innerHTML = `<span class="message-icon">${icon}</span> <span>${text}</span>`;
    container.appendChild(message);

    setTimeout(() => {
        message.remove();
    }, 5000);
}

// Função para mostrar mensagens dentro de diálogos
function showDialogMessage(dialog, message, type) {
    const feedbackEl = dialog.querySelector('.feedback');
    if (!feedbackEl) return;
    
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback ${type} show`;
    
    // Não esconde a mensagem de erro, apenas as outras
    if (type !== 'error') {
        setTimeout(() => {
            feedbackEl.classList.remove('show');
        }, 1500);
    }
}

/*
 * Cria e exibe um diálogo de confirmação genérico e estilizado.
 * @param {string} message - A pergunta a ser exibida (ex: "Salvar alterações?").
 * @param {function} onConfirm - A função a ser executada se o usuário clicar em "Confirmar".
 */
function showConfirmationDialog(message, onConfirm) {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">Confirmação</h3>
        <p>${message}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary">Não</button>
            <button class="btn btn-primary">Sim</button>
        </div>
    `;
    document.body.appendChild(dialog);
    
    dialog.showModal();

    const confirmBtn = dialog.querySelector('.btn-primary');
    const cancelBtn = dialog.querySelector('.btn-secondary');
    const feedbackEl = dialog.querySelector('.feedback');

    const closeDialog = () => { 
        dialog.close(); 
        setTimeout(() => dialog.remove(), 300);
    };
    
    cancelBtn.addEventListener('click', closeDialog);

    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;

        const result = await onConfirm(dialog);

        // Se for um objeto com informações de resultado
        if (result && typeof result === 'object') {
            if (result.success) {
                showDialogMessage(dialog, result.message, result.type || 'success');
                
                // Se houver um redirecionamento configurado, executá-lo após o delay
                if (result.redirect) {
                    setTimeout(() => {
                        closeDialog();
                        window.location.href = result.redirect;
                    }, 1500);
                } else {
                    setTimeout(closeDialog, 1500);
                }
            } else if (result.error) {
                showDialogMessage(dialog, result.message, 'error');
                setTimeout(closeDialog, 1500);
            }
        } 
        // Se for true, fecha o diálogo
        else if (result === true) {
            closeDialog();
        }
        // Se for false, mantém aberto (reabilita os botões)
        else if (result === false) {
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
        }
        // Padrão: fecha o diálogo
        else {
            closeDialog();
        }
    });
}

function showSaveConfirmationDialog() {
    showConfirmationDialog(
        'Deseja registrar este usuário?',
        async (dialog) => {
            const result = processUserCreation();
            
            if (result.success) {
                return {
                    success: true,
                    message: 'Usuário registrado com sucesso! Redirecionando...',
                    redirect: 'list-users.html'
                };
            } else {
                return {
                    error: true,
                    message: result.message
                };
            }
        }
    );
}
