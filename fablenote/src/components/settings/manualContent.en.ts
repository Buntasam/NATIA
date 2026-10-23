// English manual (Settings → Manual). Same structure as manualContent.ts.
// Keep both files in sync when a feature changes.

import type { ManualChapter } from "./manualContent";

export const MANUAL_EN: ManualChapter[] = [
  // ─── Getting started ──────────────────────────────────────────────────────
  {
    id: "start",
    title: "Getting started",
    topics: [
      {
        title: "Create and save a note",
        blocks: [
          { steps: [
            "Press `Ctrl+N` (or the **New note** button in the sidebar) to create a note.",
            "Type the title at the top, then the content below.",
            "The note saves itself. The mode is set in the version history (`Ctrl+Shift+H`): automatic (1.5 s), balanced (5 s) or manual. `Ctrl+S` saves at any time.",
          ] },
          { tip: "When you quit the app, the current note is saved first." },
        ],
      },
      {
        title: "Organise with folders and tags",
        blocks: [
          { list: [
            "**New folder**: folder button at the top of the list. Folders can be nested.",
            "**Move**: drag a note or a folder onto another folder.",
            "**Colour**: right-click a folder or a note.",
            "**Tags**: at the bottom of the note, “+ add a tag” field. Click a tag to filter notes.",
          ] },
        ],
      },
      {
        title: "Trash",
        blocks: [
          { p: "A deleted note or folder goes to the trash (button at the bottom of the sidebar). You can restore it or delete it permanently." },
        ],
      },
      {
        title: "App language",
        blocks: [
          { p: "Settings → Appearance → **Language**: French or English. On first launch, NATIA uses the Windows language." },
          { p: "The default AI prompts switch language too. Prompts you wrote yourself are left untouched, and so is the content of your notes." },
          { tip: "For prompts (and therefore answers) in a different language from the interface: Settings → Prompts → **Prompt language**, or the small flags next to “System prompt” in the AI panel (`Ctrl+Shift+A`)." },
        ],
      },
    ],
  },

  // ─── Editor ───────────────────────────────────────────────────────────────
  {
    id: "editor",
    title: "Editor",
    topics: [
      {
        title: "Formatting",
        blocks: [
          { p: "The toolbar above the note offers: headings, bold, italic, underline, strikethrough, highlight, colours, lists, checkboxes, quotes, code blocks, links, images and tables." },
          { p: "Markdown also works as you type: `# ` for a heading, `- ` for a list, `[ ] ` for a checkbox, `**text**` for bold. Type `/` to open the insert menu." },
          { tip: "Pasted or inserted images are automatically reduced (1600 px max) so the database stays light." },
        ],
      },
      {
        title: "Links between notes (wikilinks)",
        blocks: [
          { steps: [
            "Type `[[` then a note's title, for example `[[Monday meeting]]`.",
            "Click the link to open the note.",
            "The “Links and backlinks” button at the top of the note shows the notes that point to it.",
          ] },
        ],
      },
      {
        title: "Reminders",
        blocks: [
          { steps: [
            "“Insert a reminder” button in the toolbar.",
            "Write the reminder text and choose the date and time.",
            "When it's due, Windows shows a notification. NATIA must be running, possibly tucked next to the clock (see “Startup and closing”).",
          ] },
        ],
      },
      {
        title: "Sticky notes",
        blocks: [
          { list: [
            "**In a note**: “Insert a sticky note” button in the toolbar.",
            "**On the lock screen**: “Sticky note” button at the bottom right. They can be moved, resized from the bottom-right corner and hidden with the eye icon.",
            "The Sticky notes button in the sidebar shows them from within the app.",
          ] },
          { warn: "Lock-screen sticky notes are not encrypted: don't put anything confidential on them." },
        ],
      },
      {
        title: "Focus mode and find in note",
        blocks: [
          { list: [
            "**Focus mode**: button at the top of the note, hides the sidebar. `Esc` to leave.",
            "**Find / replace** in the note: `Ctrl+F`.",
          ] },
        ],
      },
      {
        title: "Export a note",
        blocks: [
          { p: "“More actions” menu (⋯) at the top of the note: export as Markdown, plain text, HTML or PDF. For PDF, choose “Microsoft Print to PDF” in the print window." },
        ],
      },
    ],
  },

  // ─── Navigation ───────────────────────────────────────────────────────────
  {
    id: "nav",
    title: "Search and navigation",
    topics: [
      {
        title: "Find a note",
        blocks: [
          { list: [
            "**Quick open** `Ctrl+P`: type a few letters of the title, then `Enter`. Type `>` to run a command (theme, trash, lock…).",
            "**Global search** `Ctrl+Shift+F`: searches titles and content, ignoring case and accents.",
            "`Alt+←` / `Alt+→`: previous / next note.",
          ] },
        ],
      },
      {
        title: "Views",
        blocks: [
          { list: [
            "**Tree view**: a map of all folders and notes.",
            "**Graph** (`Ctrl+G`): notes linked by wikilinks.",
            "**Calendar**: notes by last edit date.",
          ] },
        ],
      },
      {
        title: "Version history",
        blocks: [
          { p: "`Ctrl+Shift+H` opens the history: compare two versions or restore one. Automatic saves are grouped into 5-minute slots, and each note keeps up to 200 versions." },
        ],
      },
      {
        title: "Keyboard shortcuts",
        blocks: [
          { table: { head: ["Shortcut", "Action"], rows: [
            ["Ctrl+N", "New note"],
            ["Ctrl+P", "Quick open"],
            ["Ctrl+F", "Find in note"],
            ["Ctrl+Shift+F", "Global search"],
            ["Ctrl+,", "Settings"],
            ["Ctrl+G", "Graph"],
            ["Ctrl+Shift+A", "AI panel"],
            ["Ctrl+Shift+H", "Version history"],
            ["Ctrl+/", "Shortcut list"],
            ["Esc", "Close the panel / leave focus mode"],
          ] } },
        ],
      },
    ],
  },

  // ─── Choosing an AI ───────────────────────────────────────────────────────
  {
    id: "ai-choice",
    title: "AI: which option to choose?",
    topics: [
      {
        title: "Comparison",
        blocks: [
          { table: { head: ["Option", "Cost", "Privacy", "You need"], rows: [
            ["Built-in AI (recommended)", "Free", "Nothing leaves your PC", "One click, 1 to 3 GB to download"],
            ["Ollama (local)", "Free", "Nothing leaves your PC", "Install Ollama separately"],
            ["Claude, OpenAI, Gemini, Mistral (API)", "Pay as you go (Gemini and Mistral have a limited free tier)", "The text is sent to the provider", "An API key"],
            ["Claude Code CLI", "Included in a Claude subscription", "The text is sent to Anthropic", "Node.js and a subscription"],
          ] } },
          { tip: "For sensitive notes, use the built-in AI (or Ollama). For the best answer quality, an online API." },
        ],
      },
    ],
  },

  // ─── Built-in AI ──────────────────────────────────────────────────────────
  {
    id: "local-ai",
    title: "Built-in AI (recommended)",
    topics: [
      {
        title: "Install in one click",
        blocks: [
          { steps: [
            "Settings → Artificial intelligence → **Install the built-in AI**.",
            "NATIA downloads the llama.cpp engine (33 MB), checks your PC, then downloads the recommended model.",
            "When it's done, the built-in AI is selected automatically: open the AI panel (`Ctrl+Shift+A`) to try it.",
          ] },
          { p: "Everything runs on your PC: no text is sent over the internet. The connection is only used for the one-time download." },
          { tip: "The first message loads the model into memory: a few seconds with a graphics card, up to a minute without." },
        ],
      },
      {
        title: "Choose another model",
        blocks: [
          { p: "In the same section, each model can be downloaded, used or deleted. The “Recommended for this PC” badge takes your RAM and graphics card into account." },
          { table: { head: ["Model", "Size", "For"], rows: [
            ["Gemma 3 1B", "0.8 GB", "Modest PC (8 GB of RAM)"],
            ["Gemma 3 4B", "2.5 GB", "16 GB of RAM or a small graphics card"],
            ["Phi-4 mini", "2.5 GB", "Alternative to Gemma 3 4B"],
            ["Mistral 7B", "4.4 GB", "Graphics card with 6 GB or more"],
            ["Gemma 3 12B", "7.3 GB", "Graphics card with 10 GB or more"],
          ] } },
        ],
      },
      {
        title: "Security and disk space",
        blocks: [
          { list: [
            "The engine and models only come from their official sources (llama.cpp's GitHub, Hugging Face) and are checked against their fingerprint before use.",
            "The engine can only be reached from this PC, with a secret key changed at every start, and it stops with NATIA.",
            "Files live in `%APPDATA%\\com.natia.app\\llm`. Delete a model from the settings to free up space.",
          ] },
        ],
      },
    ],
  },

  // ─── Ollama ───────────────────────────────────────────────────────────────
  {
    id: "ollama",
    title: "Ollama (local alternative)",
    topics: [
      {
        title: "1. Install Ollama",
        blocks: [
          { steps: [
            "Download Ollama for Windows from the official website.",
            "Run `OllamaSetup.exe` and follow the installer.",
            "Ollama starts on its own: a llama icon appears next to the Windows clock.",
            "To check, open a terminal (Windows key, type `cmd`) and type:",
          ] },
          { code: "ollama --version" },
          { links: [{ label: "Download Ollama", url: "https://ollama.com/download" }] },
        ],
      },
      {
        title: "2. Pick a model that suits your PC",
        blocks: [
          { p: "A model too big for your machine can take minutes to answer, or not start at all. To see your RAM: `Ctrl+Shift+Esc` → Performance → Memory. For the graphics card: same tab, GPU." },
          { table: { head: ["Your PC", "Suggested models", "Size"], rows: [
            ["8 GB of RAM, no graphics card", "gemma3:1b, qwen2.5:1.5b", "≈ 1 GB"],
            ["16 GB of RAM", "phi4-mini, llama3.2:3b, gemma3:4b", "2 to 3 GB"],
            ["Graphics card with 8 GB of video memory or more", "mistral, llama3.1:8b", "4 to 5 GB"],
          ] } },
          { links: [{ label: "Model library", url: "https://ollama.com/library" }] },
        ],
      },
      {
        title: "3. Download the model",
        blocks: [
          { p: "Two ways to do it:" },
          { list: [
            "**From NATIA**: AI panel (`Ctrl+Shift+A`) → Ollama → **+** button next to the model picker, type the name (for example `gemma3:1b`) and start the download.",
            "**From a terminal**:",
          ] },
          { code: "ollama pull gemma3:1b" },
          { p: "To see installed models: `ollama list`. To remove one: `ollama rm model-name`." },
        ],
      },
      {
        title: "4. Set up NATIA",
        blocks: [
          { steps: [
            "Settings → Artificial intelligence → Provider: **Ollama**.",
            "Server URL: leave `http://localhost:11434`.",
            "Default model: the name of the downloaded model, for example `gemma3:1b`.",
            "Click **Save**, then open the AI panel to try it.",
          ] },
        ],
      },
      {
        title: "Common problems",
        blocks: [
          { list: [
            "**“Connection refused” or no model listed**: Ollama isn't running. Start it from the Start menu, then click the Refresh button in the AI panel.",
            "**Very slow answers**: pick a smaller model (see the table).",
            "**“model not found”**: the name in NATIA must be exactly the one shown by `ollama list`.",
            "**Disk space**: models live in `C:\\Users\\<you>\\.ollama\\models`. Remove unused ones with `ollama rm`.",
          ] },
        ],
      },
    ],
  },

  // ─── Online APIs ──────────────────────────────────────────────────────────
  {
    id: "api",
    title: "Online AI (API keys)",
    topics: [
      {
        title: "1. Get an API key",
        blocks: [
          { steps: [
            "Create an account with the provider you chose.",
            "Add a payment method or credit if the provider asks for it (Claude and OpenAI do).",
            "Create an API key and copy it right away: it's often shown only once.",
          ] },
          { links: [
            { label: "Claude (Anthropic)", url: "https://console.anthropic.com/settings/keys" },
            { label: "OpenAI", url: "https://platform.openai.com/api-keys" },
            { label: "Gemini (Google)", url: "https://aistudio.google.com/apikey" },
            { label: "Mistral", url: "https://console.mistral.ai/api-keys" },
          ] },
          { warn: "An API key gives access to your paid account: don't share it. Set a spending limit in the provider's console." },
        ],
      },
      {
        title: "2. Add the key to NATIA",
        blocks: [
          { steps: [
            "Settings → Artificial intelligence → **API keys & connections**.",
            "Add a connection: name, provider, key, colour and model.",
            "In the AI panel, pick the connection in the selector, then click **Test** to check the key.",
          ] },
          { p: "You can save several keys (for example a personal one and a work one) and switch between them. Keys are stored in Windows Credential Manager." },
          { tip: "An “Online AI” banner reminds you when your notes' text goes to an outside provider." },
        ],
      },
    ],
  },

  // ─── Claude Code CLI ──────────────────────────────────────────────────────
  {
    id: "cli",
    title: "Claude Code CLI (Claude subscription)",
    topics: [
      {
        title: "Install and sign in",
        blocks: [
          { p: "With a Claude subscription (Pro or Max), NATIA can use Claude without an API key, through the Claude Code command-line tool." },
          { steps: [
            "Install Node.js (LTS version) from the official website.",
            "Open a terminal and install Claude Code:",
          ] },
          { code: "npm install -g @anthropic-ai/claude-code" },
          { steps: [
            "Run `claude` in the terminal and sign in to your Claude account.",
            "In NATIA: Settings → Artificial intelligence → Provider: **Claude CLI**, then **Check the installation**.",
          ] },
          { links: [{ label: "Download Node.js", url: "https://nodejs.org/" }] },
          { tip: "If the check fails right after installing, restart NATIA so it finds the `claude` command." },
        ],
      },
    ],
  },

  // ─── Using the AI ─────────────────────────────────────────────────────────
  {
    id: "ai-use",
    title: "Using the AI in NATIA",
    topics: [
      {
        title: "The AI panel",
        blocks: [
          { p: "`Ctrl+Shift+A` or the AI button at the top of the note. Actions apply to the open note:" },
          { list: [
            "**Correct**: spelling and grammar, with changes highlighted before applying.",
            "**Summarise**, **Rename** (gives the note a title), **Sort all notes** (suggests a folder for each note).",
            "**Translate**, **Formalise** (rewrites as an email), **Continue** the text.",
          ] },
        ],
      },
      {
        title: "Chat",
        blocks: [
          { p: "Chat with the AI, with the open note as context. Chat history length is set in Settings → Artificial intelligence." },
          { p: "Conversations are saved (encrypted if a password is set) and listed to the right of the chat: click one to resume it, the pencil (or double-click) to rename it, the bin (twice) to delete it, and **New** to start another. The **Search** field filters conversations by their content. Opening a note resumes its last conversation." },
          { p: "The button next to **New** inserts the whole conversation into the open note." },
        ],
      },
      {
        title: "Attach files",
        blocks: [
          { steps: [
            "In a note, click the **paperclip** in the toolbar and choose one or more files (100 MB maximum each).",
            "A “📎 file name” chip appears in the note: click it to open the file with its app.",
          ] },
          { p: "**Linked files** (paperclip at the bottom of the sidebar) lists every attached file: search, open, **Save as…**, delete and go to the note." },
          { p: "Files are stored with your notes, encrypted if a password is set, and included in exports, backups and sync. Permanently deleting a note deletes its files." },
        ],
      },
      {
        title: "Ask all your notes",
        blocks: [
          { steps: [
            "Open the chat (`Ctrl+Shift+A`, then **Chat**).",
            "At the start of a conversation, choose **All my notes** instead of the open note.",
            "Ask your question, for example “What did I decide for the Orion project?”.",
          ] },
          { p: "NATIA searches this PC for the notes containing the words of the question, gives excerpts to the AI, and shows the **notes used** under the answer: click one to open it." },
          { tip: "With the built-in AI or Ollama, nothing leaves your PC. With an online AI, excerpts of the notes found are sent to it." },
          { p: "**Smart search** (Settings → Artificial intelligence, below the models, 0.6 GB): NATIA also finds notes that cover the topic in other words. The first question reads all your notes (“Reading your notes…”), later ones only the notes that changed. Everything stays on this PC, encrypted if a password is set." },
        ],
      },
      {
        title: "AI memory",
        blocks: [
          { p: "Information the AI keeps from one chat to the next (your preferences, your projects…). Manage it in Settings → AI memory, or in the graph from the sidebar." },
        ],
      },
      {
        title: "Tuning the answers",
        blocks: [
          { list: [
            "**Temperature**: low = precise, consistent answers; high = more creative.",
            "**Token usage** (Eco → Max): answer length. Eco costs less with a paid API.",
            "**Prompts**: edit the instructions of each action in Settings → Prompts. The default prompts follow the prompt language (the app language unless you choose otherwise).",
          ] },
        ],
      },
    ],
  },

  // ─── Security ─────────────────────────────────────────────────────────────
  {
    id: "security",
    title: "Security and password",
    topics: [
      {
        title: "Set a password",
        blocks: [
          { steps: [
            "Settings → Security → **Enable**.",
            "Choose a password (recommended) or a PIN. The meter shows how strong it is.",
            "Write down the **recovery key** shown: it will never be shown again.",
          ] },
          { p: "All personal data is then encrypted (AES-256): notes, titles, folders, tags, versions, settings, API keys and AI memory. The password only works on this PC and this Windows account." },
        ],
      },
      {
        title: "Recovery key",
        blocks: [
          { p: "It lets you open your notes again if you forget the password, reinstall Windows or change PC." },
          { steps: [
            "On the lock screen: **Forgot your password or new PC?**",
            "Enter the key (capitals, dashes and spaces are optional).",
            "Choose a new password.",
          ] },
          { p: "Lost the key? Settings → Security → **New key** creates another one; the old one stops working." },
          { warn: "Keep it outside NATIA (on paper, in a password manager). Without the password and the recovery key, the notes are lost." },
        ],
      },
      {
        title: "Locking",
        blocks: [
          { list: [
            "**Automatic** after inactivity (configurable), when Windows locks (`Windows+L`) or when the PC wakes from sleep.",
            "**Manual**: padlock button in the sidebar, or “Lock” in the menu of the icon next to the clock.",
            "**Mistakes**: after 4 failed attempts, the app locks for longer and longer (30 s, 1 min… up to 24 h), even after a restart.",
          ] },
        ],
      },
      {
        title: "Reset the app",
        blocks: [
          { p: "“Reset the app” (lock screen or Settings → Data) erases all notes, settings and keys so you can start over." },
          { warn: "This can't be undone. Try the recovery key first." },
        ],
      },
    ],
  },

  // ─── Backup ───────────────────────────────────────────────────────────────
  {
    id: "backup",
    title: "Backup and changing PC",
    topics: [
      {
        title: "Export",
        blocks: [
          { p: "Settings → Data → Export. Three formats:" },
          { table: { head: ["Format", "Protection", "Opens with"], rows: [
            ["Standard ZIP", "None, notes unencrypted", "Windows"],
            ["Protected AES-256", "Password, strong encryption", "7-Zip"],
            ["Windows-compatible", "Password, weak encryption", "Windows"],
          ] } },
          { links: [{ label: "Download 7-Zip", url: "https://www.7-zip.org/" }] },
          { tip: "Turn on the weekly reminder (Settings → Data) so you don't forget." },
        ],
      },
      {
        title: "Sync several PCs",
        blocks: [
          { steps: [
            "On the first PC: Settings → Data → **Sync between several PCs**: turn on the switch.",
            "Click **OneDrive**, **Dropbox** or **Google Drive** (the app must be installed and signed in to your account): NATIA creates a “NATIA-sync” folder in it. Or **Choose…** another folder, for example on a USB stick.",
            "Choose a **sync password** (8 characters minimum), then **Save**.",
            "On the other PC: same cloud app (same account) or same folder, and same password.",
          ] },
          { p: "NATIA syncs at startup, every 5 minutes and when you come back to the window (**Sync now** to force it). Notes, folders, tags, trash and attached files follow." },
          { tip: "If a note was changed on both PCs between two syncs, the most recent version is kept and the other becomes a “(conflict …)” note. Nothing is lost; each received note also keeps a version in its history." },
          { warn: "The whole shared folder is encrypted with the sync password: without it, its notes are unreadable, even for you. Write it down." },
        ],
      },
      {
        title: "Automatic backup",
        blocks: [
          { steps: [
            "Settings → Data → **Automatic backup**: turn on the switch.",
            "**Choose…**: the backup folder (OneDrive, USB stick, external drive…).",
            "Pick the frequency (every day or every week) and how many backups to keep, then **Save**.",
          ] },
          { p: "NATIA writes a `NATIA-sauvegarde-date.zip` archive at startup when the previous one is old enough, and deletes the oldest beyond the number chosen. **Back up now** makes one right away." },
          { warn: "If your notes are password-protected, backups must be too (AES-256). Write this password down: without it, the archives won't open." },
          { p: "To restore: Settings → Data → **Import**, then choose the archive." },
        ],
      },
      {
        title: "Import",
        blocks: [
          { p: "Settings → Data → Import: pick a NATIA export (any of the three formats). Notes already present aren't duplicated." },
        ],
      },
      {
        title: "Moving to a new PC",
        blocks: [
          { steps: [
            "On the old PC: make a protected AES-256 export.",
            "On the new PC: install NATIA, then Settings → Data → Import.",
            "Set the password again and write down the new recovery key.",
          ] },
          { p: "Alternative: copy the `%APPDATA%\\com.natia.app` folder. On the new PC, it opens with the recovery key." },
        ],
      },
    ],
  },

  // ─── Startup, updates and help ────────────────────────────────────────────
  {
    id: "help",
    title: "Startup, updates and help",
    topics: [
      {
        title: "Startup and closing",
        blocks: [
          { list: [
            "**Closing the window** tucks NATIA next to the Windows clock: it keeps running and reminders keep ringing. Click the icon to bring the window back.",
            "**To really quit**: right-click the icon → **Quit**.",
            "Settings → Application → **Startup and closing**: turn off this behaviour, or start NATIA with Windows.",
            "Opening NATIA a second time brings back the window that's already open.",
          ] },
        ],
      },
      {
        title: "Updates",
        blocks: [
          { p: "At startup, a window offers the new version: **Update** installs it (the current note is saved, then NATIA restarts), **Later** postpones it to the next launch. Settings → Application to turn the check off or check manually. Your notes are kept." },
        ],
      },
      {
        title: "Setup guide",
        blocks: [
          { p: "On first launch (and after a reset), a guide offers the three recommended settings: password, AI, automatic backup. Each is optional. Settings → Application → **Show the guide** to reopen it." },
        ],
      },
      {
        title: "Report a bug or suggest an idea",
        blocks: [
          { p: "Settings → Application: links to the project's issues (bugs) and discussions (ideas, questions) on GitHub. Mention your NATIA version, your Windows version and the steps to reproduce the problem." },
        ],
      },
    ],
  },
];
