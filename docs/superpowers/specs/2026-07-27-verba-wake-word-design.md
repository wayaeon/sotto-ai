# Verba wake-word dictation

## Goal

Let the Windows app wait in the background for the local phrase **“Verba, dictate”**. On a confirmed phrase, discard the phrase itself, transcribe the following utterance, and finish naturally after silence. The idle path must stay local and lightweight.

## Chosen interaction

1. The user enables **Wake phrase** once. The pill shows a clear armed state.
2. The microphone pump continues at the existing 16 kHz mono format.
3. WebRTC VAD rejects silence and background frames first.
4. A local keyword spotter receives only speech frames and confirms “Verba, dictate.”
5. Verba gives a visible pill confirmation and starts collecting the next utterance. The wake phrase is never inserted or saved.
6. 800 ms of silence finishes one dictation, using the existing transcription worker and paste pipeline.
7. The app returns to armed state. The user can turn it off with the existing hands-free control or the same shortcut.

## Why this design

- “Verba” alone can be confused with words such as “verb,” “verbal,” and the name “Vera.” The two-word phrase is less likely to wake accidentally while remaining easy to say.
- The current hands-free code already runs a 30 ms WebRTC VAD loop and only invokes the transcription worker after sustained speech. It is the correct low-idle-compute foundation.
- A dedicated local keyword spotter avoids running Parakeet on every ambient conversation. Sherpa-ONNX already exists as an optional runtime dependency and documents open-vocabulary keyword spotting with configurable keywords and thresholds. [Sherpa-ONNX KWS docs](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)

## Architecture

- Add a `WakeWordDetector` owned by `Recorder`. It loads a small local Sherpa-ONNX KWS model only when wake mode is armed.
- Reuse the recorder’s audio pump and VAD queue; do not create a second microphone stream, browser audio context, or model process.
- Maintain three explicit states: `off`, `armed`, and `dictating`. The current `handsfree_on`, `handsfree_ptt`, and `handsfree_off` IPC events remain the UI bridge, with an additional `wake_detected` confirmation event.
- Store the phrase and a conservative confidence threshold locally. The initial phrase is `Verba, dictate`; changing it requires an installed KWS model that supports the phrase’s tokens.
- Keep the existing VAD hands-free mode available as a separate accessibility fallback. It remains useful when the user cannot reliably say the wake phrase.

## Safety and privacy

- All idle analysis is local. No microphone data is uploaded for phrase matching.
- The wake phrase is removed before transcription persistence and paste.
- The pill must visibly show armed/dictating/off states so the microphone is never silently left in an ambiguous mode.
- A false wake simply creates a normal local utterance; no audio is retained beyond the existing temporary transcription path.

## Failure behavior

- If the KWS model is unavailable or fails to load, Wake phrase remains off and the UI explains that download/setup is required; push-to-talk and current hands-free dictation still work.
- If “Verba, dictate” proves unreliable on the user’s microphone, the settings screen exposes phrase and sensitivity controls and offers the fallback phrase “Verba, start dictation.”

## Verification

- Unit-test phrase configuration, state transitions, wake-phrase stripping, and disabled-model fallback.
- Run an audio fixture through the detector to prove that “Verba, dictate” arms dictation and ordinary speech does not.
- Verify that no Parakeet/ASR inference begins while the detector is merely armed and silent.
- Smoke-test Windows idle CPU, phrase detection, phrase exclusion from transcript, natural silence cutoff, disable control, and recovery after a detector error.
