# Telegram-Style LAN Chat Application

This is a Telegram-style LAN chat application built with **FastAPI**, **native WebSockets**, and a **vanilla HTML/CSS/JavaScript** frontend.  
It works entirely offline inside a Local Area Network (LAN) and requires **no external services, databases, or CDNs**.

## 1. Requirements & Installation

- Python 3.9+ installed and available in your PATH.

Install Python dependencies from the project root:

```bash
pip install -r requirements.txt
```

This installs:
- `fastapi`
- `uvicorn`

## 2. Running the Server

From the project root directory:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

The app will be available at:
- `http://localhost:8000`
- `http://<your_local_ip>:8000`

To get your local IP:
- On Windows: run `ipconfig` and use the IPv4 address of your active network adapter.
- On Linux/macOS: run `ifconfig` or `ip addr`.

## 3. How the LAN Chat Works

- All devices (laptops, desktops, etc.) must be **connected to the same LAN** (same Wi‑Fi or Ethernet network).
- One device runs the FastAPI server with the command above.
- Other devices open a browser and navigate to `http://<server_local_ip>:8000`.
- Each user chooses a **unique username**. Duplicate usernames are rejected.
- The server keeps all connected users and messages **in memory only**; nothing is written to a database.

Because everything runs on your LAN and all assets (HTML, CSS, JS) are served locally from the FastAPI server, **no internet connection is required**.

## 4. How WebSockets Are Used

- The frontend opens a **native WebSocket** connection to:

  `ws://<server_host>:8000/ws/<username>`

- The server:
  - Tracks connected users and prevents duplicate usernames.
  - Broadcasts:
    - **User list updates**.
    - **Group messages** (when chatting with "Group Chat").
  - Routes **private messages** only between sender and receiver when a specific user is selected.
  - Sends **typing indicator events** so you can see when another user is typing in the current chat.
  - Sends **file message events** when a user uploads a file through a regular POST request.

Messages and events are encoded as small JSON payloads and delivered in real time over a single WebSocket connection per user.

## 5. File Uploads & Storage

- Files are uploaded via `POST /upload` (no WebSocket binary frames).
- Files are stored in the local `uploads/` folder in the project root.
- Each stored file gets a unique generated filename; the original filename is kept only for display.
- The server:
  - Enforces a **maximum file size of 50 MB**.
  - Rejects empty files.
  - Broadcasts a WebSocket message containing:
    - Download URL (served from `/uploads/...`),
    - Original filename,
    - MIME type.
- The frontend:
  - Shows **image previews** inside the chat for image files.
  - Shows **download links** for all file types.
  - Supports both **click-to-select** and **drag & drop** uploads.

## 6. Frontend Features (Telegram-Style UI)

- **Two-panel layout**:
  - Left: app logo, search bar, active users list, selected-user highlight.
  - Right: chat header, online indicator, messages area, typing indicator, input area.
- **Message bubbles**:
  - Sent messages: right-aligned, green bubble.
  - Received messages: left-aligned, gray bubble.
  - Each message includes a **timestamp**.
- **Private vs group chats**:
  - Selecting **Group Chat** sends/broadcasts to everyone.
  - Selecting a **specific user** opens a private chat—messages are only visible to sender and that user.
- **Typing indicator**:
  - Shows `<user> is typing...` when the other side is typing in the same chat.
- **File handling**:
  - Drag & drop onto the input area.
  - Attachment button for manual selection.
  - Inline image previews and download links.
- **Theme toggle**:
  - Dark and light theme switch via a single toggle.

All of this is implemented using **only** HTML, CSS, and vanilla JavaScript—no React, no Bootstrap, no Tailwind, and no CDNs.

## 7. Offline & Production Notes

- The application:
  - Uses **no external APIs**.
  - Uses **no database** (all state is in memory).
  - Serves all assets (HTML, CSS, JS, uploaded files) from the same FastAPI process.
- As long as:
  - The server is running on one machine,
  - Other clients are on the same LAN and can reach `http://<server_local_ip>:8000`,
  - Browsers support WebSockets (all modern browsers do),

the chat will function entirely **offline inside the LAN**.

