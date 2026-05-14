"""ElevenLabs Scribe v2 Realtime WebSocket cloud STT client."""
from __future__ import annotations

import asyncio
import json
import os
from typing import Callable, Optional

import websockets

ELEVENLABS_WSS = "wss://api.elevenlabs.io/v1/speech-to-text/stream"


class ScribeClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        on_word: Optional[Callable[[str], None]] = None,
        on_segment: Optional[Callable[[str], None]] = None,
    ) -> None:
        self._api_key = api_key or os.environ.get("ELEVENLABS_API_KEY", "")
        self._on_word = on_word or (lambda _: None)
        self._on_segment = on_segment or (lambda _: None)
        self._ws = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self) -> None:
        headers = {"xi-api-key": self._api_key}
        self._ws = await websockets.connect(
            f"{ELEVENLABS_WSS}?model_id=scribe_v2_experimental",
            additional_headers=headers,
        )

    async def send_audio(self, chunk: bytes) -> None:
        if self._ws:
            import base64
            payload = json.dumps({"audio_data": base64.b64encode(chunk).decode()})
            await self._ws.send(payload)

    async def receive_loop(self) -> None:
        if not self._ws:
            return
        async for message in self._ws:
            try:
                data = json.loads(message)
                if data.get("type") == "interim":
                    self._on_word(data.get("text", ""))
                elif data.get("type") == "final":
                    self._on_segment(data.get("text", ""))
            except json.JSONDecodeError:
                pass

    async def close(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None
