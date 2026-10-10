// DOM Element Selections
const noteForm = document.querySelector('#note-form');
const noteInput = document.querySelector('#note-input');
const categorySelect = document.querySelector('#category-select');
const searchInput = document.querySelector('#search-input');
const notesContainer = document.querySelector('#notes-container');
const errorMessage = document.querySelector('#error-message');
const noteCount = document.querySelector('#note-count');

// State: Load notes from localStorage or initialize empty array
let notes = JSON.parse(localStorage.getItem('notes')) || [];

// Helper function to generate a readable date and time string
function getReadableTimestamp() {
  const now = new Date();
  return now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Save notes array to localStorage
function saveNotes() {
  localStorage.setItem('notes', JSON.stringify(notes));
}

// Update the note count message based on current filter or total notes
function updateCount(displayedCount, totalCount) {
  if (totalCount === 0) {
    noteCount.textContent = 'No notes yet.';
  } else if (totalCount === 1) {
    noteCount.textContent = '1 note total.';
  } else {
    if (displayedCount !== totalCount) {
      noteCount.textContent = `Showing ${displayedCount} of ${totalCount} notes.`;
    } else {
      noteCount.textContent = `${totalCount} notes total.`;
    }
  }
}

// Delete note by id
function deleteNote(id) {
  notes = notes.filter(note => note.id !== id);
  saveNotes();
  render();
}

// Render function to rebuild the UI list from the notes array
function render() {
  // Clear existing DOM list
  notesContainer.replaceChildren();

  const searchTerm = searchInput.value.toLowerCase().trim();

  // Filter notes by search term (matching text or category)
  const filteredNotes = notes.filter(note => 
    note.text.toLowerCase().includes(searchTerm) || 
    note.category.toLowerCase().includes(searchTerm)
  );

  // Build DOM elements for each note using createElement and textContent (never innerHTML for user text)
  filteredNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';

    const textEl = document.createElement('p');
    textEl.className = 'note-text';
    textEl.textContent = note.text;

    const metaContainer = document.createElement('div');
    metaContainer.className = 'note-meta';

    const categoryEl = document.createElement('span');
    categoryEl.className = 'note-category';
    categoryEl.textContent = note.category;

    const dateEl = document.createElement('span');
    dateEl.className = 'note-date';
    dateEl.textContent = note.createdAt;

    metaContainer.append(categoryEl, dateEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteNote(note.id));

    card.append(textEl, metaContainer, deleteBtn);
    notesContainer.appendChild(card);
  });

  updateCount(filteredNotes.length, notes.length);
}

// Event Listener for Adding Notes with Validation
noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const text = noteInput.value.trim();
  const category = categorySelect.value;

  // Validation checks
  if (text === '') {
    errorMessage.textContent = 'Error: Note cannot be empty.';
    return;
  }

  if (text.length > 200) {
    errorMessage.textContent = 'Error: Note cannot exceed 200 characters.';
    return;
  }

  // Clear any existing error messages
  errorMessage.textContent = '';

  // Create new note object
  const newNote = {
    id: Date.now().toString(),
    text: text,
    category: category,
    createdAt: getReadableTimestamp()
  };

  // Add to array, save, re-render, and clear input
  notes.push(newNote);
  saveNotes();
  render();

  noteInput.value = '';
});

// Event Listener for Search Feature
searchInput.addEventListener('input', () => {
  render();
});

// Initial render on page load
render();