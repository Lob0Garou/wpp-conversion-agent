const fs = require('fs');
const path = require('path');

async function main() {
    const filePath = "C:\\Users\\yuriq\\Downloads\\Estoque Esperado 178.csv";

    if (!fs.existsSync(filePath)) {
        console.error("Arquivo não encontrado:", filePath);
        process.exit(1);
    }

    console.log("Lendo arquivo...", filePath);
    const fileContent = fs.readFileSync(filePath);
    const blob = new Blob([fileContent], { type: 'text/csv' });

    const formData = new FormData();
    formData.append("file", blob, "Estoque Esperado 178.csv");

    console.log("Enviando para API...");
    try {
        const response = await fetch("http://localhost:8080/api/inventory/upload", {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        console.log("Status:", response.status);
        console.log("Resultado:", JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("Erro na requisição:", error);
    }
}

main();
