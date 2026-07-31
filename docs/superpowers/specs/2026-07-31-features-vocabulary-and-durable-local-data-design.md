# Features, vocabulary, and durable local data

## Goal

Make Verba improve from the user's own language without sending transcription history to a server. Existing transcripts remain available after an app update or reinstall, and selected transcript text can teach Verba a correction or vocabulary term.

## Product shape

- Add a Features hub to the left rail, above the account control.
- Ship three real feature surfaces: Vocabulary, Corrections, and Local data.
- Keep future chatbot, visual intelligence, and computer-control ideas visible as roadmap cards, but do not pretend they are implemented.
- Let users select text in a transcript and add it as a correction or vocabulary entry.
- A correction applies to the current library immediately and to future dictated text before injection.

## Local data contract

The Tauri app owns a JSON backup outside the install directory. It stores transcripts, vocabulary, correction rules, and a schema version. Writes use a temporary file followed by rename. The browser localStorage copy remains a fast cache and migration fallback; the durable file wins after the first successful hydrate.

## Performance contract

Windows keeps Parakeet TDT v3 as the model, but passes the detected CUDA/DirectML/CPU device to the ONNX runtime instead of hard-coding CPU. No model switch is part of this change; benchmark before considering streaming Nemotron.

## Non-goals

- Cloud sync, remote analysis, or an AI agent loop.
- Replacing the existing settings dictionary editor.
- A second database dependency just for this MVP.
