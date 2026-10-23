# Composants tiers — NATIA

NATIA ne contient pas ces composants dans son installeur : ils sont téléchargés à la demande, depuis leur source officielle, quand l'utilisateur installe l'IA intégrée (Paramètres → Intelligence artificielle). Chaque fichier est vérifié par son empreinte SHA-256, figée dans `fablenote/src-tauri/src/llm.rs`.

## Moteur

| Composant | Version | Source | Licence |
|---|---|---|---|
| llama.cpp (`llama-server`, build Vulkan pour Windows x64) | b11476 | https://github.com/ggml-org/llama.cpp | MIT — Copyright (c) 2023-2026 The ggml authors |
| LLVM OpenMP (`libomp.dll`, fourni avec llama.cpp) | — | https://openmp.llvm.org | Apache 2.0 avec exception LLVM |

## Modèles

| Modèle | Fichier | Source | Licence |
|---|---|---|---|
| Gemma 3 1B, 4B et 12B (instruction) | `gemma-3-*-it-Q4_K_M.gguf` | https://huggingface.co/ggml-org | Gemma Terms of Use — https://ai.google.dev/gemma/terms |
| Phi-4 mini (instruction) | `Phi-4-mini-instruct-Q4_K_M.gguf` | https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF | MIT |
| Mistral 7B Instruct v0.3 | `Mistral-7B-Instruct-v0.3-Q4_K_M.gguf` | https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF | Apache 2.0 |

En téléchargeant un modèle, l'utilisateur accepte sa licence ; l'interface affiche un lien vers chacune.

## Mettre à jour le moteur ou un modèle

1. Choisir une version publiée depuis au moins deux semaines.
2. Relever l'URL exacte et l'empreinte SHA-256 (champ `digest` de l'API GitHub pour llama.cpp, champ `lfs.sha256` de l'API Hugging Face pour un modèle) et la taille en octets.
3. Mettre à jour `ENGINE_*` ou `CATALOG` dans `llm.rs`, ce tableau et le manuel (`manualContent.ts` et `manualContent.en.ts`).
4. Vérifier en local que `llama-server --version` démarre et qu'un message en français reçoit une réponse.
