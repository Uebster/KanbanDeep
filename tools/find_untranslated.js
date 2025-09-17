const fs = require('fs');
const path =require('path');
const cheerio = require('cheerio');

// Diretório onde os arquivos HTML estão localizados
const pagesDir = path.join(__dirname, '..', 'pages');

// Atributos que devem ser traduzidos
const translatableAttributes = ['placeholder', 'title'];

// Tags a serem ignoradas completamente
const ignoredTags = ['script', 'style'];

// IDs de selects cujas opções não devem ser traduzidas
const ignoredSelectIds = ['font-family', 'pref-font-family'];

/**
 * Função principal para encontrar textos não traduzidos.
 */
async function findUntranslatedTexts() {
    console.log('🔍 Iniciando varredura aprimorada por textos não traduzidos...');
    const findings = [];

    try {
        const files = fs.readdirSync(pagesDir).filter(file => file.endsWith('.html'));

        for (const file of files) {
            const filePath = path.join(pagesDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const $ = cheerio.load(content);

            // 1. Encontrar nós de texto que não estão sob controle do i18n
            $('body *').each((_, element) => {
                const el = $(element);

                if (ignoredTags.includes(el.prop('tagName').toLowerCase())) {
                    return;
                }

                el.contents().each((_, node) => {
                    if (node.type === 'text') {
                        const trimmedText = node.data.trim();
                        if (trimmedText.length === 0) return;

                        const parent = $(node).parent();

                        // --- NOVAS REGRAS DE EXCLUSÃO ---

                        // Regra 1: Ignora se o elemento ou qualquer ancestral já tem data-i18n
                        if (parent.closest('[data-i18n]').length > 0) return;

                        // Regra 2: Ignora se o elemento pai tem um ID (provavelmente conteúdo dinâmico)
                        if (parent.attr('id')) return;

                        // Regra 3: Ignora se for um ícone/emoji único
                        if (/^[^a-zA-Z0-9\s]$/.test(trimmedText) && trimmedText.length === 1) return;

                        // Regra 4: Ignora opções de fontes
                        const parentSelect = parent.closest('select');
                        if (parent.prop('tagName').toLowerCase() === 'option' && parentSelect.length > 0) {
                            const selectId = parentSelect.attr('id');
                            if (selectId && ignoredSelectIds.includes(selectId)) {
                                return;
                            }
                        }
                        
                        // Se passou por todas as regras, é um achado válido
                        findings.push({
                            file,
                            type: 'Texto',
                            text: trimmedText,
                            element: `<${parent.prop('tagName').toLowerCase()}>`
                        });
                    }
                });

                // 2. Encontrar atributos (placeholder, title) não traduzidos
                translatableAttributes.forEach(attr => {
                    if (el.attr(attr) && !el.attr(`data-i18n-${attr}`)) {
                        findings.push({
                            file,
                            type: `Atributo '${attr}'`,
                            text: el.attr(attr),
                            element: `<${el.prop('tagName').toLowerCase()}>`
                        });
                    }
                });
            });
        }

        // Exibir os resultados
        if (findings.length > 0) {
            console.log(`\n🚨 Foram encontrados ${findings.length} textos/atributos não traduzidos:\n`);
            const findingsByFile = findings.reduce((acc, finding) => {
                acc[finding.file] = acc[finding.file] || [];
                acc[finding.file].push(finding);
                return acc;
            }, {});

            for (const file in findingsByFile) {
                console.log(`--- Arquivo: ${file} ---`);
                findingsByFile[file].forEach(f => {
                    console.log(`  - [${f.type}] em ${f.element}: "${f.text}"`);
                });
                console.log('');
            }
        } else {
            console.log('\n🎉 Excelente! Nenhum texto não traduzido foi encontrado.');
        }

    } catch (error) {
        console.error('❌ Ocorreu um erro durante a varredura:', error);
    }
}

findUntranslatedTexts();
