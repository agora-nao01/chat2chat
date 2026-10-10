
const API = "https://casinos-maintains-recovered-built.trycloudflare.com";

const login = document.querySelector("#login");
const chat = document.querySelector("#chat");
const loginForm = document.querySelector("#login-form");
const messageForm = document.querySelector("#message-form");
const nameInput = document.querySelector("#name");
const contentInput = document.querySelector("#content");
const messagesBox = document.querySelector("#messages");
const statusBox = document.querySelector("#status");

let username = "";
let lastId = 0;
let polling = false;

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    username = nameInput.value.trim();

    if (!username) return;

    document.querySelector("#username").textContent = username;
    login.hidden = true;
    chat.hidden = false;

    loadMessages();
});

document.querySelector("#leave").addEventListener("click", () => {
    username = "";
    lastId = 0;
    messagesBox.replaceChildren();
    chat.hidden = true;
    login.hidden = false;
    statusBox.textContent = "";
});

function renderMessage(message) {
    const item = document.createElement("div");
    item.className = "message";

    const heading = document.createElement("div");
    heading.className = "message-name";
    heading.textContent = message.name;

    const content = document.createElement("div");
    content.textContent = message.content;

    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = new Date(message.time * 1000)
        .toLocaleTimeString();

    item.append(heading, content, time);
    messagesBox.append(item);
    lastId = Math.max(lastId, message.id);
}

async function loadMessages() {
    if (polling || !username) return;
    polling = true;

    try {
        const response = await fetch(`${API}/messages`);

        if (!response.ok) throw new Error("Servidor indisponível");

        const data = await response.json();

        for (const message of data.messages) {
            if (message.id > lastId) renderMessage(message);
        }

        messagesBox.scrollTop = messagesBox.scrollHeight;
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
        const response = await fetch(`${API}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: username, content })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        contentInput.value = "";
        await loadMessages();
    } catch {
        statusBox.textContent = "Falha ao enviar mensagem";
    }
});

setInterval(loadMessages, 1000);

