"""Offline Windows speech grammar for the Verba wake phrase."""
from __future__ import annotations

import threading


class WindowsWakePhraseListener:
    """Listen only for the configured phrase through Windows Speech Recognition."""

    def run(self, stop_event: threading.Event, on_detected) -> None:  # type: ignore[no-untyped-def]
        import pythoncom
        import win32com.client

        class Events:
            callback = None

            def OnRecognition(self, StreamNumber, StreamPosition, RecognitionType, Result):  # noqa: N802, ANN001
                text = Result.PhraseInfo.GetText().strip().lower()
                if text in ("verba dictate", "verb dictate") and self.callback:
                    self.callback()

        pythoncom.CoInitialize()
        try:
            recognizer = win32com.client.Dispatch("SAPI.SpSharedRecognizer")
            context = recognizer.CreateRecoContext()
            events = win32com.client.DispatchWithEvents(context, Events)
            events.callback = on_detected
            grammar = context.CreateGrammar(1)
            rule = grammar.Rules.Add("verba", 1 | 32, 0)
            for phrase in ("verba dictate", "verb dictate"):
                rule.InitialState.AddWordTransition(None, phrase)
            grammar.Rules.Commit()
            grammar.CmdSetRuleState("verba", 1)
            while not stop_event.wait(0.05):
                pythoncom.PumpWaitingMessages()
            grammar.CmdSetRuleState("verba", 0)
        finally:
            pythoncom.CoUninitialize()
