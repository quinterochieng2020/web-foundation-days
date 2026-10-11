-- Drop tables if they already exist (helpful for re-running in playgrounds)
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- 1. CREATE TABLE statements
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
);

CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE(student_id, course_id) -- Prevents a student from enrolling in the same course twice
);

-- 2. INSERT sample data (At least 3 students, 3 courses, 5 enrolments)
-- Note: Charlie has no enrolments to satisfy the "students with no enrolments" query.
INSERT INTO students (name, email) VALUES 
('Alice Smith', 'alice@school.com'),
('Bob Jones', 'bob@school.com'),
('Charlie Brown', 'charlie@school.com');

INSERT INTO courses (title, code) VALUES 
('Mathematics', 'MATH101'),
('History', 'HIST101'),
('Computer Science', 'CS101');

INSERT INTO enrolments (student_id, course_id, grade) VALUES 
(1, 1, 'B+'), -- Alice in Mathematics
(1, 3, 'A'),  -- Alice in Computer Science
(2, 1, 'C'),  -- Bob in Mathematics
(2, 2, 'B'),  -- Bob in History
(3, 3, 'A-'); -- Wait, let's assign Charlie an enrolment? 
-- Wait, requirement 4 asks for "students who have no enrolments". 
-- Let's adjust enrolments so only Alice and Bob are enrolled, leaving Charlie with 0 enrolments.
-- Re-inserting clean enrolments (5 total across Alice and Bob):
DELETE FROM enrolments;
INSERT INTO enrolments (student_id, course_id, grade) VALUES 
(1, 1, 'B+'), -- Alice in Math
(1, 2, 'A'),  -- Alice in History
(1, 3, 'A-'), -- Alice in Computer Science
(2, 1, 'C+'), -- Bob in Math
(2, 2, 'B');  -- Bob in History
-- (Charlie remains with 0 enrolments)


-- 3. QUERIES

-- Query 1: All courses for one student (by name, e.g., 'Alice Smith')
SELECT c.title, c.code, e.grade
FROM courses c
JOIN enrolments e ON c.id = e.course_id
JOIN students s ON e.student_id = s.id
WHERE s.name = 'Alice Smith';

-- Query 2: All students on one course (e.g., 'Mathematics')
SELECT s.name, s.email, e.grade
FROM students s
JOIN enrolments e ON s.id = e.student_id
JOIN courses c ON e.course_id = c.id
WHERE c.title = 'Mathematics';

-- Query 3: The number of students per course (using LEFT JOIN to include courses with 0 students)
SELECT c.title, COUNT(e.student_id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id, c.title;

-- Query 4: Students who have no enrolments
SELECT s.id, s.name, s.email
FROM students s
LEFT JOIN enrolments e ON s.id = e.student_id
WHERE e.id IS NULL;

-- Query 5: Update of one enrolment's grade (updating Alice's grade in Math to 'A')
UPDATE enrolments
SET grade = 'A'
WHERE student_id = 1 AND course_id = 1;

-- Verify the update
SELECT * FROM enrolments;
