import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    UploadFile,
    File,
    Form,
    HTTPException,
)
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Setup paths relative to backend directory
# Assuming main.py is in 'backend/' folder
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BACKEND_DIR, "templates")
STATIC_DIR = os.path.join(BACKEND_DIR, "static")
# Uploads should be in the root for persistence
ROOT_DIR = os.path.dirname(BACKEND_DIR)
UPLOAD_DIR = os.path.join(ROOT_DIR, "uploads")

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

app = FastAPI(title="LAN Chat Pro IST Edition")

# Mounting static and uploads
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

def get_ist_time():
    """Returns current IST time as ISO string."""
    # IST is UTC + 5:30
    ist = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist).isoformat()

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_data: Dict[str, dict] = {}

    async def connect(self, username: str, websocket: WebSocket) -> None:
        if not username or not username.strip():
            await websocket.close(code=4000)
            return

        if username in self.active_connections:
            await websocket.close(code=4001)
            return

        await websocket.accept()
        self.active_connections[username] = websocket
        self.user_data[username] = {
            "joined_at": get_ist_time(),
            "status": "online"
        }
        await self.broadcast_user_list()

    def disconnect(self, username: str) -> None:
        if username in self.active_connections:
            del self.active_connections[username]
        if username in self.user_data:
            del self.user_data[username]

    async def send_personal_message(self, message: dict, username: str) -> None:
        websocket = self.active_connections.get(username)
        if websocket:
            try:
                await websocket.send_text(json.dumps(message))
            except Exception:
                self.disconnect(username)

    async def broadcast(self, message: dict, exclude: Optional[List[str]] = None) -> None:
        if exclude is None:
            exclude = []
        text = json.dumps(message)
        for user, websocket in list(self.active_connections.items()):
            if user in exclude:
                continue
            try:
                await websocket.send_text(text)
            except Exception:
                self.disconnect(user)
        await self.broadcast_user_list()

    async def broadcast_user_list(self) -> None:
        users_info = []
        for uname, data in self.user_data.items():
            users_info.append({
                "username": uname,
                "joined_at": data["joined_at"],
                "status": data["status"]
            })
        
        payload = {
            "type": "user_list",
            "users": users_info,
        }
        text = json.dumps(payload)
        for user, websocket in list(self.active_connections.items()):
            try:
                await websocket.send_text(text)
            except Exception:
                self.disconnect(user)

manager = ConnectionManager()

@app.get("/", response_class=FileResponse)
async def get_index() -> FileResponse:
    index_path = os.path.join(TEMPLATES_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Index template not found")
    return FileResponse(index_path)

@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str) -> None:
    await manager.connect(username, websocket)
    
    connect_message = {
        "type": "status",
        "content": f"{username} joined the station",
        "timestamp": get_ist_time(),
    }
    await manager.broadcast(connect_message)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = payload.get("type")

            if msg_type == "message":
                await handle_chat_message(username, payload)
            elif msg_type == "typing":
                await handle_typing_event(username, payload)
            elif msg_type == "ack":
                await handle_ack_event(username, payload)
            elif msg_type == "delete":
                await handle_delete_event(username, payload)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(username)
        disconnect_message = {
            "type": "status",
            "content": f"{username} left the station",
            "timestamp": get_ist_time(),
        }
        await manager.broadcast(disconnect_message)

async def handle_chat_message(sender: str, payload: dict) -> None:
    content = (payload.get("content") or "").strip()
    to_user = payload.get("to") or "all"
    is_private = bool(payload.get("is_private"))
    reply_to = payload.get("reply_to")
    reply_preview = payload.get("reply_preview")

    msg_id = str(uuid.uuid4())

    message = {
        "type": "message",
        "id": msg_id,
        "from": sender,
        "to": to_user,
        "is_private": is_private,
        "content": content,
        "timestamp": get_ist_time(),
        "is_file": bool(payload.get("is_file")),
        "file_name": payload.get("file_name"),
        "file_url": payload.get("file_url"),
        "mime_type": payload.get("mime_type"),
        "reply_to": reply_to,
        "reply_preview": reply_preview
    }

    if is_private and to_user != "all":
        await manager.send_personal_message(message, sender)
        await manager.send_personal_message(message, to_user)
    else:
        await manager.broadcast(message)

async def handle_delete_event(sender: str, payload: dict) -> None:
    msg_id = payload.get("msg_id")
    to_user = payload.get("to") or "all"
    
    del_payload = {
        "type": "delete",
        "msg_id": msg_id,
        "from": sender
    }
    
    if to_user != "all":
        await manager.send_personal_message(del_payload, to_user)
        await manager.send_personal_message(del_payload, sender)
    else:
        await manager.broadcast(del_payload)

async def handle_ack_event(sender: str, payload: dict) -> None:
    msg_id = payload.get("msg_id")
    to_user = payload.get("to_user")
    ack_type = payload.get("ack_type")

    ack_payload = {
        "type": "ack",
        "msg_id": msg_id,
        "from_user": sender,
        "ack_type": ack_type,
        "timestamp": get_ist_time(),
    }

    if to_user != "all":
        await manager.send_personal_message(ack_payload, to_user)
    else:
        await manager.broadcast(ack_payload, exclude=[sender])

async def handle_typing_event(sender: str, payload: dict) -> None:
    to_user = payload.get("to") or "all"
    is_private = bool(payload.get("is_private"))
    is_typing = bool(payload.get("is_typing"))

    event = {
        "type": "typing",
        "from": sender,
        "to": to_user,
        "is_private": is_private,
        "is_typing": is_typing,
    }

    if is_private and to_user != "all":
        await manager.send_personal_message(event, to_user)
    else:
        await manager.broadcast(event, exclude=[sender])

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    sender: str = Form(...),
    receiver: str = Form("all"),
    is_private: bool = Form(False),
) -> JSONResponse:
    contents = await file.read()
    size = len(contents)

    if size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 50MB).")

    ext = os.path.splitext(file.filename or "")[1]
    safe_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(save_path, "wb") as out_file:
        out_file.write(contents)

    file_url = f"/uploads/{safe_name}"
    msg_id = str(uuid.uuid4())

    message_payload = {
        "type": "message",
        "id": msg_id,
        "from": sender,
        "to": receiver,
        "is_private": bool(is_private),
        "content": "",
        "timestamp": get_ist_time(),
        "is_file": True,
        "file_name": file.filename,
        "file_url": file_url,
        "mime_type": file.content_type or "application/octet-stream",
    }

    if is_private and receiver != "all":
        await manager.send_personal_message(message_payload, sender)
        await manager.send_personal_message(message_payload, receiver)
    else:
        await manager.broadcast(message_payload)

    return JSONResponse({"status": "ok", "file_url": file_url, "msg_id": msg_id})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
