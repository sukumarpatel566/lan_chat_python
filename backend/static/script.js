/**
 * LAN CHAT PRO - STABLE SCRIPT V2
 * Features: IST Time, Null Safety, WebSocket Resilience
 */

document.addEventListener("DOMContentLoaded", () => {
    const RECONNECT_DELAY = 3000;
    const TYPING_DELAY = 2000;
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    let socket = null;
    let currentUser = null;
    let selectedChat = "all";
    let isPrivate = false;
    let typingTimer = null;
    let isTyping = false;
    let users = [];

    // UI Selectors with Null Safety
    const ui = {
        modal: document.getElementById("username-modal"),
        loginForm: document.getElementById("login-form"),
        nameInput: document.getElementById("username-input"),
        appContainer: document.getElementById("app-container"),
        sidebar: document.getElementById("sidebar"),
        sidebarToggle: document.getElementById("sidebar-toggle"),
        userList: document.getElementById("user-list"),
        search: document.getElementById("user-search"),
        msgContainer: document.getElementById("message-container"),
        msgInput: document.getElementById("message-input"),
        sendBtn: document.getElementById("send-button"),
        chatTitle: document.getElementById("chat-title"),
        chatStatus: document.getElementById("chat-status-text"),
        chatAvatar: document.getElementById("active-chat-avatar"),
        typingInd: document.getElementById("typing-indicator"),
        typingText: document.getElementById("typing-text"),
        menuTrigger: document.getElementById("menu-trigger"),
        dropdown: document.getElementById("header-dropdown"),
        menuList: document.getElementById("menu-list"),
        replyBar: document.getElementById("reply-preview"),
        replyUser: document.getElementById("reply-user"),
        replyTxt: document.getElementById("reply-text-preview"),
        cancelReply: document.getElementById("cancel-reply"),
        emojiBtn: document.getElementById("emoji-button"),
        emojiPicker: document.getElementById("emoji-picker"),
        emojiGrid: document.getElementById("emoji-grid"),
        themeBtn: document.getElementById("theme-toggle"),
        fileInput: document.getElementById("file-input"),
        attachBtn: document.getElementById("attach-button"),
        dropZone: document.getElementById("drop-zone"),
        welcome: document.getElementById("welcome-screen"),
        contextMenu: document.getElementById("msg-context-menu"),
        confirmDelete: document.getElementById("menu-delete"),
        confirmReply: document.getElementById("menu-reply")
    };

    let replyingTo = null;
    let replyPreview = "";

    function init() {
        if (localStorage.getItem("theme") === "dark") {
            document.body.classList.replace("light-theme", "dark-theme");
            ui.themeBtn.textContent = "☀️";
        }
        renderEmojis();
        setupListeners();
        ui.nameInput?.focus();
    }

    function setupListeners() {
        // Prevent form refresh
        ui.loginForm?.addEventListener("submit", (e) => {
            e.preventDefault();
            join();
        });

        ui.msgInput?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
            }
        });

        ui.sendBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            send();
        });

        ui.search?.addEventListener("input", renderUsers);
        ui.msgInput?.addEventListener("input", handleTypingInput);

        ui.themeBtn?.addEventListener("click", toggleTheme);

        ui.menuTrigger?.addEventListener("click", (e) => {
            e.stopPropagation();
            ui.dropdown?.classList.toggle("active");
            renderMenu();
        });

        ui.sidebarToggle?.addEventListener("click", (e) => {
            e.stopPropagation();
            ui.sidebar?.classList.toggle("open");
        });

        ui.cancelReply?.addEventListener("click", stopReply);
        ui.attachBtn?.addEventListener("click", () => ui.fileInput?.click());
        ui.fileInput?.addEventListener("change", (e) => upload(e.target.files[0]));

        ui.emojiBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            ui.emojiPicker?.classList.toggle("hidden");
        });

        document.addEventListener("click", () => {
            ui.dropdown?.classList.remove("active");
            ui.emojiPicker?.classList.add("hidden");
            ui.contextMenu?.classList.remove("active");
            if (window.innerWidth <= 900) ui.sidebar?.classList.remove("open");
            if (!ui.modal?.classList.contains("hidden")) return;
            ui.msgInput?.focus();
        });

        // Drag & Drop
        ui.dropZone?.addEventListener("dragover", (e) => {
            e.preventDefault();
            ui.dropZone.classList.add("drag-over");
        });
        ui.dropZone?.addEventListener("dragleave", () => ui.dropZone.classList.remove("drag-over"));
        ui.dropZone?.addEventListener("drop", (e) => {
            e.preventDefault();
            ui.dropZone.classList.remove("drag-over");
            upload(e.dataTransfer.files[0]);
        });
    }

    function join() {
        const val = ui.nameInput?.value.trim();
        if (!val) return;
        currentUser = val;

        ui.modal.style.opacity = "0";
        ui.modal.style.transition = "0.5s";

        setTimeout(() => {
            ui.modal.classList.add("hidden");
            ui.appContainer.classList.remove("hidden");
            document.getElementById("my-username").textContent = val;
            document.getElementById("my-avatar").textContent = val[0].toUpperCase();
            connect();
        }, 500);
    }

    function connect() {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${protocol}://${window.location.host}/ws/${encodeURIComponent(currentUser)}`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("Connected to Hub");
            updateStatus(true);
        };

        socket.onclose = () => {
            console.warn("Disconnected. Retrying...");
            updateStatus(false);
            setTimeout(connect, RECONNECT_DELAY);
        };

        socket.onerror = (err) => console.error("Socket Error:", err);

        socket.onmessage = (e) => {
            try {
                const p = JSON.parse(e.data);
                handleMessage(p);
            } catch (err) {
                console.error("Parse Error:", err);
            }
        };
    }

    function updateStatus(online) {
        const dot = document.querySelector(".status-dot");
        const txt = document.querySelector(".status-text");
        if (dot) dot.className = "status-dot " + (online ? "online" : "offline");
        if (txt) txt.textContent = online ? "Online" : "Synchronizing...";
    }

    function handleMessage(p) {
        switch (p.type) {
            case "user_list":
                users = p.users;
                renderUsers();
                break;
            case "message":
                displayMessage(p);
                break;
            case "typing":
                showTyping(p);
                break;
            case "status":
                displaySystemMessage(p.content);
                break;
            case "delete":
                const b = document.querySelector(`[data-msg-id="${p.msg_id}"]`);
                if (b) {
                    b.innerHTML = "<i style='opacity:0.6'>Transmission Erased</i>";
                    b.classList.add("erased");
                }
                break;
        }
    }

    function formatIST(isoStr) {
        if (!isoStr) return "Just now";
        const date = new Date(isoStr);
        // IST formatting HH:MM AM/PM
        return date.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    }

    function displaySystemMessage(txt) {
        const div = document.createElement("div");
        div.className = "system-status";
        div.textContent = txt;
        ui.msgContainer?.appendChild(div);
        autoScroll();
    }

    function renderUsers() {
        const q = ui.search?.value.toLowerCase() || "";
        if (!ui.userList) return;
        ui.userList.innerHTML = "";

        const all = [
            { id: "all", name: "Global Hub", group: true },
            ...users.filter(u => u.username !== currentUser).map(u => ({ id: u.username, name: u.username }))
        ];

        all.forEach(u => {
            if (!u.name.toLowerCase().includes(q)) return;
            const div = document.createElement("div");
            div.className = `station-item ${selectedChat === u.id ? 'active' : ''}`;
            div.innerHTML = `
                <div class="avatar" style="background:${u.group ? 'var(--primary)' : getColor(u.name)}">${u.group ? 'GC' : u.name[0].toUpperCase()}</div>
                <div class="station-meta">
                    <div class="station-name">${u.name}</div>
                    <div class="station-sub">${u.group ? 'Active Signal' : 'Secure Line'}</div>
                </div>
            `;
            div.onclick = () => {
                selectedChat = u.id;
                isPrivate = !u.group;
                renderUsers();
                updateHeader(u.name, u.group);
                if (ui.welcome) ui.welcome.innerHTML = ""; // Clear welcome
                if (window.innerWidth <= 900) ui.sidebar?.classList.remove("open");
                ui.msgInput?.focus();
            };
            ui.userList.appendChild(div);
        });
    }

    function updateHeader(n, g) {
        if (ui.chatTitle) ui.chatTitle.textContent = n;
        if (ui.chatAvatar) {
            ui.chatAvatar.textContent = g ? "GC" : n[0].toUpperCase();
            ui.chatAvatar.style.background = g ? "var(--primary)" : getColor(n);
        }
        if (ui.chatStatus) ui.chatStatus.textContent = g ? `${users.length} Stations Active` : "Direct Encrypted Line";
    }

    function displayMessage(m) {
        const isRelevant = (m.to === "all" && selectedChat === "all") ||
            (m.is_private && (m.from === selectedChat || (m.from === currentUser && m.to === selectedChat)));
        if (!isRelevant) return;

        if (ui.welcome) ui.welcome.classList.add("hidden");

        const mine = m.from === currentUser;
        const row = document.createElement("div");
        row.className = `message-row ${mine ? 'sent' : 'received'}`;

        const bub = document.createElement("div");
        bub.className = `message-bubble ${mine ? 'sent' : 'received'}`;
        bub.dataset.msgId = m.id;

        bub.oncontextmenu = (e) => {
            e.preventDefault();
            if (!ui.contextMenu) return;
            ui.contextMenu.style.left = `${e.pageX}px`;
            ui.contextMenu.style.top = `${e.pageY}px`;
            ui.contextMenu.classList.add("active");
            ui.confirmDelete.onclick = () => socket?.send(JSON.stringify({ type: "delete", msg_id: m.id, to: selectedChat }));
            ui.confirmReply.onclick = () => startReply(m.id, m.from, m.content || "[Asset]");
        };

        if (!mine && selectedChat === "all") {
            const senderDiv = document.createElement("div");
            senderDiv.className = "msg-sender";
            senderDiv.style.color = "var(--primary)";
            senderDiv.style.fontSize = "0.75rem";
            senderDiv.style.fontWeight = "700";
            senderDiv.style.marginBottom = "4px";
            senderDiv.textContent = m.from;
            bub.appendChild(senderDiv);
        }

        let contentHtml = "";
        if (m.reply_to) {
            contentHtml += `<div class="reply-in-msg"><b>${m.from}:</b> ${escapeHtml(m.reply_preview)}</div>`;
        }

        if (m.is_file) {
            if (m.mime_type?.startsWith("image/")) {
                const img = new Image();
                img.src = m.file_url;
                img.className = "msg-img";
                img.onclick = () => window.open(m.file_url);
                img.onload = () => autoScroll(); // Final stability fix
                bub.appendChild(img);
            } else {
                contentHtml += `<div class="msg-file">📦 <a href="${m.file_url}" download="${m.file_name}">${m.file_name}</a></div>`;
                bub.innerHTML += contentHtml;
            }
        } else {
            contentHtml += `<div class="msg-text">${escapeHtml(m.content)}</div>`;
            bub.innerHTML += contentHtml;
        }

        const timeStr = formatIST(m.timestamp);
        bub.innerHTML += `<div class="message-meta">${timeStr}</div>`;

        row.appendChild(bub);
        ui.msgContainer?.appendChild(row);
        autoScroll();
    }

    function send() {
        const val = ui.msgInput?.value.trim();
        if (!val || !socket || socket.readyState !== WebSocket.OPEN) return;

        socket.send(JSON.stringify({
            type: "message",
            content: val,
            to: selectedChat,
            is_private: isPrivate,
            reply_to: replyingTo,
            reply_preview: replyPreview
        }));

        if (ui.msgInput) ui.msgInput.value = "";
        stopReply();
        notifyTyping(false);
    }

    function startReply(id, user, text) {
        replyingTo = id;
        replyPreview = text.length > 50 ? text.substring(0, 50) + "..." : text;
        if (ui.replyUser) ui.replyUser.textContent = user;
        if (ui.replyTxt) ui.replyTxt.textContent = replyPreview;
        ui.replyBar?.classList.remove("hidden");
        ui.msgInput?.focus();
    }

    function stopReply() {
        replyingTo = null;
        ui.replyBar?.classList.add("hidden");
    }

    function handleTypingInput() {
        if (!isTyping) notifyTyping(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => notifyTyping(false), TYPING_DELAY);
    }

    function notifyTyping(st) {
        if (socket?.readyState === WebSocket.OPEN) {
            isTyping = st;
            socket.send(JSON.stringify({
                type: "typing",
                to: selectedChat,
                is_private: isPrivate,
                is_typing: st
            }));
        }
    }

    function showTyping(p) {
        const rel = (p.to === "all" && selectedChat === "all") || (p.is_private && p.from === selectedChat);
        if (!ui.typingInd) return;
        if (!rel || !p.is_typing) {
            ui.typingInd.classList.add("hidden");
            return;
        }
        if (ui.typingText) ui.typingText.textContent = `${p.from} is connecting thoughts`;
        ui.typingInd.classList.remove("hidden");
    }

    async function upload(f) {
        if (!f || f.size > MAX_FILE_SIZE) {
            alert("File too large (Max 50MB)");
            return;
        }
        const fd = new FormData();
        fd.append("file", f);
        fd.append("sender", currentUser);
        fd.append("receiver", selectedChat);
        fd.append("is_private", isPrivate);

        try {
            await fetch("/upload", { method: "POST", body: fd });
        } catch (err) {
            console.error("Upload Error:", err);
        }
    }

    function toggleTheme() {
        const isDark = document.body.classList.toggle("dark-theme");
        document.body.classList.toggle("light-theme", !isDark);
        localStorage.setItem("theme", isDark ? "dark" : "light");
        if (ui.themeBtn) ui.themeBtn.textContent = isDark ? "☀️" : "🌙";
    }

    function renderEmojis() {
        const emojis = ["😊", "😂", "❤️", "😍", "👍", "😮", "😢", "🔥", "✨", "✔️", "⭐", "🚀", "💡", "💬", "💯", "✅", "🛡️", "⚡"];
        if (!ui.emojiGrid) return;
        ui.emojiGrid.innerHTML = emojis.map(e => `<span class="emoji-item">${e}</span>`).join("");
        ui.emojiGrid.querySelectorAll(".emoji-item").forEach(el => {
            el.onclick = () => {
                if (ui.msgInput) ui.msgInput.value += el.textContent;
                ui.msgInput?.focus();
            };
        });
    }

    function renderMenu() {
        const list = [
            { id: "clear", text: "Clear History", icon: "🧹", danger: true },
            { id: "theme", text: "Toggle Mode", icon: "🌓" },
            { id: "export", text: "Download Chat", icon: "📥" },
            { id: "intel", text: "Active Stations", icon: "📡" },
            { id: "exit", text: "Disconnect", icon: "🔌" }
        ];
        if (!ui.menuList) return;
        ui.menuList.innerHTML = list.map(m => `
            <li class="${m.danger ? 'danger' : ''}" id="menu-${m.id}">
                <span>${m.icon}</span> ${m.text}
            </li>
        `).join("");

        ui.menuList.querySelectorAll("li").forEach(li => {
            li.onclick = (e) => {
                e.stopPropagation();
                const id = li.id.replace("menu-", "");
                if (id === "clear") {
                    if (confirm("Are you sure you want to clear your local chat screen?")) {
                        if (ui.msgContainer) ui.msgContainer.innerHTML = "";
                    }
                }
                if (id === "theme") toggleTheme();
                if (id === "export") exportHistory();
                if (id === "intel") openModal("Active Hub Signal", `Connected Stations: ${users.length}<br>Status: Online`);
                if (id === "exit") window.location.reload();
                ui.dropdown?.classList.remove("active");
            };
        });
    }

    function exportHistory() {
        let text = `Intelligence Logistics - HUB [${selectedChat}]\n\n`;
        document.querySelectorAll(".message-bubble").forEach(b => {
            text += `[${b.innerText.replace("\n", " ")}]\n`;
        });
        const blob = new Blob([text], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `lan_intel_${new Date().getTime()}.txt`;
        a.click();
    }

    function openModal(t, c) {
        document.getElementById("modal-title").textContent = t;
        document.getElementById("modal-body").innerHTML = c;
        document.getElementById("global-modal").classList.remove("hidden");
    }

    function getColor(n) {
        const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];
        let hash = 0;
        for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    }

    function escapeHtml(t) {
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function autoScroll() {
        if (ui.msgContainer) {
            ui.msgContainer.scrollTop = ui.msgContainer.scrollHeight;
        }
    }

    init();
});
