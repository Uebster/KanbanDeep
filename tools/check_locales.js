const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../locales');
const referenceFile = 'en-US.json';
const referenceFilePath = path.join(localesDir, referenceFile);

console.log('Iniciando verificação dos arquivos de tradução...\n');

if (!fs.existsSync(referenceFilePath)) {
    console.error(`❌ Arquivo de referência "${referenceFile}" não encontrado em ${localesDir}`);
    process.exit(1);
}

const referenceContent = fs.readFileSync(referenceFilePath, 'utf8');
let referenceKeys;
let referenceLines;
try {
    // Tenta fazer o parse para garantir que é um JSON válido
    JSON.parse(referenceContent);
    referenceKeys = Object.keys(JSON.parse(referenceContent));
    referenceLines = referenceContent.split(/\r?\n/);
} catch (e) {
    console.error(`❌ Erro de sintaxe no arquivo de referência "${referenceFile}": ${e.message}`);
    process.exit(1);
}

console.log(`Arquivo de referência: ${referenceFile} (${referenceKeys.length} chaves)`);

// Função para extrair a chave de uma linha do JSON
const getKeyFromLine = (line) => {
    const match = line.match(/"(.*?)"\s*:/);
    return match ? match[1] : null;
};

// Verifica se o arquivo de referência está em ordem alfabética
const sortedReferenceKeys = [...referenceKeys].sort((a, b) => a.localeCompare(b));
if (JSON.stringify(referenceKeys) !== JSON.stringify(sortedReferenceKeys)) {
    console.log(`\n⚠️  Atenção: O arquivo de referência "${referenceFile}" não está em ordem alfabética.`);
}

const files = fs.readdirSync(localesDir);
let allOk = true;

files.forEach(file => {
    if (file === referenceFile || !file.endsWith('.json')) {
        return;
    }

    console.log(`\n--- Verificando: ${file} ---`);
    const filePath = path.join(localesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    let targetKeys;
    let targetLines;

    try {
        const parsedContent = JSON.parse(content);
        targetKeys = Object.keys(parsedContent);
        targetLines = content.split(/\r?\n/);
    } catch (e) {
        console.error(`❌ Erro de sintaxe em "${file}": ${e.message}`);
        allOk = false;
        return;
    }

    // 1. Verificação de consistência de chaves (chaves faltantes/extras)
    const missingKeys = referenceKeys.filter(k => !targetKeys.includes(k));
    const extraKeys = targetKeys.filter(k => !referenceKeys.includes(k));

    let keysOk = true;
    if (missingKeys.length > 0) {
        console.error(`❌ Chaves faltando em "${file}":\n   - ${missingKeys.join('\n   - ')}`);
        keysOk = false;
        allOk = false;
    }
    if (extraKeys.length > 0) {
        console.error(`❌ Chaves extras em "${file}":\n   - ${extraKeys.join('\n   - ')}`);
        keysOk = false;
        allOk = false;
    }
    if (keysOk) {
        console.log('✅ Consistência de chaves: OK.');
    }

    // 2. NOVA VERIFICAÇÃO: Ordem das chaves linha por linha
    let orderOk = true;
    const minLines = Math.min(referenceLines.length, targetLines.length);

    for (let i = 0; i < minLines; i++) {
        const refKey = getKeyFromLine(referenceLines[i]);
        const targetKey = getKeyFromLine(targetLines[i]);

        // Compara apenas se ambas as linhas contêm chaves
        if (refKey && targetKey && refKey !== targetKey) {
            console.error(`❌ Ordem divergente na linha ${i + 1} de "${file}". Esperado: "${refKey}", Encontrado: "${targetKey}".`);
            orderOk = false;
            allOk = false;
            break; // Para no primeiro erro de ordem
        }
    }

    if (orderOk && referenceLines.length !== targetLines.length) {
         console.error(`❌ Número de linhas diferente em "${file}". Referência: ${referenceLines.length}, Atual: ${targetLines.length}.`);
         orderOk = false;
         allOk = false;
    }

    if (orderOk) {
        console.log('✅ Ordem das chaves: OK.');
    }
});

console.log('\n---');
if (allOk) {
    console.log('✅ Verificação concluída. Todos os arquivos estão consistentes!');
} else {
    console.error('🚨 Foram encontradas inconsistências. Por favor, revise os logs acima.');
    process.exit(1); // Sai com código de erro para falhar em pipelines de CI/CD
}
