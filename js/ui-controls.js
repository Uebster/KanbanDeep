// js/ui-controls.js - Controles de UI universais e avançados
import { getCurrentUser, updateUser } from './auth.js';
import { 
    saveUserBoardTemplates, getUserBoardTemplates, 
    saveUserTagTemplates, getUserTagTemplates,
    getGroup, saveGroup, getAllGroups
} from './storage.js';
import { t } from './translations.js';

/**
 * Biblioteca de ícones padrão para uso em toda a aplicação.
 */
export const ICON_LIBRARY = [
  '📋', '🏷️', '💼', '📚', '🛒', '🎮', '🔥', '📊', '🚀', '🎯', '💡', '🎉', '🏆', '⚙️', '🔧', '🏠', '❤️', '⭐', '📌', '📎', '📁', '📅', '⏰', '✅', '❌', '❓', '❗', '💰', '👥', '🧠',
  '🧑‍🤝‍🧑', '🔔', '💬', '🌍', '🔒', '🔑'
];

// ===== FUNÇÕES DE CONTROLE DE MODAIS E TECLADO =====

/**
 * Inicializa todos os controles de UI universais: modais, teclado e arrastar elementos.
 * Deve ser chamada uma única vez no início da aplicação.
 */
export function initUIControls() {
    setupGlobalCloseListeners();
    setupKeyboardShortcuts();
    initDraggableElements();
}

/**
 * Retorna o elemento de UI de maior prioridade que está aberto.
 * A ordem de prioridade é: Diálogos > Dropdowns.
 * @returns {HTMLElement|null} O elemento da camada superior ou null.
 */
function getTopmostLayer() {
    // Prioridade 1: Diálogos (<dialog>) abertos
    const openDialogs = document.querySelectorAll('dialog[open]');
    if (openDialogs.length > 0) {
        return openDialogs[openDialogs.length - 1]; // Retorna o último aberto, que está no topo
    }

    // Prioridade 2: Dropdowns (.dropdown.show) abertos
    const openDropdown = document.querySelector('.dropdown.show');
    if (openDropdown) {
        return openDropdown;
    }

    return null;
}

/**
 * Tenta fechar o elemento de UI que está na camada superior.
 * Para diálogos, dispara um evento 'cancel' que pode ser prevenido.
 */
function closeTopLayer() {
    const topLayer = getTopmostLayer();
    if (!topLayer) return;

    if (topLayer.tagName === 'DIALOG') {
        // Dispara um evento 'cancel' no diálogo.
        // Se o evento não for cancelado (ou seja, se dispatchEvent retornar true),
        // então o diálogo será fechado.
        const cancelEvent = new Event('cancel', { cancelable: true });
        if (topLayer.dispatchEvent(cancelEvent)) {
            topLayer.close();
        }
    } else if (topLayer.classList.contains('dropdown')) {
        topLayer.classList.remove('show');
    }
}

/**
 * Configura os listeners globais para fechar elementos de forma controlada.
 */
function setupGlobalCloseListeners() {
    // Lida com a tecla ESC de forma inteligente.
    document.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            const topLayer = getTopmostLayer();
            // Se a camada superior for um dropdown, nós a fechamos.
            // Se for um diálogo, deixamos o navegador disparar o evento 'cancel' nativo,
            // que será interceptado pelo listener do próprio diálogo (ex: em kanban.js).
            if (topLayer && topLayer.tagName !== 'DIALOG') {
                closeTopLayer();
            }
        }
    });

    // Fecha ao clicar fora (no backdrop de um modal ou fora de um dropdown)
    document.addEventListener('click', (e) => {
        const topLayer = getTopmostLayer();
        if (!topLayer) return;

        // Se a camada superior for um diálogo, tenta fechar apenas se o clique for no backdrop.
        if (topLayer.tagName === 'DIALOG' && e.target === topLayer) {
            closeTopLayer();
        } 
        // Se for um dropdown, fecha se o clique for fora do seu container.
        else if (topLayer.classList.contains('dropdown') && !e.target.closest('.menu-container')) { // Dropdowns fecham direto
            topLayer.classList.remove('show');
        }
    });
}

/**
 * Configura atalhos de teclado globais:
 * - Navegação por TAB em modais.
 * - Submissão de diálogos com ENTER.
 */
function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
        // Navegação por TAB dentro de modais
        if (e.key === "Tab") {
            handleTabNavigation(e);
        }

        // --- LÓGICA DE ENTER APRIMORADA E CENTRALIZADA ---
        // Se a tecla "Enter" for pressionada em um campo que não seja uma área de texto...
        if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "TEXTAREA") {
            // ...e houver um diálogo (<dialog>) aberto na tela...
            const openDialog = document.querySelector('dialog[open]');
            if (openDialog) {
                // ...procuramos pelo botão de ação principal.
                // A nova convenção é '.btn.confirm', mas mantemos '.btn-primary' para compatibilidade.
                // O seletor agora busca por um botão que tenha a classe 'confirm' OU a classe 'btn-primary'.
                const primaryButton = openDialog.querySelector('.btn.confirm, .btn-primary');
                
                // Se o botão existir e não estiver desabilitado...
                if (primaryButton && !primaryButton.disabled) {
                    e.preventDefault(); // Previne o comportamento padrão do Enter (ex: submeter um formulário)
                    primaryButton.click(); // Simula o clique no botão "Salvar" ou "Confirmar".
                }
            }
        }
    });
}

/**
 * Gerencia a navegação por TAB para manter o foco dentro do modal aberto.
 * @param {KeyboardEvent} e - O evento de teclado.
 */
function handleTabNavigation(e) {
    const modal = document.querySelector("dialog[open]");
    if (!modal) return;

    const focusableElements = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(modal.querySelectorAll(focusableElements));

    if (focusable.length === 0) return; // Nenhum elemento focável no modal

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (e.shiftKey) { // Shift + Tab
        if (document.activeElement === firstElement || !modal.contains(document.activeElement)) {
            lastElement.focus();
            e.preventDefault();
        }
    } else { // Tab
        if (document.activeElement === lastElement || !modal.contains(document.activeElement)) {
            firstElement.focus();
            e.preventDefault();
        }
    }
}

// ===== FUNÇÕES PARA ARRASTAR ELEMENTOS (MODAIS, JANELAS) =====

/**
 * Inicializa a funcionalidade de arrastar para todos os elementos com a classe 'draggable'.
 * O elemento arrastável deve ter um 'drag-handle' (elemento com classe 'drag-handle')
 * ou o próprio elemento será o handle se nenhum for especificado.
 */
export function initDraggableElements() {
    document.querySelectorAll(".draggable").forEach(element => {
        makeDraggable(element);
    });
}

/**
 * Torna um elemento HTML arrastável.
 * @param {HTMLElement} element - O elemento HTML a ser tornado arrastável.
 */
export function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const dragHandle = element.querySelector(".drag-handle") || element; // Usa o handle ou o próprio elemento

    if (!dragHandle) return; // Não há handle para arrastar

    dragHandle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // Pega a posição do mouse no início
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();

        //console.log("Target:", e.target);
        //console.log("Current target:", e.currentTarget)

        // Garante que só arraste se clicar na área de drag (drag-handle)
        if (!e.target.classList.contains('drag-handle')) return;

        // Calcula a nova posição do cursor
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
    

        // Define a nova posição do elemento
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// ===== FUNÇÕES DE MENSAGENS FLUTUANTES =====

/**
 * Exibe uma mensagem flutuante na tela, agora posicionada abaixo do header.
 * @param {string} message - O texto da mensagem a ser exibida.
 * @param {string} type - 'success', 'error', 'warning', 'info'.
 * @param {number} duration - Duração em milissegundos.
 */
export function showFloatingMessage(message, type = 'info', duration = 4000) {
    let container = document.getElementById('message-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        container.style.position = 'fixed';
        container.style.top = '49px';      // Distância do topo, abaixo do header
        container.style.right = '20px';     // Distância da direita
        container.style.left = 'auto';      // Remove o alinhamento à esquerda
        container.style.transform = 'none'; // Remove a centralização
        container.style.zIndex = '3000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'flex-end'; // Alinha as mensagens à direita dentro do container
        container.style.gap = '10px';
        document.body.appendChild(container);
    }


    const messageEl = document.createElement('div');
    
    // Adiciona a classe .feedback para herdar o estilo base e .floating-message para o estilo sólido
    messageEl.className = `feedback floating-message ${type}`;
    messageEl.textContent = message;
    
    // Adiciona alguns estilos inline para garantir a aparência
    messageEl.style.padding = '14px 25px';
    messageEl.style.borderRadius = '8px';
    messageEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    messageEl.style.fontWeight = '500';
    messageEl.style.minWidth = '300px';
    messageEl.style.textAlign = 'center';

    container.appendChild(messageEl);

    // Mostra o elemento (para futuras animações)
    setTimeout(() => {
        messageEl.style.display = 'block';
    }, 10);

    // Remove a mensagem após a duração
    setTimeout(() => {
        messageEl.remove();
    }, duration);
}

/**
 * Cria e exibe um diálogo de confirmação genérico e estilizado.
 * @param {string} message - A pergunta a ser exibida.
 * @param {function} onConfirm - A função a ser executada se o usuário confirmar. Retorna `true` para fechar o diálogo.
 * @param {function|null} onCancel - A função a ser executada se o usuário cancelar.
 * @param {string} confirmText - O texto do botão de confirmação.
 * @param {string} cancelText - O texto do botão de cancelamento.
 */
export function showConfirmationDialog(message, onConfirm, onCancel = null, confirmText = t('ui.yes'), cancelText = t('ui.no')) {
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('ui.confirmation')}</h3>
        <p>${message}</p>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn confirm">${confirmText}</button>
            <button class="btn cancel">${cancelText}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    initDraggableElements();
    dialog.showModal();

    const confirmBtn = dialog.querySelector('.btn.confirm');
    const cancelBtn = dialog.querySelector('.btn.cancel');

    const closeAndCleanup = () => {
        dialog.close();
        setTimeout(() => dialog.remove(), 300);
    };

    cancelBtn.addEventListener('click', () => {
        if (onCancel) {
            const result = onCancel(dialog);
            if (result) {
                setTimeout(closeAndCleanup, 1500);
            }
        } else {
            showDialogMessage(dialog, t('ui.operationCancelled'), 'info');
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            setTimeout(closeAndCleanup, 1500);
        }
    });
    
    confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        const success = await onConfirm(dialog);
        if (success) {
            setTimeout(closeAndCleanup, 1500);
        } else {
            // Se a operação falhou (retornou false), a função onConfirm já mostrou a mensagem de erro.
            // Esperamos um pouco para que a mensagem seja lida e então fechamos o diálogo.
            // Isso permite que o usuário corrija o formulário.
            setTimeout(closeAndCleanup, 2000);
        }
    });
}

/**
 * Exibe uma mensagem em um diálogo.
 * @param {HTMLElement} dialog - O elemento do diálogo.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - O tipo de mensagem ('success', 'error', 'info').
 */
export function showDialogMessage(dialog, message, type = 'info') {
    const feedbackEl = dialog.querySelector('.feedback');
    if (!feedbackEl) return;
    
    feedbackEl.textContent = message;
    feedbackEl.className = `feedback ${type} show`;
    
    // Define um temporizador para esconder a mensagem após 3 segundos, para todos os tipos.
    setTimeout(() => {
        feedbackEl.classList.remove('show');
    }, 2000);
}

/**
 * Atualiza o avatar do usuário na interface (versão independente)
 * @param {Object} user - Objeto do usuário com informações de avatar e nome
 */
export function updateUserAvatar(user) {
    const avatarImg = document.getElementById('user-avatar');
    const avatarBtn = document.getElementById('user-avatar-btn');
    
    if (!avatarImg || !avatarBtn) {
        console.warn('Elementos do avatar não encontrados na página.');
        return;
    }
    
    // Se o usuário tem um avatar definido
    if (user.avatar) {
        avatarImg.src = user.avatar;
        avatarImg.alt = `Avatar de ${user.name}`;
    } else {
        // Avatar padrão baseado nas iniciais
        const initials = user.name.split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase();
        
        // Cor de fundo baseada no ID do usuário (para consistência)
        const hue = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
        const backgroundColor = `hsl(${hue}, 65%, 65%)`;
        
        // Criar avatar com iniciais (usando SVG para evitar dependências externas)
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
            <rect width="38" height="38" fill="${backgroundColor}" rx="19"/>
            <text x="19" y="24" font-family="Arial" font-size="14" fill="white" text-anchor="middle">${initials}</text>
        </svg>`;
        
        avatarImg.src = 'data:image/svg+xml;base64,' + btoa(svgString);
        avatarImg.alt = `Avatar de ${user.name} (${initials})`;
    }
    
    // Adicionar tooltip com nome do usuário
    avatarBtn.title = t('ui.loggedInAs', { name: user.name });
}

// ===== FUNÇÕES DE TEMA E FONTE UNIVERSAIS =====

/**
 * Aplica o tema (claro/escuro) e a fonte com base nas preferências do usuário.
 * Esta função deve ser chamada em todas as páginas após o login.
 */
export function applyUserTheme() {
    const user = getCurrentUser();
    if (!user) return;

    // 1. Aplica o tema (claro/escuro)
    const userTheme = user.preferences?.theme || user.theme || 'auto';
    const systemTheme = localStorage.getItem('appTheme') || 'dark-gray';

    // Limpa todas as classes de tema para evitar conflitos
    document.body.classList.remove('light-mode', 'dark-mode', 'dark-gray-mode', 'light-gray-mode');

    let themeToApply = userTheme;
    if (themeToApply === 'auto') {
        themeToApply = systemTheme;
    }

    // Aplica a classe correta com base no tema final
    switch (themeToApply) {
      case 'light':
        document.body.classList.add('light-mode');
        break;
      case 'dark':
        document.body.classList.add('dark-mode');
        break;
      case 'light-gray':
        document.body.classList.add('light-gray-mode');
        break;
      case 'dark-gray':
      default:
        // O tema 'dark-gray' é o padrão do :root, então apenas limpamos as outras classes.
        break;
    }

    // 2. Aplica a fonte
    applyUserFont();

    // 3. Aplica a cor primária
    applyPrimaryColor(user.preferences?.primaryColor);

    // 4. Aplica o comportamento do header inteligente
    initSmartHeader();
}

/**
 * Aplica a cor primária salva nas preferências do usuário em toda a interface.
 * @param {object|string} colorData - O objeto de cor ({hex, rgb}) ou a string 'none'.
 */
function applyPrimaryColor(colorData) {
    if (colorData && colorData.hex && colorData.rgb) {
        document.body.classList.remove('no-primary-effects');
        document.documentElement.style.setProperty('--primary', colorData.hex);
        document.documentElement.style.setProperty('--primary-rgb', colorData.rgb);
    } else {
        document.body.classList.add('no-primary-effects');
    }
}

function applyUserFont() {
    const user = getCurrentUser();
    if (!user || !user.preferences) return;
    
    applyFontFamily(user.preferences.fontFamily || 'Segoe UI');
    applyFontSize(user.preferences.fontSize || 'medium');
}

function applyFontFamily(fontFamily) {
    // Define a variável CSS global. O universal.css cuidará de aplicar a fonte.
    document.documentElement.style.setProperty('--app-font-family', fontFamily);
}

function applyFontSize(size) {
    const sizeMap = { small: '0.75rem', medium: '1rem', large: '1.3rem', 'x-large': '1.6rem' };
    const fontSizeValue = sizeMap[size] || '1rem'; // Padrão para 1rem (medium)
    document.documentElement.style.fontSize = fontSizeValue;
}

let hideHeaderTimeout; // Variável para controlar o delay de fechamento

/**
 * Lida com o movimento do mouse para mostrar/ocultar o header.
 */
function handleHeaderMouseMove(e) {
    const header = document.getElementById('main-header');
    if (!header) return;

    // CORREÇÃO DEFINITIVA: Se qualquer dropdown estiver aberto, pausa a lógica do Smart Header.
    // Isso impede que o header se esconda enquanto o usuário interage com um menu.
    if (document.querySelector('.dropdown.show')) {
        return;
    }

    const openDropdown = document.querySelector('.dropdown.show');

    // Se o mouse está sobre o header ou um dropdown aberto, cancela qualquer ação de esconder e mantém visível.
    if (header.matches(':hover') || (openDropdown && openDropdown.matches(':hover'))) {
        clearTimeout(hideHeaderTimeout);
        header.classList.add('show-header');
        document.body.classList.add('header-is-visible');
        return;
    }

    // Se o mouse está na área de ativação (10px), mostra o header.
    if (e.clientY < 10) {
        clearTimeout(hideHeaderTimeout);
        header.classList.add('show-header');
        document.body.classList.add('header-is-visible');
    } 
    // Se o mouse está na área de desativação (além de 75px), esconde o header.
    else if (e.clientY > 75) {
        // Se um dropdown está aberto, usa o período de cortesia para dar tempo ao usuário.
        if (openDropdown) {
            clearTimeout(hideHeaderTimeout);
            hideHeaderTimeout = setTimeout(() => {
                // Checa novamente antes de fechar. Se o mouse alcançou o dropdown, não fecha.
                const currentOpenDropdown = document.querySelector('.dropdown.show');
                if (currentOpenDropdown && currentOpenDropdown.matches(':hover')) {
                    return;
                }
                header.classList.remove('show-header');
                document.body.classList.remove('header-is-visible');
                // Fecha qualquer dropdown que ainda esteja aberto
                document.querySelectorAll('.dropdown.show').forEach(d => d.classList.remove('show'));
            }, 300); // 300ms de "período de cortesia"
        } else {
            // Se nenhum dropdown estiver aberto, esconde o header imediatamente.
            clearTimeout(hideHeaderTimeout);
            header.classList.remove('show-header');
            document.body.classList.remove('header-is-visible');
        }
    }
}

/**
 * Inicializa ou desativa o comportamento de "header inteligente" (auto-ocultar).
 */
export function initSmartHeader() {
    const user = getCurrentUser();
    const header = document.getElementById('main-header');
    if (!user || !header) return;

    const isEnabled = user.preferences?.smartHeader === true;

    // Remove listeners antigos para evitar duplicação
    document.removeEventListener('mousemove', handleHeaderMouseMove);

    if (isEnabled) {
        document.body.classList.add('smart-header-enabled');
        document.addEventListener('mousemove', handleHeaderMouseMove);
    } else {
        document.body.classList.remove('smart-header-enabled');
        header.classList.remove('show-header');
        // Garante que a classe do indicador seja removida ao desativar a função
        document.body.classList.remove('header-is-visible');
    }
}

/**
 * Desativa forçadamente o Smart Header, removendo a classe e o listener.
 * Útil para modos como o tour guiado.
 */
export function disableSmartHeader() {
    const header = document.getElementById('main-header');
    if (!header) return;

    document.body.classList.remove('smart-header-enabled');
    header.classList.remove('show-header');
    document.body.classList.remove('header-is-visible');
    document.removeEventListener('mousemove', handleHeaderMouseMove);
}

/**
 * Exibe um diálogo para o usuário selecionar um ícone da biblioteca padrão.
 * @param {function(string): void} callback - Função a ser chamada com o ícone selecionado.
 */
export function showIconPickerDialog(callback) {
    // Reutiliza um diálogo existente ou cria um novo
    let dialog = document.getElementById('icon-picker-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'icon-picker-dialog';
        dialog.className = 'draggable';
        dialog.innerHTML = `
            <h3 class="drag-handle">${t('iconPicker.title')}</h3>
            <div id="icon-grid">
                <!-- Ícones serão inseridos aqui -->
            </div>
            <div class="modal-actions">
                <button id="close-icon-picker-btn" class="btn cancel">${t('ui.close')}</button>
            </div>
        `;
        document.body.appendChild(dialog);
        makeDraggable(dialog); // Garante que seja arrastável
    }

    const iconGrid = dialog.querySelector('#icon-grid');
    iconGrid.innerHTML = ''; // Limpa ícones anteriores

    ICON_LIBRARY.forEach(icon => {
        const iconBtn = document.createElement('button');
        iconBtn.className = 'icon-picker-btn'; // Use uma classe para estilização se necessário
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

/**
 * Exibe um modal com um seletor de cores RGB/HEX/A totalmente customizado.
 * @param {string} currentColor - A cor atual em formato hexadecimal ou rgba.
 * @param {function(string): void} callback - Função chamada com a nova cor (formato rgba) ao confirmar.
 */
export function showCustomColorPickerDialog(currentColor, callback) {
    let dialog = document.getElementById('custom-color-picker-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'custom-color-picker-dialog';
        dialog.className = 'draggable';
        document.body.appendChild(dialog);
        makeDraggable(dialog);
    }

    dialog.innerHTML = `
        <h3 class="drag-handle">${t('colorPicker.title')}</h3>
        <div class="custom-color-picker-body">
            <div class="saturation-value-area">
                <div class="sv-picker-handle"></div>
            </div>
            <div class="picker-sliders-container">
                <div class="hue-slider">
                    <div class="slider-handle"></div>
                </div>
                <div class="alpha-slider">
                    <div class="slider-handle"></div>
                </div>
            </div>
        </div>
        <div class="custom-palette-container">
            <div class="custom-palette-header">
                <span>${t('colorPicker.savedColors')}</span>
                <button class="btn btn-sm btn-add-color" title="${t('colorPicker.add')}">+</button>
            </div>
            <div class="custom-palette-grid"></div>
        </div>
        <div class="picker-footer">
            <div class="color-preview"></div>
            <div class="color-inputs">
                <input type="text" class="hex-input" maxlength="9">
                <input type="number" class="rgb-input" data-channel="r" min="0" max="255">
                <input type="number" class="rgb-input" data-channel="g" min="0" max="255">
                <input type="number" class="rgb-input" data-channel="b" min="0" max="255">
                <input type="number" class="alpha-input" data-channel="a" min="0" max="1" step="0.01">
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn cancel">${t('ui.cancel')}</button>
            <button class="btn confirm">${t('colorPicker.ok')}</button>
        </div>
    `;

    const svArea = dialog.querySelector('.saturation-value-area');
    const svHandle = dialog.querySelector('.sv-picker-handle');
    const hueSlider = dialog.querySelector('.hue-slider');
    const hueHandle = dialog.querySelector('.slider-handle');
    const preview = dialog.querySelector('.color-preview');
    const hexInput = dialog.querySelector('.hex-input');
    const rgbInputs = dialog.querySelectorAll('.rgb-input');
    const alphaSlider = dialog.querySelector('.alpha-slider');
    const alphaHandle = alphaSlider.querySelector('.slider-handle');
    const alphaInput = dialog.querySelector('.alpha-input');

    const addColorBtn = dialog.querySelector('.btn-add-color');
    const paletteGrid = dialog.querySelector('.custom-palette-grid');

    const MAX_SAVED_COLORS = 16;
    let h = 0, s = 1, v = 1, a = 1;
    const currentUser = getCurrentUser();
    const storageKey = `customColors_${currentUser.id}`;

    // Funções auxiliares para a paleta customizada
    function getSavedColors() {
        return JSON.parse(localStorage.getItem(storageKey)) || [];
    }
    function saveColors(colors) {
        // A lógica de limite agora é tratada antes de salvar.
        localStorage.setItem(storageKey, JSON.stringify(colors));
    }

    function updateUI() {
        const { r, g, b } = hsvToRgb(h, s, v);
        const rgbaString = `rgba(${r}, ${g}, ${b}, ${a})`;
        const hex = rgbToHex(r, g, b, a);
        
        svArea.style.backgroundColor = `hsl(${h * 360}, 100%, 50%)`;
        svHandle.style.left = `${s * 100}%`; svHandle.style.top = `${(1 - v) * 100}%`;
        hueHandle.style.left = `${h * 100}%`;
        
        // O gradiente da cor vai por cima do fundo quadriculado
        alphaSlider.style.backgroundImage = `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1)), 
                                         linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(135deg, #ccc 25%, transparent 25%),
                                         linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(135deg, transparent 75%, #ccc 75%)`;
        alphaSlider.style.backgroundSize = '100% 100%, 12px 12px, 12px 12px, 12px 12px, 12px 12px';
        alphaSlider.style.backgroundPosition = '0 0, 0 0, 6px 0, 6px -6px, 0px 6px';
        alphaHandle.style.left = `${a * 100}%`;
        
        preview.style.backgroundColor = rgbaString;
        hexInput.value = hex;
        rgbInputs[0].value = r; rgbInputs[1].value = g; rgbInputs[2].value = b;
        alphaInput.value = a.toFixed(2);
    }

    function renderCustomPalette() {
        paletteGrid.innerHTML = '';
        const savedColors = getSavedColors();
        savedColors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'custom-palette-swatch';
            swatch.style.backgroundColor = color;
            swatch.dataset.color = color;
            swatch.title = color;

            // Clique para aplicar a cor
            swatch.addEventListener('click', () => {
                const parsed = parseColor(color);
                if (parsed) {
                    const newHsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
                    h = newHsv.h; s = newHsv.s; v = newHsv.v; a = parsed.a;
                    updateUI();
                }
            });

            // Clique direito para remover
            swatch.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, [{
                    label: t('colorPicker.remove'), icon: '🗑️', isDestructive: true,
                    action: () => {
                        let colors = getSavedColors().filter(c => c !== color);
                        saveColors(colors);
                        renderCustomPalette();
                    }
                }]);
            });
            paletteGrid.appendChild(swatch);
        });
    }

    function handleHorizontalSlider(slider, callback) {
        const onMouseMove = (e) => { const rect = slider.getBoundingClientRect(); callback(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))); };
        const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); };
        document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
    }

    hueSlider.addEventListener('mousedown', (e) => { e.stopPropagation(); handleHorizontalSlider(hueSlider, newHue => { h = newHue; updateUI(); }); const rect = hueSlider.getBoundingClientRect(); h = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); updateUI(); });
    alphaSlider.addEventListener('mousedown', (e) => { e.stopPropagation(); handleHorizontalSlider(alphaSlider, newAlpha => { a = newAlpha; updateUI(); }); const rect = alphaSlider.getBoundingClientRect(); a = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); updateUI(); });
    svArea.addEventListener('mousedown', (e) => { e.stopPropagation(); const onMouseMove = (e) => { const rect = svArea.getBoundingClientRect(); s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)); updateUI(); }; const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); }; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); onMouseMove(e); });

    hexInput.addEventListener('change', () => { const parsed = parseColor(hexInput.value); if (parsed) { const newHsv = rgbToHsv(parsed.r, parsed.g, parsed.b); h = newHsv.h; s = newHsv.s; v = newHsv.v; a = parsed.a; updateUI(); } });
    rgbInputs.forEach(input => input.addEventListener('change', () => { const r = parseInt(rgbInputs[0].value) || 0, g = parseInt(rgbInputs[1].value) || 0, b = parseInt(rgbInputs[2].value) || 0; const newHsv = rgbToHsv(r, g, b); h = newHsv.h; s = newHsv.s; v = newHsv.v; updateUI(); }));
    alphaInput.addEventListener('change', () => { const newAlpha = parseFloat(alphaInput.value); if (!isNaN(newAlpha)) { a = Math.max(0, Math.min(1, newAlpha)); updateUI(); } });

    addColorBtn.addEventListener('click', () => {
        const { r, g, b } = hsvToRgb(h, s, v);
        const newColor = `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
        let savedColors = getSavedColors();

        // Remove a cor se ela já existir, para que seja movida para o final (mais recente)
        const existingIndex = savedColors.indexOf(newColor);
        if (existingIndex > -1) {
            savedColors.splice(existingIndex, 1);
        }

        // Adiciona a cor no final do array
        savedColors.push(newColor);

        // Se o array exceder o limite, remove a cor mais antiga (a primeira)
        if (savedColors.length > MAX_SAVED_COLORS) {
            savedColors.shift();
        }

        saveColors(savedColors);
        renderCustomPalette();
    });

    const initialColor = parseColor(currentColor);
    if (initialColor) { const initialHsv = rgbToHsv(initialColor.r, initialColor.g, initialColor.b); h = initialHsv.h; s = initialHsv.s; v = initialHsv.v; a = initialColor.a; }
    updateUI();

    dialog.querySelector('.btn.confirm').onclick = () => { const { r, g, b } = hsvToRgb(h, s, v); callback(`rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`); dialog.close(); };
    dialog.querySelector('.btn.cancel').onclick = () => dialog.close();

    renderCustomPalette(); // Renderiza a paleta ao abrir
    dialog.showModal();
}

// --- Funções de Conversão de Cor ---
function rgbToHsv(r, g, b) { r /= 255, g /= 255, b /= 255; let max = Math.max(r, g, b), min = Math.min(r, g, b), h, s, v = max, d = max - min; s = max == 0 ? 0 : d / max; if (max == min) { h = 0; } else { switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; } return { h, s, v }; }
function hsvToRgb(h, s, v) { let r, g, b, i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); switch (i % 6) { case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break; case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break; } return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }; }
function rgbToHex(r, g, b, a) { const toHex = (c) => ('0' + Math.round(c).toString(16)).slice(-2); let hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`; if (a < 1) { hex += toHex(a * 255); } return hex; }
function parseColor(colorString) { if (colorString.startsWith('#')) { let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i; colorString = colorString.replace(shorthandRegex, (m, r, g, b, a) => r + r + g + g + b + b + (a ? a + a : '')); let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(colorString); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16), a: result[4] !== undefined ? (parseInt(result[4], 16) / 255) : 1 } : null; } let match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/); if (match) { return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]), a: match[4] !== undefined ? parseFloat(match[4]) : 1 }; } return { r: 255, g: 0, b: 0, a: 1 }; }

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Inicializa todos os elementos .custom-select da página, transformando-os
 * em dropdowns estilizados e funcionais.
 */
export function initCustomSelects() {
    // Remove o listener antigo para evitar duplicação ao chamar a função várias vezes
    document.removeEventListener("click", closeAllSelect);

    // Função para fechar todos os selects abertos, exceto o atual
    function closeAllSelect(elmnt) {
        const selectItems = document.getElementsByClassName("select-items");
        const selectSelected = document.getElementsByClassName("select-selected");

        for (let i = 0; i < selectItems.length; i++) {
            // Se o elemento clicado não for o "select-selected" correspondente, fecha a lista de itens.
            if (elmnt !== selectSelected[i]) {
                selectItems[i].classList.add("select-hide");
            }
        }
    }

    // Adiciona o listener para fechar ao clicar fora
    document.addEventListener("click", closeAllSelect);

    const customSelects = document.getElementsByClassName("custom-select");

    for (let i = 0; i < customSelects.length; i++) {
        const selElmnt = customSelects[i].getElementsByTagName("select")[0];
        if (!selElmnt) continue;

        // --- CORREÇÃO: Lida com a reinicialização de selects dinâmicos ---
        // Remove elementos customizados existentes para evitar duplicação ao atualizar a UI.
        const existingSelected = customSelects[i].querySelector('.select-selected');
        if (existingSelected) existingSelected.remove();
        const existingItems = customSelects[i].querySelector('.select-items');
        if (existingItems) existingItems.remove();

        // Se o select não tiver opções (pode ser preenchido dinamicamente mais tarde), pule.
        // Se não houver opção selecionada (selectedIndex === -1), também pula. Isso acontece
        // quando o valor salvo no storage não corresponde a nenhuma opção disponível ou o select está vazio.
        // Esta é a correção definitiva para o erro 'Cannot read properties of undefined (reading 'innerHTML')'.
        if (selElmnt.options.length === 0 || selElmnt.selectedIndex === -1) {
            continue;
        }

        // Cria o elemento que mostrará a opção selecionada
        const selectedDiv = document.createElement("DIV");
        selectedDiv.setAttribute("class", "select-selected");
        selectedDiv.innerHTML = selElmnt.options[selElmnt.selectedIndex].innerHTML;
        customSelects[i].appendChild(selectedDiv);

        // Cria o container para as opções
        const optionsDiv = document.createElement("DIV");
        optionsDiv.setAttribute("class", "select-items select-hide");

        // Cria cada item de opção
        const createOptionItem = (optionEl) => {
            const itemDiv = document.createElement("DIV");
            itemDiv.setAttribute("class", "select-item");
            itemDiv.innerHTML = optionEl.innerHTML;

            itemDiv.addEventListener("click", function(e) {
                const select = this.closest('.custom-select').getElementsByTagName("select")[0];
                const selectedDisplay = this.closest('.custom-select').querySelector('.select-selected');

                for (let k = 0; k < select.options.length; k++) {
                    if (select.options[k].innerHTML == this.innerHTML) {
                        select.selectedIndex = k;
                        selectedDisplay.innerHTML = this.innerHTML;
                        
                        // Dispara o evento 'change' no select original para que outros scripts possam reagir
                        select.dispatchEvent(new Event('change'));
                        break;
                    }
                }
                selectedDisplay.click();
            });
            return itemDiv;
        };

        // Itera sobre os filhos diretos (pode ser OPTION ou OPTGROUP)
        for (let j = 0; j < selElmnt.children.length; j++) {
            const child = selElmnt.children[j];

            if (child.tagName === 'OPTGROUP') {
                const groupLabel = document.createElement("DIV");
                groupLabel.setAttribute("class", "select-group-label");
                groupLabel.innerHTML = child.label;
                optionsDiv.appendChild(groupLabel);

                for (let k = 0; k < child.children.length; k++) {
                    const groupOption = child.children[k];
                    optionsDiv.appendChild(createOptionItem(groupOption));
                }
            } else if (child.tagName === 'OPTION') {
                optionsDiv.appendChild(createOptionItem(child));
            }
        }
        customSelects[i].appendChild(optionsDiv);

        selectedDiv.addEventListener("click", function(e) {
            e.stopPropagation();
            closeAllSelect(this);
            this.nextSibling.classList.toggle("select-hide");
        });
    }
}

/**
 * Cria e exibe um menu de contexto (clique direito) padronizado.
 * @param {MouseEvent} event - O evento do mouse para obter as coordenadas.
 * @param {Array<Object>} items - Um array de objetos que definem os itens do menu.
 *   Cada objeto pode ter:
 *   - `label` (string): O texto do botão.
 *   - `icon` (string, opcional): O emoji ou ícone.
 *   - `action` (function): A função a ser executada no clique.
 *   - `isDestructive` (boolean, opcional): Se o botão deve ter estilo de "perigo".
 *   - `disabled` (boolean, opcional): Se o botão deve estar desabilitado.
 *   - `isSeparator` (boolean, opcional): Se o item é um separador <hr>.
 */
export function showContextMenu(event, items) {
    event.preventDefault();
    document.querySelectorAll('.context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    items.forEach(item => {
        if (item.isSeparator) {
            menu.appendChild(document.createElement('hr'));
        } else {
            const button = document.createElement('button');
            button.innerHTML = `${item.icon || ''} ${item.label}`;
            if (item.isDestructive) {
                button.classList.add('destructive');
            }
            if (item.disabled) {
                button.disabled = true;
                button.title = t('kanban.feedback.noPermission');
            }
            button.onclick = () => {
                item.action();
                menu.remove();
            };
            menu.appendChild(button);
        }
    });

    document.body.appendChild(menu);

    const { innerWidth, innerHeight } = window;
    menu.style.left = `${event.clientX + menu.offsetWidth > innerWidth ? innerWidth - menu.offsetWidth - 5 : event.clientX}px`;
    menu.style.top = `${event.clientY + menu.offsetHeight > innerHeight ? innerHeight - menu.offsetHeight - 5 : event.clientY}px`;

    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 0);
}

/**
 * Exibe um editor de template universal para quadros ou etiquetas.
 * @param {'board' | 'tag'} type - O tipo de template ('board' ou 'tag').
 * @param {object} context - O contexto de salvamento. Ex: { ownerType: 'user' } ou { ownerType: 'group', ownerId: '...' }.
 * @param {string|null} templateId - O ID do template para editar, ou null para criar um novo.
 */
export function showTemplateEditorDialog(type, context, templateId = null) {
    const isBoard = type === 'board';
    const dialogId = isBoard ? 'board-template-dialog' : 'tag-template-dialog';

    // CORREÇÃO DEFINITIVA: Remove qualquer diálogo antigo para evitar conflitos.
    const oldDialog = document.getElementById(dialogId);
    if (oldDialog) {
        oldDialog.remove();
    }

    // Cria o novo diálogo. A função createTemplateEditorDialog agora o adiciona ao body.
    const dialog = createTemplateEditorDialog(type);
    makeDraggable(dialog);

    const title = isBoard ? t('templateEditor.boardTitle') : t('templateEditor.tagTitle');
    const item = isBoard ? t('templateEditor.column') : t('templateEditor.tag');
    const icon = isBoard ? '📋' : '🏷️';

    dialog.querySelector('.dialog-title').textContent = templateId ? t('templateEditor.editTitle', { type: title }) : t('templateEditor.createTitle', { type: title });
    dialog.querySelector('.template-icon-input').value = icon;
    dialog.querySelector('.template-name-input').value = '';
    dialog.querySelector('.template-desc-input').value = '';
    dialog.querySelector('.editor-container').innerHTML = '';
    dialog.dataset.editingId = templateId || '';
    dialog.dataset.context = JSON.stringify(context);

    // --- LÓGICA PARA O SELETOR DE GRUPO (SE APLICÁVEL) ---
    const groupSelectorContainer = dialog.querySelector('.group-selector-container');
    if (context.ownerType === 'group') {
        groupSelectorContainer.style.display = 'block';
        const groupSelect = groupSelectorContainer.querySelector('select');
        const adminGroups = getAllGroups().filter(g => g.adminId === getCurrentUser().id);

        groupSelect.innerHTML = `<option value="">${t('templateEditor.selectGroup')}</option>`;
        adminGroups.forEach(g => {
            groupSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`;
        });

        if (templateId && context.ownerId) {
            // Se estiver editando, pré-seleciona e desabilita o grupo.
            groupSelect.value = context.ownerId;
            groupSelect.disabled = true;
        } else {
            // Se estiver criando, habilita o seletor.
            groupSelect.disabled = false;
        }
        initCustomSelects(); // Inicializa o select customizado
    } else {
        // Esconde o seletor se o contexto for 'user'.
        groupSelectorContainer.style.display = 'none';
    }

    // Lógica para preencher os dados se estiver editando
    let template = null;
    if (templateId) {
        if (context.ownerType === 'user') {
            const templates = isBoard ? getUserBoardTemplates(getCurrentUser().id) : getUserTagTemplates(getCurrentUser().id);
            template = templates.find(t => t.id === templateId);
        } else if (context.ownerType === 'group') {
            const group = getGroup(context.ownerId);
            const templates = isBoard ? group?.boardTemplates : group?.tagTemplates;
            template = (templates || []).find(t => t.id === templateId);
        }
    }

    if (template) {
        dialog.querySelector('.template-icon-input').value = template.icon || icon;
        dialog.querySelector('.template-name-input').value = template.name;
        dialog.querySelector('.template-desc-input').value = template.description || '';
        const items = isBoard ? template.columns : template.tags;
    if (items) items.forEach(it => addTemplateItemToEditor(dialog, it.name, it.color));
    } else {
        addTemplateItemToEditor(dialog, t('templateEditor.newItemName', { item: item }), isBoard ? '#e74c3c' : '#3498db');
    }

    // Configura os botões
    dialog.querySelector('.btn-add-item').onclick = () => addTemplateItemToEditor(dialog);
    dialog.querySelector('.btn-save-template').onclick = () => saveTemplateFromEditor(dialog, type);
    dialog.querySelector('.btn.cancel').onclick = () => dialog.close();
    dialog.querySelector('.btn-choose-icon').onclick = () => {
        showIconPickerDialog(selectedIcon => {
            dialog.querySelector('.template-icon-input').value = selectedIcon;
        });
    };

    updateItemCount(dialog);
    toggleEditorContainerVisibility(dialog); // Garante o estado inicial correto
    dialog.showModal();
}

/**
 * Exibe um diálogo para enviar uma mensagem privada a um usuário.
 * @param {object} targetUser - O objeto do usuário que receberá a mensagem.
 * @param {function(string, HTMLElement): void} onSend - Callback a ser executado com a mensagem e o elemento do diálogo.
 */
export function showPrivateMessageDialog(targetUser, onSend) {
    if (!targetUser) {
        showFloatingMessage(t('groups.message.memberNotFound'), 'error');
        return;
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'draggable';
    dialog.innerHTML = `
        <h3 class="drag-handle">${t('publicProfile.messageDialog.title', { name: targetUser.name })}</h3>
        <div class="form-group">
            <textarea id="private-message-textarea" placeholder="${t('publicProfile.messageDialog.placeholder')}" rows="5"></textarea>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn cancel">${t('ui.cancel')}</button>
            <button class="btn confirm">${t('ui.send')}</button>
        </div>
    `;
    document.body.appendChild(dialog);
    makeDraggable(dialog);
    dialog.showModal();
    const textarea = dialog.querySelector('#private-message-textarea');
    const sendBtn = dialog.querySelector('.btn.confirm');
    const cancelBtn = dialog.querySelector('.btn.cancel');
    const closeDialog = () => { dialog.close(); dialog.remove(); };
    cancelBtn.addEventListener('click', closeDialog);
    sendBtn.addEventListener('click', () => {
        const message = textarea.value.trim();
        if (!message) {
            showDialogMessage(dialog, t('publicProfile.messageDialog.emptyError'), 'error');
            return;
        }
        onSend(message, dialog);
    });
}

function createTemplateEditorDialog(type) {
    const isBoard = type === 'board';
    const dialog = document.createElement('dialog');
    dialog.id = isBoard ? 'board-template-dialog' : 'tag-template-dialog';
    dialog.className = 'draggable';

    const title = isBoard ? t('templateEditor.boardTitle') : t('templateEditor.tagTitle');
    const item = isBoard ? t('templateEditor.column') : t('templateEditor.tag');

    // Adiciona o diálogo ao corpo da página.
    document.body.appendChild(dialog);

    dialog.innerHTML = `
        <h3 class="drag-handle dialog-title">${t('templateEditor.createTitle', { type: title })}</h3>
        <div class="form-group group-selector-container" style="display: none;">
            <label>${t('templateEditor.saveInGroup')}</label>
            <div class="custom-select">
                <select class="template-group-select"></select>
            </div>
        </div>
        <div class="form-group">
            <label>${t('templateEditor.nameLabel', { type: title })}</label>
            <input type="text" class="template-name-input" placeholder="${t('templateEditor.namePlaceholder')}">
        </div>
        <div class="form-group">
            <label>${t('templateEditor.iconLabel')}</label>
            <div class="icon-input-group">
                <input type="text" class="icon-display template-icon-input" readonly>
                <button type="button" class="btn btn-sm btn-choose-icon">${t('ui.choose')}</button>
            </div>
        </div>
        <div class="form-group">
            <label>${t('templateEditor.descriptionLabel')}</label>
            <textarea class="template-desc-input" rows="2"></textarea>
        </div>
        <div class="form-group">
            <label class="items-label">${t('templateEditor.itemsLabel', { itemType: (isBoard ? t('templateEditor.column') : t('templateEditor.tag')) + 's', count: 0 })}</label>
            <div class="editor-container"></div>
            <button type="button" class="btn alternative1 btn-add-item" style="width:100%; margin-top:10px;">${t('templateEditor.addItem', { item: item })}</button>
        </div>
        <div class="feedback"></div>
        <div class="modal-actions">
            <button class="btn cancel">${t('ui.cancel')}</button>
            <button class="btn confirm btn-save-template">${t('ui.save')}</button>
        </div>
    `;

    return dialog;
}

function addTemplateItemToEditor(dialog, name = '', color = '#333') {
    const editor = dialog.querySelector('.editor-container');
    if (editor.children.length >= 8) {
        showDialogMessage(dialog, t('templateEditor.limitReached'), 'warning');
        return;
    }
    editor.classList.remove('hidden'); // Garante que o container esteja visível ao adicionar
    const itemEl = document.createElement('div');
    itemEl.className = 'editor-item';
    itemEl.innerHTML = `
        <input type="text" value="${name}" placeholder="${t('templateEditor.itemNamePlaceholder')}">
        <div class="color-picker-trigger" style="background-color: ${color};" data-color="${color}" title="${t('templateEditor.changeColorTitle')}"></div>
        <button class="remove-btn" title="${t('templateEditor.removeItemTitle')}">-</button>
    `;
    const colorTrigger = itemEl.querySelector('.color-picker-trigger');
    colorTrigger.addEventListener('click', () => {
        showCustomColorPickerDialog(colorTrigger.dataset.color, (newColor) => {
            colorTrigger.style.backgroundColor = newColor;
            colorTrigger.dataset.color = newColor;
        });
    });
    itemEl.querySelector('.remove-btn').onclick = () => {
        itemEl.remove();
        updateItemCount(dialog);
        toggleEditorContainerVisibility(dialog); // Verifica se precisa esconder o container
    };
    editor.appendChild(itemEl);
    updateItemCount(dialog);
}

function updateItemCount(dialog) {
    const count = dialog.querySelector('.editor-container').children.length;
    const isBoard = dialog.id === 'board-template-dialog';
    dialog.querySelector('.items-label').innerHTML = t('templateEditor.itemsLabel', { itemType: (isBoard ? t('templateEditor.column') : t('templateEditor.tag')) + 's', count: count });
    dialog.querySelector('.btn-add-item').disabled = count >= 8;
}

function toggleEditorContainerVisibility(dialog) {
    const editor = dialog.querySelector('.editor-container');
    if (!editor) return;
    const hasItems = editor.children.length > 0;
    editor.classList.toggle('hidden', !hasItems);
}

function saveTemplateFromEditor(dialog, type) {
    const context = JSON.parse(dialog.dataset.context);
    const templateId = dialog.dataset.editingId;
    const name = dialog.querySelector('.template-name-input').value.trim();
    if (!name) {
        showDialogMessage(dialog, t('templateEditor.nameRequired'), 'error');
        return;
    }

    // Validação para templates de grupo
    if (context.ownerType === 'group') {
        const groupId = dialog.querySelector('.template-group-select').value;
        if (!groupId) {
            showDialogMessage(dialog, t('templateEditor.groupRequired'), 'error');
            return;
        }
        context.ownerId = groupId; // Atualiza o ownerId com o grupo selecionado
    }

    const items = Array.from(dialog.querySelectorAll('.editor-container .editor-item')).map(item => ({
        name: item.querySelector('input[type="text"]').value.trim() || t('templateEditor.unnamedItem'),
        color: item.querySelector('.color-picker-trigger').dataset.color
    }));

    if (items.length === 0) {
        showDialogMessage(dialog, t('templateEditor.itemRequired'), 'error');
        return;
    }

    const newTemplateData = {
        id: templateId || `${context.ownerType}-${type}-${Date.now()}`,
        name: name,
        icon: dialog.querySelector('.template-icon-input').value,
        description: dialog.querySelector('.template-desc-input').value.trim()
    };
    if (type === 'board') newTemplateData.columns = items;
    else newTemplateData.tags = items;

    showConfirmationDialog(t('templateEditor.confirmSave'), (confirmDialog) => {
        let success = false;
        if (context.ownerType === 'user') {
            const userId = getCurrentUser().id;
            const getFunc = type === 'board' ? getUserBoardTemplates : getUserTagTemplates;
            const saveFunc = type === 'board' ? saveUserBoardTemplates : saveUserTagTemplates;
            let templates = getFunc(userId);
            const index = templates.findIndex(t => t.id === templateId);
            if (index !== -1) templates[index] = newTemplateData;
            else templates.push(newTemplateData);
            success = saveFunc(userId, templates);
        } else if (context.ownerType === 'group') {
            const group = getGroup(context.ownerId);
            if (group) {
                const templateKey = type === 'board' ? 'boardTemplates' : 'tagTemplates';
                if (!group[templateKey]) group[templateKey] = [];
                const index = group[templateKey].findIndex(t => t.id === templateId);
                if (index !== -1) group[templateKey][index] = newTemplateData;
                else group[templateKey].push(newTemplateData);
                success = saveGroup(group);
            }
        }

        if (success) {
            showDialogMessage(confirmDialog, t('templateEditor.saveSuccess'), 'success');
            // Recarrega a lista de templates na página que chamou
            window.dispatchEvent(new CustomEvent('templatesUpdated'));
            setTimeout(() => dialog.close(), 1500);
            return true;
        } else {
            showDialogMessage(confirmDialog, t('templateEditor.saveError'), 'error');
            return false;
        }
    });
}
