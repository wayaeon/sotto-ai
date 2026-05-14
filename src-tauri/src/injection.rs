use enigo::{Enigo, Keyboard, Settings};

pub struct Injector {
    enigo: Enigo,
}

impl Injector {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let enigo = Enigo::new(&Settings::default())?;
        Ok(Self { enigo })
    }

    pub fn inject(&self, text: &str) -> Result<(), Box<dyn std::error::Error>> {
        // Write to clipboard first for apps that need it
        self.set_clipboard(text)?;
        // Then type via keyboard simulation for direct injection
        self.type_text(text)?;
        Ok(())
    }

    fn set_clipboard(&self, text: &str) -> Result<(), Box<dyn std::error::Error>> {
        use std::process::Command;
        // Use PowerShell to set clipboard on Windows
        #[cfg(target_os = "windows")]
        {
            let mut child = Command::new("powershell")
                .args(["-Command", &format!("Set-Clipboard -Value '{}'", text.replace('\'', "''"))])
                .spawn()?;
            child.wait()?;
        }
        Ok(())
    }

    fn type_text(&self, text: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut enigo = Enigo::new(&Settings::default())?;
        enigo.text(text)?;
        Ok(())
    }
}
