document.addEventListener('DOMContentLoaded', () => {
  const noteText = document.getElementById('note-text');
  const charCount = document.getElementById('char-count');
  const wordCount = document.getElementById('word-count');
  const clearBtn = document.getElementById('clear-btn');
  const themeToggle = document.getElementById('theme-toggle');
  const body = document.body;

  // 1. Restore Theme Preference
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark');
    themeToggle.textContent = 'Light mode';
  } else {
    themeToggle.textContent = 'Dark mode';
  }

  // 2. Restore Draft from localStorage
  const savedDraft = localStorage.getItem('noteDraft');
  if (savedDraft !== null) {
    noteText.value = savedDraft;
    updateCounters(savedDraft);
  }

  // Helper function to calculate words and characters
  function updateCounters(text) {
    const chars = text.length;
    // Split by whitespace and filter out empty strings to get exact word count
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

    // Update text content
    charCount.textContent = `${chars} / 200 characters`;
    wordCount.textContent = `${words} words`;

    // Manage character counter classes
    charCount.classList.remove('warning', 'over');
    if (chars > 200) {
      charCount.classList.add('over');
    } else if (chars > 180) {
      charCount.classList.add('warning');
    }
  }

  // 3. Input Event Listener
  noteText.addEventListener('input', () => {
    const currentText = noteText.value;
    updateCounters(currentText);
    localStorage.setItem('noteDraft', currentText);
  });

  // 4. Clear Button Event Listener
  clearBtn.addEventListener('click', () => {
    noteText.value = '';
    updateCounters('');
    localStorage.removeItem('noteDraft');
    noteText.focus();
  });

  // 5. Escape Key Listener inside Textarea
  noteText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      noteText.value = '';
      updateCounters('');
      localStorage.removeItem('noteDraft');
    }
  });

  // 6. Theme Toggle Event Listener
  themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark');
    const isDark = body.classList.contains('dark');
    
    themeToggle.textContent = isDark ? 'Light mode' : 'Dark mode';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
});
