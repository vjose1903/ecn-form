"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.concatWords = concatWords;
function concatWords(words) {
    // Validar entrada
    if (!Array.isArray(words)) {
        console.warn("concatWords: La entrada debe ser un array");
        return "";
    }
    // Filtrar elementos vacíos, null, undefined y convertir a string
    const validWords = words
        .filter((word) => word != null && word !== "")
        .map((word) => String(word).trim())
        .filter((word) => word.length > 0);
    // Casos especiales
    if (validWords.length === 0)
        return "";
    if (validWords.length === 1)
        return validWords[0];
    if (validWords.length === 2) {
        const [first, second] = validWords;
        // Aplicar regla fonética: si el segundo nombre empieza por i, y, o, hi, usar "e"
        const secondLower = second.toLowerCase();
        const startsWithVowel = secondLower.startsWith("i") || secondLower.startsWith("y") || secondLower.startsWith("hi");
        const conjunction = startsWithVowel ? "e" : "y";
        return `${first} ${conjunction} ${second}`;
    }
    // Para más de 2 palabras, usar coma y "y" al final
    const lastWord = validWords[validWords.length - 1];
    const otherWords = validWords.slice(0, -1);
    // Verificar si la última palabra empieza por vocal para usar "e"
    const lastWordLower = lastWord.toLowerCase();
    const lastStartsWithVowel = lastWordLower.startsWith("i") || lastWordLower.startsWith("y") || lastWordLower.startsWith("hi");
    const conjunction = lastStartsWithVowel ? "e" : "y";
    return `${otherWords.join(", ")} ${conjunction} ${lastWord}`;
}
//# sourceMappingURL=concatWords.js.map