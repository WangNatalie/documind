// Settings page for API key configuration

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm') as HTMLFormElement;
  const chunkrInput = document.getElementById('chunkrApiKey') as HTMLInputElement;
  const geminiInput = document.getElementById('geminiApiKey') as HTMLInputElement;
  const successMessage = document.getElementById('successMessage') as HTMLDivElement;
  
  // Load saved settings
  const settings = await chrome.storage.local.get(['chunkrApiKey', 'geminiApiKey']);
  
  if (settings.chunkrApiKey) {
    chunkrInput.value = settings.chunkrApiKey;
  }
  
  if (settings.geminiApiKey) {
    geminiInput.value = settings.geminiApiKey;
  }
  
  // Save settings
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settingsToSave = {
      chunkrApiKey: chunkrInput.value.trim(),
      geminiApiKey: geminiInput.value.trim()
    };
    
    await chrome.storage.local.set(settingsToSave);
    
    // Show success message
    successMessage.classList.add('show');
    setTimeout(() => {
      successMessage.classList.remove('show');
    }, 3000);
  });
});
