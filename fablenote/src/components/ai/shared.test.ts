import { describe, expect, it } from "vitest";
import { defaultModelForProvider, detectProvider } from "./shared";

describe("detectProvider", () => {
  it("reconnaît le service à la forme de la clé", () => {
    expect(detectProvider("sk-ant-api03-xxx")).toBe("Anthropic");
    expect(detectProvider("sk-proj-xxx")).toBe("OpenAI");
    expect(detectProvider("AIzaSyXXX")).toBe("Gemini");
    expect(detectProvider("gsk_xxx")).toBe("Groq");
    expect(detectProvider("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("Mistral");
    expect(detectProvider("n'importe quoi")).toBe("");
  });
  it("propose un modèle par défaut pour chaque service reconnu", () => {
    for (const p of ["Anthropic", "OpenAI", "Gemini", "Mistral", "Groq"]) expect(defaultModelForProvider(p)).not.toBe("");
    expect(defaultModelForProvider("Inconnu")).toBe("");
  });
});
