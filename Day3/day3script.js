// 1. Starting data
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// 2. searchNotes using filter, toLowerCase and includes
function searchNotes(word) {
  const lowerWord = word.toLowerCase();
  return notes.filter(note => note.text.toLowerCase().includes(lowerWord));
}

// 3. longestNote handling empty array first, then comparing lengths
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }
  return longest;
}

// 4. countByCategory looping over notes and increasing a counter in an object
function countByCategory() {
  const counts = {};
  for (let note of notes) {
    if (counts[note.category]) {
      counts[note.category]++;
    } else {
      counts[note.category] = 1;
    }
  }
  return counts;
}

// 5. getSummary using countByCategory and a template literal (singular/plural support)
function getSummary() {
  const counts = countByCategory();
  const noteWord = notes.length === 1 ? "1 note" : `${notes.length} notes`;
  const categoryDetails = Object.entries(counts)
    .map(([category, count]) => `${count} ${category}`)
    .join(", ");
  return `${noteWord}: ${categoryDetails}.`;
}

// 6. isDuplicate using some, comparing trimmed lower-case text
function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();
  return notes.some(note => note.text.trim().toLowerCase() === normalizedText);
}

// 7. addNote calling isDuplicate and checking length/category before adding
function addNote(text, category) {
  const trimmedText = text.trim();
  const validCategories = ["personal", "work", "study"];

  if (trimmedText.length < 1 || trimmedText.length > 200) {
    console.log(`Failed to add note: Length must be between 1 and 200 characters.`);
    return false;
  }
  if (!validCategories.includes(category)) {
    console.log(`Failed to add note: Category must be personal, work, or study.`);
    return false;
  }
  if (isDuplicate(text)) {
    console.log(`Failed to add note: Note already exists.`);
    return false;
  }

  const newId = notes.length > 0 ? Math.max(...notes.map(n => n.id)) + 1 : 1;
  notes.push({ id: newId, text: trimmedText, category: category });
  console.log(`Successfully added note: "${trimmedText}" (${category})`);
  return true;
}

// ==========================================
// 8. CONSOLE LOG TESTS & EXPECTED OUTPUTS
// ==========================================

console.log("--- Testing searchNotes ---");
console.log(searchNotes("day")); 
// Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]

console.log(searchNotes("xylophone")); 
// Expected: [] (Edge case: no matching results)


console.log("--- Testing longestNote ---");
console.log(longestNote()); 
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

// Edge case: empty notes array
let backupNotes = notes;
notes = [];
console.log(longestNote()); 
// Expected: null
notes = backupNotes; // Restore notes


console.log("--- Testing countByCategory ---");
console.log(countByCategory()); 
// Expected: { personal: 2, study: 2, work: 1 }

// Edge case: empty notes array counts
notes = [];
console.log(countByCategory()); 
// Expected: {}
notes = backupNotes;


console.log("--- Testing getSummary ---");
console.log(getSummary()); 
// Expected: "5 notes: personal: 2, study: 2, work: 1." (or similar category order)

// Edge case: single note array ("1 note" singular check)
notes = [{ id: 1, text: "Quick task", category: "work" }];
console.log(getSummary()); 
// Expected: "1 note: work: 1."
notes = backupNotes;


console.log("--- Testing isDuplicate ---");
console.log(isDuplicate("  call MUM  ")); 
// Expected: true (Edge case: checks with extra spaces and different casing)

console.log(isDuplicate("Learn TypeScript")); 
// Expected: false (Edge case: non-existent note)


console.log("--- Testing addNote ---");
console.log(addNote("Read a new book", "personal")); 
// Expected: Successfully added log, returns true

console.log(addNote("Buy milk and bread", "personal")); 
// Expected: Failed to add note: Note already exists., returns false