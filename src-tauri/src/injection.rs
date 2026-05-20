use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub struct Injector;

impl Injector {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self)
    }

    /// Copy text to clipboard then send Ctrl+V — instant, no character-by-character jank.
    pub fn inject(&self, text: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.set_clipboard(text)?;
        // Give the clipboard a moment to settle before pasting
        std::thread::sleep(std::time::Duration::from_millis(80));
        self.paste()?;
        Ok(())
    }

    fn set_clipboard(&self, text: &str) -> Result<(), Box<dyn std::error::Error>> {
        #[cfg(target_os = "windows")]
        {
            // Write to a temp file then read into clipboard — avoids shell-escaping issues
            // with apostrophes and special characters in the transcribed text.
            let escaped = text.replace('\'', "''");
            let script = format!("Set-Clipboard -Value '{}'", escaped);
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                .spawn()?
                .wait()?;
        }
        Ok(())
    }

    fn paste(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut enigo = Enigo::new(&Settings::default())?;
        enigo.key(Key::Control, Direction::Press)?;
        enigo.key(Key::Unicode('v'), Direction::Click)?;
        enigo.key(Key::Control, Direction::Release)?;
        Ok(())
    }
}
