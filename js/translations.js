// js/translations.js

import { getCurrentUser } from './auth.js';

let currentLanguage = 'pt-BR';
let dictionary = {};

/**
 * Carrega o arquivo de idioma apropriado.
 * @param {string} lang - O código do idioma (ex: 'pt-BR').
 */
export async function loadLanguage(lang) {
    try {
        // Determina o caminho base correto, não importa onde o script é chamado.
        let basePath = '../locales';
        if (window.location.pathname.endsWith('/') || window.location.pathname.endsWith('index.html')) {
            basePath = 'locales';
        }

        const response = await fetch(`${basePath}/${lang}.json`);
        if (!response.ok) {
            throw new Error(`Falha ao carregar arquivo de idioma: ${lang}`);
        }
        dictionary = await response.json();
        currentLanguage = lang;
        document.documentElement.lang = lang.split('-')[0]; // Define 'pt', 'en', 'es'
    } catch (error) {
        console.error(error);
        // Se falhar, tenta carregar o idioma padrão como fallback.
        if (lang !== 'pt-BR') {
            await loadLanguage('pt-BR');
        }
    }
}

/**
 * Obtém a string traduzida para a chave fornecida.
 * Suporta a substituição de placeholders (ex: {name}).
 * @param {string} key - A chave da tradução (ex: 'ui.save').
 * @param {Object} [replacements={}] - Um objeto com os valores para os placeholders.
 * @returns {string} A string traduzida ou a chave se não for encontrada.
 */
export function t(key, replacements = {}) {
    let translation = dictionary[key] || key;
    for (const placeholder in replacements) {
        // Usa uma RegExp global para substituir todas as ocorrências do placeholder
        const regex = new RegExp(`\\{${placeholder}\\}`, 'g');
        translation = translation.replace(regex, replacements[placeholder]);
    }
    return translation;
}

/**
 * Aplica as traduções a todos os elementos com o atributo `data-i18n`.
 */
export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);

        // Remove apenas os nós de texto antigos para evitar duplicatas, preservando ícones em <span> ou outros elementos.
        const nodesToRemove = [];
        el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                nodesToRemove.push(node);
            }
        });
        nodesToRemove.forEach(node => node.remove());

        // Adiciona o novo texto traduzido. Se houver um ícone, ele será adicionado após.
        const textNode = document.createTextNode(' ' + translation);
        el.appendChild(textNode);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    // Atualiza o título da página
    const pageTitleEl = document.querySelector('title[data-i18n-title]');
    if (pageTitleEl) {
        const key = pageTitleEl.getAttribute('data-i18n-title');
        document.title = t(key);
    }
}

/**
 * Inicializa o sistema de tradução carregando o idioma do usuário.
 */
export async function initTranslations() {
    const user = await getCurrentUser();
    // 1. Prioridade: Idioma salvo no perfil do usuário logado.
    // 2. Fallback: Idioma salvo no localStorage (escolhido na tela de login por um visitante).
    // 3. Fallback final: Português do Brasil como padrão.
    const lang = user?.language || localStorage.getItem('appLanguage') || 'pt-BR';
    await loadLanguage(lang);
    applyTranslations();
}