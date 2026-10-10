const API = "https://adventures-employees-cabin-meant.trycloudflare.com";
const IS_DEBUG_APP = document.body.dataset.room === "debug";
let currentRoom = IS_DEBUG_APP ? "debug" : "main";

const login = document.querySelector("#login");
const chat = document.querySelector("#chat");
const loginForm = document.querySelector("#login-form");
const messageForm = document.querySelector("#message-form");
const nameInput = document.querySelector("#name");
const contentInput = document.querySelector("#content");
const linebreakButton = document.querySelector("#linebreak");
const messagesBox = document.querySelector("#messages");
const statusBox = document.querySelector("#status");
const roomSwitch = document.querySelector("#room-switch");
const gifDialog = document.querySelector("#gif-dialog");
const gifOpenButton = document.querySelector("#gif-open");
const gifSearchForm = document.querySelector("#gif-search-form");
const gifQuery = document.querySelector("#gif-query");
const gifResults = document.querySelector("#gif-results");
const gifStatus = document.querySelector("#gif-status");

let username = "";
let lastId = 0;
let polling = false;
let roomGeneration = 0;

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const requestedName = nameInput.value.trim();
    const isDevName = requestedName.toLocaleLowerCase().startsWith("dev:");

    if (currentRoom === "debug" && !isDevName) {
        statusBox.textContent = "Na sala debug, o nome deve começar com dev:.";
        return;
    }

    if (currentRoom === "main" && isDevName) {
        statusBox.textContent = "Nomes dev: são reservados para a versão debug.";
        return;
    }

    if (!requestedName) return;

    username = requestedName;
    document.querySelector("#username").textContent = username;
    login.hidden = true;
    chat.hidden = false;
    statusBox.textContent = "Conectando…";
    loadMessages();
});

function switchRoom(nextRoom) {
    if (!IS_DEBUG_APP || !["main", "debug"].includes(nextRoom) || nextRoom === currentRoom) return;

    const isDevName = username.toLocaleLowerCase().startsWith("dev:");
    let nextUsername = username;

    if (nextRoom === "debug" && !isDevName) {
        const promptText = "Digite seu nome dev: para entrar na sala debug.";
        nextUsername = window.prompt(promptText, "dev:");
        if (nextUsername === null) {
            roomSwitch.value = currentRoom;
            return;
        }
        nextUsername = nextUsername.trim();
        const nextIsDevName = nextUsername.toLocaleLowerCase().startsWith("dev:");
        if (!nextUsername || nextUsername.length > 32 || !nextIsDevName) {
            statusBox.textContent = "Use um nome começando com dev: para a sala debug.";
            roomSwitch.value = currentRoom;
            return;
        }
    }

    currentRoom = nextRoom;
    roomGeneration += 1;
    document.body.dataset.room = currentRoom;
    username = nextUsername;
    roomSwitch.value = currentRoom;
    document.querySelector("#username").textContent = username;
    lastId = 0;
    messagesBox.replaceChildren();
    statusBox.textContent = `Trocando para a sala ${currentRoom}…`;
    loadMessages();
}

roomSwitch?.addEventListener("change", () => switchRoom(roomSwitch.value));

document.querySelector("#leave").addEventListener("click", () => {
    username = "";
    lastId = 0;
    messagesBox.replaceChildren();
    chat.hidden = true;
    login.hidden = false;
    statusBox.textContent = "";
});

function appendText(parent, text) {
    if (text) parent.append(document.createTextNode(text));
}

function imgurImageUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:" || !["imgur.com", "i.imgur.com", "www.imgur.com"].includes(url.hostname)) {
            return null;
        }
        return url.href;
    } catch {
        return null;
    }
}

function addImgurImage(parent, rawUrl) {
    const url = imgurImageUrl(rawUrl);
    if (!url) {
        appendText(parent, `{img:${rawUrl}}`);
        return;
    }

    const image = document.createElement("img");
    image.className = "message-image";
    image.src = url;
    image.alt = "Imagem do Imgur";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Abrir imagem no Imgur";
        image.replaceWith(link);
    }, { once: true });
    parent.append(image);
}

function addKlipyGif(parent, rawUrl) {
    const url = safeKlipyMediaUrl(rawUrl);
    if (!url) {
        appendText(parent, `{gif:${rawUrl}}`);
        return;
    }

    const image = document.createElement("img");
    image.className = "message-image klipy-gif";
    image.src = url;
    image.alt = "GIF do KLIPY";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    parent.append(image);
}

function renderContent(parent, content) {
    const tokenPattern = /\{img:(https:\/\/[^}\s]+)\}|\{gif:(https:\/\/[^}\s]+)\}/gi;
    let cursor = 0;
    let match;

    while ((match = tokenPattern.exec(content)) !== null) {
        appendText(parent, content.slice(cursor, match.index));
        if (match[1]) {
            addImgurImage(parent, match[1]);
        } else if (match[2]) {
            addKlipyGif(parent, match[2]);
        } else {
            appendText(parent, match[0]);
        }
        cursor = match.index + match[0].length;
    }

    appendText(parent, content.slice(cursor));
}

function renderMessage(message) {
    const item = document.createElement("article");
    item.className = "message";
    item.dataset.messageId = String(message.id);

    const heading = document.createElement("div");
    heading.className = "message-name";
    heading.textContent = message.name;

    const content = document.createElement("div");
    content.className = "message-content";
    renderContent(content, message.content);

    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = new Date(message.time * 1000).toLocaleTimeString();

    item.append(heading, content, time);

    if (IS_DEBUG_APP) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "moderation-delete";
        deleteButton.textContent = "Apagar";
        deleteButton.setAttribute("aria-label", `Apagar mensagem ${message.id}`);
        deleteButton.title = "Apagar esta mensagem";
        deleteButton.addEventListener("click", () => deleteMessage(message.id));
        item.append(deleteButton);
    }

    messagesBox.append(item);
    lastId = Math.max(lastId, message.id);
}

function captureScrollPosition() {
    const boxRect = messagesBox.getBoundingClientRect();
    const anchors = [...messagesBox.querySelectorAll(".message")]
        .filter((message) => {
            const rect = message.getBoundingClientRect();
            return rect.bottom > boxRect.top && rect.top < boxRect.bottom;
        })
        .map((message) => ({
            message,
            offset: message.getBoundingClientRect().top - boxRect.top
        }));
    return {
        following: messagesBox.scrollHeight - messagesBox.scrollTop - messagesBox.clientHeight < 72,
        anchors
    };
}

function restoreScrollPosition(position) {
    if (position.following) {
        messagesBox.scrollTop = messagesBox.scrollHeight;
        return;
    }
    const anchor = position.anchors.find(({ message }) => message.isConnected);
    if (anchor) {
        const boxTop = messagesBox.getBoundingClientRect().top;
        const newOffset = anchor.message.getBoundingClientRect().top - boxTop;
        messagesBox.scrollTop += newOffset - anchor.offset;
    }
}

async function deleteMessage(messageId) {
    if (!window.confirm(`Apagar a mensagem ${messageId}?`)) return;

    try {
        const room = encodeURIComponent(currentRoom);
        const response = await fetch(
            `${API}/messages/${messageId}?room=${room}&debugClient=1`,
            { method: "DELETE" }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao apagar mensagem");
        await loadMessages();
        statusBox.textContent = "Mensagem apagada.";
    } catch (error) {
        statusBox.textContent = error.message || "Falha ao apagar mensagem";
    }
}

async function loadMessages() {
    if (polling || !username) return;
    polling = true;
    const requestedRoom = currentRoom;
    const requestedGeneration = roomGeneration;

    try {
        const roomQuery = requestedRoom === "debug" ? "?room=debug" : "";
        const response = await fetch(`${API}/messages${roomQuery}`);
        if (!response.ok) throw new Error("Servidor indisponível");

        const data = await response.json();
        if (requestedGeneration !== roomGeneration || requestedRoom !== currentRoom) return;
        const scrollPosition = captureScrollPosition();
        const liveIds = new Set(data.messages.map((message) => String(message.id)));
        for (const existing of messagesBox.querySelectorAll(".message")) {
            if (!liveIds.has(existing.dataset.messageId)) existing.remove();
        }
        for (const message of data.messages) {
            if (message.id > lastId) renderMessage(message);
        }

        restoreScrollPosition(scrollPosition);
        statusBox.textContent = "Conectado";
    } catch {
        statusBox.textContent = "Não foi possível conectar ao servidor";
    } finally {
        polling = false;
    }
}

messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const content = contentInput.value.trim();
    if (!content || !username) return;

    try {
        const payload = { name: username, content };
        if (currentRoom === "debug") payload.room = "debug";
        if (IS_DEBUG_APP) payload.debugClient = true;

        const response = await fetch(`${API}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);
        contentInput.value = "";
        resizeComposer();
        messagesBox.scrollTop = messagesBox.scrollHeight;
        await loadMessages();
    } catch {
        statusBox.textContent = "Falha ao enviar mensagem";
    }
});

gifOpenButton?.addEventListener("click", () => {
    gifDialog.showModal();
    gifQuery.focus();
});

gifSearchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = gifQuery.value.trim();
    if (!query) return;

    gifResults.replaceChildren();
    gifStatus.textContent = "Buscando GIFs…";

    try {
        const configResponse = await fetch(`${API}/klipy/config`);
        const config = await configResponse.json();
        if (!configResponse.ok || !config.apiKey) {
            throw new Error("Configure KLIPY_API_KEY no arquivo .env do projeto.");
        }

        const params = new URLSearchParams({
            q: query,
            page: "1",
            per_page: "12",
            content_filter: "medium",
            format_filter: "gif"
        });
        const apiKey = encodeURIComponent(config.apiKey);
        const response = await fetch(
            `https://api.klipy.com/api/v1/${apiKey}/gifs/search?${params}`,
            { headers: { Accept: "application/json" } }
        );
        const payload = await response.json();
        if (!response.ok || payload.result === false) {
            throw new Error("A busca KLIPY falhou. Confira a API key e o acesso da conta.");
        }

        const items = Array.isArray(payload.data?.data)
            ? payload.data.data
            : Array.isArray(payload.data) ? payload.data : [];
        if (!items.length) {
            gifStatus.textContent = "Nenhum GIF encontrado.";
            return;
        }

        gifStatus.textContent = "Escolha um GIF para adicionar à mensagem.";
        for (const result of items) {
            const files = result.file || {};
            const gif = files.md?.gif || files.hd?.gif || files.sm?.gif || files.xs?.gif;
            const preview = files.sm?.gif || files.xs?.gif || gif;
            const gifUrl = safeKlipyMediaUrl(gif?.url);
            const previewUrl = safeKlipyMediaUrl(preview?.url);
            if (!gifUrl || !previewUrl) continue;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "gif-result";
            button.title = result.content_description || result.title || "GIF do KLIPY";

            const image = document.createElement("img");
            image.src = previewUrl;
            image.alt = result.content_description || result.title || "Prévia do GIF";
            image.loading = "lazy";

            const title = document.createElement("span");
            title.textContent = result.content_description || result.title || "GIF do KLIPY";
            button.append(image, title);
            button.addEventListener("click", () => {
                const start = contentInput.selectionStart;
                const end = contentInput.selectionEnd;
                const prefix = start > 0 && !/\s$/.test(contentInput.value.slice(0, start)) ? " " : "";
                contentInput.setRangeText(`${prefix}{gif:${gifUrl}}`, start, end, "end");
                gifDialog.close();
                contentInput.focus();
            });
            gifResults.append(button);
        }
    } catch (error) {
        gifStatus.textContent = error.message || "Não foi possível buscar GIFs no KLIPY.";
    }
});

function safeKlipyMediaUrl(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const allowedHosts = ["static.klipy.com", "static1.klipy.com", "static2.klipy.com"];
        return url.protocol === "https:" && allowedHosts.includes(url.hostname) ? rawUrl : null;
    } catch {
        return null;
    }
}

function insertComposerText(text) {
    const start = contentInput.selectionStart;
    const end = contentInput.selectionEnd;
    contentInput.setRangeText(text, start, end, "end");
    contentInput.focus();
    resizeComposer();
}

function resizeComposer() {
    contentInput.style.height = "auto";
    contentInput.style.height = `${Math.min(contentInput.scrollHeight, 180)}px`;
}

linebreakButton?.addEventListener("click", () => insertComposerText("\n"));
contentInput.addEventListener("input", resizeComposer);
contentInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        messageForm.requestSubmit();
    }
});

document.querySelectorAll(".emoji-button").forEach((button) => {
    button.addEventListener("click", () => {
        const start = contentInput.selectionStart;
        const end = contentInput.selectionEnd;
        contentInput.setRangeText(button.dataset.emoji, start, end, "end");
        contentInput.focus();
    });
});

setInterval(loadMessages, 1000);
