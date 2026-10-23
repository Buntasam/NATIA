// English version of legalContent.ts: same chapters and topics, same order.

import type { ManualChapter } from "../settings/manualContent";

export const LEGAL_EN: ManualChapter[] = [
  // ─── Terms of use ──────────────────────────────────────────────────────────
  {
    id: "terms",
    title: "Terms of use",
    topics: [
      {
        title: "1. Purpose and acceptance",
        blocks: [
          { p: "These terms govern the use of NATIA, a note-taking app that runs on your computer. They must be accepted on first launch, after the app is reset, and whenever their content changes. If you don't accept them, don't use NATIA." },
          { p: "Last updated: October 23, 2026." },
        ],
      },
      {
        title: "2. Publisher",
        blocks: [
          { p: "NATIA is developed and published on a personal, non-commercial basis by **Buntasam** (the “Author”). Contact: the “issues” of the official GitHub repository." },
          { links: [{ label: "github.com/Buntasam/NATIA", url: "https://github.com/Buntasam/NATIA" }] },
        ],
      },
      {
        title: "3. Licence",
        blocks: [
          { p: "NATIA is free. Its use is governed by the licence of the official repository (`LICENSE` file): personal, non-commercial use, readable source code, changes for your own use only. Resale, redistribution and any commercial use are forbidden without the Author's written consent. If they conflict, the licence prevails over these terms regarding rights in the software." },
        ],
      },
      {
        title: "4. Beta version, provided as is",
        blocks: [
          { p: "NATIA is under active development. It is provided **“as is”**, with no warranty of operation, availability or fitness for a particular purpose. Bugs may occur, including data loss." },
        ],
      },
      {
        title: "5. Your data, your backups",
        blocks: [
          { list: [
            "Your notes stay on your computer: the Author has no access to them and cannot recover them for you.",
            "You are responsible for backing them up (Settings → Data → ZIP export).",
            "If you set a password, keep it, along with your recovery key, somewhere safe: without them, encrypted notes are **permanently unreadable**, for you and for the Author.",
          ] },
        ],
      },
      {
        title: "6. Artificial intelligence",
        blocks: [
          { list: [
            "AI answers (summaries, corrections, sorting, translations…) can be wrong, incomplete or unsuitable. Check them before applying them, and don't rely on them alone for a medical, legal, financial or safety decision.",
            "Online AI services (Anthropic, OpenAI, Google, Mistral) are provided by third parties under their own terms. API keys, their use and any costs are your responsibility.",
            "Models downloaded for the built-in AI have their own licence (Gemma Terms of Use, MIT, Apache 2.0), shown next to each model. By downloading a model, you accept its licence.",
          ] },
        ],
      },
      {
        title: "7. Lawful use",
        blocks: [
          { p: "You agree to use NATIA in accordance with the law. If your notes contain other people's personal data, you are responsible for respecting their rights, especially before sending those notes to an online AI." },
        ],
      },
      {
        title: "8. Liability",
        blocks: [
          { p: "To the fullest extent permitted by law, the Author shall not be liable for any direct or indirect damage resulting from the use of, or inability to use, NATIA, including data loss, nor for the operation of third-party services. Nothing in these terms limits the rights the law guarantees you and that cannot be waived." },
        ],
      },
      {
        title: "9. Updates and changes to the terms",
        blocks: [
          { p: "NATIA may offer updates; installing them is your choice. These terms may change: the new version will be shown at the next launch and must be accepted to keep using the app." },
        ],
      },
      {
        title: "10. Governing law",
        blocks: [
          { p: "These terms are governed by French law. In case of disagreement, contact the Author first to seek an amicable solution. If you are a consumer, you keep the benefit of the protective rules of your country of residence." },
        ],
      },
    ],
  },

  // ─── Privacy policy ────────────────────────────────────────────────────────
  {
    id: "privacy",
    title: "Privacy policy",
    topics: [
      {
        title: "1. In short",
        blocks: [
          { list: [
            "NATIA **collects no data**: no account, no usage statistics, no ads, no trackers. The Author receives nothing you write.",
            "Everything is stored on your computer. Data only leaves it when you use a feature that needs it (list below).",
            "For sensitive notes, use the built-in AI or Ollama: nothing is then sent over the internet.",
          ] },
          { p: "Last updated: October 23, 2026." },
        ],
      },
      {
        title: "2. What is stored on your computer",
        blocks: [
          { p: "In `%APPDATA%\\com.natia.app`: notes (titles, content, tags, folders, colours), their attached files, their version history, the AI memory, AI conversation history, settings and the built-in AI models. Display preferences (language, theme…) are kept by the app window." },
          { list: [
            "With a password, notes, titles, tags, attached files and API keys are encrypted (AES-256-GCM, key derived with Argon2id). Sticky notes stay in clear text. To open an attached file, a decrypted copy is placed in the Windows temporary folder, erased when locking and closing.",
            "Without a password, API keys are stored in the Windows Credential Manager and everything else is in clear text in the local database.",
            "The debug log, if enabled, stays on your computer.",
          ] },
        ],
      },
      {
        title: "3. When data leaves your computer",
        blocks: [
          { table: { head: ["Feature", "Recipient", "Data sent", "When"], rows: [
            ["Online AI", "Anthropic, OpenAI, Google or Mistral (your choice)", "The text submitted to the AI (note, selection, conversation, system prompt, AI memory if enabled, excerpts of the notes found in “All my notes” mode) and your API key", "Only when you run an AI action with that provider"],
            ["Claude Code CLI", "Anthropic, through your Claude account", "The same", "Same"],
            ["Built-in AI, Ollama", "No one (processed on your PC)", "—", "—"],
            ["Built-in AI setup", "GitHub (engine), Hugging Face (models)", "Technical connection data (IP address, software)", "Once, when downloading"],
            ["Update check", "GitHub", "Technical connection data", "At startup or on request; can be turned off (Settings → Application)"],
            ["Voice dictation", "Microsoft, if Windows / Edge speech recognition uses its online services", "Microphone audio during dictation", "Only while dictating"],
            ["External links", "The site opened in your browser", "Depends on that site", "When you click a link"],
            ["Automatic backup", "The folder you choose (and the service that syncs it, such as OneDrive)", "An archive of all notes and attached files, password-protected if you set one", "At the chosen frequency, if you turn it on"],
            ["Sync between PCs", "The shared folder you choose (and the service that syncs it)", "Notes and attached files, always encrypted with the sync password", "Every 5 minutes, if you turn it on"],
          ] } },
          { p: "These third parties process data under their own privacy policy, sometimes outside the European Union:" },
          { links: [
            { label: "Anthropic", url: "https://www.anthropic.com/legal/privacy" },
            { label: "OpenAI", url: "https://openai.com/policies/privacy-policy" },
            { label: "Google", url: "https://policies.google.com/privacy" },
            { label: "Mistral AI", url: "https://legal.mistral.ai/terms/privacy-policy" },
            { label: "GitHub", url: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" },
            { label: "Hugging Face", url: "https://huggingface.co/privacy" },
            { label: "Microsoft", url: "https://privacy.microsoft.com/" },
          ] },
          { warn: "What you post on GitHub to report a bug is public: don't paste the content of your notes there." },
        ],
      },
      {
        title: "4. Who is responsible for what",
        blocks: [
          { list: [
            "The Author neither collects nor processes your personal data: they are not a data controller under the GDPR for your notes.",
            "Your notes belong to you. Strictly personal use falls under the GDPR “household” exemption (Article 2); if you keep other people's data in them, it's up to you to respect their rights.",
            "When you use an online AI, the chosen provider processes the text sent under its own terms. Avoid sending sensitive data (health, opinions, other people's data) there without good reason.",
          ] },
        ],
      },
      {
        title: "5. Retention",
        blocks: [
          { p: "Your data stays on your computer until you delete it. Automatic versions of a note are grouped into 5-minute slots; named versions are kept until you delete them. Retention by an online AI provider depends on its own policy." },
        ],
      },
      {
        title: "6. Your rights (GDPR)",
        blocks: [
          { table: { head: ["Right", "How to exercise it in NATIA"], rows: [
            ["Access and portability", "Settings → Data → ZIP export (all notes), or export a single note as Markdown, text or HTML"],
            ["Rectification", "Edit your notes and settings directly"],
            ["Erasure", "Delete a note, or Settings → Data → **Reset the app** to erase everything; before uninstalling NATIA, also delete its data folder (Settings → Data → Uninstall)"],
            ["Objection", "Don't use online AI, turn off the update check"],
          ] } },
          { p: "For data sent to an AI provider, contact that provider. You can also lodge a complaint with the CNIL, the French data protection authority, or with the authority of your country." },
          { links: [{ label: "CNIL", url: "https://www.cnil.fr/en/home" }] },
        ],
      },
      {
        title: "7. Security",
        blocks: [
          { p: "NATIA protects your data with encryption (if a password is set), automatic locking and verification of downloaded files (SHA-256 fingerprint, signed updates). The security of your computer (Windows session, antivirus, backups) remains your responsibility." },
        ],
      },
      {
        title: "8. Changes",
        blocks: [
          { p: "This policy may change along with the app. Any substantial change will be shown at the next launch and must be accepted." },
        ],
      },
    ],
  },
];
