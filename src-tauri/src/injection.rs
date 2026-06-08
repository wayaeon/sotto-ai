use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub struct Injector;

impl Injector {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self)
    }

    /// Copy text to clipboard then send Ctrl+V — instant, no character-by-character jank.
    pub fn inject(&self, text: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.set_clipboard(text)?;
        self.paste()?;
        Ok(())
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
}
