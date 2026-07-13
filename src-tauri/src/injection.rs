use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub struct Injector;

impl Injector {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self)
    }

    /// Copy text to clipboard, then paste it — but only if a real text field
    /// is focused. Returns whether the paste happened; the clipboard is
    /// always set either way, so a skipped paste still leaves the text
    /// reachable with a manual Ctrl+V.
    pub fn inject(&self, text: &str) -> Result<bool, Box<dyn std::error::Error>> {
        self.set_clipboard(text)?;
        if !Self::text_field_focused() {
            return Ok(false);
        }
        self.paste()?;
        Ok(true)
    }

    fn set_clipboard(&self, text: &str) -> Result<(), Box<dyn std::error::Error>> {
        Clipboard::new()?.set_text(text)?;
        Ok(())
    }

    fn paste(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut enigo = Enigo::new(&Settings::default())?;
        enigo.key(Key::Control, Direction::Press)?;
        enigo.key(Key::Unicode('v'), Direction::Click)?;
        enigo.key(Key::Control, Direction::Release)?;
        Ok(())
    }

    /// Whether the currently focused UI element accepts text input. Checked
    /// via UI Automation so this works across native Win32 controls and
    /// Electron/Chromium apps (Slack, Discord, VS Code), which don't expose
    /// classic window-class-based edit controls. Fails open (assumes yes) on
    /// any UIA error — a wrong paste is better than silently eating dictated
    /// text with no explanation.
    #[cfg(windows)]
    fn text_field_focused() -> bool {
        use uiautomation::UIAutomation;
        use uiautomation::patterns::{UITextPattern, UIValuePattern};

        let Ok(automation) = UIAutomation::new() else { return true };
        let Ok(element) = automation.get_focused_element() else { return true };

        element.get_pattern::<UIValuePattern>().is_ok()
            || element.get_pattern::<UITextPattern>().is_ok()
    }

    #[cfg(not(windows))]
    fn text_field_focused() -> bool {
        true
    }
}
